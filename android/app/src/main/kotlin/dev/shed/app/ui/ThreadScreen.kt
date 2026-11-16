package dev.shed.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import dev.shed.app.Comment
import dev.shed.app.Issue
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope

private class Thread(val issue: Issue, val comments: List<Comment>)

// An issue or pull request: header, description and comments. The full PR screen (files, reviews, checks, merge) is the next step.
@Composable
fun ThreadScreen(r: ThreadRoute) {
	val api = LocalApi.current
	val base = "/repos/${r.owner}/${r.repo}/issues/${r.number}"
	val l = rememberLoad(api, r) {
		coroutineScope {
			val issue = async { api.get<Issue>(base) }
			val comments = async { api.get<List<Comment>>("$base/comments") }
			Thread(issue.await(), comments.await())
		}
	}
	Scaffold(topBar = { BackBar("#${r.number}", "${r.owner}/${r.repo}") }) { pad ->
		Loading(l, Modifier.padding(pad)) { t ->
			val i = t.issue
			LazyColumn {
				item {
					Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
						Text(i.title, style = MaterialTheme.typography.headlineSmall)
						Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
							StateChip(i.state, i.pullRequest != null, i.pullRequest?.merged == true, i.pullRequest?.draft == true)
							Text("${i.user.login} opened ${ago(i.createdAt)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
						}
						if (i.labels.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
							i.labels.forEach { LabelChip(it.name, it.color) }
						}
					}
				}
				item { Post(i.user.login, i.user.avatarUrl, i.createdAt, i.body.orEmpty().ifBlank { "_No description._" }) }
				items(t.comments, key = { it.id }) { c -> Post(c.user.login, c.user.avatarUrl, c.createdAt, c.body) }
			}
		}
	}
}

@Composable
private fun Post(login: String, avatar: String, at: String, body: String) {
	Column(Modifier.fillMaxWidth()) {
		HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
		Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
			Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
				Avatar(avatar, 24.dp)
				Text(login, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
				Text(ago(at), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
			}
			MarkdownText(body)
		}
	}
}
