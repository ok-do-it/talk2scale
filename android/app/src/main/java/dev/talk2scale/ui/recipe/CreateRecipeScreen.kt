package dev.talk2scale.ui.recipe

import android.app.Application
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import dev.talk2scale.ui.entry.FoodEntryEvent
import dev.talk2scale.ui.entry.FoodEntryMode
import dev.talk2scale.ui.entry.FoodEntryPanel
import dev.talk2scale.ui.entry.FoodEntryViewModel

@Composable
fun CreateRecipeScreen(
    onBack: () -> Unit,
    viewModel: CreateRecipeViewModel = viewModel(),
) {
    val app = LocalContext.current.applicationContext as Application
    val entryViewModel: FoodEntryViewModel = viewModel(
        key = "food-entry-recipe",
        factory = FoodEntryViewModel.factory(app, FoodEntryMode.Ingredient),
    )
    val state by viewModel.state.collectAsStateWithLifecycle()
    var notice by remember { mutableStateOf<String?>(null) }
    var confirmDiscard by remember { mutableStateOf(false) }

    LaunchedEffect(entryViewModel) {
        entryViewModel.events.collect { event ->
            if (event is FoodEntryEvent.IngredientAdded) viewModel.addIngredient(event.food)
        }
    }

    fun requestBack() {
        if (state.hasDraft) confirmDiscard = true else onBack()
    }

    BackHandler(enabled = !confirmDiscard && notice == null && state.error == null) {
        requestBack()
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.padding(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = { requestBack() }) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
            }
            Text("Create Recipe", fontSize = 18.sp, fontWeight = FontWeight.Bold)
        }
        Column(modifier = Modifier.padding(horizontal = 16.dp)) {
            Text("Recipe name", color = Color(0xFF666666), fontSize = 13.sp)
            OutlinedTextField(
                value = state.name,
                onValueChange = viewModel::onNameChange,
                modifier = Modifier.fillMaxWidth(),
                enabled = !state.saving,
                placeholder = { Text("Overnight oats") },
                singleLine = true,
            )
            Text(
                "Serving grams (optional)",
                color = Color(0xFF666666),
                fontSize = 13.sp,
                modifier = Modifier.padding(top = 8.dp),
            )
            OutlinedTextField(
                value = state.servingGrams,
                onValueChange = viewModel::onServingChange,
                modifier = Modifier.fillMaxWidth(),
                enabled = !state.saving,
                placeholder = { Text("Default whole batch: ${state.totalGrams}") },
                singleLine = true,
            )
        }
        FoodEntryPanel(viewModel = entryViewModel, active = !state.saving)
        Text(
            "Ingredients (${state.totalGrams} g)",
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            fontWeight = FontWeight.Bold,
            fontSize = 16.sp,
        )
        if (state.ingredients.isEmpty()) {
            Text(
                "Weigh and resolve ingredients",
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 24.dp),
                color = Color(0xFF888888),
                textAlign = TextAlign.Center,
            )
        }
        LazyColumn(modifier = Modifier.weight(1f)) {
            items(state.ingredients, key = { it.localId }) { item ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(item.name, modifier = Modifier.weight(1f), maxLines = 1)
                    Text("${item.grams} g", modifier = Modifier.padding(horizontal = 8.dp))
                    IconButton(
                        onClick = { viewModel.removeIngredient(item.localId) },
                        enabled = !state.saving,
                    ) {
                        Icon(Icons.Filled.Delete, contentDescription = "Delete", tint = Color(0xFFC62828))
                    }
                }
            }
        }
        Row(
            modifier = Modifier.padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            OutlinedButton(
                onClick = { requestBack() },
                modifier = Modifier.weight(1f),
            ) { Text("Back") }
            Button(
                onClick = {
                    notice = validationMessage(state)
                    if (notice == null) {
                        viewModel.save(
                            name = state.name.trim(),
                            servingGrams = servingOrNull(state.servingGrams),
                            onSaved = onBack,
                        )
                    }
                },
                enabled = !state.saving,
                modifier = Modifier.weight(1f),
            ) { Text(if (state.saving) "Saving..." else "Save Recipe") }
        }
    }

    val message = notice
    if (message != null) {
        AlertDialog(
            onDismissRequest = { notice = null },
            text = { Text(message) },
            confirmButton = { TextButton(onClick = { notice = null }) { Text("OK") } },
        )
    }
    val saveError = state.error
    if (saveError != null) {
        AlertDialog(
            onDismissRequest = viewModel::dismissError,
            text = { Text(saveError) },
            confirmButton = { TextButton(onClick = viewModel::dismissError) { Text("OK") } },
        )
    }
    if (confirmDiscard) {
        AlertDialog(
            onDismissRequest = { confirmDiscard = false },
            title = { Text("Discard recipe?") },
            text = { Text("Your unsaved ingredients will be lost.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmDiscard = false
                    onBack()
                }) { Text("Discard") }
            },
            dismissButton = {
                TextButton(onClick = { confirmDiscard = false }) { Text("Cancel") }
            },
        )
    }
}

private fun validationMessage(state: RecipeUiState): String? {
    if (state.name.trim().isEmpty()) return "Enter a recipe name first"
    if (state.ingredients.isEmpty()) return "Add at least one ingredient"
    val serving = state.servingGrams.trim()
    if (serving.isNotEmpty()) {
        val parsed = serving.toDoubleOrNull()
        if (parsed == null || parsed <= 0.0) return "Serving grams must be a positive number"
    }
    return null
}

private fun servingOrNull(raw: String): Double? {
    val serving = raw.trim()
    if (serving.isEmpty()) return null
    return serving.toDouble()
}
