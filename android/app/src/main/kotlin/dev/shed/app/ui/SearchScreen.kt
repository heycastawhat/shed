package dev.shed.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PrimaryScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import dev.shed.app.CodeHit
import dev.shed.app.Issue
import dev.shed.app.Profile
import dev.shed.app.RepoInfo
import dev.shed.app.Wrapped
import java.net.URLEncoder

private val KINDS = listOf("Repos", "Issues", "Pull requests", "Code", "People")

// Search across Shed, as the web's /search; with nothing typed, Repos lists every repo you can see (Explore).
@Composable
fun SearchScreen() {
	val api = LocalApi.current
	val nav = LocalNav.current
	var text by rememberSaveable { mutableStateOf("") }
	var query by rememberSaveable { mutableStateOf("") }
	var tab by rememberSaveable { mutableIntStateOf(0) }
	val focus = remember { FocusRequester() }
	LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
	val q = URLEncoder.encode(query, "UTF-8")
	val l = rememberLoad(api, query, tab) {
		when (tab) {
			0 -> api.get<Wrapped<RepoInfo>>("/repos/search?q=$q&limit=50").data
			1 -> if (query.isBlank()) emptyList() else api.get<List<Issue>>("/repos/issues/search?q=$q&type=issues&state=all&limit=50")
			2 -> if (query.isBlank()) emptyList() else api.get<List<Issue>>("/repos/issues/search?q=$q&type=pulls&state=all&limit=50")
			3 -> if (query.length < 2) emptyList() else api.get<Wrapped<CodeHit>>("/repos/code/search?q=$q&limit=100").data
			else -> api.get<Wrapped<Profile>>("/users/search?q=$q&limit=50").data
		}
	}
	BackPage("Search") {
		OutlinedTextField(
			text, { text = it },
			placeholder = { Text("Search Shed") },
			singleLine = true,
			leadingIcon = { Icon(ShedIcons.search, null) },
			keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
			keyboardActions = KeyboardActions(onSearch = { query = text.trim() }),
			modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).focusRequester(focus)
		)
		PrimaryScrollableTabRow(selectedTabIndex = tab, edgePadding = 12.dp, containerColor = MaterialTheme.colorScheme.surfaceContainerLowest) {
			KINDS.forEachIndexed { i, k -> Tab(selected = tab == i, onClick = { tab = i }, text = { Text(k) }) }
		}
		Loading(l) { results ->
			if (results.isEmpty()) EmptyState(if (query.isBlank() && tab != 0) "Type to search" else "No results", if (tab == 3) "Code search looks through every repo's default branch." else "", ShedIcons.search)
			else LazyColumn(contentPadding = PaddingValues(top = 8.dp, bottom = pageClearance())) {
				items(results) { x ->
					when (x) {
						is RepoInfo -> RepoRow(x) { nav.navigate(RepoRoute(x.owner.login, x.name)) }
						is Issue -> IssueRow(x) { nav.navigate(threadOf(x)) }
						is CodeHit -> CardRow({
							val (o, rp) = x.repo.split('/', limit = 2)
							nav.navigate(FileRoute(o, rp, x.ref, x.path))
						}) {
							Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
								Text("${x.repo} · ${x.path}:${x.line}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
								Text(x.text.trim(), style = CodeStyle, maxLines = 3, overflow = TextOverflow.Ellipsis)
							}
						}
						is Profile -> CardRow({ nav.navigate(ProfileRoute(x.name)) }) {
							Row(Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
								Avatar(x.avatarUrl, 36.dp)
								Column {
									Text(x.name, style = MaterialTheme.typography.titleSmall)
									if (x.fullName.isNotBlank()) Text(x.fullName, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
								}
							}
						}
					}
				}
			}
		}
	}
}
