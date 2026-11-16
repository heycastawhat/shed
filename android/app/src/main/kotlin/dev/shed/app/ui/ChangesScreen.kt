package dev.shed.app.ui

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.shed.app.Issue

private val FILTERS = listOf("review_requested" to "To review", "created" to "Mine", "mentioned" to "Mentioned", "assigned" to "Assigned")

// Open pull requests across every repo, as on the web's /changes.
@Composable
fun ChangesScreen() {
	val api = LocalApi.current
	val nav = LocalNav.current
	val haptics = rememberHaptics()
	var filter by rememberSaveable { mutableStateOf("review_requested") }
	val l = rememberLoad(api, filter) { api.get<List<Issue>>("/repos/issues/search?type=pulls&state=open&$filter=true&limit=50&sort=recentupdate") }
	TabPage("Changes") {
		// Four short choices that always fit the screen, as one segmented row.
		SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
			FILTERS.forEachIndexed { i, (k, label) ->
				SegmentedButton(
					selected = filter == k,
					onClick = { if (filter != k) haptics.tick(); filter = k },
					shape = SegmentedButtonDefaults.itemShape(i, FILTERS.size),
					icon = {},
					label = { Text(label, maxLines = 1, style = MaterialTheme.typography.labelMedium) }
				)
			}
		}
		Loading(l) { list ->
			if (list.isEmpty()) EmptyState("Nothing here", when (filter) {
				"review_requested" -> "No open pull requests are waiting for your review."
				"created" -> "You have no open pull requests."
				"mentioned" -> "No open pull requests mention you."
				else -> "No open pull requests are assigned to you."
			}, ShedIcons.changes, Modifier.padding(top = 8.dp))
			else LazyColumn(contentPadding = PaddingValues(top = 8.dp, bottom = toolbarClearance())) { items(list, key = { it.id }) { i -> IssueRow(i) { nav.navigate(threadOf(i)) } } }
		}
	}
}
