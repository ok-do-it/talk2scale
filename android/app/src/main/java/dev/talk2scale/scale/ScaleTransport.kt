package dev.talk2scale.scale

import kotlinx.coroutines.flow.StateFlow

enum class ConnectionState {
    Disconnected,
    Connecting,
    Connected,
}

data class WeightReading(
    val grams: Int,
    val stable: Boolean,
)

data class ScannedDevice(
    val address: String,
    val name: String?,
)

interface ScaleListener {
    fun onConnectionStateChanged(state: ConnectionState)
    fun onWeightData(grams: Int)
}

/**
 * Shared contract for the real scale and mock mode.
 * Scan, connect, and disconnect apply to BLE; mock implementations no-op them.
 */
interface ScaleTransport {
    val devices: StateFlow<List<ScannedDevice>>

    fun setListener(listener: ScaleListener?)
    fun startScan(onDeviceFound: () -> Unit = {}, onError: (String) -> Unit = {})
    fun stopScan()
    fun clearDiscovered()
    suspend fun connect(address: String, autoConnect: Boolean)
    fun disconnect()
    fun sendTare()
    fun sendCalibrate(refMassGrams: Int)
    fun close()
}
