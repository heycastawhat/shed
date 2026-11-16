package dev.shed.app.ui

import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import dev.shed.app.NotificationThread
import dev.shed.app.Notifier
import kotlinx.coroutines.launch

@Composable
fun InboxScreen() {
	val api = LocalApi.current
	val l = rememberLoad(api) { api.get<List<NotificationThread>>("/notifications?all=true&limit=50") }
	LaunchedEffect(Unit) { Notifier.changes.collect { l.reload() } }
	val send = rememberSend()
	TabPage("Inbox", actions = {
		androidx.compose.material3.IconButton(onClick = { send { api.send("PUT", "/notifications"); l.reload() } }) { androidx.compose.material3.Icon(ShedIcons.read, "Mark all read") }
	}) {
		Loading(l) { list ->
			if (list.isEmpty()) EmptyState("Inbox zero", "Comments, reviews and mentions show up here.", ShedIcons.inbox)
			else LazyColumn(contentPadding = PaddingValues(bottom = toolbarClearance())) { items(list, key = { it.id }) { n -> NotificationRow(n, onRead = l.reload) } }
		}
	}
}

// Opens the native screen for the thread and marks it read.
@Composable
fun NotificationRow(n: NotificationThread, onRead: () -> Unit = {}) {
	val api = LocalApi.current
	val nav = LocalNav.current
	val ctx = LocalContext.current
	val scope = rememberCoroutineScope()
	val c = MaterialTheme.colorScheme
	val (icon, tint) = issueLook(n.subject.type == "Pull", n.subject.state, n.subject.state == "merged", false)
	CardRow({
		if (n.unread) scope.launch { runCatching { api.send("PATCH", "/notifications/threads/${n.id}?to-status=read") }; onRead() }
		val route = routeFor(api.account.server, n.subject.htmlUrl)
		if (route != null) nav.navigate(route) else if (n.subject.htmlUrl.isNotEmpty()) CustomTabsIntent.Builder().build().launchUrl(ctx, n.subject.htmlUrl.toUri())
	}) {
		Row(Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
			StateBadge(icon, tint)
			Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
				Text(n.repository.fullName, style = MaterialTheme.typography.labelMedium, color = c.onSurfaceVariant)
				Text(n.subject.title, style = MaterialTheme.typography.titleMedium, fontWeight = if (n.unread) FontWeight.Bold else FontWeight.Normal, maxLines = 2, overflow = TextOverflow.Ellipsis)
				Text(ago(n.updatedAt), style = MaterialTheme.typography.bodySmall, color = c.onSurfaceVariant)
			}
			if (n.unread) Box(Modifier.size(10.dp).background(c.primary, CircleShape))
		}
	}
}
