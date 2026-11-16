package dev.shed.app.ui

import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
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
	Scaffold(topBar = { TabBar("Inbox") }) { pad ->
		Loading(l, Modifier.padding(pad)) { list ->
			if (list.isEmpty()) Column { Empty("Nothing here.") }
			else LazyColumn { items(list, key = { it.id }) { n -> NotificationRow(n, onRead = l.reload) } }
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
	val pull = n.subject.type == "Pull"
	Row(
		Modifier.fillMaxWidth().clickable {
			if (n.unread) scope.launch { runCatching { api.send("PATCH", "/notifications/threads/${n.id}?to-status=read") }; onRead() }
			val route = routeFor(api.account.server, n.subject.htmlUrl)
			if (route != null) nav.navigate(route) else if (n.subject.htmlUrl.isNotEmpty()) CustomTabsIntent.Builder().build().launchUrl(ctx, n.subject.htmlUrl.toUri())
		}.padding(horizontal = 16.dp, vertical = 12.dp),
		horizontalArrangement = Arrangement.spacedBy(12.dp)
	) {
		Box(Modifier.padding(top = 2.dp)) {
			ShedIcon(
				if (pull) (if (n.subject.state == "merged") ShedIcons.merge else ShedIcons.changes) else ShedIcons.issue,
				20.dp,
				when (n.subject.state) { "merged" -> c.tertiary; "closed" -> c.error; else -> c.primary }
			)
		}
		Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
			Text(n.repository.fullName, style = MaterialTheme.typography.labelMedium, color = c.onSurfaceVariant)
			Text(n.subject.title, style = MaterialTheme.typography.bodyLarge, fontWeight = if (n.unread) FontWeight.SemiBold else null, maxLines = 2, overflow = TextOverflow.Ellipsis)
			Text(ago(n.updatedAt), style = MaterialTheme.typography.bodySmall, color = c.onSurfaceVariant)
		}
		if (n.unread) Box(Modifier.align(Alignment.CenterVertically).size(8.dp).background(c.primary, CircleShape))
	}
	HorizontalDivider(color = c.outlineVariant)
}
