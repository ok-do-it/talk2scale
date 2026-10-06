package dev.talk2scale.data

import dev.talk2scale.data.api.ApiException
import dev.talk2scale.data.api.ApiJson
import dev.talk2scale.data.api.DailyTargetsDto
import dev.talk2scale.data.api.ElementDto
import dev.talk2scale.data.api.FoodHitDto
import dev.talk2scale.data.api.FoodLogDto
import dev.talk2scale.data.api.NewFoodLogBody
import dev.talk2scale.data.api.NewRecipeBody
import dev.talk2scale.data.api.NutrientGroupDto
import dev.talk2scale.data.api.RecipeChildBody
import dev.talk2scale.data.api.Talk2ScaleApi
import dev.talk2scale.data.api.UpdateFoodLogBody
import java.time.LocalDate
import kotlinx.coroutines.CancellationException
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

class FoodRepository(private val api: Talk2ScaleApi) {
    suspend fun fetchUser(userId: Int): UserProfile = apiCall {
        val user = api.getUser(userId)
        UserProfile(id = user.id, name = user.name)
    }

    suspend fun searchFoods(query: String): List<FoodHit> = apiCall {
        api.searchFood(query).take(SEARCH_LIMIT).map { hit -> hit.toFoodHit() }
    }

    suspend fun createFoodLog(
        userId: Int,
        elementId: Int,
        rawName: String,
        amountGrams: Int,
        loggedAt: String,
    ): FoodLogDto = apiCall {
        api.createFoodLog(
            NewFoodLogBody(
                user_id = userId,
                logged_at = loggedAt,
                element_id = elementId,
                raw_name = rawName,
                amount = amountGrams,
                measure_id = GRAM_MEASURE_ID,
            ),
        )
    }

    suspend fun updateFoodLog(id: Int, elementId: Int, rawName: String): FoodLogDto = apiCall {
        api.updateFoodLog(id, UpdateFoodLogBody(element_id = elementId, raw_name = rawName))
    }

    suspend fun deleteFoodLog(id: Int): Unit = apiCall {
        api.deleteFoodLog(id)
    }

    suspend fun todayFoodLogs(userId: Int): List<FoodLogDto> = apiCall {
        val (from, to) = localDayRange()
        api.getFoodLogs(userId, from, to)
    }

    suspend fun todayNutrients(userId: Int): List<NutrientGroupDto> = apiCall {
        val (from, to) = localDayRange()
        api.getFoodLogNutrients(userId, from, to)
    }

    suspend fun dailyTargets(userId: Int): DailyTargetsDto? = apiCall {
        val raw = api.getDailyTargets(userId)?.use { it.string() }?.trim().orEmpty()
        if (raw.isEmpty() || raw == "null") {
            null
        } else {
            ApiJson.json.decodeFromString<DailyTargetsDto>(raw)
        }
    }

    suspend fun nutrientElements(): List<ElementDto> = apiCall {
        api.getElements("nutrient")
    }

    suspend fun createRecipe(
        name: String,
        servingGrams: Double?,
        userId: Int,
        children: List<Pair<Int, Double>>,
    ) = apiCall {
        api.createRecipe(
            NewRecipeBody(
                name = name,
                serving_grams = servingGrams,
                user_id = userId,
                children = children.map { (elementId, grams) ->
                    RecipeChildBody(element_id = elementId, grams = grams)
                },
            ),
        )?.close()
    }

    private suspend fun <T> apiCall(block: suspend () -> T): T {
        try {
            return block()
        } catch (error: CancellationException) {
            throw error
        } catch (error: ApiException) {
            throw error
        } catch (error: Exception) {
            throw ApiException(error.message ?: "cannot reach server")
        }
    }

    private fun FoodHitDto.toFoodHit(): FoodHit = FoodHit(
        elementId = elementId,
        name = name,
        type = "whole_food",
    )

    companion object {
        const val GRAM_MEASURE_ID = 1
        private const val SEARCH_LIMIT = 6
        private val utcFormat = DateTimeFormatter.ofPattern(
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            Locale.US,
        ).withZone(ZoneOffset.UTC)

        fun localDayRange(zone: ZoneId = ZoneId.systemDefault()): Pair<String, String> {
            val today = LocalDate.now(zone)
            val from = today.atStartOfDay(zone).toInstant()
            val to = today.atTime(23, 59, 59, 999_000_000).atZone(zone).toInstant()
            return utcFormat.format(from) to utcFormat.format(to)
        }
    }
}

data class UserProfile(
    val id: Int,
    val name: String,
)

data class FoodHit(
    val elementId: Int,
    val name: String,
    val type: String,
)
