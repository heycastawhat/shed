package dev.shed.app.ui

import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.LaunchedEffect
import dev.shed.app.ApiError
import kotlinx.coroutines.launch

// Runs a write, showing its error as a toast; true when it worked.
@Composable
fun rememberSend(): (suspend () -> Unit) -> Unit {
	val ctx = LocalContext.current
	val scope = rememberCoroutineScope()
	val haptics = rememberHaptics()
	return { block ->
		scope.launch {
			try {
				block()
				haptics.confirm()
			} catch (e: Exception) {
				haptics.reject()
				Toast.makeText(ctx, (e as? ApiError)?.message ?: "Couldn't reach Shed: ${e.message}", Toast.LENGTH_LONG).show()
			}
		}
	}
}

// A bottom sheet with a Markdown text box: comments, replies, review bodies, descriptions.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ComposeSheet(
	title: String,
	initial: String = "",
	action: String = "Comment",
	allowEmpty: Boolean = false,
	extra: @Composable () -> Unit = {},
	onDismiss: () -> Unit,
	onSend: suspend (String) -> Unit
) {
	var text by rememberSaveable { mutableStateOf(initial) }
	var busy by remember { mutableStateOf(false) }
	val send = rememberSend()
	val focus = remember { FocusRequester() }
	LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
	ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
		Column(Modifier.fillMaxWidth().imePadding().navigationBarsPadding().padding(horizontal = 20.dp).padding(bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
			Text(title, style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold))
			extra()
			OutlinedTextField(
				value = text,
				onValueChange = { text = it },
				placeholder = { Text("Markdown is fine") },
				modifier = Modifier.fillMaxWidth().heightIn(min = 140.dp, max = 360.dp).focusRequester(focus)
			)
			Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
				TextButton(onClick = onDismiss) { Text("Cancel") }
				Spacer(Modifier.width(8.dp))
				Button(enabled = !busy && (allowEmpty || text.isNotBlank()), onClick = {
					busy = true
					send {
						try {
							onSend(text)
							onDismiss()
						} finally {
							busy = false
						}
					}
				}) { Text(action) }
			}
		}
	}
}

// Pick several of a list (labels, assignees, reviewers) or one (milestone, merge style).
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun <T> PickSheet(
	title: String,
	options: List<T>,
	selected: Set<String>,
	key: (T) -> String,
	multi: Boolean = true,
	action: String = "Save",
	row: @Composable (T) -> Unit,
	onDismiss: () -> Unit,
	onSave: suspend (Set<String>) -> Unit
) {
	var picked by remember { mutableStateOf(selected) }
	var busy by remember { mutableStateOf(false) }
	val send = rememberSend()
	val haptics = rememberHaptics()
	ModalBottomSheet(onDismissRequest = onDismiss) {
		Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(bottom = 16.dp)) {
			Text(title, style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold), modifier = Modifier.padding(horizontal = 20.dp))
			if (options.isEmpty()) Text("Nothing to pick from.", Modifier.padding(20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
			LazyColumn(Modifier.heightIn(max = 420.dp)) {
				items(options, key = key) { o ->
					val k = key(o)
					val on = k in picked
					Row(
						Modifier.fillMaxWidth().clickable {
							haptics.tick()
							picked = if (multi) (if (on) picked - k else picked + k) else setOf(k)
						}.padding(horizontal = 12.dp, vertical = 2.dp),
						verticalAlignment = Alignment.CenterVertically
					) {
						if (multi) Checkbox(checked = on, onCheckedChange = null, modifier = Modifier.padding(12.dp)) else RadioButton(selected = on, onClick = null, modifier = Modifier.padding(12.dp))
						row(o)
					}
				}
			}
			Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp), horizontalArrangement = Arrangement.End) {
				TextButton(onClick = onDismiss) { Text("Cancel") }
				Spacer(Modifier.width(8.dp))
				Button(enabled = !busy, onClick = {
					busy = true
					send {
						try {
							onSave(picked)
							onDismiss()
						} finally {
							busy = false
						}
					}
				}) { Text(action) }
			}
		}
	}
}
