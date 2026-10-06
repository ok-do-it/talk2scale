package dev.talk2scale.scale

import dev.talk2scale.data.Preferences
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class ScaleRepository(
    private val preferences: Preferences,
    private val ble: BleScaleTransport,
    private val mock: MockScaleTransport,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val _connection = MutableStateFlow(ConnectionState.Disconnected)
    val connection: StateFlow<ConnectionState> = _connection.asStateFlow()

    private val _reading = MutableStateFlow<WeightReading?>(null)
    val reading: StateFlow<WeightReading?> = _reading.asStateFlow()

    private val _lastGrams = MutableStateFlow(0)
    val lastGrams: StateFlow<Int> = _lastGrams.asStateFlow()

    private val _mockEnabled = MutableStateFlow(true)
    val mockEnabled: StateFlow<Boolean> = _mockEnabled.asStateFlow()

    private val _realConnectionRequested = MutableStateFlow(false)
    val realConnectionRequested: StateFlow<Boolean> = _realConnectionRequested.asStateFlow()

    val devices: StateFlow<List<ScannedDevice>> = ble.devices

    private var recentWeights = IntArray(STABLE_WINDOW)
    private var recentWeightCount = 0
    private var started = false
    private var intentionalClose = false

    fun isBluetoothEnabled(): Boolean = ble.isBluetoothEnabled()

    fun start() {
        if (started) return
        started = true
        ble.setListener(bleListener)
        mock.setListener(mockListener)
        mock.start()
        scope.launch {
            val mac = preferences.scaleMac.first()
            if (!mac.isNullOrBlank()) {
                try {
                    connectToRealDevice(mac, autoConnect = true)
                } catch (_: Exception) {
                    fallBackToMock()
                }
            }
        }
    }

    fun prepareForRealConnection() {
        _realConnectionRequested.value = true
        _mockEnabled.value = false
    }

    suspend fun connectToRealDevice(address: String, autoConnect: Boolean) {
        prepareForRealConnection()
        try {
            ble.connect(address, autoConnect)
            preferences.setScaleMac(address)
        } catch (error: Exception) {
            intentionalClose = true
            ble.close()
            fallBackToMock()
            throw error
        }
    }

    fun disconnect() {
        intentionalClose = true
        _realConnectionRequested.value = false
        _mockEnabled.value = true
        ble.close()
        mock.start()
    }

    fun cancelConnection() {
        intentionalClose = true
        _realConnectionRequested.value = false
        _mockEnabled.value = true
        ble.close()
        mock.start()
    }

    suspend fun forgetStoredDevice() {
        preferences.clearScaleMac()
    }

    fun sendTare() {
        if (_connection.value == ConnectionState.Connected) {
            ble.sendTare()
        } else if (_mockEnabled.value) {
            mock.sendTare()
        }
    }

    fun sendCalibrate(refMassGrams: Int) {
        if (_connection.value == ConnectionState.Connected) {
            ble.sendCalibrate(refMassGrams)
        }
    }

    fun setMockEnabled(enabled: Boolean) {
        if (_mockEnabled.value == enabled) return
        if (enabled) {
            intentionalClose = true
            _mockEnabled.value = true
            _realConnectionRequested.value = false
            ble.close()
            mock.start()
        } else {
            _mockEnabled.value = false
            if (_connection.value != ConnectionState.Connected) {
                clearLiveReading()
            }
        }
    }

    fun addMockWeight() {
        if (_connection.value != ConnectionState.Connected && _mockEnabled.value) {
            mock.addRandomWeight()
        }
    }

    fun startScan(onError: (String) -> Unit) {
        ble.clearDiscovered()
        ble.startScan(onError = onError)
    }

    fun stopScan() {
        ble.stopScan()
    }

    private fun fallBackToMock() {
        intentionalClose = true
        _mockEnabled.value = true
        _realConnectionRequested.value = false
        mock.start()
    }

    private fun clearLiveReading() {
        recentWeights = IntArray(STABLE_WINDOW)
        recentWeightCount = 0
        _reading.value = null
    }

    private fun publishWeight(grams: Int, forceStable: Boolean) {
        val stable = forceStable || isStable(grams)
        _lastGrams.value = grams
        _reading.value = WeightReading(grams, stable)
    }

    private fun isStable(grams: Int): Boolean {
        recentWeights[recentWeightCount % STABLE_WINDOW] = grams
        recentWeightCount += 1
        if (recentWeightCount < STABLE_WINDOW) return false
        val baseline = recentWeights[0]
        for (index in 1 until STABLE_WINDOW) {
            if (recentWeights[index] != baseline) return false
        }
        return true
    }

    private val bleListener = object : ScaleListener {
        override fun onConnectionStateChanged(state: ConnectionState) {
            _connection.value = state
            when (state) {
                ConnectionState.Connected -> _mockEnabled.value = false
                ConnectionState.Disconnected -> {
                    if (intentionalClose) {
                        intentionalClose = false
                    } else {
                        clearLiveReading()
                    }
                }
                ConnectionState.Connecting -> Unit
            }
        }

        override fun onWeightData(grams: Int) {
            if (_connection.value == ConnectionState.Connected) {
                publishWeight(grams, forceStable = false)
            }
        }
    }

    private val mockListener = object : ScaleListener {
        override fun onConnectionStateChanged(state: ConnectionState) = Unit

        override fun onWeightData(grams: Int) {
            val connected = _connection.value == ConnectionState.Connected
            if (!connected && _mockEnabled.value) {
                publishWeight(grams, forceStable = true)
            }
        }
    }

    companion object {
        private const val STABLE_WINDOW = 3
    }
}
