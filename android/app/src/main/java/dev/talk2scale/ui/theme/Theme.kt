package dev.talk2scale.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.sp

private val Talk2ScaleColors = lightColorScheme(
    primary = Color(0xFF1976D2),
    onPrimary = Color.White,
    secondary = Color(0xFF36D7FF),
    background = Color.White,
    surface = Color.White,
)

private val Talk2ScaleTypography = Typography().run {
    copy(
        bodyLarge = bodyLarge.copy(letterSpacing = 0.sp),
        bodyMedium = bodyMedium.copy(letterSpacing = 0.sp),
        bodySmall = bodySmall.copy(letterSpacing = 0.sp),
        labelLarge = labelLarge.copy(letterSpacing = 0.sp),
        labelMedium = labelMedium.copy(letterSpacing = 0.sp),
        labelSmall = labelSmall.copy(letterSpacing = 0.sp),
        titleMedium = titleMedium.copy(letterSpacing = 0.sp),
        titleSmall = titleSmall.copy(letterSpacing = 0.sp),
    )
}

@Composable
fun Talk2ScaleTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = Talk2ScaleColors,
        typography = Talk2ScaleTypography,
        content = content,
    )
}
