package dev.shed.app.ui

import android.content.Intent
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import androidx.navigation.NavDestination
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
import dev.shed.app.BuildConfig
import dev.shed.app.Notifier
import dev.shed.app.Update
import dev.shed.app.Updates
import dev.shed.app.User
import dev.shed.app.settings
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

// Routes. The five tabs match the web's phone tab bar.
@Serializable data object HomeRoute
@Serializable data object ChangesRoute
@Serializable data object ReposRoute
@Serializable data object AgentsRoute
@Serializable data object InboxRoute
@Serializable data object SettingsRoute
@Serializable data class RepoRoute(val owner: String, val repo: String)
@Serializable data class ThreadRoute(val owner: String, val repo: String, val number: Long)

private val TABS = listOf(
	NavPlace(HomeRoute, "Home", ShedIcons.home, ShedIcons.homeFilled),
	NavPlace(ChangesRoute, "Changes", ShedIcons.changes, ShedIcons.changesFilled),
	NavPlace(ReposRoute, "Repos", ShedIcons.repos, ShedIcons.reposFilled),
	NavPlace(AgentsRoute, "Agents", ShedIcons.agents, ShedIcons.agentsFilled),
	NavPlace(InboxRoute, "Inbox", ShedIcons.bell, ShedIcons.bellFilled)
)

private fun NavDestination?.tab() = TABS.firstOrNull { t -> this?.hasRoute(t.route::class) == true }?.route

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

// As Sink's shell: screens draw to the bottom edge and the tabs float over them as a pill; pages below the tabs rise
// over the screen they came from, with the theme's expressive motion, and the pill slides away under them.
@Composable
fun Shell(account: Account, links: Flow<String>) {
	val nav = rememberNavController()
	val ctx = LocalContext.current
	val api = remember(account) { Api(account) }
	val entry by nav.currentBackStackEntryAsState()
	val tab = entry?.destination.tab()
	val haptics = rememberHaptics()
	val motion = MaterialTheme.motionScheme

	var me by remember(account) { mutableStateOf<User?>(null) }
	LaunchedEffect(api) { me = runCatching { api.get<User>("/user") }.getOrNull() }

	// Unread count for the Inbox tab, kept fresh by the notification stream.
	var unread by remember { mutableIntStateOf(0) }
	LaunchedEffect(api) {
		suspend fun count() = runCatching { unread = api.get<NewCount>("/notifications/new").new }
		count()
		Notifier.changes.collect { count() }
	}

	LaunchedEffect(nav) {
		links.collect { url ->
			val route = routeFor(account.server, url)
			if (route != null) nav.navigate(route) else CustomTabsIntent.Builder().build().launchUrl(ctx, url.toUri())
		}
	}

	// A newer APK on GitHub: asked about once a day, or from Settings (as Sink's app does).
	val settings = ctx.settings
	var update by remember { mutableStateOf<Update?>(null) }
	LaunchedEffect(Unit) {
		if (BuildConfig.DEBUG || System.currentTimeMillis() - settings.updateCheckedAt() < Updates.DAY_MS) return@LaunchedEffect
		val found = runCatching { Updates.check(BuildConfig.VERSION_NAME) }.getOrElse { return@LaunchedEffect }
		settings.setUpdateCheckedAt(System.currentTimeMillis())
		if (found != null && found.version != settings.skippedVersion()) update = found
	}
	val checkForUpdates: suspend () -> String? = {
		runCatching { Updates.check(BuildConfig.VERSION_NAME) }.fold(
			onSuccess = { found ->
				settings.setUpdateCheckedAt(System.currentTimeMillis())
				update = found
				if (found == null) "You have the latest version" else null
			},
			onFailure = { "Couldn't check: ${it.message}" }
		)
	}
	val scope = rememberCoroutineScope()
	update?.let { u ->
		UpdateDialog(
			u,
			onDownload = { update = null; ctx.startActivity(Intent(Intent.ACTION_VIEW, u.apkUrl.toUri())) },
			onSkip = { update = null; scope.launch { settings.skipVersion(u.version) } },
			onLater = { update = null }
		)
	}

	CompositionLocalProvider(LocalApi provides api, LocalNav provides nav, LocalMe provides me) {
		Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceContainerLowest)) {
			val isTab = { d: NavDestination -> d.tab() != null }
			NavHost(
				nav,
				startDestination = HomeRoute,
				modifier = Modifier.fillMaxSize(),
				// A page rises over the screen it came from, which settles back a little; tabs fade through.
				enterTransition = {
					if (!isTab(targetState.destination)) slideInVertically(motion.defaultSpatialSpec()) { it / 12 } + fadeIn(motion.defaultEffectsSpec())
					else fadeIn(motion.defaultEffectsSpec()) + scaleIn(motion.defaultSpatialSpec(), initialScale = 0.96f)
				},
				exitTransition = {
					if (!isTab(targetState.destination)) fadeOut(motion.fastEffectsSpec()) + scaleOut(motion.defaultSpatialSpec(), targetScale = 0.96f)
					else fadeOut(motion.fastEffectsSpec())
				},
				popEnterTransition = { fadeIn(motion.defaultEffectsSpec()) + scaleIn(motion.defaultSpatialSpec(), initialScale = 0.96f) },
				popExitTransition = {
					if (!isTab(initialState.destination)) slideOutVertically(motion.defaultSpatialSpec()) { it / 10 } + fadeOut(motion.fastEffectsSpec())
					else fadeOut(motion.fastEffectsSpec())
				}
			) {
				composable<HomeRoute> { HomeScreen() }
				composable<ChangesRoute> { ChangesScreen() }
				composable<ReposRoute> { ReposScreen() }
				composable<AgentsRoute> { AgentsScreen() }
				composable<InboxRoute> { InboxScreen() }
				composable<SettingsRoute> { SettingsScreen(onBack = { nav.popBackStack() }, onCheckForUpdates = checkForUpdates) }
				composable<RepoRoute> { RepoScreen(it.toRoute()) }
				composable<ThreadRoute> { ThreadScreen(it.toRoute()) }
			}
			AnimatedVisibility(
				visible = tab != null,
				enter = slideInVertically(motion.defaultSpatialSpec()) { it } + fadeIn(motion.defaultEffectsSpec()),
				exit = slideOutVertically(motion.fastSpatialSpec()) { it } + fadeOut(motion.fastEffectsSpec()),
				modifier = Modifier.align(Alignment.BottomStart)
			) {
				FloatingNavBar(
					TABS,
					tab,
					mapOf(InboxRoute to unread),
					onSelect = { t ->
						if (tab != t.route) haptics.tick()
						nav.navigate(t.route) {
							// Tabs keep one copy each and remember where you were in them.
							popUpTo(nav.graph.findStartDestination().id) { saveState = true }
							launchSingleTop = true
							restoreState = true
						}
					},
					modifier = Modifier.navigationBarsPadding().padding(start = 16.dp, bottom = TOOLBAR_BOTTOM)
				)
			}
		}
	}
}

@Serializable private data class NewCount(val new: Int = 0)

// A tab's screen: Sink's big title with the account avatar (Settings) on the right, content clearing the floating bar.
@Composable
fun TabPage(title: String, content: @Composable ColumnScope.() -> Unit) {
	val nav = LocalNav.current
	val account = LocalApi.current.account
	val me = LocalMe.current
	Page(title, trailing = {
		IconButton(onClick = { nav.navigate(SettingsRoute) }, modifier = Modifier.semantics { contentDescription = "Settings" }) { Avatar(me?.avatarUrl ?: "/avatars/${account.login}.svg", 32.dp) }
	}, content = content)
}

// A page below the tabs: the big title with a back arrow.
@Composable
fun BackPage(title: String, sub: String? = null, trailing: @Composable () -> Unit = {}, content: @Composable ColumnScope.() -> Unit) {
	val nav = LocalNav.current
	Page(title, sub, onBack = { nav.popBackStack() }, trailing = trailing, content = content)
}
