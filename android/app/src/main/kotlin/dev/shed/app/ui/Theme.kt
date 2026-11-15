package dev.shed.app.ui

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

// Shed's default palette (src/lib/themes.ts, seed #6750A4), or the wallpaper's colours where Android offers them.
private val Light = lightColorScheme(
	primary = Color(0xFF65558F), onPrimary = Color.White,
	primaryContainer = Color(0xFFE8DEF8), onPrimaryContainer = Color(0xFF1D1B20),
	background = Color(0xFFFAFAFC), surface = Color(0xFFF8F2FA), surfaceContainer = Color(0xFFF2ECF4),
	onBackground = Color(0xFF1D1B20), onSurface = Color(0xFF1D1B20), onSurfaceVariant = Color(0xFF49454E), outlineVariant = Color(0xFFDFDCE2)
)
private val Dark = darkColorScheme(
	primary = Color(0xFFCFBDFE), onPrimary = Color(0xFF36275D),
	primaryContainer = Color(0xFF4A4458), onPrimaryContainer = Color(0xFFE6E0E9),
	background = Color(0xFF1C1923), surface = Color(0xFF1D1B20), surfaceContainer = Color(0xFF211F24),
	onBackground = Color(0xFFE6E0E9), onSurface = Color(0xFFE6E0E9), onSurfaceVariant = Color(0xFFCAC4CF), outlineVariant = Color(0xFF3B373F)
)

@Composable
fun ShedTheme(dynamic: Boolean = true, content: @Composable () -> Unit) {
	val dark = isSystemInDarkTheme()
	val ctx = LocalContext.current
	val scheme = when {
		dynamic && Build.VERSION.SDK_INT >= 31 -> if (dark) dynamicDarkColorScheme(ctx) else dynamicLightColorScheme(ctx)
		dark -> Dark
		else -> Light
	}
	MaterialTheme(colorScheme = scheme, content = content)
}
