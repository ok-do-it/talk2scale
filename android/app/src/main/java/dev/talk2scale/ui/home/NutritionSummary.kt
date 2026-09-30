package dev.talk2scale.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.talk2scale.data.api.DailyTargetsDto
import dev.talk2scale.data.api.ElementDto
import dev.talk2scale.data.api.NutrientEntryDto
import dev.talk2scale.data.api.NutrientGroupDto

data class SummaryRow(
    val key: String,
    val label: String,
    val amount: Double,
    val target: Double?,
    val unit: String,
)

private data class SummaryNutrient(
    val key: String,
    val label: String,
    val unit: String,
    val match: (NutrientEntryDto) -> Boolean,
)

private val summaryNutrients = listOf(
    SummaryNutrient("calories", "Calories", "kcal") { nutrient ->
        val name = nutrient.name.lowercase()
        nutrient.calculated ||
            name.contains("energy") ||
            name.contains("kcal") ||
            name.contains("calorie")
    },
    SummaryNutrient("protein", "Protein", "g") { nutrient ->
        nutrient.name.lowercase().contains("protein")
    },
    SummaryNutrient("fiber", "Fiber", "g") { nutrient ->
        nutrient.name.lowercase().contains("fiber")
    },
    SummaryNutrient("fat", "Fat", "g") { nutrient ->
        val name = nutrient.name.lowercase()
        name.contains("fat") || name.contains("total lipid")
    },
)

fun buildSummaryRows(
    groups: List<NutrientGroupDto>,
    targets: DailyTargetsDto?,
    targetNutrients: List<ElementDto> = emptyList(),
): List<SummaryRow> {
    val nutrients = groups.flatMap { it.nutrients }
    return summaryNutrients.map { spec ->
        val nutrient = nutrients.find(spec.match)
        val amount = nutrient?.amount ?: 0.0
        val matchingTarget = targets?.nutrient_amounts?.find { item ->
            if (item.id == nutrient?.id) return@find true
            val element = targetNutrients.find { it.id == item.id }
            element != null && spec.match(
                NutrientEntryDto(id = element.id, name = element.name, amount = 0.0),
            )
        }
        val target = if (spec.key == "calories") {
            targets?.kcal
        } else {
            matchingTarget?.grams
        }
        SummaryRow(spec.key, spec.label, amount, target, spec.unit)
    }
}

@Composable
fun NutritionSummary(
    rows: List<SummaryRow>,
    loading: Boolean,
    error: String?,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(12.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(Color(0xFFF5F7FB))
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp, Alignment.CenterVertically),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Bottom,
        ) {
            Text("Today", fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Text(
                text = when {
                    loading -> "Loading..."
                    error != null -> error
                    else -> "Daily targets"
                },
                color = Color(0xFF666666),
                fontSize = 13.sp,
            )
        }
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            rows.forEach { row ->
                SummaryLine(row)
            }
        }
    }
}

@Composable
private fun SummaryLine(row: SummaryRow) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = row.label,
            modifier = Modifier.width(72.dp),
            fontWeight = FontWeight.SemiBold,
            fontSize = 14.sp,
            color = Color(0xFF333333),
        )
        Box(
            modifier = Modifier
                .weight(1f)
                .height(12.dp)
                .clip(RoundedCornerShape(999.dp))
                .background(Color(0xFFDDE3EA)),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .fillMaxWidth(progress(row))
                    .clip(RoundedCornerShape(999.dp))
                    .background(if (row.target == null) Color(0xFF8AA4BF) else Color(0xFF1976D2)),
            )
        }
        Text(
            text = valueText(row),
            modifier = Modifier.width(92.dp),
            fontSize = 12.sp,
            color = Color(0xFF555555),
            textAlign = TextAlign.End,
        )
    }
}

private fun progress(row: SummaryRow): Float {
    val target = row.target
    val fraction = if (target == null || target <= 0.0) {
        if (row.amount > 0.0) 1f else 0f
    } else {
        (row.amount / target).toFloat().coerceIn(0f, 1f)
    }
    return fraction
}

private fun valueText(row: SummaryRow): String {
    val amount = formatAmount(row.amount, row.unit)
    val target = row.target ?: return "$amount ${row.unit}"
    return "$amount/${formatAmount(target, row.unit)} ${row.unit}"
}

private fun formatAmount(amount: Double, unit: String): String {
    if (unit == "kcal" || amount >= 10.0) return kotlin.math.round(amount).toInt().toString()
    if (amount == 0.0) return "0"
    return String.format(java.util.Locale.US, "%.1f", amount)
}
