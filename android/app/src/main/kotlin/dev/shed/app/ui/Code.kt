package dev.shed.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.shed.app.Api
import dev.shed.app.Highlighted
import dev.shed.app.Token
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.JsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody

// Code is drawn natively with Shiki's colours from the server (POST /api/v1/highlight), the same as the web's.
val CodeStyle = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 12.5.sp, lineHeight = 18.sp)

private val cache = object : LinkedHashMap<String, List<List<Token>>>(64, 0.75f, true) {
	override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, List<List<Token>>>?) = size > 64
}

suspend fun highlight(api: Api, filename: String, lines: List<String>): List<List<Token>>? {
	if (lines.isEmpty() || lines.size > 5000) return null
	val key = filename.substringAfterLast('.') + "\u0000" + lines.hashCode()
	synchronized(cache) { cache[key] }?.let { return it }
	val body = buildJsonObject {
		put("filename", filename)
		putJsonArray("lines") { lines.forEach { add(JsonPrimitive(it)) } }
	}.toString()
	val req = api.request("/highlight").post(body.toRequestBody("application/json".toMediaType())).build()
	val h = runCatching { Api.call(req) { Api.json.decodeFromString<Highlighted>(it) } }.getOrNull() ?: return null
	if (h.lang == "text") return null
	synchronized(cache) { cache[key] = h.lines }
	return h.lines
}

@Composable
fun rememberHighlight(filename: String, lines: List<String>): List<List<Token>>? {
	val api = LocalApi.current
	var tokens by remember(filename, lines) { mutableStateOf<List<List<Token>>?>(null) }
	LaunchedEffect(filename, lines) { tokens = highlight(api, filename, lines) }
	return tokens
}

private fun hex(s: String?): Color? = s?.removePrefix("#")?.takeIf { it.length == 6 }?.toLongOrNull(16)?.let { Color(0xFF000000 or it) }

@Composable
fun isDark() = MaterialTheme.colorScheme.surface.luminance() < 0.5f

fun tokensToText(text: String, tokens: List<Token>?, dark: Boolean): AnnotatedString =
	if (tokens == null) AnnotatedString(text)
	else buildAnnotatedString {
		for (t in tokens) {
			val c = hex(if (dark) t.d else t.l)
			withStyle(SpanStyle(color = c ?: Color.Unspecified, fontStyle = if (t.i == true) FontStyle.Italic else null)) { append(t.t) }
		}
	}

// A file's lines with numbers (or the caller's gutter, e.g. blame), lazily. Long lines wrap, as in GitHub's app: code on a
// phone is read, and sideways scrolling fights the vertical scroll.
@Composable
fun CodeView(
	filename: String,
	lines: List<String>,
	modifier: Modifier = Modifier,
	gutter: (@Composable (Int) -> Unit)? = null,
	gutterWidth: Dp = 0.dp,
	bottom: Dp = 0.dp,
	header: LazyListScope.() -> Unit = {}
) {
	val tokens = rememberHighlight(filename, lines)
	val dark = isDark()
	val c = MaterialTheme.colorScheme
	val gw = if (gutter != null) gutterWidth else (lines.size.toString().length * 8 + 16).dp
	LazyColumn(modifier.fillMaxWidth(), contentPadding = PaddingValues(bottom = bottom)) {
		header()
		item { Spacer(Modifier.height(4.dp)) }
		itemsIndexed(lines) { i, l ->
			Row(Modifier.fillMaxWidth().padding(end = 12.dp)) {
				Box(Modifier.width(gw)) {
					if (gutter != null) gutter(i)
					else Text("${i + 1}", style = CodeStyle, color = c.onSurfaceVariant.copy(alpha = 0.55f), textAlign = TextAlign.End, modifier = Modifier.fillMaxWidth().padding(end = 8.dp))
				}
				Text(tokensToText(l, tokens?.getOrNull(i), dark), style = CodeStyle, color = c.onSurface, modifier = Modifier.weight(1f))
			}
		}
	}
}
