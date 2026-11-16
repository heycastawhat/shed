package dev.shed.app.ui

import android.text.format.DateUtils
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LoadingIndicator
import androidx.compose.material3.MaterialShapes
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.ripple
import androidx.compose.material3.toShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import dev.shed.app.Api
import dev.shed.app.ApiError
import dev.shed.app.session
import java.time.Instant

val LocalApi = compositionLocalOf<Api> { error("No account") }

// One request's state, for screens that load something and can be pulled to refresh.
sealed interface Load<out T> {
	data object Loading : Load<Nothing>
	data class Ok<T>(val value: T) : Load<T>
	data class Failed(val message: String) : Load<Nothing>
}

class Loaded<T>(val state: Load<T>, val refreshing: Boolean, val reload: () -> Unit)

@Composable
fun <T> rememberLoad(vararg keys: Any?, fetch: suspend () -> T): Loaded<T> {
	val ctx = LocalContext.current
	var state by remember(*keys) { mutableStateOf<Load<T>>(Load.Loading) }
	var refreshing by remember(*keys) { mutableStateOf(false) }
	var tick by remember(*keys) { mutableIntStateOf(0) }
	LaunchedEffect(*keys, tick) {
		refreshing = true
		state = try {
			Load.Ok(fetch())
		} catch (e: ApiError) {
			if (e.status == 401) ctx.session.signOut()
			if (state is Load.Ok) state else Load.Failed(e.message ?: "Error ${e.status}")
		} catch (e: Exception) {
			if (state is Load.Ok) state else Load.Failed("Can't reach Shed: ${e.message}")
		}
		refreshing = false
	}
	return Loaded(state, refreshing, { tick++ })
}

// Pull to refresh around whatever loaded, with Material's expressive loading indicator first and a retry on failure.
@OptIn(ExperimentalMaterial3Api::class, ExperimentalMaterial3ExpressiveApi::class)
@Composable
fun <T> Loading(l: Loaded<T>, modifier: Modifier = Modifier, content: @Composable (T) -> Unit) {
	PullToRefreshBox(isRefreshing = l.refreshing && l.state is Load.Ok, onRefresh = l.reload, modifier = modifier.fillMaxSize()) {
		when (val s = l.state) {
			Load.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { LoadingIndicator() }
			is Load.Failed -> Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
				Text(s.message, color = MaterialTheme.colorScheme.error)
				Button(onClick = l.reload) { Text("Try again") }
			}
			is Load.Ok -> content(s.value)
		}
	}
}

// A screen as Sink's are: drawn to the edges on the lowest surface, under a big title.
@Composable
fun Page(title: String, sub: String? = null, onBack: (() -> Unit)? = null, trailing: @Composable () -> Unit = {}, content: @Composable ColumnScope.() -> Unit) {
	Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceContainerLowest).statusBarsPadding()) {
		ScreenTitle(title, sub, onBack, trailing)
		content()
	}
}

/** Big page title, Sink style, with an optional back arrow and trailing tools. */
@Composable
fun ScreenTitle(title: String, sub: String? = null, onBack: (() -> Unit)? = null, trailing: @Composable () -> Unit = {}) {
	Row(
		Modifier.fillMaxWidth().padding(start = if (onBack != null) 4.dp else 20.dp, end = 8.dp, top = 12.dp, bottom = 12.dp),
		verticalAlignment = Alignment.CenterVertically
	) {
		if (onBack != null) IconButton(onClick = onBack) { Icon(ShedIcons.left, "Back") }
		Column(Modifier.weight(1f)) {
			Text(
				title,
				style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.5).sp),
				maxLines = 1,
				overflow = TextOverflow.Ellipsis
			)
			sub?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
		}
		trailing()
	}
}

@OptIn(ExperimentalMaterial3ExpressiveApi::class)
@Composable
fun EmptyState(title: String, body: String, icon: ImageVector) {
	Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
		Box(
			Modifier.size(112.dp).clip(MaterialShapes.Ghostish.toShape()).background(MaterialTheme.colorScheme.tertiaryContainer),
			contentAlignment = Alignment.Center
		) { Icon(icon, null, Modifier.size(44.dp), tint = MaterialTheme.colorScheme.onTertiaryContainer) }
		Spacer(Modifier.height(24.dp))
		Text(title, style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold), textAlign = TextAlign.Center)
		if (body.isNotEmpty()) {
			Spacer(Modifier.height(8.dp))
			Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
		}
	}
}

/** Small caps section label, same as the web's. */
@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier) {
	Text(
		text.uppercase(),
		style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold, letterSpacing = MaterialTheme.typography.labelMedium.letterSpacing * 2),
		color = MaterialTheme.colorScheme.onSurfaceVariant,
		modifier = modifier
	)
}

/** The floating tab toolbar's size and distance from the bottom (above the system navigation bar). */
val TOOLBAR_HEIGHT = 64.dp
val TOOLBAR_BOTTOM = 16.dp

/** Room at the bottom of a tab's scrolling content so its end clears the floating toolbar and the system navigation bar. */
@Composable
fun toolbarClearance(extra: Dp = 0.dp): Dp =
	WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding() + TOOLBAR_BOTTOM + TOOLBAR_HEIGHT + 16.dp + extra

/** Room at the bottom of a page without the toolbar. */
@Composable
fun pageClearance(): Dp = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding() + 16.dp

/** Shrinks a tappable card a touch while it's pressed and springs it back (Sink's Motion.kt). Put it before `clip`. */
@Composable
fun Modifier.pressScale(source: InteractionSource, pressedScale: Float = 0.97f): Modifier {
	val pressed by source.collectIsPressedAsState()
	val scale by animateFloatAsState(if (pressed) pressedScale else 1f, MaterialTheme.motionScheme.fastSpatialSpec(), label = "press")
	return graphicsLayer { scaleX = scale; scaleY = scale }
}

/** A list item as one of Sink's cards: rounded, on the low surface, pressing in a little when tapped. */
@Composable
fun CardRow(onClick: () -> Unit, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
	val source = remember { MutableInteractionSource() }
	val haptics = rememberHaptics()
	Box(
		modifier
			.fillMaxWidth()
			.padding(horizontal = 12.dp, vertical = 3.dp)
			.pressScale(source)
			.clip(RoundedCornerShape(20.dp))
			.background(MaterialTheme.colorScheme.surfaceContainerLow)
			.clickable(interactionSource = source, indication = ripple()) { haptics.tick(); onClick() }
	) { content() }
}

@Composable
fun Avatar(url: String, size: Dp = 28.dp) {
	val api = LocalApi.current
	AsyncImage(
		model = if (url.startsWith("/")) api.account.server + url else url,
		contentDescription = null,
		modifier = Modifier.size(size).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant)
	)
}

@Composable
fun ShedIcon(icon: ImageVector, size: Dp = 20.dp, tint: Color = MaterialTheme.colorScheme.onSurfaceVariant) =
	Icon(icon, contentDescription = null, modifier = Modifier.size(size), tint = tint)

// Open is the accent, as on the web; merged tertiary; closed red.
@Composable
fun StateChip(state: String, pull: Boolean, merged: Boolean, draft: Boolean = false) {
	val c = MaterialTheme.colorScheme
	val (label, bg, fg) = when {
		merged -> Triple("Merged", c.tertiaryContainer, c.onTertiaryContainer)
		state == "closed" -> Triple("Closed", c.errorContainer, c.onErrorContainer)
		draft -> Triple("Draft", c.surfaceContainerHighest, c.onSurfaceVariant)
		else -> Triple("Open", c.primary, c.onPrimary)
	}
	Row(
		Modifier.clip(RoundedCornerShape(50)).background(bg).padding(horizontal = 10.dp, vertical = 4.dp),
		verticalAlignment = Alignment.CenterVertically,
		horizontalArrangement = Arrangement.spacedBy(4.dp)
	) {
		ShedIcon(if (pull) (if (merged) ShedIcons.merge else ShedIcons.changes) else ShedIcons.issue, 16.dp, fg)
		Text(label, color = fg, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Medium)
	}
}

@Composable
fun LabelChip(name: String, hex: String) {
	val color = runCatching { Color(android.graphics.Color.parseColor("#${hex.removePrefix("#")}")) }.getOrDefault(MaterialTheme.colorScheme.surfaceVariant)
	val dark = (color.red * 0.299f + color.green * 0.587f + color.blue * 0.114f) < 0.6f
	Text(
		name,
		Modifier.clip(RoundedCornerShape(50)).background(color).padding(horizontal = 8.dp, vertical = 2.dp),
		color = if (dark) Color.White else Color.Black,
		style = MaterialTheme.typography.labelMedium
	)
}

fun ago(iso: String): String = runCatching {
	DateUtils.getRelativeTimeSpanString(Instant.parse(iso).toEpochMilli(), System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS).toString()
}.getOrDefault("")
