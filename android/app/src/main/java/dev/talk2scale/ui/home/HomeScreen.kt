package dev.talk2scale.ui.home

import android.app.Application
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bluetooth
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.Scale
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import dev.talk2scale.Talk2ScaleApp
import dev.talk2scale.ui.calibration.CalibrationDialog
import dev.talk2scale.ui.entry.FoodEntryEvent
import dev.talk2scale.ui.entry.FoodEntryMode
import dev.talk2scale.ui.entry.FoodEntryPanel
import dev.talk2scale.ui.entry.FoodEntryViewModel
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

@Composable
fun HomeScreen(
    onOpenConnection: (autoStart: Boolean) -> Unit,
    onOpenRecipe: () -> Unit,
    homeViewModel: HomeViewModel = viewModel(),
) {
    val app = LocalContext.current.applicationContext as Application
    val entryViewModel: FoodEntryViewModel = viewModel(
        key = "food-entry-log",
        factory = FoodEntryViewModel.factory(app, FoodEntryMode.Log),
    )
    val state by homeViewModel.state.collectAsStateWithLifecycle()
    val pagerState = rememberPagerState(pageCount = { 2 })
    val scope = rememberCoroutineScope()
    val lifecycleOwner = LocalLifecycleOwner.current
    var showUserDialog by remember { mutableStateOf(false) }
    var userIdInput by remember { mutableStateOf("") }
    var showMenu by remember { mutableStateOf(false) }
    var showCalibration by remember { mutableStateOf(false) }
    var showDisconnected by remember { mutableStateOf(false) }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) homeViewModel.refresh()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    LaunchedEffect(entryViewModel) {
        entryViewModel.events.collect { event ->
            if (event is FoodEntryEvent.Saved) {
                homeViewModel.clearSelection()
                homeViewModel.refresh()
            }
        }
    }
    LaunchedEffect(pagerState) {
        snapshotFlow { pagerState.currentPage }.collect { page ->
            if (page == 0) homeViewModel.loadSummary()
        }
    }

    val carouselHeight = maxOf(280, (LocalConfiguration.current.screenHeightDp * 0.36f).roundToInt()).dp

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.White)
            .safeDrawingPadding(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TopBarIcon(Icons.Outlined.AccountCircle, "User", size = 32.dp) {
                userIdInput = state.userId.toString()
                showUserDialog = true
            }
            Text(
                state.userName ?: "#${state.userId}",
                modifier = Modifier.padding(start = 4.dp),
                fontSize = 16.sp,
            )
            Box(modifier = Modifier.weight(1f))
            TopBarIcon(Icons.Filled.Bluetooth, "Bluetooth") {
                onOpenConnection(!state.connected)
            }
            TopBarIcon(Icons.Outlined.Settings, "Settings") {
                if (state.connected) showCalibration = true else showDisconnected = true
            }
            Box {
                TopBarIcon(Icons.Filled.Menu, "Menu") { showMenu = true }
                DropdownMenu(expanded = showMenu, onDismissRequest = { showMenu = false }) {
                    DropdownMenuItem(
                        text = { Text("Create Recipe") },
                        onClick = {
                            showMenu = false
                            onOpenRecipe()
                        },
                    )
                }
            }
        }

        HorizontalPager(
            state = pagerState,
            modifier = Modifier
                .fillMaxWidth()
                .height(carouselHeight - 16.dp),
        ) { page ->
            if (page == 0) {
                NutritionSummary(
                    rows = state.summary,
                    loading = state.summaryLoading,
                    error = state.summaryError,
                )
            } else {
                Column(
                    modifier = Modifier
                        .verticalScroll(rememberScrollState())
                        .padding(bottom = 8.dp),
                ) {
                    FoodEntryPanel(
                        viewModel = entryViewModel,
                        active = pagerState.currentPage == 1,
                    )
                }
            }
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(16.dp)
                .padding(bottom = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PageDot(active = pagerState.currentPage == 0, label = "Nutrition") {
                scope.launch {
                    entryViewModel.clearEdit()
                    homeViewModel.clearSelection()
                    pagerState.animateScrollToPage(0)
                    homeViewModel.loadSummary()
                }
            }
            PageDot(active = pagerState.currentPage == 1, label = "Scale") {
                scope.launch { pagerState.animateScrollToPage(1) }
            }
        }
        Text(
            "Today's food",
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            fontWeight = FontWeight.Bold,
            fontSize = 16.sp,
        )
        FoodLogList(
            logs = state.logs,
            loading = state.logsLoading,
            error = state.logsError,
            selectedLogId = state.selectedLogId,
            onPressLog = { log ->
                homeViewModel.selectLog(log)
                entryViewModel.beginEdit(log.id, log.name)
                scope.launch { pagerState.animateScrollToPage(1) }
            },
            onDelete = homeViewModel::deleteLog,
            modifier = Modifier.weight(1f),
        )
        Box(modifier = Modifier.padding(16.dp)) {
            if (pagerState.currentPage == 0) {
                Button(
                    onClick = { scope.launch { pagerState.animateScrollToPage(1) } },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(4.dp),
                    contentPadding = PaddingValues(14.dp),
                ) {
                    Text("Add Food From Scale", fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.width(8.dp))
                    Icon(Icons.Outlined.Scale, contentDescription = null, modifier = Modifier.size(20.dp))
                }
            } else {
                OutlinedButton(
                    onClick = {
                        entryViewModel.clearEdit()
                        homeViewModel.clearSelection()
                        scope.launch {
                            pagerState.animateScrollToPage(0)
                        }
                        homeViewModel.loadSummary()
                    },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(4.dp),
                    border = BorderStroke(1.dp, Color(0xFFCCCCCC)),
                    contentPadding = PaddingValues(14.dp),
                ) {
                    Text(
                        "Back",
                        color = Color(0xFF333333),
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
    }

    if (showUserDialog) {
        AlertDialog(
            onDismissRequest = { showUserDialog = false },
            title = { Text("User ID") },
            text = {
                OutlinedTextField(
                    value = userIdInput,
                    onValueChange = { userIdInput = it.filter { char -> char.isDigit() } },
                    placeholder = { Text("Enter user id") },
                    singleLine = true,
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    homeViewModel.confirmUserId(userIdInput)
                    showUserDialog = false
                }) { Text("OK") }
            },
            dismissButton = {
                TextButton(onClick = { showUserDialog = false }) { Text("Cancel") }
            },
        )
    }
    if (state.deleteFailed) {
        AlertDialog(
            onDismissRequest = homeViewModel::dismissDeleteError,
            text = { Text("Unable to delete food log") },
            confirmButton = {
                TextButton(onClick = homeViewModel::dismissDeleteError) { Text("OK") }
            },
        )
    }
    if (showDisconnected) {
        AlertDialog(
            onDismissRequest = { showDisconnected = false },
            text = { Text("Scale not connected") },
            confirmButton = {
                TextButton(onClick = { showDisconnected = false }) { Text("OK") }
            },
        )
    }
    if (showCalibration) {
        val scale = (app as Talk2ScaleApp).container.scaleRepository
        CalibrationDialog(scale = scale, onDismiss = { showCalibration = false })
    }
}

@Composable
private fun TopBarIcon(
    icon: ImageVector,
    label: String,
    size: Dp = 28.dp,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .clip(CircleShape)
            .clickable(onClick = onClick)
            .padding(8.dp),
    ) {
        Icon(icon, contentDescription = label, modifier = Modifier.size(size), tint = Color(0xFF333333))
    }
}

@Composable
private fun PageDot(active: Boolean, label: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(8.dp)
            .clip(CircleShape)
            .background(if (active) Color(0xFF1976D2) else Color(0xFFC5CED8))
            .clickable(onClick = onClick)
            .semantics { contentDescription = label },
    )
}
