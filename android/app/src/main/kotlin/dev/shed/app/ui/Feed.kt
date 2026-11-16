package dev.shed.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import dev.shed.app.Api
import dev.shed.app.FeedItem
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

// What a feed entry says happened, and where tapping it goes (as the web's activity feed).
data class Said(val verb: String, val what: String, val route: Any?)

fun describe(f: FeedItem): Said {
	val (owner, repo) = f.repo.fullName.split('/', limit = 2).let { it[0] to it.getOrElse(1) { "" } }
	val branch = f.ref.removePrefix("refs/heads/").removePrefix("refs/tags/")
	val pair = runCatching { Api.json.parseToJsonElement(f.content) as JsonArray }.getOrNull()
	val number = pair?.getOrNull(0)?.jsonPrimitive?.content?.toLongOrNull()
	val text = pair?.getOrNull(1)?.jsonPrimitive?.content.orEmpty()
	val thread = number?.let { ThreadRoute(owner, repo, it) }
	return when (f.op) {
		"commit_repo", "push" -> {
			val n = runCatching { Api.json.parseToJsonElement(f.content).jsonObject["Commits"]!!.jsonArray.size }.getOrDefault(0)
			Said("pushed ${if (n == 1) "a commit" else "$n commits"} to", branch, CommitsRoute(owner, repo, branch, ""))
		}
		"push_tag" -> Said("tagged", branch, TreeRoute(owner, repo, branch, ""))
		"delete_branch" -> Said("deleted branch", branch, RepoRoute(owner, repo))
		"delete_tag" -> Said("deleted tag", branch, RepoRoute(owner, repo))
		"create_repo" -> Said("created", f.repo.fullName, RepoRoute(owner, repo))
		"create_issue" -> Said("opened issue", "#$number $text", thread)
		"create_pull_request" -> Said("opened pull request", "#$number $text", thread)
		"close_issue", "close_pull_request" -> Said("closed", "#$number $text", thread)
		"reopen_issue", "reopen_pull_request" -> Said("reopened", "#$number $text", thread)
		"merge_pull_request" -> Said("merged", "#$number $text", thread)
		"comment_issue", "comment_pull" -> Said("commented on", "#$number", thread)
		"approve_pull_request" -> Said("approved", "#$number", thread)
		"reject_pull_request" -> Said("requested changes on", "#$number", thread)
		"publish_release" -> Said("published a release in", f.repo.fullName, ReleasesRoute(owner, repo))
		else -> Said(f.op.replace('_', ' '), "", RepoRoute(owner, repo))
	}
}

// One line of activity: avatar, who did what where, and when.
@Composable
fun FeedRow(f: FeedItem, showRepo: Boolean = true) {
	val nav = LocalNav.current
	val said = describe(f)
	val c = MaterialTheme.colorScheme
	Row(
		Modifier.fillMaxWidth().clickableRow { said.route?.let { nav.navigate(it) } }.padding(horizontal = 20.dp, vertical = 10.dp),
		horizontalArrangement = Arrangement.spacedBy(12.dp),
		verticalAlignment = Alignment.Top
	) {
		Avatar(f.user?.avatarUrl ?: "", 28.dp)
		Column(Modifier.weight(1f)) {
			Text(
				buildAnnotatedString {
					withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(f.user?.login ?: "Someone") }
					append(" ${said.verb} ")
					withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(said.what) }
				},
				style = MaterialTheme.typography.bodyMedium,
				maxLines = 2,
				overflow = TextOverflow.Ellipsis
			)
			Text(listOfNotNull(f.repo.fullName.takeIf { showRepo }, ago(f.created)).joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = c.onSurfaceVariant)
		}
	}
}
