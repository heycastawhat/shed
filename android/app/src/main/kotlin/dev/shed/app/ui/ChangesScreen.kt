package dev.shed.app.ui

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.shed.app.Issue

private val FILTERS = listOf("review_requested" to "Review requested", "created" to "Created", "mentioned" to "Mentioned", "assigned" to "Assigned")

// Open pull requests across every repo, as on the web's /changes.
@Composable
fun ChangesScreen() {
	val api = LocalApi.current
	val nav = LocalNav.current
	val haptics = rememberHaptics()
	var filter by rememberSaveable { mutableStateOf("review_requested") }
	val l = rememberLoad(api, filter) { api.get<List<Issue>>("/repos/issues/search?type=pulls&state=open&$filter=true&limit=50&sort=recentupdate") }
	TabPage("Changes") {
		Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
			FILTERS.forEach { (k, label) -> FilterChip(selected = filter == k, onClick = { if (filter != k) haptics.tick(); filter = k }, label = { Text(label) }) }
		}
		Loading(l) { list ->
			if (list.isEmpty()) EmptyState("No pull requests", "Nothing open here.", ShedIcons.changes)
			else LazyColumn(contentPadding = PaddingValues(top = 8.dp, bottom = toolbarClearance())) { items(list, key = { it.id }) { i -> IssueRow(i) { nav.navigate(threadOf(i)) } } }
		}
	}
}
