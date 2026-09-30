package dev.talk2scale.scale

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.Handler
import android.os.HandlerThread
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.suspendCancellableCoroutine

class BleScaleTransport(private val context: Context) : ScaleTransport {
    private val bluetoothManager = context.getSystemService(BluetoothManager::class.java)
    private val gattThread = HandlerThread("scale-gatt").apply { start() }
    private val gattHandler = Handler(gattThread.looper)

    private var listener: ScaleListener? = null
    private var gatt: BluetoothGatt? = null
    private var notifyChar: BluetoothGattCharacteristic? = null
    private var writeChar: BluetoothGattCharacteristic? = null
    private var scanning = false
    private var generation = 0
    private var onDeviceFound: () -> Unit = {}
    private var onScanError: (String) -> Unit = {}
    private val discovered = LinkedHashMap<String, ScannedDevice>()
    private val writeQueue = ArrayDeque<ByteArray>()
    private var writeInFlight = false

    private val _devices = MutableStateFlow<List<ScannedDevice>>(emptyList())
    override val devices: StateFlow<List<ScannedDevice>> = _devices

    fun isBluetoothEnabled(): Boolean = adapter()?.isEnabled == true

    override fun setListener(listener: ScaleListener?) {
        this.listener = listener
    }

    @SuppressLint("MissingPermission")
    override fun startScan(onDeviceFound: () -> Unit, onError: (String) -> Unit) {
        this.onDeviceFound = onDeviceFound
        this.onScanError = onError
        val scanner = adapter()?.bluetoothLeScanner
        if (scanner == null) {
            onError("Bluetooth is off")
            return
        }
        if (scanning) return
        scanning = true
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()
        try {
            scanner.startScan(null, settings, scanCallback)
        } catch (error: SecurityException) {
            scanning = false
            onError(error.message ?: "Bluetooth scan failed")
        }
    }

    @SuppressLint("MissingPermission")
    override fun stopScan() {
        if (!scanning) return
        scanning = false
        try {
            adapter()?.bluetoothLeScanner?.stopScan(scanCallback)
        } catch (_: SecurityException) {
            // Permission was revoked while scanning.
        }
    }

    override fun clearDiscovered() {
        synchronized(discovered) {
            discovered.clear()
            _devices.value = emptyList()
        }
    }

    @SuppressLint("MissingPermission")
    override suspend fun connect(address: String, autoConnect: Boolean) {
        stopScan()
        suspendCancellableCoroutine { continuation ->
            gattHandler.post {
                listener?.onConnectionStateChanged(ConnectionState.Connecting)
                closeGatt(dispatchDisconnected = false)
                val session = ++generation
                val device = try {
                    adapter()?.getRemoteDevice(address)
                } catch (error: IllegalArgumentException) {
                    listener?.onConnectionStateChanged(ConnectionState.Disconnected)
                    if (continuation.isActive) continuation.resumeWithException(error)
                    return@post
                }
                if (device == null) {
                    listener?.onConnectionStateChanged(ConnectionState.Disconnected)
                    if (continuation.isActive) {
                        continuation.resumeWithException(IllegalStateException("Bluetooth is off"))
                    }
                    return@post
                }
                val callback = SessionCallback(session, continuation)
                try {
                    gatt = device.connectGatt(
                        context,
                        autoConnect,
                        callback,
                        BluetoothDevice.TRANSPORT_LE,
                        BluetoothDevice.PHY_LE_1M_MASK,
                        gattHandler,
                    )
                } catch (error: SecurityException) {
                    listener?.onConnectionStateChanged(ConnectionState.Disconnected)
                    if (continuation.isActive) continuation.resumeWithException(error)
                }
            }
            continuation.invokeOnCancellation {
                gattHandler.post { closeGatt(dispatchDisconnected = true) }
            }
        }
    }

    override fun disconnect() {
        gattHandler.post { closeGatt(dispatchDisconnected = true) }
    }

    override fun sendTare() {
        enqueueWrite(ScaleCodec.tareBytes())
    }

    override fun sendCalibrate(refMassGrams: Int) {
        enqueueWrite(ScaleCodec.calibrateBytes(refMassGrams))
    }

    override fun close() {
        stopScan()
        disconnect()
    }

    fun shutdown() {
        close()
        gattThread.quitSafely()
    }

    private fun adapter(): BluetoothAdapter? = bluetoothManager?.adapter

    private fun enqueueWrite(bytes: ByteArray) {
        gattHandler.post {
            writeQueue.add(bytes)
            drainWrites()
        }
    }

    @SuppressLint("MissingPermission")
    private fun drainWrites() {
        if (writeInFlight) return
        val next = writeQueue.removeFirstOrNull() ?: return
        val current = gatt
        val characteristic = writeChar
        if (current == null || characteristic == null) {
            writeQueue.clear()
            return
        }
        writeInFlight = true
        try {
            current.writeCharacteristic(
                characteristic,
                next,
                BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT,
            )
        } catch (_: SecurityException) {
            writeInFlight = false
            drainWrites()
        }
    }

    @SuppressLint("MissingPermission")
    private fun closeGatt(dispatchDisconnected: Boolean) {
        generation += 1
        writeQueue.clear()
        writeInFlight = false
        notifyChar = null
        writeChar = null
        val current = gatt
        gatt = null
        if (current != null) {
            try {
                current.disconnect()
            } catch (_: SecurityException) {
                // Already gone.
            }
            current.close()
        }
        if (dispatchDisconnected) {
            listener?.onConnectionStateChanged(ConnectionState.Disconnected)
        }
    }

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val record = result.scanRecord
            val name = record?.deviceName
            val serviceIds = record?.serviceUuids?.map { it.uuid.toString().lowercase() }.orEmpty()
            val isScale = serviceIds.any { it == ScaleUuids.SERVICE } || name == ScaleUuids.DEVICE_NAME
            if (!isScale) return
            val address = result.device.address ?: return
            val added = synchronized(discovered) {
                if (discovered.containsKey(address)) {
                    false
                } else {
                    discovered[address] = ScannedDevice(address, name)
                    _devices.value = discovered.values.toList()
                    true
                }
            }
            if (added) onDeviceFound()
        }

        override fun onScanFailed(errorCode: Int) {
            scanning = false
            onScanError("Bluetooth scan failed")
        }
    }

    private inner class SessionCallback(
        private val session: Int,
        private val continuation: CancellableContinuation<Unit>,
    ) : BluetoothGattCallback() {
        private fun active(): Boolean = session == generation

        @SuppressLint("MissingPermission")
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            if (!active()) return
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> {
                    if (status == BluetoothGatt.GATT_SUCCESS) {
                        gatt.discoverServices()
                    } else {
                        fail(IllegalStateException("Connection failed"))
                    }
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    notifyChar = null
                    writeChar = null
                    if (this@BleScaleTransport.gatt == gatt) {
                        this@BleScaleTransport.gatt = null
                    }
                    listener?.onConnectionStateChanged(ConnectionState.Disconnected)
                    if (continuation.isActive) {
                        continuation.resumeWithException(IllegalStateException("Connection failed"))
                    }
                }
            }
        }

        @SuppressLint("MissingPermission")
        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (!active()) return
            if (status != BluetoothGatt.GATT_SUCCESS) {
                fail(IllegalStateException("Connection failed"))
                return
            }
            val service = gatt.getService(ScaleUuids.service)
            val notify = service?.getCharacteristic(ScaleUuids.notify)
            val write = service?.getCharacteristic(ScaleUuids.write)
            if (notify == null || write == null) {
                fail(IllegalStateException("Connection failed"))
                return
            }
            notifyChar = notify
            writeChar = write
            gatt.setCharacteristicNotification(notify, true)
            val cccd = notify.getDescriptor(ScaleUuids.CCCD)
            if (cccd == null) {
                fail(IllegalStateException("Connection failed"))
                return
            }
            try {
                gatt.writeDescriptor(cccd, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
            } catch (_: SecurityException) {
                fail(IllegalStateException("Connection failed"))
            }
        }

        override fun onDescriptorWrite(
            gatt: BluetoothGatt,
            descriptor: BluetoothGattDescriptor,
            status: Int,
        ) {
            if (!active() || descriptor.uuid != ScaleUuids.CCCD) return
            if (status == BluetoothGatt.GATT_SUCCESS) {
                listener?.onConnectionStateChanged(ConnectionState.Connected)
                if (continuation.isActive) continuation.resume(Unit)
            } else {
                fail(IllegalStateException("Connection failed"))
            }
        }

        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray,
        ) {
            if (!active() || characteristic.uuid != ScaleUuids.notify) return
            val grams = ScaleCodec.decodeWeight(value) ?: return
            listener?.onWeightData(grams)
        }

        override fun onCharacteristicWrite(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int,
        ) {
            if (!active()) return
            writeInFlight = false
            drainWrites()
        }

        private fun fail(error: Exception) {
            listener?.onConnectionStateChanged(ConnectionState.Disconnected)
            if (continuation.isActive) continuation.resumeWithException(error)
        }
    }
}
