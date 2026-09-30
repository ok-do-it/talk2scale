package dev.talk2scale.data.api

import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.ResponseBody
import retrofit2.Retrofit
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory

class ApiException(message: String) : IOException(message)

class ApiErrorInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val response = try {
            chain.proceed(request)
        } catch (error: ApiException) {
            throw error
        } catch (_: IOException) {
            throw ApiException("cannot reach server")
        }
        val voice = request.url.encodedPath.endsWith("/voice/transcribe")
        if (response.isSuccessful || voice) return response
        val message = errorMessage(response)
        response.close()
        throw ApiException(message)
    }

    private fun errorMessage(response: Response): String {
        val raw = try {
            response.peekBody(MAX_ERROR_BYTES).string()
        } catch (_: Exception) {
            return "HTTP ${response.code}"
        }
        return parseApiError(raw, response.code)
    }

    companion object {
        private const val MAX_ERROR_BYTES = 64L * 1024L
    }
}

fun parseApiError(raw: String, status: Int): String {
    return try {
        val element = ApiJson.json.parseToJsonElement(raw)
        val error = (element as? JsonObject)
            ?.get("error")
            ?.jsonPrimitive
            ?.content
            ?.takeIf { it.isNotBlank() }
        error ?: "HTTP $status"
    } catch (_: Exception) {
        "HTTP $status"
    }
}

interface Talk2ScaleApi {
    @GET("users/{userId}")
    suspend fun getUser(@Path("userId") userId: Int): UserDto

    @GET("users/{userId}/food-logs")
    suspend fun getFoodLogs(
        @Path("userId") userId: Int,
        @Query("from") from: String,
        @Query("to") to: String,
    ): List<FoodLogDto>

    @GET("users/{userId}/food-logs/nutrients")
    suspend fun getFoodLogNutrients(
        @Path("userId") userId: Int,
        @Query("from") from: String,
        @Query("to") to: String,
    ): List<NutrientGroupDto>

    @GET("users/{userId}/daily-targets")
    suspend fun getDailyTargets(@Path("userId") userId: Int): ResponseBody?

    @GET("elements")
    suspend fun getElements(@Query("type") type: String): List<ElementDto>

    @GET("search-food")
    suspend fun searchFood(@Query("food_name") foodName: String): List<FoodHitDto>

    @POST("food-logs")
    suspend fun createFoodLog(@Body body: NewFoodLogBody): FoodLogDto

    @PUT("food-logs/{id}")
    suspend fun updateFoodLog(
        @Path("id") id: Int,
        @Body body: UpdateFoodLogBody,
    ): FoodLogDto

    @DELETE("food-logs/{id}")
    suspend fun deleteFoodLog(@Path("id") id: Int): retrofit2.Response<Unit>

    @POST("recipes")
    suspend fun createRecipe(@Body body: NewRecipeBody): ResponseBody?

    @Multipart
    @POST("voice/transcribe")
    suspend fun transcribe(
        @Part audio: okhttp3.MultipartBody.Part,
    ): retrofit2.Response<ResponseBody>
}

fun createTalk2ScaleApi(baseUrl: String): Talk2ScaleApi {
    val normalized = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"
    val client = OkHttpClient.Builder()
        .callTimeout(15, TimeUnit.SECONDS)
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .addInterceptor(ApiErrorInterceptor())
        .build()
    val contentType = "application/json".toMediaType()
    return Retrofit.Builder()
        .baseUrl(normalized)
        .client(client)
        .addConverterFactory(ApiJson.json.asConverterFactory(contentType))
        .build()
        .create(Talk2ScaleApi::class.java)
}
