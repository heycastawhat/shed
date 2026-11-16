package dev.shed.app.ui

import android.content.Intent
import android.os.PowerManager
import android.provider.Settings
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import dev.shed.app.Account
import dev.shed.app.Api
import dev.shed.app.User
import dev.shed.app.session
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

// Routes. The five tabs match the web's phone tab bar.
@Serializable data object HomeRoute
@Serializable data object ChangesRoute
@Serializable data object ReposRoute
@Serializable data object AgentsRoute
@Serializable data object InboxRoute
@Serializable data class RepoRoute(val owner: String, val repo: String)
@Serializable data class ThreadRoute(val owner: String, val repo: String, val number: Long)

private data class Tab(val route: Any, val label: String, val icon: ImageVector)

private val TABS = listOf(
	Tab(HomeRoute, "Home", ShedIcons.home),
	Tab(ChangesRoute, "Changes", ShedIcons.changes),
	Tab(ReposRoute, "Repos", ShedIcons.repos),
	Tab(AgentsRoute, "Agents", ShedIcons.agents),
	Tab(InboxRoute, "Inbox", ShedIcons.bell)
)

val LocalNav = compositionLocalOf<NavHostController> { error("No nav") }
val LocalMe = compositionLocalOf<User?> { null }

// A Shed web URL as a native screen, when there is one: /owner/repo/(pulls|issues)/n and /owner/repo.
fun routeFor(server: String, url: String): Any? {
	if (!url.startsWith(server)) return null
	val parts = url.removePrefix(server).substringBefore('?').substringBefore('#').trim('/').split('/')
	return when {
		parts.size >= 4 && (parts[2] == "pulls" || parts[2] == "issues") -> parts[3].toLongOrNull()?.let { ThreadRoute(parts[0], parts[1], it) }
		parts.size == 2 -> RepoRoute(parts[0], parts[1])
		else -> null
	}
}

@Composable
fun Shell(account: Account, links: Flow<String>) {
	val nav = rememberNavController()
	val ctx = LocalContext.current
	val api = remember(account) { Api(account) }
	val entry by nav.currentBackStackEntryAsState()
	var me by remember(account) { mutableStateOf<User?>(null) }
	LaunchedEffect(api) { me = runCatching { api.get<User>("/user") }.getOrNull() }
	val onTab = TABS.any { t -> entry?.destination?.hasRoute(t.route::class) == true }

	LaunchedEffect(nav) {
		links.collect { url ->
			val route = routeFor(account.server, url)
			if (route != null) nav.navigate(route) else CustomTabsIntent.Builder().build().launchUrl(ctx, url.toUri())
		}
	}

	CompositionLocalProvider(LocalApi provides api, LocalNav provides nav, LocalMe provides me) {
		Scaffold(bottomBar = {
			if (onTab) NavigationBar {
				TABS.forEach { t ->
					NavigationBarItem(
						selected = entry?.destination?.hasRoute(t.route::class) == true,
						onClick = {
							nav.navigate(t.route) {
								popUpTo(nav.graph.findStartDestination().id) { saveState = true }
								launchSingleTop = true
								restoreState = true
							}
						},
						icon = { ShedIcon(t.icon, 22.dp, LocalContentColor.current) },
						label = { Text(t.label) }
					)
				}
			}
		}) { pad ->
			NavHost(nav, startDestination = HomeRoute, modifier = Modifier.padding(pad).consumeWindowInsets(pad)) {
				composable<HomeRoute> { HomeScreen() }
				composable<ChangesRoute> { ChangesScreen() }
				composable<ReposRoute> { ReposScreen() }
				composable<AgentsRoute> { AgentsScreen() }
				composable<InboxRoute> { InboxScreen() }
				composable<RepoRoute> { RepoScreen(it.toRoute()) }
				composable<ThreadRoute> { ThreadScreen(it.toRoute()) }
			}
		}
	}
}

// The top bar for the tab screens: a title, search (coming), and the account menu.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TabBar(title: String) {
	val ctx = LocalContext.current
	val account = LocalApi.current.account
	val scope = rememberCoroutineScope()
	var menu by remember { mutableStateOf(false) }
	val power = ctx.getSystemService(PowerManager::class.java)
	TopAppBar(
		title = { Text(title) },
		actions = {
			Box {
				IconButton(onClick = { menu = true }) { Avatar(LocalMe.current?.avatarUrl ?: "/avatars/${account.login}.svg", 30.dp) }
				DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
					DropdownMenuItem(text = { Text("Signed in as ${account.login}") }, onClick = {}, enabled = false)
					if (!power.isIgnoringBatteryOptimizations(ctx.packageName)) DropdownMenuItem(
						text = { Text("Keep notifications instant") },
						onClick = {
							menu = false
							// Exempting the app from battery optimisation lets Android keep the stream open and restart it from the background.
							@Suppress("BatteryLife")
							ctx.startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, "package:${ctx.packageName}".toUri()))
						}
					)
					DropdownMenuItem(text = { Text("Sign out") }, onClick = { menu = false; scope.launch { ctx.session.signOut() } })
				}
			}
		}
	)
}

// For screens below the tabs: a title and a back arrow.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BackBar(title: String, subtitle: String? = null, actions: @Composable () -> Unit = {}) {
	val nav = LocalNav.current
	TopAppBar(
		title = {
			Column {
				Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis)
				subtitle?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
			}
		},
		navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { ShedIcon(ShedIcons.left, 24.dp, LocalContentColor.current) } },
		actions = { actions() }
	)
}
