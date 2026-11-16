package dev.shed.app.ui

import android.text.format.DateUtils
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
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

// Pull to refresh around whatever loaded, with a spinner first and a retry on failure.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun <T> Loading(l: Loaded<T>, modifier: Modifier = Modifier, content: @Composable (T) -> Unit) {
	PullToRefreshBox(isRefreshing = l.refreshing && l.state is Load.Ok, onRefresh = l.reload, modifier = modifier.fillMaxSize()) {
		when (val s = l.state) {
			Load.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
			is Load.Failed -> Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
				Text(s.message, color = MaterialTheme.colorScheme.error)
				Button(onClick = l.reload) { Text("Try again") }
			}
			is Load.Ok -> content(s.value)
		}
	}
}

@Composable
fun Empty(text: String) = Text(text, Modifier.padding(24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)

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

// Open is the accent, as on the web; merged purple-ish container; closed red.
@Composable
fun StateChip(state: String, pull: Boolean, merged: Boolean, draft: Boolean = false) {
	val c = MaterialTheme.colorScheme
	val (label, bg, fg) = when {
		merged -> Triple("Merged", c.tertiaryContainer, c.onTertiaryContainer)
		state == "closed" -> Triple("Closed", c.errorContainer, c.onErrorContainer)
		draft -> Triple("Draft", c.surfaceVariant, c.onSurfaceVariant)
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

@Composable
fun SectionTitle(text: String) = Text(
	text,
	Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 20.dp, bottom = 4.dp),
	style = MaterialTheme.typography.titleSmall,
	color = MaterialTheme.colorScheme.primary
)
