package dev.talk2scale.voice

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import java.io.File

enum class RecordStart {
    Started,
    PermissionDenied,
    Failed,
}

class VoiceRecorder(private val context: Context) {
    private var recorder: MediaRecorder? = null
    private var output: File? = null
    private var autoStop: Runnable? = null
    private val handler = Handler(Looper.getMainLooper())

    fun start(onAutoStop: () -> Unit): RecordStart {
        discard()
        val granted = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECORD_AUDIO,
        ) == PackageManager.PERMISSION_GRANTED
        if (!granted) return RecordStart.PermissionDenied

        val file = File(context.cacheDir, "recording.m4a")
        if (file.exists()) file.delete()
        val media = MediaRecorder(context)
        try {
            media.setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION)
            media.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            media.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            media.setAudioSamplingRate(44_100)
            media.setAudioChannels(1)
            media.setAudioEncodingBitRate(128_000)
            media.setOutputFile(file.absolutePath)
            media.prepare()
            media.start()
        } catch (_: Exception) {
            media.release()
            file.delete()
            return RecordStart.Failed
        }
        recorder = media
        output = file
        val stop = Runnable { onAutoStop() }
        autoStop = stop
        handler.postDelayed(stop, MAX_RECORDING_MS)
        return RecordStart.Started
    }

    fun stop(): File? {
        clearAutoStop()
        val media = recorder ?: return null
        val file = output
        recorder = null
        output = null
        return try {
            media.stop()
            media.release()
            file
        } catch (_: Exception) {
            try {
                media.release()
            } catch (_: Exception) {
                // Already released.
            }
            file?.delete()
            null
        }
    }

    fun discard() {
        clearAutoStop()
        val media = recorder
        recorder = null
        val file = output
        output = null
        if (media != null) {
            try {
                media.stop()
            } catch (_: Exception) {
                // Stopping a recorder that never received audio throws.
            }
            try {
                media.release()
            } catch (_: Exception) {
                // Already released.
            }
        }
        file?.delete()
    }

    private fun clearAutoStop() {
        autoStop?.let { handler.removeCallbacks(it) }
        autoStop = null
    }

    companion object {
        const val MAX_RECORDING_MS = 10_000L
    }
}
