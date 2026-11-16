package dev.shed.app.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.shed.app.Issue
import dev.shed.app.NotificationThread
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope

private class Home(val review: List<Issue>, val mentioned: List<Issue>, val activity: List<NotificationThread>)

// What needs you, as on the web's home: reviews requested of you, mentions, then unread activity.
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
			val r = review.await()
			val seen = r.map { it.repository?.fullName to it.number }.toSet()
			val m = mentioned.await().filter { it.user.login != me && (it.repository?.fullName to it.number) !in seen }
			Home(r, m, notes.await())
		}
	}
	Scaffold(topBar = { TabBar("Home") }) { pad ->
		Loading(l, Modifier.padding(pad)) { h ->
			if (h.review.isEmpty() && h.mentioned.isEmpty() && h.activity.isEmpty()) Column { Empty("Nothing needs you.") }
			else LazyColumn {
				if (h.review.isNotEmpty()) {
					item { SectionTitle("Review requested") }
					items(h.review, key = { "r${it.id}" }) { i -> IssueRow(i) { nav.navigate(threadOf(i)) } }
				}
				if (h.mentioned.isNotEmpty()) {
					item { SectionTitle("Mentioned") }
					items(h.mentioned, key = { "m${it.id}" }) { i -> IssueRow(i) { nav.navigate(threadOf(i)) } }
				}
				if (h.activity.isNotEmpty()) {
					item { SectionTitle("New activity") }
					items(h.activity, key = { "n${it.id}" }) { n -> NotificationRow(n) }
				}
			}
		}
	}
}

fun threadOf(i: Issue): ThreadRoute {
	val (owner, repo) = (i.repository?.fullName ?: "/").split('/', limit = 2)
	return ThreadRoute(owner, repo, i.number)
}
