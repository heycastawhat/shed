package dev.shed.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.shed.app.RepoInfo

@Composable
fun ReposScreen() {
	val api = LocalApi.current
	val nav = LocalNav.current
	val l = rememberLoad(api) { api.get<List<RepoInfo>>("/user/repos?limit=100").sortedByDescending { it.updatedAt } }
	Scaffold(topBar = { TabBar("Repos") }) { pad ->
		Loading(l, Modifier.padding(pad)) { list ->
			if (list.isEmpty()) Column { Empty("No repos yet.") }
			else LazyColumn { items(list, key = { it.id }) { r -> RepoRow(r) { nav.navigate(RepoRoute(r.owner.login, r.name)) } } }
		}
	}
}

@Composable
fun RepoRow(r: RepoInfo, onClick: () -> Unit) {
	val c = MaterialTheme.colorScheme
	Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
		Avatar(r.owner.avatarUrl, 32.dp)
		Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
			Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
				Text(r.fullName, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
				if (r.private) ShedIcon(ShedIcons.lock, 14.dp)
				if (r.fork) ShedIcon(ShedIcons.fork, 14.dp)
				if (r.archived) ShedIcon(ShedIcons.archive, 14.dp)
			}
			if (r.description.isNotBlank()) Text(r.description, style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
			Text(listOfNotNull(ago(r.updatedAt).takeIf { it.isNotEmpty() }?.let { "Updated $it" }, r.stars.takeIf { it > 0 }?.let { "★ $it" }).joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = c.onSurfaceVariant)
		}
	}
	HorizontalDivider(color = c.outlineVariant)
}
