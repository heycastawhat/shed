package dev.shed.app.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

// Agents (approvals, T3 tasks) need new API endpoints; they come in a later step.
@Composable
fun AgentsScreen() {
	Scaffold(topBar = { TabBar("Agents") }) { pad ->
		Column(Modifier.padding(pad)) { Empty("Agents are coming to the app soon. Use the web for now.") }
	}
}
