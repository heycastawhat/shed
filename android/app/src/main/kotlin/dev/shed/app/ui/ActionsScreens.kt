package dev.shed.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.shed.app.Job
import dev.shed.app.Run
import dev.shed.app.Runs
import kotlinx.coroutines.delay

@Composable
fun RunRow(run: Run, onClick: () -> Unit) = CardRow(onClick) {
	Row(Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
		StatusDot(run.status)
		Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
			Text(run.title.ifBlank { run.name }, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
			Text(
				listOf(run.workflow.ifBlank { run.name }, run.prettyref, "#${run.number}", ago(run.created)).filter { it.isNotBlank() }.joinToString(" · "),
				style = MaterialTheme.typography.bodySmall,
				color = MaterialTheme.colorScheme.onSurfaceVariant,
				maxLines = 1,
				overflow = TextOverflow.Ellipsis
			)
		}
	}
}

private val live = setOf("waiting", "running", "blocked", "cancelling")

@Composable
fun RunsScreen(r: RunsRoute) {
	val api = LocalApi.current
	val nav = LocalNav.current
	val l = rememberLoad(api, r) { api.get<Runs>("/repos/${r.owner}/${r.repo}/actions/runs?limit=50").runs }
	// Refresh while anything is still going.
	LaunchedEffect((l.state as? Load.Ok)?.value) {
		if ((l.state as? Load.Ok)?.value?.any { it.status in live } == true) { delay(5000); l.reload() }
	}
	BackPage("Actions", "${r.owner}/${r.repo}") {
		Loading(l) { runs ->
			if (runs.isEmpty()) EmptyState("No runs yet", "Workflows in .forgejo/workflows run on push and show up here.", ShedIcons.actions)
			else LazyColumn(contentPadding = PaddingValues(bottom = pageClearance())) { items(runs, key = { it.id }) { run -> RunRow(run) { nav.navigate(RunRoute(r.owner, r.repo, run.number)) } } }
		}
	}
}

private val ansi = Regex("\u001B\\[[0-9;]*[A-Za-z]")

// A run: its jobs as chips, the picked job's steps with their logs (each folds), re-run and cancel. Live while it runs.
@Composable
fun RunScreen(r: RunRoute) {
	val api = LocalApi.current
	val send = rememberSend()
	val base = "/repos/${r.owner}/${r.repo}/actions"
	var jobId by rememberSaveable { mutableLongStateOf(0L) }
	var menu by remember { mutableStateOf(false) }
	val l = rememberLoad(api, r) { api.get<Run>("$base/runs/${r.number}") }
	val run = (l.state as? Load.Ok)?.value
	val job = run?.jobs?.firstOrNull { it.id == jobId } ?: run?.jobs?.firstOrNull { it.status == "running" } ?: run?.jobs?.firstOrNull()
	val log = rememberLoad(api, job?.id, job?.status, (l.state as? Load.Ok)?.value?.stopped) { job?.let { api.text("$base/jobs/${it.id}/logs").split('\n') } ?: emptyList() }
	LaunchedEffect(run) { if (run != null && (run.status in live || run.jobs.any { it.status in live })) { delay(3000); l.reload(); log.reload() } }
	BackPage("Run #${r.number}", "${r.owner}/${r.repo}", trailing = {
		if (run != null) Box {
			IconButton(onClick = { menu = true }) { Icon(ShedIcons.more, "More") }
			DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
				if (run.status in live) DropdownMenuItem(text = { Text("Cancel") }, onClick = { menu = false; send { api.send("POST", "$base/runs/${r.number}/cancel"); l.reload() } })
				else {
					DropdownMenuItem(text = { Text("Re-run all jobs") }, onClick = { menu = false; send { api.send("POST", "$base/runs/${r.number}/rerun"); l.reload() } })
					if (run.jobs.any { it.result == "failure" || it.status == "failure" }) DropdownMenuItem(text = { Text("Re-run failed jobs") }, onClick = { menu = false; send { api.send("POST", "$base/runs/${r.number}/rerun?failed=true"); l.reload() } })
				}
			}
		}
	}) {
		Loading(l) { run ->
			val lines = (log.state as? Load.Ok)?.value ?: emptyList()
			val open = remember(job?.id) { mutableStateMapOf<Int, Boolean>() }
			LazyColumn(contentPadding = PaddingValues(bottom = pageClearance())) {
				item {
					Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
						Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
							StatusDot(run.status)
							Text(run.title.ifBlank { run.name }, style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold), modifier = Modifier.weight(1f))
						}
						Text(listOf(run.workflow, run.prettyref, run.sha.take(7), run.user?.login?.let { "by $it" }, ago(run.created)).filterNotNull().filter { it.isNotBlank() }.joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
						Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
							run.jobs.forEach { j -> FilterChip(selected = j.id == job?.id, onClick = { jobId = j.id }, label = { Text(j.name) }, leadingIcon = { Box(Modifier.padding(0.dp)) { ShedIcon(jobIcon(j), 16.dp) } }) }
						}
						job?.let { j -> Text(listOfNotNull(j.status, j.runner?.let { "on $it" }, j.attempt.takeIf { it > 1 }?.let { "attempt $it" }).joinToString(" · "), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
					}
				}
				if (job != null) {
					val used = job.steps.flatMap { s -> (s.logIndex until s.logIndex + s.logLength).toList() }.toSet()
					val setup = lines.indices.filter { it !in used && it < (job.steps.firstOrNull()?.logIndex ?: lines.size) }
					if (setup.isNotEmpty()) stepItem("Set up job", null, -1, open, setup.map { lines[it] })
					job.steps.forEach { s ->
						val text = (s.logIndex until (s.logIndex + s.logLength).coerceAtMost(lines.size)).map { lines[it] }
						stepItem(job.stepNames.getOrNull(s.id) ?: "Step ${s.id + 1}", s.result ?: if (s.startedAt != null && s.stoppedAt == null) "running" else null, s.id, open, text)
					}
					if (lines.isEmpty()) item { Text("No output yet.", Modifier.padding(20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
				}
			}
		}
	}
}

@Composable
private fun jobIcon(j: Job) = when (j.result ?: j.status) {
	"success" -> ShedIcons.check
	"failure" -> ShedIcons.x
	"running" -> ShedIcons.refresh
	else -> ShedIcons.clock
}

private fun androidx.compose.foundation.lazy.LazyListScope.stepItem(name: String, result: String?, id: Int, open: MutableMap<Int, Boolean>, lines: List<String>) {
	item(key = "s$id") {
		val c = MaterialTheme.colorScheme
		val expanded = open[id] ?: (result == "failure" || result == "running")
		Row(
			Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 3.dp).clip(RoundedCornerShape(14.dp)).background(c.surfaceContainerLow)
				.clickableRow { open[id] = !expanded }.padding(horizontal = 12.dp, vertical = 10.dp),
			horizontalArrangement = Arrangement.spacedBy(10.dp),
			verticalAlignment = Alignment.CenterVertically
		) {
			ShedIcon(if (expanded) ShedIcons.chevron else ShedIcons.right, 16.dp)
			Text(name, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
			Text(result ?: "", style = MaterialTheme.typography.labelMedium, color = if (result == "failure") c.error else c.onSurfaceVariant)
		}
		if (expanded) Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
			// Each line is "<timestamp> <text>".
			lines.forEach { l -> Text(l.drop(25).replace(ansi, "").ifEmpty { l.replace(ansi, "") }, style = CodeStyle, color = c.onSurface) }
		}
	}
}
