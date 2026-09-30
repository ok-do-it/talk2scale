package dev.talk2scale.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.talk2scale.data.api.FoodLogDto
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private const val CLUSTER_GAP_MS = 30 * 60 * 1000L

data class FoodLogRow(
    val id: Int,
    val name: String,
    val loggedAt: String,
    val loggedAtMs: Long,
    val kcal: Int,
)

fun FoodLogDto.toFoodLogRow(): FoodLogRow {
    val instant = Instant.parse(logged_at)
    val time = DateTimeFormatter.ofPattern("h:mm a")
        .withZone(ZoneId.systemDefault())
        .format(instant)
    return FoodLogRow(
        id = id,
        name = raw_name,
        loggedAt = time,
        loggedAtMs = instant.toEpochMilli(),
        kcal = kotlin.math.round(kcal ?: 0.0).toInt(),
    )
}

private sealed interface ListItem {
    val key: String

    data class Header(override val key: String, val label: String) : ListItem
    data class Log(override val key: String, val log: FoodLogRow) : ListItem
}

private fun clusteredItems(logs: List<FoodLogRow>): List<ListItem> {
    val sorted = logs.sortedByDescending { it.loggedAtMs }
    val items = mutableListOf<ListItem>()
    var previous: Long? = null
    var clusterIndex = 0
    for (log in sorted) {
        val needsHeader = previous == null || previous - log.loggedAtMs > CLUSTER_GAP_MS
        if (needsHeader) {
            clusterIndex += 1
            items += ListItem.Header("cluster-$clusterIndex-${log.loggedAtMs}", log.loggedAt)
        }
        items += ListItem.Log("log-${log.id}", log)
        previous = log.loggedAtMs
    }
    return items
}

@Composable
fun FoodLogList(
    logs: List<FoodLogRow>,
    loading: Boolean,
    error: String?,
    selectedLogId: Int?,
    onPressLog: (FoodLogRow) -> Unit,
    onDelete: (FoodLogRow) -> Unit,
    modifier: Modifier = Modifier,
) {
    var pendingDelete by remember { mutableStateOf<FoodLogRow?>(null) }
    Column(modifier = modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xFFF0F0F0))
                .padding(horizontal = 16.dp, vertical = 4.dp),
        ) {
            Text("Food", modifier = Modifier.weight(3f), fontSize = 14.sp, fontWeight = FontWeight.Bold)
            Text(
                "Time",
                modifier = Modifier.weight(1f),
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.End,
            )
            Text(
                "Cal",
                modifier = Modifier.weight(1f),
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.End,
            )
        }
        val items = clusteredItems(logs)
        if (items.isEmpty()) {
            Text(
                text = when {
                    loading -> "Loading food logs..."
                    error != null -> error
                    else -> "No food logs yet"
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 24.dp),
                color = Color(0xFF888888),
                textAlign = TextAlign.Center,
            )
        } else {
            LazyColumn(modifier = Modifier.fillMaxSize()) {
                items(items, key = { it.key }) { item ->
                    when (item) {
                        is ListItem.Header -> Column {
                            Text(
                                text = item.label.uppercase(),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(Color(0xFFF7F9FC))
                                    .padding(horizontal = 16.dp, vertical = 6.dp),
                                color = Color(0xFF607089),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                            )
                            HorizontalDivider(thickness = Dp.Hairline, color = Color(0xFFE4E8EE))
                        }
                        is ListItem.Log -> LogRow(
                            log = item.log,
                            selected = item.log.id == selectedLogId,
                            onPress = { onPressLog(item.log) },
                            onSwipeRight = { pendingDelete = item.log },
                        )
                    }
                }
            }
        }
    }
    val pending = pendingDelete
    if (pending != null) {
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("Are you sure") },
            text = { Text("Delete ${pending.name}?") },
            confirmButton = {
                TextButton(onClick = {
                    pendingDelete = null
                    onDelete(pending)
                }) { Text("Delete") }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) { Text("Cancel") }
            },
        )
    }
}

@Composable
private fun LogRow(
    log: FoodLogRow,
    selected: Boolean,
    onPress: () -> Unit,
    onSwipeRight: () -> Unit,
) {
    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            if (value == SwipeToDismissBoxValue.StartToEnd) onSwipeRight()
            false
        },
    )
    SwipeToDismissBox(
        state = dismissState,
        enableDismissFromStartToEnd = true,
        enableDismissFromEndToStart = false,
        backgroundContent = {
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color(0xFFC62828))
                    .padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Delete", color = Color.White, fontWeight = FontWeight.SemiBold)
            }
        },
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(if (selected) Color(0xFFE3F2FD) else Color.White)
                .clickable(onClick = onPress),
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(log.name, modifier = Modifier.weight(3f), fontSize = 15.sp, maxLines = 1)
                Text(log.loggedAt, modifier = Modifier.weight(1f), fontSize = 15.sp, textAlign = TextAlign.End)
                Text(log.kcal.toString(), modifier = Modifier.weight(1f), fontSize = 15.sp, textAlign = TextAlign.End)
            }
            HorizontalDivider(thickness = Dp.Hairline, color = Color(0xFFDDDDDD))
        }
    }
}
