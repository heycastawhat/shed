package dev.shed.app.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AssistChip
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import dev.shed.app.ApiError
import dev.shed.app.RepoInfo
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope

private class RepoHome(val repo: RepoInfo, val readme: String?, val starred: Boolean, val watching: Boolean)

// A repo's home, as the web's on a phone: description and counts, star/watch/fork, the repo's places, then the README.
@Composable
fun RepoScreen(r: RepoRoute) {
	val api = LocalApi.current
	val nav = LocalNav.current
	val ctx = LocalContext.current
	val send = rememberSend()
	val base = "/repos/${r.owner}/${r.repo}"
	val l = rememberLoad(api, r) {
		coroutineScope {
			val info = api.get<RepoInfo>(base)
			val starred = async { runCatching { api.send("GET", "/user/starred/${r.owner}/${r.repo}"); true }.getOrDefault(false) }
			val watching = async { runCatching { api.send("GET", "$base/subscription"); true }.getOrDefault(false) }
			val readme = async {
				listOf("README.md", "readme.md", "Readme.md", "README").firstNotNullOfOrNull { name ->
					try { api.text("$base/raw/$name?ref=${info.defaultBranch}") } catch (e: ApiError) { null }
				}
			}
			RepoHome(info, readme.await(), starred.await(), watching.await())
		}
	}
	BackPage(r.repo, r.owner) {
		Loading(l) { h ->
			val repo = h.repo
			var starred by remember(h) { mutableStateOf(h.starred) }
			var watching by remember(h) { mutableStateOf(h.watching) }
			LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = pageClearance())) {
				item {
					Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
						if (repo.description.isNotBlank()) Text(repo.description, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
						FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
							FilterChip(selected = starred, onClick = {
								val now = !starred
								starred = now
								send { api.send(if (now) "PUT" else "DELETE", "/user/starred/${r.owner}/${r.repo}") }
							}, label = { Text(if (starred) "Starred ${repo.stars + (if (h.starred) 0 else 1)}" else "Star ${repo.stars - (if (h.starred) 1 else 0)}") }, leadingIcon = { Icon(ShedIcons.star, null, Modifier.padding(0.dp)) })
							FilterChip(selected = watching, onClick = {
								val now = !watching
								watching = now
								send { api.send(if (now) "PUT" else "DELETE", "$base/subscription") }
							}, label = { Text(if (watching) "Watching" else "Watch") }, leadingIcon = { Icon(ShedIcons.eye, null) })
							AssistChip(onClick = {
								send {
									api.send("POST", "$base/forks", "{}")
									Toast.makeText(ctx, "Forked to your account", Toast.LENGTH_SHORT).show()
								}
							}, label = { Text("Fork") }, leadingIcon = { Icon(ShedIcons.fork, null) })
							AssistChip(onClick = {
								ctx.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Clone URL", repo.cloneUrl))
								Toast.makeText(ctx, "Clone URL copied", Toast.LENGTH_SHORT).show()
							}, label = { Text("Clone") }, leadingIcon = { Icon(ShedIcons.copy, null) })
						}
						repo.parent?.let { Text("Forked from ${it.fullName}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
						Surface(shape = RoundedCornerShape(24.dp), color = MaterialTheme.colorScheme.surfaceContainerLow, modifier = Modifier.fillMaxWidth()) {
							Column(Modifier.padding(vertical = 6.dp)) {
								Place(ShedIcons.code, "Code", repo.defaultBranch) { nav.navigate(TreeRoute(r.owner, r.repo, repo.defaultBranch, "")) }
								Place(ShedIcons.changes, "Pull requests", "${repo.openPulls}") { nav.navigate(ListRoute(r.owner, r.repo, true)) }
								if (repo.hasIssues) Place(ShedIcons.issue, "Issues", "${repo.openIssues}") { nav.navigate(ListRoute(r.owner, r.repo, false)) }
								Place(ShedIcons.commit, "Commits", "") { nav.navigate(CommitsRoute(r.owner, r.repo, repo.defaultBranch, "")) }
								Place(ShedIcons.branch, "Branches and tags", "") { nav.navigate(BranchesRoute(r.owner, r.repo)) }
								Place(ShedIcons.release, "Releases", if (repo.releases > 0) "${repo.releases}" else "") { nav.navigate(ReleasesRoute(r.owner, r.repo)) }
								Place(ShedIcons.actions, "Actions", "") { nav.navigate(RunsRoute(r.owner, r.repo)) }
								if (repo.hasWiki) Place(ShedIcons.wiki, "Wiki", "") { nav.navigate(WikiRoute(r.owner, r.repo, "")) }
							}
						}
						if (h.readme != null) Surface(shape = RoundedCornerShape(24.dp), color = MaterialTheme.colorScheme.surfaceContainerLow, modifier = Modifier.fillMaxWidth()) {
							Column(Modifier.padding(20.dp)) {
								SectionLabel("Readme", Modifier.padding(bottom = 8.dp))
								MarkdownText(h.readme, repo = RepoRoute(r.owner, r.repo), ref = repo.defaultBranch)
							}
						}
					}
				}
			}
		}
	}
}

@Composable
fun Place(icon: ImageVector, label: String, value: String, onClick: () -> Unit) {
	val haptics = rememberHaptics()
	Row(
		Modifier.fillMaxWidth().clickableRow { haptics.tick(); onClick() }.padding(horizontal = 20.dp, vertical = 14.dp),
		verticalAlignment = Alignment.CenterVertically
	) {
		ShedIcon(icon, 22.dp, MaterialTheme.colorScheme.primary)
		Spacer(Modifier.width(16.dp))
		Text(label, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
		if (value.isNotEmpty()) Text(value, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
		Spacer(Modifier.width(8.dp))
		ShedIcon(ShedIcons.right, 18.dp)
	}
}

fun Modifier.clickableRow(onClick: () -> Unit) = this.then(Modifier.clickable(onClick = onClick))
