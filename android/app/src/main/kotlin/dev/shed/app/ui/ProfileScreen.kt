package dev.shed.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import dev.shed.app.ApiError
import dev.shed.app.Profile
import dev.shed.app.RepoInfo

// A person or an organisation, and their repos.
@Composable
fun ProfileScreen(r: ProfileRoute) {
	val api = LocalApi.current
	val nav = LocalNav.current
	val l = rememberLoad(api, r) {
		try {
			api.get<Profile>("/users/${r.name}") to api.get<List<RepoInfo>>("/users/${r.name}/repos?limit=100")
		} catch (e: ApiError) {
			if (e.status != 404) throw e
			api.get<Profile>("/orgs/${r.name}") to api.get<List<RepoInfo>>("/orgs/${r.name}/repos?limit=100")
		}
	}
	BackPage(r.name) {
		Loading(l) { (p, repos) ->
			LazyColumn(contentPadding = PaddingValues(bottom = pageClearance())) {
				item {
					Row(Modifier.padding(horizontal = 20.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
						Avatar(p.avatarUrl, 72.dp)
						Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
							if (p.fullName.isNotBlank()) Text(p.fullName, style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold))
							Text(p.name, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
							listOf(p.location, p.website).filter { it.isNotBlank() }.takeIf { it.isNotEmpty() }?.let { Text(it.joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
						}
					}
					if (p.description.isNotBlank()) Text(p.description, Modifier.padding(horizontal = 20.dp, vertical = 4.dp), style = MaterialTheme.typography.bodyMedium)
					SectionLabel("Repos", Modifier.padding(start = 20.dp, top = 16.dp, bottom = 8.dp))
				}
				if (repos.isEmpty()) item { Text("No repos you can see.", Modifier.padding(20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
				items(repos.sortedByDescending { it.updatedAt }, key = { it.id }) { x -> RepoRow(x) { nav.navigate(RepoRoute(x.owner.login, x.name)) } }
			}
		}
	}
}
