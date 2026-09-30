package dev.talk2scale.ui.connection

import android.bluetooth.BluetoothAdapter
import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bluetooth
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import dev.talk2scale.scale.ScannedDevice

@Composable
fun ConnectionScreen(
    autoStart: Boolean,
    onBack: () -> Unit,
    viewModel: ConnectionViewModel = viewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val permissions = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { result ->
        val granted = result[android.Manifest.permission.BLUETOOTH_SCAN] == true &&
            result[android.Manifest.permission.BLUETOOTH_CONNECT] == true
        viewModel.onPermissionResult(granted)
    }
    val enableBluetooth = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { }

    LaunchedEffect(autoStart) { viewModel.onOpened(autoStart) }
    LaunchedEffect(viewModel) {
        viewModel.permissionRequests.collect {
            permissions.launch(
                arrayOf(
                    android.Manifest.permission.BLUETOOTH_SCAN,
                    android.Manifest.permission.BLUETOOTH_CONNECT,
                ),
            )
        }
    }
    LaunchedEffect(state.status) {
        if (state.status == ConnectionStatus.Connected && autoStart) onBack()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            Icons.Filled.Bluetooth,
            contentDescription = "Bluetooth",
            tint = Color(0xFF1976D2),
            modifier = Modifier.padding(bottom = 24.dp),
        )
        Text(statusText(state.status), fontSize = 18.sp)
        if (state.inProgress && state.status != ConnectionStatus.SelectScale) {
            CircularProgressIndicator(modifier = Modifier.padding(16.dp))
        }
        if (!state.connected && state.devices.isNotEmpty()) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f, fill = false)
                    .padding(vertical = 16.dp),
            ) {
                items(state.devices, key = { it.address }) { device ->
                    DeviceRow(device = device, onClick = { viewModel.selectDevice(device) })
                }
            }
        } else {
            Column(modifier = Modifier.weight(1f)) {}
        }
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (state.status == ConnectionStatus.BluetoothOff) {
                Button(
                    onClick = {
                        viewModel.connectWhenReady()
                        enableBluetooth.launch(Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE))
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Turn on Bluetooth") }
            }
            Button(
                onClick = viewModel::startConnectionFlow,
                enabled = !state.connected && !state.inProgress,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Connect") }
            Button(
                onClick = viewModel::disconnect,
                enabled = state.connected,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Disconnect") }
            OutlinedButton(
                onClick = viewModel::forgetAll,
                enabled = !state.inProgress,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Forget All Devices") }
            OutlinedButton(
                onClick = {
                    if (state.inProgress) viewModel.cancel()
                    onBack()
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (state.inProgress) "Cancel" else "Back") }
        }
    }
}

@Composable
private fun DeviceRow(device: ScannedDevice, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 12.dp),
    ) {
        Text(device.name ?: "Unknown device", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
        Text(device.address, color = Color(0xFF666666), fontSize = 12.sp)
    }
}

private fun statusText(status: ConnectionStatus): String = when (status) {
    ConnectionStatus.Disconnected -> "Disconnected"
    ConnectionStatus.Reconnecting -> "Reconnecting…"
    ConnectionStatus.Searching -> "Searching for scale…"
    ConnectionStatus.SelectScale -> "Select scale"
    ConnectionStatus.Connecting -> "Connecting…"
    ConnectionStatus.Connected -> "Connected"
    ConnectionStatus.Failed -> "Connection failed"
    ConnectionStatus.BluetoothOff -> "Bluetooth is off"
    ConnectionStatus.PermissionDenied ->
        "Bluetooth permission is required to connect the scale. Mock mode is still available."
}
