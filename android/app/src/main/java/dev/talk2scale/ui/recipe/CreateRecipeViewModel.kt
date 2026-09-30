package dev.talk2scale.ui.recipe

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import dev.talk2scale.Talk2ScaleApp
import dev.talk2scale.data.Preferences
import dev.talk2scale.ui.entry.ResolvedFood
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class DraftIngredient(
    val localId: Long,
    val elementId: Int,
    val name: String,
    val grams: Int,
)

data class RecipeUiState(
    val name: String = "",
    val servingGrams: String = "",
    val ingredients: List<DraftIngredient> = emptyList(),
    val saving: Boolean = false,
    val error: String? = null,
) {
    val totalGrams: Int get() = ingredients.sumOf { it.grams }
    val hasDraft: Boolean
        get() = name.isNotBlank() || servingGrams.isNotBlank() || ingredients.isNotEmpty()
}

class CreateRecipeViewModel(application: Application) : AndroidViewModel(application) {
    private val container = (application as Talk2ScaleApp).container
    private val foodRepository = container.foodRepository
    private var userId: Int = Preferences.DEFAULT_USER_ID
    private var nextId = 0L

    private val _state = MutableStateFlow(RecipeUiState())
    val state: StateFlow<RecipeUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            container.preferences.userId.collect { userId = it }
        }
    }

    fun onNameChange(value: String) {
        _state.update { it.copy(name = value, error = null) }
    }

    fun onServingChange(value: String) {
        _state.update { it.copy(servingGrams = value, error = null) }
    }

    fun addIngredient(food: ResolvedFood) {
        val ingredient = DraftIngredient(
            localId = nextId++,
            elementId = food.elementId,
            name = food.name,
            grams = food.amountGrams,
        )
        _state.update { it.copy(ingredients = listOf(ingredient) + it.ingredients) }
    }

    fun removeIngredient(localId: Long) {
        _state.update { current ->
            current.copy(ingredients = current.ingredients.filterNot { it.localId == localId })
        }
    }

    fun dismissError() {
        _state.update { it.copy(error = null) }
    }

    fun save(name: String, servingGrams: Double?, onSaved: () -> Unit) {
        viewModelScope.launch {
            _state.update { it.copy(saving = true, error = null) }
            try {
                foodRepository.createRecipe(
                    name = name,
                    servingGrams = servingGrams,
                    userId = userId,
                    children = _state.value.ingredients.map { it.elementId to it.grams.toDouble() },
                )
                _state.update { it.copy(saving = false) }
                onSaved()
            } catch (error: Exception) {
                _state.update {
                    it.copy(saving = false, error = error.message ?: "Unable to save recipe")
                }
            }
        }
    }
}
