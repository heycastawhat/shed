package dev.shed.app.ui

import androidx.compose.runtime.Composable

// Agents (approvals, T3 tasks) need new API endpoints; they come in a later step.
@Composable
fun AgentsScreen() = TabPage("Agents") { EmptyState("Agents are coming", "Approvals and tasks arrive in a later version. Use the web for now.", ShedIcons.agents) }
