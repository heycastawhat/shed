package dev.shed.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.shed.app.RepoInfo
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

// Your repos, newest activity first, with Explore (every repo you can see) and New.
@Composable
fun ReposScreen() {
	val api = LocalApi.current
	val nav = LocalNav.current
	var creating by remember { mutableStateOf(false) }
	val l = rememberLoad(api) { api.get<List<RepoInfo>>("/user/repos?limit=100").sortedByDescending { it.updatedAt } }
	TabPage("Repos") {
		Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
			FilterChip(selected = false, onClick = { creating = true }, label = { Text("New repo") }, leadingIcon = { Icon(ShedIcons.plus, null) })
			FilterChip(selected = false, onClick = { nav.navigate(SearchRoute) }, label = { Text("Explore") }, leadingIcon = { Icon(ShedIcons.explore, null) })
		}
		Loading(l) { list ->
			if (list.isEmpty()) EmptyState("No repos yet", "Make one with New repo, or push to a new one.", ShedIcons.repos)
			else LazyColumn(contentPadding = PaddingValues(top = 8.dp, bottom = toolbarClearance())) { items(list, key = { it.id }) { r -> RepoRow(r) { nav.navigate(RepoRoute(r.owner.login, r.name)) } } }
		}
	}
	if (creating) {
		var name by remember { mutableStateOf("") }
		var private by remember { mutableStateOf(true) }
		ComposeSheet("New repo", action = "Create", allowEmpty = true, extra = {
			OutlinedTextField(name, { name = it.trim() }, label = { Text("Name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
			Row(verticalAlignment = Alignment.CenterVertically) {
				Checkbox(checked = private, onCheckedChange = { private = it })
				Text("Private")
			}
			Text("Description below (optional).")
		}, onDismiss = { creating = false }) { description ->
			val made = api.post<RepoInfo>("/user/repos", buildJsonObject { put("name", name); put("description", description); put("private", private); put("auto_init", true) }.toString())
			nav.navigate(RepoRoute(made.owner.login, made.name))
		}
	}
}
