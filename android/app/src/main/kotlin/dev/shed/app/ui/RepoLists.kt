package dev.shed.app.ui

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.rememberScrollState as rs
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import dev.shed.app.Branch
import dev.shed.app.Issue
import dev.shed.app.LabelFull
import dev.shed.app.RepoInfo
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

// A repo's pull requests or issues: open/closed/all, a search, and New.
@Composable
fun ListScreen(r: ListRoute) {
	val api = LocalApi.current
	val nav = LocalNav.current
	val haptics = rememberHaptics()
	var state by rememberSaveable { mutableStateOf("open") }
	var query by rememberSaveable { mutableStateOf("") }
	var search by rememberSaveable { mutableStateOf("") }
	val type = if (r.pulls) "pulls" else "issues"
	val l = rememberLoad(api, r, state, search) {
		api.get<List<Issue>>("/repos/${r.owner}/${r.repo}/issues?type=$type&state=$state&limit=50" + if (search.isNotBlank()) "&q=${java.net.URLEncoder.encode(search, "UTF-8")}" else "")
	}
	BackPage(if (r.pulls) "Pull requests" else "Issues", "${r.owner}/${r.repo}") {
		Box(Modifier.fillMaxSize()) {
			Column {
				OutlinedTextField(
					query, { query = it },
					placeholder = { Text("Search ${if (r.pulls) "pull requests" else "issues"}") },
					singleLine = true,
					leadingIcon = { Icon(ShedIcons.search, null) },
					keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
					keyboardActions = KeyboardActions(onSearch = { search = query }),
					modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)
				)
				Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
					listOf("open" to "Open", "closed" to "Closed", "all" to "All").forEach { (k, label) ->
						FilterChip(selected = state == k, onClick = { if (state != k) haptics.tick(); state = k }, label = { Text(label) })
					}
				}
				Loading(l) { list ->
					if (list.isEmpty()) EmptyState("Nothing here", if (state == "open") "No open ${if (r.pulls) "pull requests" else "issues"}." else "No matches.", if (r.pulls) ShedIcons.changes else ShedIcons.issue)
					else LazyColumn(contentPadding = PaddingValues(bottom = 100.dp)) {
						items(list, key = { it.id }) { i -> IssueRow(i, repo = null) { nav.navigate(ThreadRoute(r.owner, r.repo, i.number)) } }
					}
				}
			}
			ExtendedFloatingActionButton(
				onClick = { nav.navigate(NewThreadRoute(r.owner, r.repo, r.pulls)) },
				icon = { Icon(ShedIcons.plus, null) },
				text = { Text(if (r.pulls) "New pull request" else "New issue") },
				modifier = Modifier.align(Alignment.BottomEnd).navigationBarsPadding().padding(16.dp)
			)
		}
	}
}

// A new issue (title, description, labels) or pull request (branches, title, description, draft).
@Composable
fun NewThreadScreen(r: NewThreadRoute) {
	val api = LocalApi.current
	val nav = LocalNav.current
	val send = rememberSend()
	val base = "/repos/${r.owner}/${r.repo}"
	var title by rememberSaveable { mutableStateOf("") }
	var body by rememberSaveable { mutableStateOf("") }
	var draft by rememberSaveable { mutableStateOf(false) }
	var head by rememberSaveable { mutableStateOf("") }
	var into by rememberSaveable { mutableStateOf("") }
	var labels by remember { mutableStateOf(setOf<String>()) }
	var picking by remember { mutableStateOf<String?>(null) }
	var busy by remember { mutableStateOf(false) }
	val l = rememberLoad(api, r) {
		val repo = api.get<RepoInfo>(base)
		val branches = if (r.pull) api.get<List<Branch>>("$base/branches?limit=100") else emptyList()
		val all = if (!r.pull) runCatching { api.get<List<LabelFull>>("$base/labels?limit=100") }.getOrDefault(emptyList()) else emptyList()
		Triple(repo, branches, all)
	}
	BackPage(if (r.pull) "New pull request" else "New issue", "${r.owner}/${r.repo}") {
		Loading(l) { (repo, branches, all) ->
			if (into.isEmpty()) into = repo.defaultBranch
			Column(Modifier.verticalScroll(rs()).imePadding().padding(horizontal = 16.dp).padding(bottom = pageClearance()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
				if (r.pull) {
					Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
						FilterChip(selected = false, onClick = { picking = "into" }, label = { Text("into $into") }, leadingIcon = { Icon(ShedIcons.branch, null) })
						Text("←")
						FilterChip(selected = head.isNotEmpty(), onClick = { picking = "head" }, label = { Text(head.ifEmpty { "pick a branch" }) }, leadingIcon = { Icon(ShedIcons.branch, null) })
					}
				}
				OutlinedTextField(title, { title = it }, label = { Text("Title") }, singleLine = true, modifier = Modifier.fillMaxWidth())
				OutlinedTextField(body, { body = it }, label = { Text("Description") }, placeholder = { Text("Markdown is fine") }, modifier = Modifier.fillMaxWidth().heightIn(min = 180.dp))
				if (!r.pull && all.isNotEmpty() && repo.permissions.push) FilterChip(selected = labels.isNotEmpty(), onClick = { picking = "labels" }, label = { Text(if (labels.isEmpty()) "Labels" else labels.joinToString()) }, leadingIcon = { Icon(ShedIcons.tag, null) })
				if (r.pull) Row(verticalAlignment = Alignment.CenterVertically) {
					Checkbox(checked = draft, onCheckedChange = { draft = it })
					Text("Open as a draft")
				}
				Button(
					enabled = !busy && title.isNotBlank() && (!r.pull || (head.isNotEmpty() && head != into)),
					modifier = Modifier.fillMaxWidth(),
					onClick = {
						busy = true
						send {
							try {
								val made = if (r.pull) api.post<Issue>("$base/pulls", buildJsonObject { put("title", title); put("body", body); put("head", head); put("base", into); put("draft", draft) }.toString())
								else api.post<Issue>("$base/issues", buildJsonObject {
									put("title", title)
									put("body", body)
									put("labels", JsonArray(all.filter { it.name in labels }.map { JsonPrimitive(it.id) }))
								}.toString())
								nav.popBackStack()
								nav.navigate(ThreadRoute(r.owner, r.repo, made.number))
							} finally {
								busy = false
							}
						}
					}
				) { Text(if (r.pull) "Open pull request" else "Open issue") }
			}
			when (picking) {
				"head", "into" -> PickSheet(
					if (picking == "head") "Compare branch" else "Base branch",
					branches,
					setOf(if (picking == "head") head else into),
					key = { it.name },
					multi = false,
					action = "Pick",
					row = { Text(it.name) },
					onDismiss = { picking = null }
				) { picked -> picked.firstOrNull()?.let { if (picking == "head") head = it else into = it } }
				"labels" -> PickSheet("Labels", all, labels, key = { it.name }, row = { LabelChip(it.name, it.color) }, onDismiss = { picking = null }) { labels = it }
			}
		}
	}
}
