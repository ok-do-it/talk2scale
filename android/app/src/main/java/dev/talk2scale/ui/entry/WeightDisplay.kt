package dev.talk2scale.ui.entry

import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.talk2scale.BuildConfig

private val UnstableColor = Color(0xFFFFDD00)
private val StableColor = Color(0xFF36D7FF)

@Composable
fun WeightDisplay(
    grams: Int,
    stable: Boolean,
    onClick: () -> Unit,
    onToggleMock: () -> Boolean,
    modifier: Modifier = Modifier,
) {
    var mockNotice by remember { mutableStateOf<String?>(null) }
    Text(
        text = "$grams g",
        color = if (stable) StableColor else UnstableColor,
        fontSize = 48.sp,
        fontWeight = FontWeight.Bold,
        textAlign = TextAlign.Center,
        modifier = modifier
            .fillMaxWidth()
            .pointerInput(Unit) {
                detectTapGestures(
                    onTap = { onClick() },
                    onLongPress = {
                        if (BuildConfig.DEBUG) {
                            val enabled = onToggleMock()
                            mockNotice = if (enabled) "enabled" else "disabled"
                        }
                    },
                )
            }
            .padding(vertical = 16.dp),
    )
    val notice = mockNotice
    if (notice != null) {
        AlertDialog(
            onDismissRequest = { mockNotice = null },
            title = { Text("Mock mode") },
            text = { Text(notice) },
            confirmButton = {
                TextButton(onClick = { mockNotice = null }) { Text("OK") }
            },
        )
    }
}
