package dev.shed.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.shed.app.FeedItem
import dev.shed.app.Issue
import dev.shed.app.NotificationThread
import dev.shed.app.RepoInfo
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import java.time.Duration
import java.time.Instant

private class Push(val repo: String, val branch: String, val at: String)
private class Home(val review: List<Issue>, val mentioned: List<Issue>, val activity: List<NotificationThread>, val pushes: List<Push>, val repos: List<RepoInfo>, val feed: List<FeedItem>) {
	val needs get() = review.size + mentioned.size + activity.size
}

// As the web's home: what needs you, branches you just pushed (open a PR from them), your repos, and recent activity.
@Composable
fun HomeScreen() {
	val api = LocalApi.current
	val nav = LocalNav.current
	val me = api.account.login
	val l = rememberLoad(api) {
		coroutineScope {
			val q = "/repos/issues/search?type=pulls&state=open&limit=50&sort=recentupdate"
			val review = async { api.get<List<Issue>>("$q&review_requested=true") }
			val mentioned = async { api.get<List<Issue>>("$q&mentioned=true") }
			val notes = async { api.get<List<NotificationThread>>("/notifications?status-types=unread&limit=30") }
			val repos = async { api.get<List<RepoInfo>>("/user/repos?limit=100").sortedByDescending { it.updatedAt } }
			val feed = async { runCatching { api.get<List<FeedItem>>("/users/$me/activities/feeds?limit=40") }.getOrDefault(emptyList()) }
			val r = review.await()
			val seen = r.map { it.repository?.fullName to it.number }.toSet()
			val m = mentioned.await().filter { it.user.login != me && (it.repository?.fullName to it.number) !in seen }
			val defaults = repos.await().associate { it.fullName to it.defaultBranch }
			// Pushes in the last two days to a branch that isn't the repo's default: the web offers a PR for them.
			val pushes = feed.await()
				.filter { it.op == "commit_repo" && it.ref.startsWith("refs/heads/") && runCatching { Duration.between(Instant.parse(it.created), Instant.now()).toHours() < 48 }.getOrDefault(false) }
				.filter { f -> defaults[f.repo.fullName]?.let { it != f.ref.removePrefix("refs/heads/") } ?: false }
				.distinctBy { it.repo.fullName + it.ref }
				.take(3)
				.map { Push(it.repo.fullName, it.ref.removePrefix("refs/heads/"), it.created) }
			Home(r, m, notes.await(), pushes, repos.await(), feed.await())
		}
	}
	TabPage("Home") {
		Loading(l) { h ->
			LazyColumn(contentPadding = PaddingValues(bottom = toolbarClearance())) {
				item { Section("Needs you") }
				if (h.needs == 0) item { EmptyState("All clear", "No reviews, mentions or unread activity.", ShedIcons.done) }
				items(h.review, key = { "r${it.id}" }) { i -> IssueRow(i) { nav.navigate(threadOf(i)) } }
				items(h.mentioned, key = { "m${it.id}" }) { i -> IssueRow(i) { nav.navigate(threadOf(i)) } }
				items(h.activity, key = { "n${it.id}" }) { n -> NotificationRow(n) }
				if (h.pushes.isNotEmpty()) {
					item { Section("Recently pushed") }
					items(h.pushes, key = { "p${it.repo}${it.branch}" }) { p ->
						val (o, rp) = p.repo.split('/', limit = 2)
						Surface(shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.surfaceContainerLow, modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 3.dp)) {
							Row(Modifier.padding(start = 16.dp, end = 10.dp, top = 10.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
								Column(Modifier.weight(1f)) {
									Text(p.branch, style = MaterialTheme.typography.titleSmall.copy(fontFamily = CodeStyle.fontFamily), maxLines = 1, overflow = TextOverflow.Ellipsis)
									Text("${p.repo} · ${ago(p.at)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
								}
								FilledTonalButton(onClick = { nav.navigate(NewThreadRoute(o, rp, true, p.branch)) }) { Text("Open PR") }
							}
						}
					}
				}
				item {
					Row(Modifier.fillMaxWidth().padding(end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
						Box(Modifier.weight(1f)) { Section("Your repos") }
						TextButton(onClick = { nav.navigate(ReposRoute) }) { Text("All ${h.repos.size}") }
					}
				}
				if (h.repos.isEmpty()) item { EmptyState("No repos yet", "Make one from Repos, or push to a new one.", ShedIcons.repos) }
				item { RepoGroup(h.repos.take(5)) { nav.navigate(RepoRoute(it.owner.login, it.name)) } }
				item { Section("Recent activity") }
				if (h.feed.isEmpty()) item { EmptyState("Nothing yet", "Pushes, pull requests and comments show up here.", ShedIcons.activity) }
				items(h.feed.take(20), key = { "f${it.id}" }) { f -> FeedRow(f) }
			}
		}
	}
}

@Composable
fun Section(text: String) = SectionLabel(text, Modifier.padding(start = 20.dp, top = 18.dp, bottom = 8.dp))

fun threadOf(i: Issue): ThreadRoute {
	val (owner, repo) = (i.repository?.fullName ?: "/").split('/', limit = 2)
	return ThreadRoute(owner, repo, i.number)
}
