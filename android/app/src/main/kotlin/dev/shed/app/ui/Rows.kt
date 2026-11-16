package dev.shed.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.shed.app.Issue
import dev.shed.app.RepoInfo

// The state icon in a tinted circle, as the leading part of a card.
@Composable
fun StateBadge(icon: ImageVector, tint: Color) {
	Box(Modifier.size(36.dp).clip(CircleShape).background(tint.copy(alpha = 0.14f)), Alignment.Center) { ShedIcon(icon, 20.dp, tint) }
}

@Composable
fun issueLook(pull: Boolean, state: String?, merged: Boolean, draft: Boolean): Pair<ImageVector, Color> {
	val c = MaterialTheme.colorScheme
	val icon = if (pull) (if (merged) ShedIcons.merge else ShedIcons.changes) else ShedIcons.issue
	val tint = when {
		merged -> c.tertiary
		state == "closed" -> c.error
		draft -> c.onSurfaceVariant
		else -> c.primary
	}
	return icon to tint
}

// A pull request or issue as a card: state, repo and number, title, author and age, labels.
@Composable
fun IssueRow(i: Issue, repo: String? = i.repository?.fullName, onClick: () -> Unit) {
	val c = MaterialTheme.colorScheme
	val (icon, tint) = issueLook(i.pullRequest != null, i.state, i.pullRequest?.merged == true, i.pullRequest?.draft == true)
	CardRow(onClick) {
		Row(Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
			StateBadge(icon, tint)
			Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
				Text(listOfNotNull(repo, "#${i.number}").joinToString(" "), style = MaterialTheme.typography.labelMedium, color = c.onSurfaceVariant)
				Text(i.title, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
				Row(Modifier.padding(top = 2.dp), verticalAlignment = Alignment.CenterVertically) {
					Avatar(i.user.avatarUrl, 18.dp)
					Spacer(Modifier.width(6.dp))
					Text(
						listOfNotNull(i.user.login, ago(i.updatedAt), i.comments.takeIf { it > 0 }?.let { "$it comments" }).joinToString(" · "),
						style = MaterialTheme.typography.bodySmall,
						color = c.onSurfaceVariant
					)
				}
				if (i.labels.isNotEmpty()) FlowRow(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
					i.labels.forEach { LabelChip(it.name, it.color) }
				}
			}
		}
	}
}

@Composable
fun RepoRow(r: RepoInfo, onClick: () -> Unit) {
	val c = MaterialTheme.colorScheme
	CardRow(onClick) {
		Row(Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
			Box(Modifier.size(36.dp).clip(RoundedCornerShape(12.dp)).background(c.secondaryContainer), Alignment.Center) {
				ShedIcon(ShedIcons.repos, 20.dp, c.onSecondaryContainer)
			}
			Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
				Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
					Text(
						buildString { append(r.owner.login); append(" / ") },
						style = MaterialTheme.typography.titleMedium,
						color = c.onSurfaceVariant,
						maxLines = 1
					)
					Text(r.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
					if (r.private) ShedIcon(ShedIcons.lock, 14.dp)
					if (r.fork) ShedIcon(ShedIcons.fork, 14.dp)
					if (r.archived) ShedIcon(ShedIcons.archive, 14.dp)
				}
				if (r.description.isNotBlank()) Text(r.description, style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
				Text(
					listOfNotNull(ago(r.updatedAt).takeIf { it.isNotEmpty() }?.let { "Updated $it" }, r.stars.takeIf { it > 0 }?.let { "★ $it" }).joinToString(" · "),
					style = MaterialTheme.typography.bodySmall,
					color = c.onSurfaceVariant
				)
			}
		}
	}
}
