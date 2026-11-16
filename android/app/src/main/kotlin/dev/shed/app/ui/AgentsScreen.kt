package dev.shed.app.ui

import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import dev.shed.app.Agents
import dev.shed.app.Target
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

private val MODES = listOf("approval-required" to "Ask before acting", "auto-accept-edits" to "Edit freely, ask for commands", "full-access" to "Full access")

// The web's Agents page: what agents are waiting on you for, your T3 tasks (and their questions), a new task, keys and activity.
@Composable
fun AgentsScreen() {
	val api = LocalApi.current
	val ctx = LocalContext.current
	val send = rememberSend()
	var launching by remember { mutableStateOf(false) }
	val l = rememberLoad(api) { api.get<Agents>("/user/agents") }
	TabPage("Agents") {
		Box(Modifier.fillMaxSize()) {
			Loading(l) { a ->
				val t3 = a.t3
				if (a.pending.isEmpty() && t3 == null && a.keys.isEmpty()) EmptyState("No agents yet", "Add an agent key or a T3 Code host in Settings → Agents on the web.", ShedIcons.agents)
				else LazyColumn(contentPadding = PaddingValues(bottom = toolbarClearance(72.dp))) {
					if (a.pending.isNotEmpty()) {
						item { Section("Waiting on you") }
						items(a.pending, key = { "p${it.id}" }) { p ->
							Card {
								Text("${p.keyName} wants to ${p.tool.replace('_', ' ')}", style = MaterialTheme.typography.titleMedium)
								Text(p.repo, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
								p.args.entries.take(4).forEach { (k, v) ->
									val s = (v as? JsonPrimitive)?.contentOrNull ?: v.toString()
									Text("$k: ${s.take(160)}", style = CodeStyle, maxLines = 3, overflow = TextOverflow.Ellipsis)
								}
								p.reason?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
								Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
									Button(onClick = { send { api.send("POST", "/user/agents/approvals/${p.id}", """{"approve":true}"""); l.reload() } }) { Text("Approve") }
									OutlinedButton(onClick = { send { api.send("POST", "/user/agents/approvals/${p.id}", """{"approve":false}"""); l.reload() } }) { Text("Deny") }
								}
							}
						}
					}
					if (t3 != null) {
						t3.down.forEach { d -> item { Text("${d.name} isn't answering: ${d.error}", Modifier.padding(horizontal = 20.dp, vertical = 4.dp), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) } }
						if (t3.asks.isNotEmpty()) {
							item { Section("Tasks asking you") }
							items(t3.asks, key = { "a${it.thread.id}" }) { ask ->
								Card {
									Text(ask.thread.title.ifBlank { "Task" }, style = MaterialTheme.typography.titleMedium)
									ask.prompt?.let { Text(it, style = CodeStyle, maxLines = 8, overflow = TextOverflow.Ellipsis) }
									ask.questions?.forEach { Text(it, style = MaterialTheme.typography.bodyMedium) }
									if (ask.questions == null) FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
										listOf("accept" to "Allow once", "acceptForSession" to "Allow for this task", "decline" to "Deny").forEach { (d, label) ->
											OutlinedButton(onClick = {
												send {
													api.send("POST", "/user/agents/tasks/respond", buildJsonObject { put("host", ask.thread.host); put("thread", ask.thread.id); put("request", ask.request.id); put("decision", d) }.toString())
													l.reload()
												}
											}) { Text(label) }
										}
									} else TextButton(onClick = { CustomTabsIntent.Builder().build().launchUrl(ctx, ask.thread.web.toUri()) }) { Text("Answer in T3 Code") }
								}
							}
						}
						item { Section("Tasks") }
						if (t3.threads.isEmpty()) item { Text("No tasks running.", Modifier.padding(horizontal = 20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
						items(t3.threads, key = { "t${it.host}${it.id}" }) { th ->
							CardRow({ CustomTabsIntent.Builder().build().launchUrl(ctx, th.web.toUri()) }) {
								Row(Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
									StatusDot(when { th.pendingRuntimeRequest != null -> "waiting"; th.activeRunId != null -> "running"; else -> "success" })
									Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
										Text(th.title.ifBlank { "Task" }, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
										Text(listOfNotNull(th.repo ?: th.project, th.model, th.hostName.takeIf { it.isNotBlank() }, ago(th.updatedAt)).joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
									}
									if (th.activeRunId == null && th.pendingRuntimeRequest == null) TextButton(onClick = {
										send { api.send("POST", "/user/agents/tasks/dismiss", buildJsonObject { put("host", th.host); put("thread", th.id); put("updatedAt", th.updatedAt) }.toString()); l.reload() }
									}) { Text("Dismiss") }
								}
							}
						}
					}
					if (a.keys.isNotEmpty()) {
						item { Section("Agent keys") }
						items(a.keys, key = { "k${it.id}" }) { k ->
							Card {
								Text(k.name, style = MaterialTheme.typography.titleSmall)
								Text("${k.repos.joinToString().ifEmpty { "No repos" }} · ${k.lastUsedAt?.let { "used ${ago(it)}" } ?: "never used"}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
							}
						}
					}
					if (a.activity.isNotEmpty()) {
						item { Section("Recent activity") }
						items(a.activity, key = { "v${it.at}${it.action}" }) { x ->
							Text("${x.name} ${x.action} in ${x.repo} · ${ago(x.at)}", Modifier.padding(horizontal = 20.dp, vertical = 6.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
						}
					}
				}
				if (launching && t3 != null) NewTaskSheet(t3.targets, onDismiss = { launching = false }) { l.reload() }
			}
			if ((l.state as? Load.Ok)?.value?.t3?.targets?.isNotEmpty() == true) ExtendedFloatingActionButton(
				onClick = { launching = true },
				icon = { Icon(ShedIcons.plus, null) },
				text = { Text("New task") },
				modifier = Modifier.align(Alignment.BottomEnd).navigationBarsPadding().padding(end = 16.dp, bottom = TOOLBAR_BOTTOM + TOOLBAR_HEIGHT + 16.dp)
			)
		}
	}
}

@Composable
private fun Card(content: @Composable () -> Unit) {
	Surface(shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.surfaceContainerLow, modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp)) {
		Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) { content() }
	}
}

// A new T3 task in one of the repos a host has a project for: the same fields as the web's New task form.
@Composable
private fun NewTaskSheet(targets: List<Target>, onDismiss: () -> Unit, onDone: () -> Unit) {
	val api = LocalApi.current
	var target by remember { mutableStateOf(targets.first()) }
	var host by remember { mutableStateOf(target.hosts.first()) }
	var model by remember { mutableStateOf(host.models.firstOrNull()) }
	var mode by remember { mutableStateOf(MODES.first().first) }
	var picking by remember { mutableStateOf<String?>(null) }
	ComposeSheet("New task", action = "Start", extra = {
		FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
			FilterChip(selected = false, onClick = { picking = "repo" }, label = { Text(target.repo) }, leadingIcon = { Icon(ShedIcons.repos, null) })
			if (target.hosts.size > 1) FilterChip(selected = false, onClick = { picking = "host" }, label = { Text(host.name) })
			FilterChip(selected = false, onClick = { picking = "model" }, label = { Text(model?.name ?: "Model") }, leadingIcon = { Icon(ShedIcons.agents, null) })
			FilterChip(selected = false, onClick = { picking = "mode" }, label = { Text(MODES.first { it.first == mode }.second) })
		}
	}, onDismiss = onDismiss) { text ->
		api.send("POST", "/user/agents/tasks", buildJsonObject {
			put("repo", target.repo)
			put("text", text)
			put("host", host.id)
			put("model", "${model?.instanceId}/${model?.slug}")
			put("mode", mode)
			put("base", target.base)
		}.toString())
		onDone()
	}
	when (picking) {
		"repo" -> PickSheet("Repo", targets, setOf(target.repo), key = { it.repo }, multi = false, action = "Pick", row = { Text(it.repo) }, onDismiss = { picking = null }) { p ->
			targets.firstOrNull { it.repo in p }?.let { target = it; host = it.hosts.first(); model = host.models.firstOrNull() }
		}
		"host" -> PickSheet("Host", target.hosts, setOf(host.id), key = { it.id }, multi = false, action = "Pick", row = { Text(it.name) }, onDismiss = { picking = null }) { p ->
			target.hosts.firstOrNull { it.id in p }?.let { host = it; model = it.models.firstOrNull() }
		}
		"model" -> PickSheet("Model", host.models, setOfNotNull(model?.let { "${it.instanceId}/${it.slug}" }), key = { "${it.instanceId}/${it.slug}" }, multi = false, action = "Pick", row = { Text(it.name) }, onDismiss = { picking = null }) { p ->
			model = host.models.firstOrNull { "${it.instanceId}/${it.slug}" in p }
		}
		"mode" -> PickSheet("Permissions", MODES, setOf(mode), key = { it.first }, multi = false, action = "Pick", row = { Text(it.second) }, onDismiss = { picking = null }) { p -> p.firstOrNull()?.let { mode = it } }
	}
}
