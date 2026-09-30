package dev.talk2scale.ui.home

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import dev.talk2scale.Talk2ScaleApp
import dev.talk2scale.data.Preferences
import dev.talk2scale.scale.ConnectionState
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class HomeUiState(
    val userId: Int = Preferences.DEFAULT_USER_ID,
    val userName: String? = null,
    val logs: List<FoodLogRow> = emptyList(),
    val logsLoading: Boolean = true,
    val logsError: String? = null,
    val summary: List<SummaryRow> = emptyList(),
    val summaryLoading: Boolean = true,
    val summaryError: String? = null,
    val connected: Boolean = false,
    val selectedLogId: Int? = null,
    val deleteFailed: Boolean = false,
)

class HomeViewModel(application: Application) : AndroidViewModel(application) {
    private val container = (application as Talk2ScaleApp).container
    private val foodRepository = container.foodRepository
    private val preferences = container.preferences
    private val scale = container.scaleRepository

    private val _state = MutableStateFlow(HomeUiState())
    val state: StateFlow<HomeUiState> = _state.asStateFlow()

    private var userId: Int = Preferences.DEFAULT_USER_ID
    private var logsJob: Job? = null
    private var summaryJob: Job? = null
    private var profileJob: Job? = null

    init {
        scale.start()
        viewModelScope.launch {
            preferences.userId.collect { id ->
                userId = id
                _state.update { it.copy(userId = id, selectedLogId = null) }
                loadProfile()
                refresh()
            }
        }
        viewModelScope.launch {
            scale.connection.collect { connection ->
                _state.update { it.copy(connected = connection == ConnectionState.Connected) }
            }
        }
    }

    fun refresh() {
        loadLogs()
        loadSummary()
    }

    fun loadSummary() {
        val id = userId
        summaryJob?.cancel()
        summaryJob = viewModelScope.launch {
            _state.update { it.copy(summaryLoading = true, summaryError = null) }
            try {
                val groups = foodRepository.todayNutrients(id)
                val targets = foodRepository.dailyTargets(id)
                val elements = if (targets != null && targets.nutrient_amounts.isNotEmpty()) {
                    foodRepository.nutrientElements()
                } else {
                    emptyList()
                }
                if (userId != id) return@launch
                _state.update {
                    it.copy(
                        summary = buildSummaryRows(groups, targets, elements),
                        summaryLoading = false,
                        summaryError = null,
                    )
                }
            } catch (error: Exception) {
                if (userId != id) return@launch
                _state.update {
                    it.copy(
                        summaryLoading = false,
                        summaryError = error.message ?: "Unable to load today",
                    )
                }
            }
        }
    }

    fun confirmUserId(raw: String) {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return
        val id = trimmed.toIntOrNull() ?: return
        viewModelScope.launch { preferences.setUserId(id) }
    }

    fun selectLog(log: FoodLogRow) {
        _state.update { it.copy(selectedLogId = log.id) }
    }

    fun clearSelection() {
        _state.update { it.copy(selectedLogId = null) }
    }

    fun deleteLog(log: FoodLogRow) {
        viewModelScope.launch {
            try {
                foodRepository.deleteFoodLog(log.id)
                if (_state.value.selectedLogId == log.id) {
                    _state.update { it.copy(selectedLogId = null) }
                }
                refresh()
            } catch (_: Exception) {
                _state.update { it.copy(deleteFailed = true) }
            }
        }
    }

    fun dismissDeleteError() {
        _state.update { it.copy(deleteFailed = false) }
    }

    private fun loadProfile() {
        val id = userId
        profileJob?.cancel()
        profileJob = viewModelScope.launch {
            val name = try {
                foodRepository.fetchUser(id).name.takeIf { it.isNotBlank() }
            } catch (_: Exception) {
                null
            }
            if (userId == id) _state.update { it.copy(userName = name) }
        }
    }

    private fun loadLogs() {
        val id = userId
        logsJob?.cancel()
        logsJob = viewModelScope.launch {
            _state.update { it.copy(logsLoading = true, logsError = null) }
            try {
                val logs = foodRepository.todayFoodLogs(id).map { it.toFoodLogRow() }
                if (userId != id) return@launch
                _state.update { it.copy(logs = logs, logsLoading = false, logsError = null) }
            } catch (error: Exception) {
                if (userId != id) return@launch
                _state.update {
                    it.copy(
                        logsLoading = false,
                        logsError = error.message ?: "Unable to load food logs",
                    )
                }
            }
        }
    }
}
