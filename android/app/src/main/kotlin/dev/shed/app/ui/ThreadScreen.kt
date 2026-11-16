package dev.shed.app.ui

import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PrimaryScrollableTabRow
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import dev.shed.app.Api
import dev.shed.app.ChangedFile
import dev.shed.app.CombinedStatus
import dev.shed.app.Commit
import dev.shed.app.Issue
import dev.shed.app.LabelFull
import dev.shed.app.LineComment
import dev.shed.app.Milestone
import dev.shed.app.Pull
import dev.shed.app.RepoInfo
import dev.shed.app.Review
import dev.shed.app.Runs
import dev.shed.app.TimelineItem
import dev.shed.app.Token
import dev.shed.app.User
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

private class Thread(val issue: Issue, val pull: Pull?, val repo: RepoInfo, val timeline: List<TimelineItem>, val reviews: List<Review>, val lines: List<LineComment>)

private enum class Sheet { None, Comment, Review, Merge, Labels, Assignees, Milestone, Reviewers, Edit }

// An issue or a pull request. A PR has tabs as on the web: Conversation, Files, Commits, Checks.
@Composable
fun ThreadScreen(r: ThreadRoute) {
	val api = LocalApi.current
	val ctx = LocalContext.current
	val base = "/repos/${r.owner}/${r.repo}"
	val path = "$base/issues/${r.number}"
	val l = rememberLoad(api, r) {
		coroutineScope {
			val issue = async { api.get<Issue>(path) }
			val repo = async { api.get<RepoInfo>(base) }
			val timeline = async { api.get<List<TimelineItem>>("$path/timeline") }
			val i = issue.await()
			val pr = i.pullRequest != null
			val pull = if (pr) async { api.get<Pull>("$base/pulls/${r.number}") } else null
			val reviews = if (pr) async { api.get<List<Review>>("$base/pulls/${r.number}/reviews") } else null
			val lines = if (pr) async { api.get<List<LineComment>>("$base/pulls/${r.number}/comments") } else null
			Thread(i, pull?.await(), repo.await(), timeline.await(), reviews?.await() ?: emptyList(), lines?.await() ?: emptyList())
		}
	}
	var sheet by remember { mutableStateOf(Sheet.None) }
	var menu by remember { mutableStateOf(false) }
	val send = rememberSend()
	val t = (l.state as? Load.Ok)?.value

	BackPage("#${r.number}", "${r.owner}/${r.repo}", trailing = {
		if (t != null) Box {
			IconButton(onClick = { menu = true }) { Icon(ShedIcons.more, "More") }
			DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
				val can = t.repo.permissions.push
				DropdownMenuItem(text = { Text("Edit") }, onClick = { menu = false; sheet = Sheet.Edit })
				if (can) DropdownMenuItem(text = { Text("Labels") }, onClick = { menu = false; sheet = Sheet.Labels })
				if (can) DropdownMenuItem(text = { Text("Assignees") }, onClick = { menu = false; sheet = Sheet.Assignees })
				if (can) DropdownMenuItem(text = { Text("Milestone") }, onClick = { menu = false; sheet = Sheet.Milestone })
				if (t.pull != null) DropdownMenuItem(text = { Text("Reviewers") }, onClick = { menu = false; sheet = Sheet.Reviewers })
				if (t.pull?.draft == true) DropdownMenuItem(text = { Text("Ready for review") }, onClick = {
					menu = false
					send { api.send("PATCH", "$base/pulls/${r.number}", """{"draft":false}"""); l.reload() }
				})
				if (t.pull?.merged != true) DropdownMenuItem(text = { Text(if (t.issue.state == "open") "Close" else "Reopen") }, onClick = {
					menu = false
					send { api.send("PATCH", path, """{"state":"${if (t.issue.state == "open") "closed" else "open"}"}"""); l.reload() }
				})
				DropdownMenuItem(text = { Text("Open in browser") }, onClick = {
					menu = false
					CustomTabsIntent.Builder().build().launchUrl(ctx, "${api.account.server}/${r.owner}/${r.repo}/${if (t.pull != null) "pulls" else "issues"}/${r.number}".toUri())
				})
			}
		}
	}) {
		Loading(l) { t ->
			if (t.pull == null) Box(Modifier.fillMaxSize()) {
				Conversation(t, r, onReload = l.reload)
				ActionBar(Modifier.align(Alignment.BottomCenter)) {
					FilledTonalButton(onClick = { sheet = Sheet.Comment }) { Text("Comment") }
				}
			}
			else PullTabs(t, r, l.reload, onSheet = { sheet = it })
		}
	}

	if (t != null) when (sheet) {
		Sheet.None -> Unit
		Sheet.Comment -> ComposeSheet("Comment", onDismiss = { sheet = Sheet.None }) { body ->
			api.send("POST", "$path/comments", buildJsonObject { put("body", body) }.toString())
			l.reload()
		}
		Sheet.Edit -> EditSheet(t.issue.title, t.issue.body.orEmpty(), onDismiss = { sheet = Sheet.None }) { title, body ->
			api.send("PATCH", path, buildJsonObject { put("title", title); put("body", body) }.toString())
			l.reload()
		}
		Sheet.Review -> ReviewSheet(onDismiss = { sheet = Sheet.None }) { event, body ->
			api.send("POST", "$base/pulls/${r.number}/reviews", buildJsonObject { put("event", event); put("body", body) }.toString())
			l.reload()
		}
		Sheet.Merge -> MergeSheet(t.pull!!, t.repo, onDismiss = { sheet = Sheet.None }) { style, delete, auto ->
			api.send("POST", "$base/pulls/${r.number}/merge", buildJsonObject {
				put("Do", style)
				put("delete_branch_after_merge", delete)
				if (auto) put("merge_when_checks_succeed", true)
			}.toString())
			l.reload()
		}
		Sheet.Labels -> {
			val all = rememberLoad(api, "labels", base) { api.get<List<LabelFull>>("$base/labels?limit=100") }
			(all.state as? Load.Ok)?.value?.let { labels ->
				PickSheet("Labels", labels, t.issue.labels.map { it.name }.toSet(), key = { it.name }, row = { LabelChip(it.name, it.color) }, onDismiss = { sheet = Sheet.None }) { picked ->
					val ids = labels.filter { it.name in picked }.map { it.id }
					api.send("PUT", "$path/labels", buildJsonObject { put("labels", JsonArray(ids.map { JsonPrimitive(it) })) }.toString())
					l.reload()
				}
			}
		}
		Sheet.Assignees, Sheet.Reviewers -> {
			val reviewers = sheet == Sheet.Reviewers
			val people = rememberLoad(api, sheet, base) { api.get<List<User>>(if (reviewers) "$base/reviewers" else "$base/assignees") }
			(people.state as? Load.Ok)?.value?.let { users ->
				val current = if (reviewers) t.pull?.requestedReviewers.orEmpty().filterNotNull() else t.issue.assignees.orEmpty()
				PickSheet(if (reviewers) "Reviewers" else "Assignees", users, current.map { it.login }.toSet(), key = { it.login }, row = { PersonRow(it) }, onDismiss = { sheet = Sheet.None }) { picked ->
					if (reviewers) {
						val now = current.map { it.login }.toSet()
						val add = picked - now
						val remove = now - picked
						if (add.isNotEmpty()) api.send("POST", "$base/pulls/${r.number}/requested_reviewers", buildJsonObject { putJsonArray("reviewers") { add.forEach { add(JsonPrimitive(it)) } } }.toString())
						if (remove.isNotEmpty()) api.send("DELETE", "$base/pulls/${r.number}/requested_reviewers", buildJsonObject { putJsonArray("reviewers") { remove.forEach { add(JsonPrimitive(it)) } } }.toString())
					} else api.send("PATCH", path, buildJsonObject { putJsonArray("assignees") { picked.forEach { add(JsonPrimitive(it)) } } }.toString())
					l.reload()
				}
			}
		}
		Sheet.Milestone -> {
			val all = rememberLoad(api, "milestones", base) { api.get<List<Milestone>>("$base/milestones?state=all&limit=100") }
			(all.state as? Load.Ok)?.value?.let { ms ->
				val none = Milestone(0, "No milestone")
				PickSheet("Milestone", listOf(none) + ms, setOf((t.issue.milestone?.id ?: 0).toString()), key = { it.id.toString() }, multi = false, row = { Text(it.title) }, onDismiss = { sheet = Sheet.None }) { picked ->
					api.send("PATCH", path, buildJsonObject { put("milestone", picked.firstOrNull()?.toLongOrNull() ?: 0) }.toString())
					l.reload()
				}
			}
		}
	}
}

// The floating row of actions at the bottom of a thread, as Sink's toolbar floats.
@Composable
fun ActionBar(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
	Surface(
		modifier.navigationBarsPadding().padding(bottom = 16.dp),
		shape = RoundedCornerShape(50),
		color = MaterialTheme.colorScheme.surfaceContainerHigh,
		shadowElevation = 6.dp
	) {
		Row(Modifier.padding(horizontal = 8.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) { content() }
	}
}

@Composable
fun PersonRow(u: User) = Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
	Avatar(u.avatarUrl, 28.dp)
	Column {
		Text(u.login, style = MaterialTheme.typography.bodyLarge)
		u.fullName?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
	}
}

private val TABS = listOf("Conversation", "Files", "Commits", "Checks")

@Composable
private fun PullTabs(t: Thread, r: ThreadRoute, reload: () -> Unit, onSheet: (Sheet) -> Unit) {
	var tab by rememberSaveable { mutableIntStateOf(0) }
	val haptics = rememberHaptics()
	val p = t.pull!!
	Column(Modifier.fillMaxSize()) {
		PrimaryScrollableTabRow(selectedTabIndex = tab, edgePadding = 12.dp, containerColor = MaterialTheme.colorScheme.surfaceContainerLowest) {
			TABS.forEachIndexed { i, name ->
				val count = when (i) { 1 -> p.changedFiles; else -> null }
				Tab(selected = tab == i, onClick = { if (tab != i) haptics.tick(); tab = i }, text = { Text(if (count != null && count > 0) "$name $count" else name) })
			}
		}
		Box(Modifier.weight(1f)) {
			when (tab) {
				0 -> Conversation(t, r, onReload = reload)
				1 -> FilesTab(p, r, t.lines, reload)
				2 -> CommitsTab(r)
				else -> ChecksTab(p, r)
			}
			if (tab == 0) ActionBar(Modifier.align(Alignment.BottomCenter)) {
				FilledTonalButton(onClick = { onSheet(Sheet.Comment) }) { Text("Comment") }
				if (p.state == "open") FilledTonalButton(onClick = { onSheet(Sheet.Review) }) { Text("Review") }
				if (p.state == "open" && !p.merged && t.repo.permissions.push) Button(onClick = { onSheet(Sheet.Merge) }, enabled = p.mergeable || p.autoMerge != null) { Text(if (p.autoMerge != null) "Auto-merge on" else "Merge") }
			}
		}
	}
}

// The description, then comments, events and reviews in order.
@Composable
private fun Conversation(t: Thread, r: ThreadRoute, onReload: () -> Unit) {
	val i = t.issue
	val p = t.pull
	val api = LocalApi.current
	val nav = LocalNav.current
	val send = rememberSend()
	var editing by remember { mutableStateOf<TimelineItem?>(null) }
	var replying by remember { mutableStateOf<LineComment?>(null) }
	val byReview = t.lines.groupBy { it.reviewId }
	val entries = remember(t) {
		(t.timeline.map { it.createdAt to it } + t.reviews.filter { it.state != "PENDING" }.map { it.submittedAt to it }).sortedBy { it.first }.map { it.second }
	}
	LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 110.dp)) {
		item {
			Column(Modifier.padding(start = 20.dp, end = 20.dp, bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
				Text(i.title, style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold))
				Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
					StateChip(i.state, p != null, p?.merged == true, p?.draft == true)
					Text("${i.user.login} opened ${ago(i.createdAt)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
				}
				if (p != null) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
					ShedIcon(ShedIcons.branch, 16.dp)
					Text("${p.head.label.ifEmpty { p.head.ref }} → ${p.base.ref}", style = MaterialTheme.typography.bodyMedium.copy(fontFamily = CodeStyle.fontFamily), maxLines = 1, overflow = TextOverflow.Ellipsis)
				}
				if (p != null) Text(
					"${p.changedFiles} files · +${p.additions} −${p.deletions}" + when {
						p.merged -> " · merged ${p.mergedAt?.let { ago(it) } ?: ""}"
						!p.mergeable && p.state == "open" -> " · conflicts with ${p.base.ref}"
						else -> ""
					},
					style = MaterialTheme.typography.bodySmall,
					color = MaterialTheme.colorScheme.onSurfaceVariant
				)
				Meta(t)
			}
		}
		item { Post(i.user, i.createdAt, i.body.orEmpty().ifBlank { "_No description._" }) }
		items(entries, key = { e -> if (e is Review) "r${e.id}" else "t${(e as TimelineItem).id}" }) { e ->
			when (e) {
				is Review -> ReviewCard(e, byReview[e.id].orEmpty(), r, onReply = { replying = it }, onReload = onReload)
				is TimelineItem -> if (e.type == "comment") Post(e.user, e.createdAt, e.body, mine = e.user?.login == api.account.login, onEdit = { editing = e }, onDelete = {
					send { api.send("DELETE", "/repos/${r.owner}/${r.repo}/issues/comments/${e.id}"); onReload() }
				}) else Event(e, onOpen = { o, rp, n -> nav.navigate(ThreadRoute(o, rp, n)) })
			}
		}
	}
	editing?.let { e ->
		ComposeSheet("Edit comment", initial = e.body, action = "Save", onDismiss = { editing = null }) { body ->
			api.send("PATCH", "/repos/${r.owner}/${r.repo}/issues/comments/${e.id}", buildJsonObject { put("body", body) }.toString())
			onReload()
		}
	}
	replying?.let { c ->
		ComposeSheet("Reply on ${c.path}:${c.line}", onDismiss = { replying = null }) { body -> lineComment(api, r, c.path, c.side, c.line, body); onReload() }
	}
}

suspend fun lineComment(api: Api, r: ThreadRoute, path: String, side: String, line: Int, body: String) {
	api.send("POST", "/repos/${r.owner}/${r.repo}/pulls/${r.number}/reviews", buildJsonObject {
		put("event", "COMMENT")
		put("body", "")
		putJsonArray("comments") {
			add(buildJsonObject {
				put("path", path)
				put("body", body)
				put(if (side == "new") "new_position" else "old_position", line)
			})
		}
	}.toString())
}

// Labels, assignees, milestone and reviewers under the title.
@Composable
private fun Meta(t: Thread) {
	val i = t.issue
	val reviewers = t.pull?.requestedReviewers.orEmpty().filterNotNull()
	if (i.labels.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) { i.labels.forEach { LabelChip(it.name, it.color) } }
	val parts = listOfNotNull(
		i.assignees?.takeIf { it.isNotEmpty() }?.let { "Assigned to ${it.joinToString { u -> u.login }}" },
		reviewers.takeIf { it.isNotEmpty() }?.let { "Review asked of ${it.joinToString { u -> u.login }}" },
		i.milestone?.let { "Milestone ${it.title}" }
	)
	if (parts.isNotEmpty()) Text(parts.joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

// A comment as one of Sink's cards; your own have Edit and Delete.
@Composable
fun Post(user: User?, at: String, body: String, mine: Boolean = false, onEdit: () -> Unit = {}, onDelete: () -> Unit = {}) {
	var menu by remember { mutableStateOf(false) }
	Surface(shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.surfaceContainerLow, modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp)) {
		Column(Modifier.padding(start = 16.dp, end = 4.dp, top = 6.dp, bottom = 14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
			Row(verticalAlignment = Alignment.CenterVertically) {
				Avatar(user?.avatarUrl ?: "", 24.dp)
				Spacer(Modifier.width(8.dp))
				Text(user?.login ?: "ghost", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
				Spacer(Modifier.width(8.dp))
				Text(ago(at), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
				if (mine) Box {
					IconButton(onClick = { menu = true }) { Icon(ShedIcons.more, "Comment actions", Modifier.size(18.dp)) }
					DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
						DropdownMenuItem(text = { Text("Edit") }, onClick = { menu = false; onEdit() })
						DropdownMenuItem(text = { Text("Delete") }, onClick = { menu = false; onDelete() })
					}
				} else Spacer(Modifier.height(40.dp))
			}
			Box(Modifier.padding(end = 12.dp)) { MarkdownText(body) }
		}
	}
}

// A line in the timeline for something that happened: labels, titles, assignees, merges, references.
@Composable
private fun Event(e: TimelineItem, onOpen: (String, String, Long) -> Unit) {
	val who = e.user?.login ?: "Someone"
	val (icon, text) = when (e.type) {
		"label" -> ShedIcons.tag to "$who ${if (e.body == "1") "added" else "removed"} ${e.label?.name ?: "a label"}"
		"change_title" -> ShedIcons.pencil to "$who renamed this from “${e.oldTitle}” to “${e.newTitle}”"
		"assignees" -> ShedIcons.user to if (e.removedAssignee) "$who unassigned ${e.assignee?.login}" else if (e.assignee?.login == e.user?.login) "$who self-assigned this" else "$who assigned ${e.assignee?.login}"
		"review_request" -> ShedIcons.eye to if (e.removedAssignee) "$who removed the review request for ${e.assignee?.login}" else "$who asked ${e.assignee?.login} for a review"
		"milestone" -> ShedIcons.milestone to if (e.milestone != null) "$who added this to ${e.milestone.title}" else "$who removed the milestone"
		"close" -> ShedIcons.x to "$who closed this"
		"reopen" -> ShedIcons.refresh to "$who reopened this"
		"merge_pull" -> ShedIcons.merge to "$who merged this"
		"delete_branch" -> ShedIcons.branch to "$who deleted the branch"
		"change_target_branch" -> ShedIcons.branch to "$who changed the base branch"
		"dismiss_review" -> ShedIcons.x to "$who dismissed a review"
		"pull_scheduled_merge" -> ShedIcons.clock to "$who set this to merge when checks pass"
		"pull_cancel_scheduled_merge" -> ShedIcons.clock to "$who cancelled auto-merge"
		"issue_ref", "pull_ref" -> ShedIcons.link to "$who mentioned this in ${e.refRepo}#${e.refNumber}${e.refTitle?.let { " “$it”" } ?: ""}"
		else -> ShedIcons.activity to "$who ${e.type.replace('_', ' ')}"
	}
	val ref = if (e.refRepo != null && e.refNumber != null) e.refRepo.split('/', limit = 2).takeIf { it.size == 2 } else null
	Row(
		Modifier.fillMaxWidth().then(if (ref != null) Modifier.clickable { onOpen(ref[0], ref[1], e.refNumber!!) } else Modifier).padding(horizontal = 24.dp, vertical = 8.dp),
		horizontalArrangement = Arrangement.spacedBy(10.dp),
		verticalAlignment = Alignment.CenterVertically
	) {
		Box(Modifier.size(28.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceContainerHigh), Alignment.Center) { ShedIcon(icon, 15.dp) }
		Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
		Text(ago(e.createdAt), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
	}
}

