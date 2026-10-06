package dev.talk2scale.ui.entry

import android.Manifest
import android.content.pm.PackageManager
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.talk2scale.data.FoodHit

private const val REPEAT_MESSAGE = "Food not found. Please hold the mic and repeat."
private val ButtonShape = RoundedCornerShape(4.dp)
private val Primary = Color(0xFF1976D2)
private val Recording = Color(0xFFC62828)

@Composable
fun FoodEntryPanel(
    viewModel: FoodEntryViewModel,
    active: Boolean,
    modifier: Modifier = Modifier,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(active) { viewModel.setActive(active) }

    val context = LocalContext.current
    LaunchedEffect(viewModel) {
        viewModel.repeatPrompts.collect {
            Toast.makeText(context, REPEAT_MESSAGE, Toast.LENGTH_SHORT).show()
        }
    }
    val micPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (!granted) viewModel.onMicrophoneDenied()
    }
    val micInteraction = remember { MutableInteractionSource() }
    LaunchedEffect(micInteraction, state.controlsEnabled) {
        micInteraction.interactions.collect { event ->
            if (!state.controlsEnabled) return@collect
            when (event) {
                is PressInteraction.Press -> {
                    val granted = ContextCompat.checkSelfPermission(
                        context,
                        Manifest.permission.RECORD_AUDIO,
                    ) == PackageManager.PERMISSION_GRANTED
                    if (granted) viewModel.onMicDown() else micPermission.launch(Manifest.permission.RECORD_AUDIO)
                }
                is PressInteraction.Release,
                is PressInteraction.Cancel,
                -> viewModel.onMicUp()
            }
        }
    }

    val inputEnabled = state.controlsEnabled && !state.listening
    Column(modifier = modifier.fillMaxWidth()) {
        WeightDisplay(
            grams = state.grams,
            stable = state.stable,
            live = state.scaleLive,
            onClick = viewModel::addMockWeight,
            onToggleMock = viewModel::toggleMock,
        )
        Box(
            modifier = Modifier
                .padding(start = 16.dp, end = 16.dp, bottom = 8.dp)
                .fillMaxWidth()
                .clip(ButtonShape)
                .background(Color(0xFFE0E0E0))
                .clickable(enabled = inputEnabled, onClick = viewModel::tare)
                .padding(12.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text("TARE", fontWeight = FontWeight.SemiBold, color = Color.Black)
        }
        Column(modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 8.dp)) {
            Box {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        Icons.Filled.Search,
                        contentDescription = null,
                        modifier = Modifier
                            .padding(end = 8.dp)
                            .size(22.dp),
                        tint = Color(0xFF666666),
                    )
                    BasicTextField(
                        value = state.query,
                        onValueChange = viewModel::onQueryChange,
                        modifier = Modifier.weight(1f),
                        enabled = inputEnabled,
                        singleLine = true,
                        textStyle = TextStyle(fontSize = 16.sp, color = Color.Black),
                        decorationBox = { inner ->
                            Box(contentAlignment = Alignment.CenterStart) {
                                if (state.query.isEmpty()) {
                                    Text("Food name", fontSize = 16.sp, color = Color(0xFF999999))
                                }
                                inner()
                            }
                        },
                    )
                    if (state.query.isNotEmpty() && !state.listening) {
                        Icon(
                            Icons.Filled.Cancel,
                            contentDescription = "Clear",
                            modifier = Modifier
                                .clip(RoundedCornerShape(50))
                                .clickable(onClick = viewModel::onClear)
                                .padding(4.dp)
                                .size(28.dp),
                            tint = Color(0xFF666666),
                        )
                    }
                }
                if (state.listening) {
                    Box(
                        modifier = Modifier
                            .matchParentSize()
                            .background(Color(0xB3000000), ButtonShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("Listening...", color = Color.White, fontWeight = FontWeight.Bold)
                    }
                }
            }
            val showResults = state.query.isNotBlank() &&
                !state.listening &&
                state.controlsEnabled &&
                (state.searching || state.results.isNotEmpty())
            if (showResults) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(ButtonShape)
                        .border(1.dp, Color(0xFFDDDDDD), ButtonShape),
                ) {
                    if (state.searching) {
                        Text(
                            "Searching...",
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                            color = Color(0xFF666666),
                        )
                    } else {
                        if (state.showAutoSelect) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(3.dp)
                                    .background(Color(0xFFE0E0E0)),
                            ) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth(state.autoSelectProgress)
                                        .fillMaxHeight()
                                        .background(Primary),
                                )
                            }
                        }
                        state.results.forEach { hit ->
                            FoodHitRow(hit = hit, onClick = { viewModel.pick(hit) })
                        }
                    }
                }
            }
        }
        Row(
            modifier = Modifier
                .padding(start = 16.dp, end = 16.dp, bottom = 8.dp)
                .fillMaxWidth()
                .clip(ButtonShape)
                .background(if (state.listening) Recording else Primary)
                .clickable(
                    interactionSource = micInteraction,
                    indication = ripple(),
                    enabled = state.controlsEnabled,
                    onClick = {},
                )
                .padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.Mic, contentDescription = null, modifier = Modifier.size(20.dp), tint = Color.White)
            Text(
                text = if (state.listening) "Release to send" else "Hold to speak",
                color = Color.White,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }

    val error = state.error
    if (error != null) {
        AlertDialog(
            onDismissRequest = viewModel::dismissError,
            text = { Text(errorText(error, state.errorMessage)) },
            confirmButton = {
                TextButton(onClick = viewModel::dismissError) { Text("OK") }
            },
        )
    }
}

@Composable
private fun FoodHitRow(hit: FoodHit, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    ) {
        Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
            Text(hit.name, fontSize = 15.sp, color = Color(0xFF222222), maxLines = 1)
            Text(
                hit.type,
                modifier = Modifier.padding(top = 2.dp),
                fontSize = 12.sp,
                color = Color(0xFF777777),
            )
        }
        HorizontalDivider(thickness = Dp.Hairline, color = Color(0xFFEEEEEE))
    }
}

private fun errorText(error: FoodEntryError, message: String?): String = when (error) {
    FoodEntryError.NoWeight -> "No weight reading yet"
    FoodEntryError.MicPermission -> "Microphone permission is required. You can still type a food name."
    FoodEntryError.EnterName -> "Enter a food name first"
    FoodEntryError.Message -> message ?: "Unable to add food"
}
