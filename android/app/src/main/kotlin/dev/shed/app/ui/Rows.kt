package dev.shed.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
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

// Tile colours, as the web's pinned repos: picked to sit with the purple accent.
private val TILES = listOf(0xFF5B5BD6, 0xFF8B5CF6, 0xFF3E8FB0, 0xFFC2703A, 0xFF3F9A78, 0xFFB4559A).map { Color(it) }

// GitHub's language colours for the common ones, so the dot means the same as everywhere else.
private val LANGUAGE = mapOf(
	"TypeScript" to 0xFF3178C6, "JavaScript" to 0xFFF1E05A, "Svelte" to 0xFFFF3E00, "Vue" to 0xFF41B883, "Python" to 0xFF3572A5, "Go" to 0xFF00ADD8,
	"Rust" to 0xFFDEA584, "Kotlin" to 0xFFA97BFF, "Java" to 0xFFB07219, "Swift" to 0xFFF05138, "C" to 0xFF555555, "C++" to 0xFFF34B7D, "C#" to 0xFF178600,
	"Ruby" to 0xFF701516, "PHP" to 0xFF4F5D95, "Shell" to 0xFF89E051, "HTML" to 0xFFE34C26, "CSS" to 0xFF563D7C, "Lua" to 0xFF000080, "Nix" to 0xFF7E7EFF,
	"Dart" to 0xFF00B4AB, "Zig" to 0xFFEC915C, "Elixir" to 0xFF6E4A7E, "Haskell" to 0xFF5E5086
).mapValues { Color(it.value) }

@Composable
fun RepoTile(name: String, size: androidx.compose.ui.unit.Dp = 36.dp) {
	val color = TILES[(name.hashCode() and 0x7fffffff) % TILES.size]
	Box(Modifier.size(size).clip(RoundedCornerShape(10.dp)).background(color), Alignment.Center) {
		Text(name.take(1).uppercase(), color = Color.White, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
	}
}

@Composable
private fun Tag(text: String) = Text(
	text,
	Modifier.clip(RoundedCornerShape(50)).background(MaterialTheme.colorScheme.surfaceContainerHighest).padding(horizontal = 7.dp, vertical = 1.dp),
	style = MaterialTheme.typography.labelSmall,
	color = MaterialTheme.colorScheme.onSurfaceVariant
)

// A repo as a dense row (as the web's list): tile, name with its tags, the description, then language, stars, PRs, updated.
@Composable
fun RepoRow(r: RepoInfo, showOwner: Boolean = true, onClick: () -> Unit) {
	val c = MaterialTheme.colorScheme
	Row(Modifier.fillMaxWidth().clickableRow(onClick).padding(horizontal = 16.dp, vertical = 11.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
		RepoTile(r.name)
		Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
			Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
				Text(
					buildAnnotatedString {
						if (showOwner) withStyle(SpanStyle(color = c.onSurfaceVariant)) { append("${r.owner.login}/") }
						withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(r.name) }
					},
					style = MaterialTheme.typography.titleSmall,
					maxLines = 1,
					overflow = TextOverflow.Ellipsis,
					modifier = Modifier.weight(1f, fill = false)
				)
				if (r.private) Tag("private")
				if (r.fork) Tag("fork")
				if (r.mirror) Tag("mirror")
				if (r.archived) Tag("archived")
				if (r.empty) Tag("empty")
			}
			if (r.description.isNotBlank()) Text(r.description, style = MaterialTheme.typography.bodySmall, color = c.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
			Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
				r.language?.let { lang ->
					Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
						Box(Modifier.size(8.dp).clip(CircleShape).background(LANGUAGE[lang] ?: c.outline))
						Meta(lang)
					}
				}
				if (r.stars > 0) Meta("★ ${r.stars}")
				if (r.openPulls > 0) Meta("${r.openPulls} PR${if (r.openPulls == 1) "" else "s"}")
				if (r.updatedAt.isNotEmpty()) Meta(ago(r.updatedAt))
			}
		}
	}
}

@Composable
private fun Meta(text: String) = Text(text, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)

// Repos as one card with dividers, as the web's bordered list.
@Composable
fun RepoGroup(repos: List<RepoInfo>, showOwner: Boolean = true, onOpen: (RepoInfo) -> Unit) {
	if (repos.isEmpty()) return
	Surface(shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.surfaceContainerLow, modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp)) {
		Column {
			repos.forEachIndexed { i, r ->
				if (i > 0) HorizontalDivider(Modifier.padding(start = 64.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
				RepoRow(r, showOwner) { onOpen(r) }
			}
		}
	}
}
