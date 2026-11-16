package dev.shed.app.ui

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.text.format.DateUtils
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.core.net.toUri
import dev.shed.app.Account
import dev.shed.app.Api
import dev.shed.app.ApiError
import dev.shed.app.NotificationThread
import dev.shed.app.Notifier
import dev.shed.app.session
import kotlinx.coroutines.launch
import java.time.Instant

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InboxScreen(account: Account) {
	val ctx = LocalContext.current
	val scope = rememberCoroutineScope()
	val api = remember(account) { Api(account) }
	var items by remember { mutableStateOf<List<NotificationThread>?>(null) }
	var error by remember { mutableStateOf<String?>(null) }
	var loading by remember { mutableStateOf(false) }
	var reload by remember { mutableIntStateOf(0) }
	var menu by remember { mutableStateOf(false) }

	val askNotifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
	LaunchedEffect(Unit) {
		if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
			askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
	}
	LaunchedEffect(Unit) { Notifier.changes.collect { reload++ } }
	val power = ctx.getSystemService(PowerManager::class.java)

	LaunchedEffect(reload) {
		loading = true
		try {
			items = api.get("/notifications?all=true&limit=50")
			error = null
		} catch (e: ApiError) {
			if (e.status == 401) ctx.session.signOut() else error = e.message
		} catch (e: Exception) {
			error = "Can't reach ${account.server}: ${e.message}"
		}
		loading = false
	}

	Scaffold(
		topBar = {
			TopAppBar(
				title = { Text("Inbox") },
				actions = {
					Box {
						TextButton(onClick = { menu = true }) { Text(account.login) }
						DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
							if (!power.isIgnoringBatteryOptimizations(ctx.packageName)) DropdownMenuItem(
								text = { Text("Keep notifications instant") },
								onClick = {
									menu = false
									// Exempting the app from battery optimisation lets Android keep the stream open and restart it from the background.
									@SuppressLint("BatteryLife")
									val i = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, "package:${ctx.packageName}".toUri())
									ctx.startActivity(i)
								}
							)
							DropdownMenuItem(text = { Text("Sign out") }, onClick = { menu = false; scope.launch { ctx.session.signOut() } })
						}
					}
				}
			)
		}
	) { pad ->
		PullToRefreshBox(isRefreshing = loading && items != null, onRefresh = { reload++ }, modifier = Modifier.padding(pad).fillMaxSize()) {
			val list = items
			when {
				error != null && list == null -> Text(error!!, Modifier.padding(24.dp), color = MaterialTheme.colorScheme.error)
				list == null -> Unit
				list.isEmpty() -> Text("Nothing here.", Modifier.padding(24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
				else -> LazyColumn(Modifier.fillMaxSize()) {
					items(list, key = { it.id }) { n ->
						ListItem(
							overlineContent = { Text(n.repository.fullName) },
							headlineContent = { Text(n.subject.title, fontWeight = if (n.unread) FontWeight.SemiBold else null) },
							supportingContent = { Text(listOfNotNull(kind(n.subject.type), n.subject.state, ago(n.updatedAt)).joinToString(" · ")) },
							leadingContent = {
								Box(Modifier.size(8.dp).background(if (n.unread) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface, CircleShape))
							},
							modifier = Modifier.clickable(enabled = n.subject.htmlUrl.isNotEmpty()) {
								CustomTabsIntent.Builder().build().launchUrl(ctx, n.subject.htmlUrl.toUri())
							}
						)
						HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
					}
				}
			}
		}
	}
}

private fun kind(type: String) = when (type) {
	"Pull" -> "Pull request"
	"Issue" -> "Issue"
	"Commit" -> "Commit"
	"Repository" -> "Repository"
	else -> type
}

private fun ago(iso: String): String? = runCatching {
	DateUtils.getRelativeTimeSpanString(Instant.parse(iso).toEpochMilli(), System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS).toString()
}.getOrNull()
