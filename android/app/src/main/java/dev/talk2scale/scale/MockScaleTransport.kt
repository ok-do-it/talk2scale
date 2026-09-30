package dev.talk2scale.scale

import kotlin.random.Random
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

class MockScaleTransport : ScaleTransport {
    private var listener: ScaleListener? = null
    private var currentWeight = 0
    private val _devices = MutableStateFlow<List<ScannedDevice>>(emptyList())
    override val devices: StateFlow<List<ScannedDevice>> = _devices

    override fun setListener(listener: ScaleListener?) {
        this.listener = listener
    }

    fun start() {
        listener?.onConnectionStateChanged(ConnectionState.Connected)
        listener?.onWeightData(currentWeight)
    }

    fun addRandomWeight() {
        currentWeight += Random.nextInt(251) + 50
        listener?.onWeightData(currentWeight)
    }

    override fun startScan(onDeviceFound: () -> Unit, onError: (String) -> Unit) = Unit

    override fun stopScan() = Unit

    override fun clearDiscovered() = Unit

    override suspend fun connect(address: String, autoConnect: Boolean) = Unit

    override fun disconnect() {
        listener?.onConnectionStateChanged(ConnectionState.Disconnected)
    }

    override fun sendTare() {
        currentWeight = 0
        listener?.onWeightData(currentWeight)
    }

    override fun sendCalibrate(refMassGrams: Int) = Unit

    override fun close() {
        listener?.onConnectionStateChanged(ConnectionState.Disconnected)
    }
}
