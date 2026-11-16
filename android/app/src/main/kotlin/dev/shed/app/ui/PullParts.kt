package dev.shed.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import dev.shed.app.CombinedStatus
import dev.shed.app.Commit
import dev.shed.app.LineComment
import dev.shed.app.Pull
import dev.shed.app.RepoInfo
import dev.shed.app.Review
import dev.shed.app.Runs
import dev.shed.app.Token
import dev.shed.app.User
import kotlinx.coroutines.async

// A submitted review: who, what they decided, what they said, and the line comments it carries.
@Composable
fun ReviewCard(r: Review, lines: List<LineComment>, route: ThreadRoute, onReply: (LineComment) -> Unit, onReload: () -> Unit) {
	val c = MaterialTheme.colorScheme
	val api = LocalApi.current
	val send = rememberSend()
	val (label, tint) = when (r.state) {
		"APPROVED" -> "approved" to c.primary
		"REQUEST_CHANGES" -> "requested changes" to c.error
		else -> "reviewed" to c.onSurfaceVariant
	}
	Surface(shape = RoundedCornerShape(20.dp), color = c.surfaceContainerLow, modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp)) {
		Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
			Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
				Avatar(r.user.avatarUrl, 24.dp)
				Text(r.user.login, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
				Text(label, color = tint, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
				Text(ago(r.submittedAt), style = MaterialTheme.typography.bodySmall, color = c.onSurfaceVariant)
			}
			if (r.stale || r.dismissed) Text(if (r.dismissed) "Dismissed" else "On an older revision", style = MaterialTheme.typography.labelMedium, color = c.onSurfaceVariant)
			if (r.body.isNotBlank()) MarkdownText(r.body)
			lines.groupBy { "${it.path}:${it.side}:${it.line}" }.values.forEach { thread ->
				val first = thread.first()
				val resolved = thread.any { it.resolver != null }
				Surface(shape = RoundedCornerShape(14.dp), color = c.surfaceContainerHigh) {
					Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
						Text("${first.path}:${first.line}", style = MaterialTheme.typography.labelMedium.copy(fontFamily = CodeStyle.fontFamily), color = c.onSurfaceVariant)
						if (first.diffHunk.isNotBlank()) Text(
							first.diffHunk.lines().takeLast(3).joinToString("\n"),
							style = CodeStyle,
							color = c.onSurfaceVariant,
							modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(c.surfaceContainerLowest).padding(8.dp)
						)
						if (resolved) Text("Resolved by ${thread.first { it.resolver != null }.resolver!!.login}", style = MaterialTheme.typography.labelMedium, color = c.primary)
						else thread.forEach { lc ->
							Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
								Avatar(lc.user.avatarUrl, 18.dp)
								Text(lc.user.login, style = MaterialTheme.typography.labelLarge)
								Text(ago(lc.createdAt), style = MaterialTheme.typography.labelMedium, color = c.onSurfaceVariant)
							}
							MarkdownText(lc.body)
						}
						Row {
							TextButton(onClick = { onReply(first) }) { Text("Reply") }
							TextButton(onClick = {
								send {
									api.send(if (resolved) "DELETE" else "POST", "/repos/${route.owner}/${route.repo}/pulls/comments/${first.id}/resolve")
									onReload()
								}
							}) { Text(if (resolved) "Unresolve" else "Resolve") }
						}
					}
				}
			}
		}
	}
}

// Every changed file's diff, highlighted; tap a line to comment on it. Comments show under their lines.
@Composable
fun FilesTab(p: Pull, route: ThreadRoute, lineComments: List<LineComment>, onReload: () -> Unit) {
	val api = LocalApi.current
	val base = "/repos/${route.owner}/${route.repo}"
	val from = p.mergeBase ?: p.base.sha
	val l = rememberLoad(api, from, p.head.sha) { parseDiff(api.text("$base/compare/$from..${p.head.sha}.diff")) }
	val closed = remember { mutableStateMapOf<String, Boolean>() }
	val tokens = remember { mutableStateMapOf<String, List<List<Token>>>() }
	var commenting by remember { mutableStateOf<Pair<FileDiff, DiffLine>?>(null) }
	val byLine = remember(lineComments) { lineComments.filter { it.resolver == null }.groupBy { "${it.path}|${it.side}|${it.line}" } }
	Loading(l) { files ->
		LaunchedEffect(files) {
			for (f in files) if (!f.binary && f.lines.size <= 3000 && f.path !in tokens) highlight(api, f.path, f.code)?.let { tokens[f.path] = it }
		}
		if (files.isEmpty()) EmptyState("No changes", "This pull request doesn't change any files.", ShedIcons.diff)
		else LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 32.dp)) {
			for (f in files) {
				val open = closed[f.path] != true
				item(key = "h:${f.path}") { DiffFileHeader(f, open) { closed[f.path] = open } }
				if (open) diffLines(f, tokens[f.path], f.path, onLine = { line -> commenting = f to line }) { line ->
					val k = if (line.new != null && line.kind != '-') "${f.path}|new|${line.new}" else "${f.path}|old|${line.old}"
					byLine[k]?.forEach { lc ->
						Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceContainerHigh, modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp)) {
							Column(Modifier.padding(10.dp)) {
								Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
									Avatar(lc.user.avatarUrl, 18.dp)
									Text(lc.user.login, style = MaterialTheme.typography.labelLarge)
									Text(ago(lc.createdAt), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
								}
								MarkdownText(lc.body)
							}
						}
					}
				}
			}
		}
	}
	commenting?.let { (f, line) ->
		val side = if (line.kind == '-') "old" else "new"
		val n = if (side == "old") line.old!! else line.new!!
		ComposeSheet("Comment on ${f.path.substringAfterLast('/')}:$n", onDismiss = { commenting = null }) { body ->
			lineComment(api, route, f.path, side, n, body)
			onReload()
		}
	}
}

@Composable
fun CommitsTab(route: ThreadRoute) {
	val api = LocalApi.current
	val nav = LocalNav.current
	val l = rememberLoad(api, route) { api.get<List<Commit>>("/repos/${route.owner}/${route.repo}/pulls/${route.number}/commits?limit=250") }
	Loading(l) { list ->
		LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = 8.dp, bottom = 32.dp)) {
			items(list, key = { it.sha }) { c -> CommitRow(c) { nav.navigate(CommitRoute(route.owner, route.repo, c.sha)) } }
		}
	}
}

@Composable
fun CommitRow(c: Commit, onClick: () -> Unit) = CardRow(onClick) {
	Row(Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
		Avatar(c.author?.avatarUrl ?: "", 32.dp)
		Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
			Text(c.title, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
			Text("${c.author?.login ?: c.commit.author.name} · ${ago(c.commit.author.date)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
		}
		Text(c.sha.take(7), style = CodeStyle, color = MaterialTheme.colorScheme.onSurfaceVariant)
	}
}

// Commit statuses and the CI runs for the head commit.
@Composable
fun ChecksTab(p: Pull, route: ThreadRoute) {
	val api = LocalApi.current
	val nav = LocalNav.current
	val ctx = androidx.compose.ui.platform.LocalContext.current
	val base = "/repos/${route.owner}/${route.repo}"
	val l = rememberLoad(api, p.head.sha) {
		kotlinx.coroutines.coroutineScope {
			val s = async { api.get<CombinedStatus>("$base/commits/${p.head.sha}/status") }
			val r = async { api.get<Runs>("$base/actions/runs?head_sha=${p.head.sha}") }
			s.await() to r.await().runs
		}
	}
	Loading(l) { (status, runs) ->
		if (status.statuses.isEmpty() && runs.isEmpty()) EmptyState("No checks", "Nothing has reported on ${p.head.sha.take(7)} yet.", ShedIcons.actions)
		else LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = 8.dp, bottom = 32.dp)) {
			if (runs.isNotEmpty()) item { SectionLabel("Runs", Modifier.padding(start = 20.dp, top = 8.dp, bottom = 8.dp)) }
			items(runs, key = { "run${it.id}" }) { run -> RunRow(run) { nav.navigate(RunRoute(route.owner, route.repo, run.number)) } }
			if (status.statuses.isNotEmpty()) item { SectionLabel("Statuses", Modifier.padding(start = 20.dp, top = 16.dp, bottom = 8.dp)) }
			items(status.statuses, key = { "st${it.id}:${it.context}" }) { s ->
				CardRow({ if (s.targetUrl.isNotBlank()) androidx.browser.customtabs.CustomTabsIntent.Builder().build().launchUrl(ctx, s.targetUrl.toUri()) }) {
					Row(Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
						StatusDot(s.state)
						Column(Modifier.weight(1f)) {
							Text(s.context, style = MaterialTheme.typography.titleSmall)
							if (s.description.isNotBlank()) Text(s.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
						}
					}
				}
			}
		}
	}
}

// Green for success is a diff colour, so states use the accent (success), red (failure) and muted (waiting).
@Composable
fun StatusDot(state: String) {
	val c = MaterialTheme.colorScheme
	val (icon, tint) = when (state) {
		"success" -> ShedIcons.check to c.primary
		"failure", "error" -> ShedIcons.x to c.error
		"cancelled", "skipped" -> ShedIcons.x to c.onSurfaceVariant
		"running" -> ShedIcons.refresh to c.tertiary
		else -> ShedIcons.clock to c.onSurfaceVariant
	}
	Box(Modifier.size(32.dp).clip(CircleShape).background(tint.copy(alpha = 0.14f)), Alignment.Center) { ShedIcon(icon, 18.dp, tint) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditSheet(title: String, body: String, onDismiss: () -> Unit, onSave: suspend (String, String) -> Unit) {
	var t by rememberSaveable { mutableStateOf(title) }
	var b by rememberSaveable { mutableStateOf(body) }
	var busy by remember { mutableStateOf(false) }
	val send = rememberSend()
	ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
		Column(Modifier.fillMaxWidth().imePadding().navigationBarsPadding().padding(horizontal = 20.dp).padding(bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
			Text("Edit", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold))
			OutlinedTextField(t, { t = it }, label = { Text("Title") }, singleLine = true, modifier = Modifier.fillMaxWidth())
			OutlinedTextField(b, { b = it }, label = { Text("Description") }, modifier = Modifier.fillMaxWidth().heightIn(min = 160.dp, max = 380.dp))
			Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
				TextButton(onClick = onDismiss) { Text("Cancel") }
				Spacer(Modifier.width(8.dp))
				Button(enabled = !busy && t.isNotBlank(), onClick = { busy = true; send { try { onSave(t, b); onDismiss() } finally { busy = false } } }) { Text("Save") }
			}
		}
	}
}

@Composable
fun ReviewSheet(onDismiss: () -> Unit, onSubmit: suspend (String, String) -> Unit) {
	var event by remember { mutableStateOf("COMMENT") }
	ComposeSheet("Review", action = "Submit review", allowEmpty = event != "COMMENT", extra = {
		Column {
			listOf("COMMENT" to "Comment", "APPROVED" to "Approve", "REQUEST_CHANGES" to "Request changes").forEach { (k, label) ->
				Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { event = k }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
					RadioButton(selected = event == k, onClick = null, modifier = Modifier.padding(8.dp))
					Text(label)
				}
			}
		}
	}, onDismiss = onDismiss) { body -> onSubmit(event, body) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MergeSheet(p: Pull, repo: RepoInfo, onDismiss: () -> Unit, onMerge: suspend (String, Boolean, Boolean) -> Unit) {
	val styles = listOfNotNull(
		("merge" to "Create a merge commit").takeIf { repo.allowMerge },
		("squash" to "Squash and merge").takeIf { repo.allowSquash },
		("rebase" to "Rebase and merge").takeIf { repo.allowRebase },
		("rebase-merge" to "Rebase, then merge commit").takeIf { repo.allowRebaseMerge },
		("fast-forward-only" to "Fast-forward only").takeIf { repo.allowFastForward }
	)
	var style by remember { mutableStateOf(styles.firstOrNull { it.first == repo.defaultMergeStyle }?.first ?: styles.firstOrNull()?.first ?: "merge") }
	var delete by remember { mutableStateOf(repo.deleteBranchAfterMerge) }
	var auto by remember { mutableStateOf(false) }
	var busy by remember { mutableStateOf(false) }
	val send = rememberSend()
	ModalBottomSheet(onDismissRequest = onDismiss) {
		Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 20.dp).padding(bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
			Text("Merge #${p.number}", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold))
			Text("${p.head.label.ifEmpty { p.head.ref }} into ${p.base.ref}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
			styles.forEach { (k, label) ->
				Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { style = k }.padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
					RadioButton(selected = style == k, onClick = null, modifier = Modifier.padding(8.dp))
					Text(label)
				}
			}
			Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { delete = !delete }, verticalAlignment = Alignment.CenterVertically) {
				Checkbox(checked = delete, onCheckedChange = null, modifier = Modifier.padding(8.dp))
				Text("Delete ${p.head.ref} afterwards")
			}
			Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { auto = !auto }, verticalAlignment = Alignment.CenterVertically) {
				Checkbox(checked = auto, onCheckedChange = null, modifier = Modifier.padding(8.dp))
				Text("Wait for checks to pass (auto-merge)")
			}
			if (!p.mergeable) Text("This branch conflicts with ${p.base.ref}; resolve the conflicts first.", color = MaterialTheme.colorScheme.error)
			Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
				TextButton(onClick = onDismiss) { Text("Cancel") }
				Spacer(Modifier.width(8.dp))
				Button(enabled = !busy && (p.mergeable || auto), onClick = { busy = true; send { try { onMerge(style, delete, auto); onDismiss() } finally { busy = false } } }) { Text(if (auto) "Enable auto-merge" else "Merge") }
			}
		}
	}
}
