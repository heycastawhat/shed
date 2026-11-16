package dev.shed.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.shed.app.Token

// A unified diff (git diff output), parsed into files of lines with their old and new numbers.
data class DiffLine(val kind: Char, val old: Int?, val new: Int?, val text: String)

data class FileDiff(val from: String, val to: String, val status: String, val lines: List<DiffLine>, val binary: Boolean) {
	val path get() = if (status == "deleted") from else to
	val additions get() = lines.count { it.kind == '+' }
	val deletions get() = lines.count { it.kind == '-' }
	val code get() = lines.filter { it.kind != '@' }.map { it.text }
}

fun parseDiff(text: String): List<FileDiff> {
	val files = mutableListOf<FileDiff>()
	var from = ""
	var to = ""
	var status = "modified"
	var binary = false
	var lines = mutableListOf<DiffLine>()
	var old = 0
	var new = 0
	var started = false
	fun flush() {
		if (started) files += FileDiff(from, to, status, lines, binary)
	}
	for (raw in text.split('\n')) {
		when {
			raw.startsWith("diff --git ") -> {
				flush()
				started = true
				val m = Regex("""^diff --git a/(.*) b/(.*)$""").find(raw)
				from = m?.groupValues?.get(1) ?: ""
				to = m?.groupValues?.get(2) ?: from
				status = "modified"
				binary = false
				lines = mutableListOf()
			}
			!started -> Unit
			raw.startsWith("new file mode") -> status = "added"
			raw.startsWith("deleted file mode") -> status = "deleted"
			raw.startsWith("rename from ") -> { from = raw.removePrefix("rename from "); status = "renamed" }
			raw.startsWith("rename to ") -> to = raw.removePrefix("rename to ")
			raw.startsWith("Binary files ") -> binary = true
			raw.startsWith("--- ") || raw.startsWith("+++ ") || raw.startsWith("index ") || raw.startsWith("similarity ") || raw.startsWith("old mode") || raw.startsWith("new mode") -> Unit
			raw.startsWith("@@") -> {
				val m = Regex("""^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$""").find(raw)
				old = m?.groupValues?.get(1)?.toInt() ?: 0
				new = m?.groupValues?.get(2)?.toInt() ?: 0
				lines += DiffLine('@', null, null, raw)
			}
			raw.startsWith("+") -> lines += DiffLine('+', null, new++, raw.substring(1))
			raw.startsWith("-") -> lines += DiffLine('-', old++, null, raw.substring(1))
			raw.startsWith(" ") -> lines += DiffLine(' ', old++, new++, raw.substring(1))
			raw.startsWith("\\") -> Unit
		}
	}
	flush()
	return files
}

// A file's header in a diff: its path, status and counts; tapping it folds the file away.
@Composable
fun DiffFileHeader(f: FileDiff, open: Boolean, onToggle: () -> Unit) {
	val c = MaterialTheme.colorScheme
	Row(
		Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, top = 10.dp).clip(RoundedCornerShape(14.dp)).background(c.surfaceContainerHigh).clickable(onClick = onToggle).padding(horizontal = 12.dp, vertical = 10.dp),
		verticalAlignment = Alignment.CenterVertically,
		horizontalArrangement = Arrangement.spacedBy(8.dp)
	) {
		ShedIcon(if (open) ShedIcons.chevron else ShedIcons.right, 16.dp)
		Text(
			if (f.status == "renamed") "${f.from} → ${f.to}" else f.path,
			style = MaterialTheme.typography.labelLarge.copy(fontFamily = CodeStyle.fontFamily),
			maxLines = 2,
			overflow = TextOverflow.Ellipsis,
			modifier = Modifier.weight(1f)
		)
		if (f.status == "added" || f.status == "deleted") Text(if (f.status == "added") "new" else "deleted", style = MaterialTheme.typography.labelSmall, color = c.onSurfaceVariant)
		Text("+${f.additions}", style = MaterialTheme.typography.labelMedium, color = DiffColors.addText(), fontWeight = FontWeight.SemiBold)
		Text("−${f.deletions}", style = MaterialTheme.typography.labelMedium, color = DiffColors.delText(), fontWeight = FontWeight.SemiBold)
	}
}

// Green and red only for diff lines, as on the web.
object DiffColors {
	@Composable fun add() = if (isDark()) Color(0x332EA043) else Color(0xFFE6FFEC)
	@Composable fun del() = if (isDark()) Color(0x33F85149) else Color(0xFFFFEBE9)
	@Composable fun addText() = if (isDark()) Color(0xFF3FB950) else Color(0xFF1A7F37)
	@Composable fun delText() = if (isDark()) Color(0xFFF85149) else Color(0xFFCF222E)
}

// The file's lines as list items: numbers, +/-, highlighted code. [after] puts things (comments) under a line.
fun LazyListScope.diffLines(
	f: FileDiff,
	tokens: List<List<Token>>?,
	key: String,
	onLine: ((DiffLine) -> Unit)? = null,
	after: @Composable (DiffLine) -> Unit = {}
) {
	if (f.binary) {
		item(key = "$key:bin") { Text("Binary file", Modifier.padding(start = 24.dp, top = 8.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
		return
	}
	// Token rows are numbered over the file's code lines (hunk headers excluded).
	var code = 0
	val indexed = f.lines.map { l -> l to (if (l.kind == '@') -1 else code++) }
	items(indexed, key = { (l, i) -> "$key:${l.kind}${l.old}:${l.new}:$i" }) { (l, i) -> DiffRow(l, if (i >= 0) tokens?.getOrNull(i) else null, onLine); after(l) }
}

@Composable
private fun DiffRow(l: DiffLine, tokens: List<Token>?, onLine: ((DiffLine) -> Unit)?) {
	val c = MaterialTheme.colorScheme
	val dark = isDark()
	if (l.kind == '@') {
		Text(
			l.text,
			style = CodeStyle,
			color = c.onSurfaceVariant,
			maxLines = 1,
			overflow = TextOverflow.Ellipsis,
			modifier = Modifier.fillMaxWidth().background(c.primaryContainer.copy(alpha = 0.35f)).padding(horizontal = 12.dp, vertical = 4.dp)
		)
		return
	}
	val bg = when (l.kind) {
		'+' -> DiffColors.add()
		'-' -> DiffColors.del()
		else -> Color.Transparent
	}
	Row(Modifier.fillMaxWidth().background(bg).then(if (onLine != null) Modifier.clickable { onLine(l) } else Modifier)) {
		val num = c.onSurfaceVariant.copy(alpha = 0.55f)
		Text(l.old?.toString() ?: "", style = CodeStyle, color = num, textAlign = TextAlign.End, modifier = Modifier.width(36.dp))
		Text(l.new?.toString() ?: "", style = CodeStyle, color = num, textAlign = TextAlign.End, modifier = Modifier.width(36.dp))
		Text(
			when (l.kind) { '+' -> "+"; '-' -> "−"; else -> " " },
			style = CodeStyle,
			color = when (l.kind) { '+' -> DiffColors.addText(); '-' -> DiffColors.delText(); else -> num },
			textAlign = TextAlign.Center,
			modifier = Modifier.width(16.dp)
		)
		Box(Modifier.weight(1f).padding(end = 12.dp)) { Text(tokensToText(l.text, tokens, dark), style = CodeStyle, color = c.onSurface) }
	}
}
