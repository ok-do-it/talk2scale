package dev.talk2scale.ui.entry

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import dev.talk2scale.Talk2ScaleApp
import dev.talk2scale.data.FoodHit
import dev.talk2scale.data.Preferences
import dev.talk2scale.scale.ConnectionState
import dev.talk2scale.voice.RecordStart
import java.time.Instant
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

enum class FoodEntryMode {
    Log,
    Ingredient,
}

enum class FoodEntryError {
    NoWeight,
    MicPermission,
    EnterName,
    Message,
}

data class ResolvedFood(
    val rawName: String,
    val elementId: Int,
    val name: String,
    val amountGrams: Int,
)

data class FoodEntryUiState(
    val query: String = "",
    val results: List<FoodHit> = emptyList(),
    val searching: Boolean = false,
    val listening: Boolean = false,
    val grams: Int = 0,
    val stable: Boolean = false,
    val editing: Boolean = false,
    val showAutoSelect: Boolean = false,
    val autoSelectProgress: Float = 0f,
    val error: FoodEntryError? = null,
    val errorMessage: String? = null,
    val controlsEnabled: Boolean = true,
    val scaleLive: Boolean = true,
)

sealed interface FoodEntryEvent {
    data class Saved(val editedLogId: Int?) : FoodEntryEvent
    data class IngredientAdded(val food: ResolvedFood) : FoodEntryEvent
}

class FoodEntryViewModel(
    application: Application,
    private val mode: FoodEntryMode,
) : AndroidViewModel(application) {
    private val container = (application as Talk2ScaleApp).container
    private val foodRepository = container.foodRepository
    private val scale = container.scaleRepository
    private val voiceRepository = container.voiceRepository
    private val recorder = container.voiceRecorder

    private val _state = MutableStateFlow(FoodEntryUiState())
    val state: StateFlow<FoodEntryUiState> = _state.asStateFlow()

    private val _events = MutableSharedFlow<FoodEntryEvent>(extraBufferCapacity = 1)
    val events: SharedFlow<FoodEntryEvent> = _events.asSharedFlow()

    private val _repeatPrompts = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val repeatPrompts: SharedFlow<Unit> = _repeatPrompts.asSharedFlow()

    private var spokenGrams: Int? = null
    private var voiceRawName: String? = null
    private var editingLogId: Int? = null
    private var userId: Int = Preferences.DEFAULT_USER_ID
    private var searchJob: Job? = null
    private var autoSelectJob: Job? = null
    private var finishingVoice = false
    private var active = true

    private val backgroundObserver = LifecycleEventObserver { _, event ->
        if (event == Lifecycle.Event.ON_STOP) discardRecording()
    }

    init {
        ProcessLifecycleOwner.get().lifecycle.addObserver(backgroundObserver)
        viewModelScope.launch {
            container.preferences.userId.collect { userId = it }
        }
        viewModelScope.launch {
            combine(
                scale.reading,
                scale.connection,
                scale.mockEnabled,
            ) { reading, connection, mock ->
                val live = reading != null &&
                    (connection == ConnectionState.Connected || mock)
                live to reading
            }.collect { (live, reading) ->
                _state.update {
                    it.copy(
                        grams = if (live) reading?.grams ?: 0 else 0,
                        stable = live && reading?.stable == true,
                        scaleLive = live,
                    )
                }
            }
        }
    }

    override fun onCleared() {
        ProcessLifecycleOwner.get().lifecycle.removeObserver(backgroundObserver)
        recorder.discard()
        super.onCleared()
    }

    fun setActive(isActive: Boolean) {
        active = isActive
        if (!isActive) discardRecording()
    }

    fun onQueryChange(text: String) {
        clearVoiceMetadata()
        _state.update {
            it.copy(query = text, results = emptyList(), searching = false, error = null)
        }
        scheduleSearch(text, immediate = false)
    }

    fun onClear() {
        editingLogId = null
        clearVoiceMetadata()
        searchJob?.cancel()
        _state.update {
            it.copy(
                query = "",
                results = emptyList(),
                searching = false,
                editing = false,
                error = null,
            )
        }
    }

    fun beginEdit(logId: Int, name: String) {
        editingLogId = logId
        clearVoiceMetadata()
        _state.update { it.copy(query = name, editing = true, results = emptyList(), error = null) }
        if (name.isNotBlank()) scheduleSearch(name, immediate = true)
    }

    fun clearEdit() {
        onClear()
    }

    fun dismissError() {
        _state.update { it.copy(error = null, errorMessage = null) }
    }

    fun tare() {
        scale.sendTare()
    }

    fun addMockWeight() {
        scale.addMockWeight()
    }

    fun toggleMock(): Boolean {
        val next = !scale.mockEnabled.value
        scale.setMockEnabled(next)
        return scale.mockEnabled.value
    }

    fun onMicrophoneDenied() {
        show(FoodEntryError.MicPermission)
    }

    fun onMicDown() {
        if (!active || _state.value.listening || finishingVoice) return
        when (recorder.start { viewModelScope.launch { finishListening() } }) {
            RecordStart.Started -> _state.update { it.copy(listening = true, error = null) }
            RecordStart.PermissionDenied -> show(FoodEntryError.MicPermission)
            RecordStart.Failed -> promptRepeat()
        }
    }

    fun onMicUp() {
        if (!_state.value.listening) return
        viewModelScope.launch { finishListening() }
    }

    fun pick(hit: FoodHit) {
        resolve(hit, rawNameOverride = null)
    }

    private fun resolve(hit: FoodHit, rawNameOverride: String?) {
        if (rawNameOverride == null) cancelAutoSelect()
        viewModelScope.launch {
            val rawName = (rawNameOverride ?: voiceRawName ?: _state.value.query).trim()
            if (rawName.isEmpty()) {
                show(FoodEntryError.EnterName)
                return@launch
            }
            val amount = spokenGrams ?: liveGrams() ?: 0
            val editingId = editingLogId
            if (editingId == null && amount <= 0) {
                show(FoodEntryError.NoWeight)
                return@launch
            }
            val resolved = ResolvedFood(rawName, hit.elementId, hit.name, amount)
            try {
                _state.update { it.copy(controlsEnabled = false, error = null) }
                if (mode == FoodEntryMode.Log) {
                    if (editingId != null) {
                        foodRepository.updateFoodLog(editingId, hit.elementId, rawName)
                    } else {
                        foodRepository.createFoodLog(
                            userId = userId,
                            elementId = hit.elementId,
                            rawName = rawName,
                            amountGrams = amount,
                            loggedAt = Instant.now().toString(),
                        )
                    }
                    _events.emit(FoodEntryEvent.Saved(editingId))
                } else {
                    _events.emit(FoodEntryEvent.IngredientAdded(resolved))
                }
                editingLogId = null
                clearVoiceMetadata()
                searchJob?.cancel()
                _state.update {
                    it.copy(
                        query = "",
                        results = emptyList(),
                        searching = false,
                        editing = false,
                        controlsEnabled = true,
                        error = null,
                    )
                }
                if (editingId == null) scale.sendTare()
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                _state.update {
                    it.copy(
                        controlsEnabled = true,
                        error = FoodEntryError.Message,
                        errorMessage = error.message ?: "Unable to add food",
                    )
                }
            }
        }
    }

    private fun scheduleSearch(text: String, immediate: Boolean) {
        searchJob?.cancel()
        val filter = text.trim()
        if (filter.isEmpty() || _state.value.listening) {
            _state.update { it.copy(searching = false, results = emptyList(), showAutoSelect = false) }
            return
        }
        searchJob = viewModelScope.launch {
            if (!immediate) delay(SEARCH_DEBOUNCE_MS)
            _state.update { it.copy(searching = true) }
            try {
                val hits = foodRepository.searchFoods(filter)
                val auto = voiceRawName == filter && hits.isNotEmpty()
                _state.update {
                    it.copy(
                        searching = false,
                        results = hits,
                        showAutoSelect = auto,
                        autoSelectProgress = if (auto) 1f else 0f,
                        error = null,
                        errorMessage = null,
                    )
                }
                if (auto) startAutoSelect(hits.first(), filter)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                _state.update {
                    it.copy(
                        searching = false,
                        results = emptyList(),
                        showAutoSelect = false,
                        error = FoodEntryError.Message,
                        errorMessage = error.message ?: "cannot reach server",
                    )
                }
            }
        }
    }

    private fun startAutoSelect(hit: FoodHit, rawName: String) {
        autoSelectJob?.cancel()
        autoSelectJob = viewModelScope.launch {
            val startedAt = System.currentTimeMillis()
            while (isActive) {
                val elapsed = System.currentTimeMillis() - startedAt
                val progress = (1f - elapsed / AUTO_SELECT_MS.toFloat()).coerceAtLeast(0f)
                _state.update { it.copy(autoSelectProgress = progress, showAutoSelect = true) }
                if (elapsed >= AUTO_SELECT_MS) break
                delay(100)
            }
            resolve(hit, rawNameOverride = rawName)
        }
    }

    private suspend fun finishListening() {
        if (finishingVoice) return
        finishingVoice = true
        try {
            val file = recorder.stop()
            _state.update { it.copy(listening = false) }
            if (!active || file == null) {
                file?.delete()
                if (active && file == null) promptRepeat()
                return
            }
            try {
                val result = voiceRepository.transcribe(file)
                val food = result.text.trim()
                clearVoiceMetadata()
                searchJob?.cancel()
                _state.update {
                    it.copy(query = food, results = emptyList(), searching = false, error = null, errorMessage = null)
                }
                if (food.isEmpty()) {
                    promptRepeat()
                    return
                }
                voiceRawName = food
                spokenGrams = result.grams
                scheduleSearch(food, immediate = true)
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                promptRepeat()
            } finally {
                file.delete()
            }
        } finally {
            finishingVoice = false
        }
    }

    private fun discardRecording() {
        recorder.discard()
        finishingVoice = false
        _state.update { it.copy(listening = false) }
    }

    private fun clearVoiceMetadata() {
        spokenGrams = null
        voiceRawName = null
        cancelAutoSelect()
    }

    private fun cancelAutoSelect() {
        autoSelectJob?.cancel()
        autoSelectJob = null
        _state.update { it.copy(showAutoSelect = false, autoSelectProgress = 0f) }
    }

    private fun promptRepeat() {
        _repeatPrompts.tryEmit(Unit)
    }

    private fun liveGrams(): Int? {
        val reading = scale.reading.value ?: return null
        val live = scale.connection.value == ConnectionState.Connected || scale.mockEnabled.value
        return reading.grams.takeIf { live }
    }

    private fun show(error: FoodEntryError) {
        _state.update { it.copy(error = error, errorMessage = null) }
    }

    companion object {
        private const val SEARCH_DEBOUNCE_MS = 300L
        private const val AUTO_SELECT_MS = 3_000L

        fun factory(app: Application, mode: FoodEntryMode): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    @Suppress("UNCHECKED_CAST")
                    return FoodEntryViewModel(app, mode) as T
                }
            }
    }
}
