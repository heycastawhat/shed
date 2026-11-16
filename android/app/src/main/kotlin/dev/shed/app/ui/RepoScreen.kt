package dev.shed.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import dev.shed.app.ApiError
import dev.shed.app.RepoInfo

private class RepoHome(val repo: RepoInfo, val readme: String?)

// Repo home: description, counts and the README. Code browsing, PR and issue lists come in later steps.
@Composable
fun RepoScreen(r: RepoRoute) {
	val api = LocalApi.current
	val base = "/repos/${r.owner}/${r.repo}"
	val l = rememberLoad(api, r) {
		val info = api.get<RepoInfo>(base)
		val readme = listOf("README.md", "readme.md", "README").firstNotNullOfOrNull { name ->
			try {
				api.text("$base/raw/$name?ref=${info.defaultBranch}")
			} catch (e: ApiError) {
				null
			}
		}
		RepoHome(info, readme)
	}
	BackPage(r.repo, r.owner) {
		Loading(l) { h ->
			Column(Modifier.verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, bottom = pageClearance()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
				if (h.repo.description.isNotBlank()) Text(h.repo.description, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
				Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
					Stat(ShedIcons.branch, h.repo.defaultBranch)
					Stat(ShedIcons.changes, "${h.repo.openPulls}")
					Stat(ShedIcons.issue, "${h.repo.openIssues}")
					Stat(ShedIcons.star, "${h.repo.stars}")
				}
				Surface(shape = RoundedCornerShape(24.dp), color = MaterialTheme.colorScheme.surfaceContainerLow, modifier = Modifier.fillMaxWidth()) {
					Column(Modifier.padding(20.dp)) {
						SectionLabel("Readme", Modifier.padding(bottom = 8.dp))
						if (h.readme != null) MarkdownText(h.readme) else Text("No README.", color = MaterialTheme.colorScheme.onSurfaceVariant)
					}
				}
			}
		}
	}
}

@Composable
private fun Stat(icon: ImageVector, text: String) =
	Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
		ShedIcon(icon, 16.dp)
		Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
	}
