package dev.talk2scale

import android.app.Application
import dev.talk2scale.data.FoodRepository
import dev.talk2scale.data.Preferences
import dev.talk2scale.data.api.createTalk2ScaleApi
import dev.talk2scale.scale.BleScaleTransport
import dev.talk2scale.scale.MockScaleTransport
import dev.talk2scale.scale.ScaleRepository
import dev.talk2scale.voice.VoiceRecorder
import dev.talk2scale.voice.VoiceRepository

class AppContainer(app: Application) {
    val preferences = Preferences(app)
    val api = createTalk2ScaleApi(BuildConfig.API_BASE_URL)
    val foodRepository = FoodRepository(api)
    val voiceRepository = VoiceRepository(api)
    val voiceRecorder = VoiceRecorder(app)
    private val ble = BleScaleTransport(app)
    private val mock = MockScaleTransport()
    val scaleRepository = ScaleRepository(preferences, ble, mock)
}

class Talk2ScaleApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
