package dev.talk2scale.data.api

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

object ApiJson {
    val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        isLenient = true
    }
}

@Serializable
data class UserDto(
    val id: Int,
    val email: String = "",
    val name: String = "",
    val tracking_started_on: String? = null,
)

@Serializable
data class FoodLogDto(
    val id: Int,
    val user_id: Int,
    val logged_at: String,
    val element_id: Int? = null,
    val raw_name: String,
    val amount: Double = 0.0,
    val measure_id: Int = 1,
    val kcal: Double? = null,
)

@Serializable
data class NewFoodLogBody(
    val user_id: Int,
    val logged_at: String,
    val element_id: Int,
    val raw_name: String,
    val amount: Int,
    val measure_id: Int,
)

@Serializable
data class UpdateFoodLogBody(
    val element_id: Int,
    val raw_name: String,
)

@Serializable
data class FoodHitDto(
    val foodNameId: Int,
    val elementId: Int,
    val elementName: String = "",
    val name: String,
    val distance: Double = 0.0,
)

@Serializable
data class NutrientEntryDto(
    val id: Int? = null,
    val name: String,
    val amount: Double = 0.0,
    val calculated: Boolean = false,
)

@Serializable
data class NutrientGroupDto(
    val id: Int,
    val name: String,
    val displayOrder: Int = 0,
    val nutrients: List<NutrientEntryDto> = emptyList(),
)

@Serializable
data class NutrientAmountDto(
    val id: Int,
    val grams: Double,
)

@Serializable
data class DailyTargetsDto(
    val kcal: Double = 0.0,
    val nutrient_amounts: List<NutrientAmountDto> = emptyList(),
)

@Serializable
data class ElementDto(
    val id: Int,
    val type: String = "",
    val name: String,
)

@Serializable
data class RecipeChildBody(
    val element_id: Int,
    val grams: Double,
)

@Serializable
data class NewRecipeBody(
    val name: String,
    val children: List<RecipeChildBody>,
    val serving_grams: Double? = null,
    val user_id: Int? = null,
)

@Serializable
data class TranscribeDto(
    val text: String = "",
    val grams: Int? = null,
    val error: String? = null,
)
