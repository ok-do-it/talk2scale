package dev.talk2scale.ui.connection

import android.app.Application
import android.bluetooth.BluetoothAdapter
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import dev.talk2scale.Talk2ScaleApp
import dev.talk2scale.scale.ConnectionState
import dev.talk2scale.scale.ScannedDevice
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

enum class ConnectionStatus {
    Disconnected,
    Reconnecting,
    Searching,
    SelectScale,
    Connecting,
    Connected,
    Failed,
    BluetoothOff,
    PermissionDenied,
}

data class ConnectionUiState(
    val status: ConnectionStatus = ConnectionStatus.Disconnected,
    val devices: List<ScannedDevice> = emptyList(),
    val connected: Boolean = false,
    val inProgress: Boolean = false,
    val bluetoothOn: Boolean = true,
)

class ConnectionViewModel(application: Application) : AndroidViewModel(application) {
    private val app = application
    private val scale = (application as Talk2ScaleApp).container.scaleRepository
    private val preferences = (application as Talk2ScaleApp).container.preferences

    private val _state = MutableStateFlow(
        ConnectionUiState(bluetoothOn = scale.isBluetoothEnabled()),
    )
    val state: StateFlow<ConnectionUiState> = _state.asStateFlow()

    private val _permissionRequests = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val permissionRequests: SharedFlow<Unit> = _permissionRequests.asSharedFlow()

    private var opened = false
    private var connectWhenBluetoothOn = false
    private var attempted = false

    private val bluetoothReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action != BluetoothAdapter.ACTION_STATE_CHANGED) return
            val radio = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR)
            val on = radio == BluetoothAdapter.STATE_ON
            _state.update { it.copy(bluetoothOn = on) }
            if (on && connectWhenBluetoothOn) {
                connectWhenBluetoothOn = false
                beginConnection()
            }
        }
    }

    init {
        val filter = IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED)
        ContextCompat.registerReceiver(
            app,
            bluetoothReceiver,
            filter,
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )
        viewModelScope.launch {
            scale.connection.collect { connection ->
                val connected = connection == ConnectionState.Connected
                val inProgress = scale.realConnectionRequested.value && !connected
                _state.update { current ->
                    val status = when {
                        connected -> ConnectionStatus.Connected
                        current.status == ConnectionStatus.BluetoothOff -> current.status
                        current.status == ConnectionStatus.PermissionDenied -> current.status
                        current.status == ConnectionStatus.Searching && inProgress -> current.status
                        current.status == ConnectionStatus.SelectScale && current.devices.isNotEmpty() ->
                            current.status
                        current.status == ConnectionStatus.Connecting && inProgress -> current.status
                        inProgress -> ConnectionStatus.Reconnecting
                        else -> ConnectionStatus.Disconnected
                    }
                    current.copy(
                        connected = connected,
                        inProgress = inProgress,
                        status = status,
                    )
                }
                if (connected) scale.stopScan()
            }
        }
        viewModelScope.launch {
            scale.devices.collect { devices ->
                _state.update { current ->
                    current.copy(
                        devices = devices,
                        status = if (!current.connected && devices.isNotEmpty()) {
                            ConnectionStatus.SelectScale
                        } else {
                            current.status
                        },
                    )
                }
            }
        }
    }

    override fun onCleared() {
        app.unregisterReceiver(bluetoothReceiver)
        scale.stopScan()
        super.onCleared()
    }

    fun onOpened(autoStart: Boolean) {
        if (opened) return
        opened = true
        val connected = scale.connection.value == ConnectionState.Connected
        if (autoStart && !connected) {
            startConnectionFlow()
        } else if (connected) {
            _state.update { it.copy(status = ConnectionStatus.Connected, connected = true) }
        }
    }

    fun startConnectionFlow() {
        attempted = true
        if (!hasBluetoothPermission()) {
            _permissionRequests.tryEmit(Unit)
            return
        }
        beginConnection()
    }

    fun onPermissionResult(granted: Boolean) {
        if (!granted) {
            _state.update { it.copy(status = ConnectionStatus.PermissionDenied, inProgress = false) }
            scale.cancelConnection()
            return
        }
        beginConnection()
    }

    fun connectWhenReady() {
        connectWhenBluetoothOn = true
        _state.update { it.copy(status = ConnectionStatus.BluetoothOff) }
    }

    fun selectDevice(device: ScannedDevice) {
        scale.stopScan()
        _state.update { it.copy(status = ConnectionStatus.Connecting, inProgress = true) }
        viewModelScope.launch {
            try {
                scale.connectToRealDevice(device.address, autoConnect = false)
            } catch (_: Exception) {
                _state.update { it.copy(status = ConnectionStatus.Failed, inProgress = false) }
            }
        }
    }

    fun disconnect() {
        scale.disconnect()
        _state.update {
            it.copy(status = ConnectionStatus.Disconnected, connected = false, inProgress = false)
        }
    }

    fun forgetAll() {
        viewModelScope.launch { scale.forgetStoredDevice() }
    }

    fun cancel() {
        connectWhenBluetoothOn = false
        scale.stopScan()
        scale.cancelConnection()
    }

    private fun beginConnection() {
        if (!scale.isBluetoothEnabled()) {
            connectWhenBluetoothOn = true
            _state.update { it.copy(status = ConnectionStatus.BluetoothOff, inProgress = false) }
            return
        }
        viewModelScope.launch {
            val mac = preferences.scaleMac.first()
            if (!mac.isNullOrBlank()) {
                _state.update { it.copy(status = ConnectionStatus.Reconnecting, inProgress = true) }
                try {
                    scale.connectToRealDevice(mac, autoConnect = true)
                } catch (_: Exception) {
                    _state.update { it.copy(status = ConnectionStatus.Failed, inProgress = false) }
                }
            } else {
                _state.update { it.copy(status = ConnectionStatus.Searching, inProgress = true, devices = emptyList()) }
                scale.prepareForRealConnection()
                scale.startScan {
                    _state.update { it.copy(status = ConnectionStatus.Failed, inProgress = false) }
                }
            }
        }
    }

    private fun hasBluetoothPermission(): Boolean {
        val scan = ContextCompat.checkSelfPermission(app, android.Manifest.permission.BLUETOOTH_SCAN)
        val connect = ContextCompat.checkSelfPermission(app, android.Manifest.permission.BLUETOOTH_CONNECT)
        return scan == PackageManager.PERMISSION_GRANTED && connect == PackageManager.PERMISSION_GRANTED
    }
}
