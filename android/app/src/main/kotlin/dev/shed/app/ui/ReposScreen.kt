package dev.shed.app.ui

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import dev.shed.app.RepoInfo

@Composable
fun ReposScreen() {
	val api = LocalApi.current
	val nav = LocalNav.current
	val l = rememberLoad(api) { api.get<List<RepoInfo>>("/user/repos?limit=100").sortedByDescending { it.updatedAt } }
	TabPage("Repos") {
		Loading(l) { list ->
			if (list.isEmpty()) EmptyState("No repos yet", "Create one on the web, or push to a new one.", ShedIcons.repos)
			else LazyColumn(contentPadding = PaddingValues(bottom = toolbarClearance())) { items(list, key = { it.id }) { r -> RepoRow(r) { nav.navigate(RepoRoute(r.owner.login, r.name)) } } }
		}
	}
}
