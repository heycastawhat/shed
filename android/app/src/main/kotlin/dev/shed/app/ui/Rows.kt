package dev.shed.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.shed.app.Issue

// A pull request or issue in a list: state icon, repo and number, title, author, age, labels.
@Composable
fun IssueRow(i: Issue, repo: String? = i.repository?.fullName, onClick: () -> Unit) {
	val pull = i.pullRequest != null
	val merged = i.pullRequest?.merged == true
	val c = MaterialTheme.colorScheme
	val tint = when {
		merged -> c.tertiary
		i.state == "closed" -> c.error
		i.pullRequest?.draft == true -> c.onSurfaceVariant
		else -> c.primary
	}
	Row(
		Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 12.dp),
		horizontalArrangement = Arrangement.spacedBy(12.dp)
	) {
		ShedIcon(if (pull) (if (merged) ShedIcons.merge else ShedIcons.changes) else ShedIcons.issue, 20.dp, tint)
		Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
			Text(listOfNotNull(repo, "#${i.number}").joinToString(" "), style = MaterialTheme.typography.labelMedium, color = c.onSurfaceVariant)
			Text(i.title, style = MaterialTheme.typography.bodyLarge, maxLines = 2, overflow = TextOverflow.Ellipsis)
			Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
				Avatar(i.user.avatarUrl, 16.dp)
				Text(
					listOfNotNull(i.user.login, ago(i.updatedAt), i.comments.takeIf { it > 0 }?.let { "$it comments" }).joinToString(" · "),
					style = MaterialTheme.typography.bodySmall,
					color = c.onSurfaceVariant
				)
			}
			if (i.labels.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.padding(top = 4.dp)) {
				i.labels.forEach { LabelChip(it.name, it.color) }
			}
		}
	}
	HorizontalDivider(color = c.outlineVariant)
}
