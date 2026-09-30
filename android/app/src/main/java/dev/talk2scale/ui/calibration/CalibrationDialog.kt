package dev.talk2scale.ui.calibration

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.talk2scale.scale.ConnectionState
import dev.talk2scale.scale.ScaleRepository

@Composable
fun CalibrationDialog(
    scale: ScaleRepository,
    onDismiss: () -> Unit,
) {
    val connection by scale.connection.collectAsStateWithLifecycle()
    val connected = connection == ConnectionState.Connected
    var grams by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Calibrate Scale") },
        text = {
            Column {
                Text("1. Remove everything from the scale and press Set Zero.")
                Button(
                    onClick = { if (connected) scale.sendTare() },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 8.dp),
                ) { Text("Set Zero") }
                Text(
                    "2. Place a known weight on the scale, enter it in grams, and press Set Calibration Weight.",
                    modifier = Modifier.padding(top = 16.dp),
                )
                OutlinedTextField(
                    value = grams,
                    onValueChange = { grams = it.filter { char -> char.isDigit() } },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 8.dp),
                    placeholder = { Text("Weight in grams") },
                    singleLine = true,
                )
                Button(
                    onClick = {
                        if (!connected) return@Button
                        val value = grams.toIntOrNull() ?: return@Button
                        if (value <= 0) return@Button
                        scale.sendCalibrate(value)
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Set Calibration Weight") }
                if (!connected) {
                    Text(
                        "Scale not connected",
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 12.dp),
                        color = Color(0xFFC62828),
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 16.sp,
                        textAlign = TextAlign.Center,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Close") }
        },
    )
}
