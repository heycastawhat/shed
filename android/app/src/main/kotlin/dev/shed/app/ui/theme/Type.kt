@file:OptIn(ExperimentalTextApi::class)

package dev.shed.app.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import dev.shed.app.R

/**
 * Roboto Flex, as on the web: one variable font (Latin; weight, width, optical size and slant axes, from the web's
 * @fontsource-variable/roboto-flex, see android/OFL-RobotoFlex.txt). Each weight sets the axis explicitly: without it
 * Android draws the file's default weight whatever's asked for, which made the titles look thin.
 */
private fun flex(width: Float) = FontFamily((100..900 step 50).map { w ->
	Font(R.font.roboto_flex, FontWeight(w), variationSettings = FontVariation.Settings(FontVariation.weight(w), FontVariation.width(width)))
})

val RobotoFlex = flex(100f)

/** Headings, as the web's h1/h2: Roboto Flex's width axis at 115%. */
val RobotoFlexWide = flex(115f)

private fun TextStyle.flex() = copy(fontFamily = RobotoFlex)
private fun TextStyle.wide(weight: Int) = copy(fontFamily = RobotoFlexWide, fontWeight = FontWeight(weight), letterSpacing = (-0.01).sp * fontSize.value)

internal val ShedTypography = Typography().run {
	copy(
		displayLarge = displayLarge.wide(750),
		displayMedium = displayMedium.wide(750),
		displaySmall = displaySmall.wide(750),
		headlineLarge = headlineLarge.wide(750),
		headlineMedium = headlineMedium.wide(750),
		headlineSmall = headlineSmall.wide(700),
		titleLarge = titleLarge.wide(680),
		titleMedium = titleMedium.flex(),
		titleSmall = titleSmall.flex(),
		bodyLarge = bodyLarge.flex(),
		bodyMedium = bodyMedium.flex(),
		bodySmall = bodySmall.flex(),
		labelLarge = labelLarge.flex(),
		labelMedium = labelMedium.flex(),
		labelSmall = labelSmall.flex()
	)
}
