package dev.talk2scale.voice

import dev.talk2scale.data.api.ApiException
import dev.talk2scale.data.api.ApiJson
import dev.talk2scale.data.api.Talk2ScaleApi
import dev.talk2scale.data.api.TranscribeDto
import dev.talk2scale.data.api.parseApiError
import java.io.File
import java.io.IOException
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody

data class TranscribeResult(
    val text: String,
    val grams: Int?,
)

class VoiceRepository(private val api: Talk2ScaleApi) {
    suspend fun transcribe(file: File): TranscribeResult {
        val part = MultipartBody.Part.createFormData(
            "audio",
            "recording.m4a",
            file.asRequestBody("audio/mp4".toMediaType()),
        )
        val response = try {
            api.transcribe(part)
        } catch (error: ApiException) {
            throw error
        } catch (_: IOException) {
            throw ApiException("cannot reach server")
        }
        val raw = response.body()?.use { it.string() }.orEmpty()
        val dto = decode(raw)
        if (!response.isSuccessful) {
            if (!dto?.text.isNullOrBlank()) {
                return TranscribeResult(dto.text, dto.grams)
            }
            val message = dto?.error?.takeIf { it.isNotBlank() } ?: parseApiError(raw, response.code())
            throw ApiException(message)
        }
        val body = dto ?: throw ApiException("HTTP ${response.code()}")
        return TranscribeResult(body.text, body.grams)
    }

    private fun decode(raw: String): TranscribeDto? {
        if (raw.isBlank()) return null
        return try {
            ApiJson.json.decodeFromString<TranscribeDto>(raw)
        } catch (_: Exception) {
            null
        }
    }
}
