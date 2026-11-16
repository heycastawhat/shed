package dev.shed.app.ui

import android.content.Intent
import android.os.PowerManager
import android.provider.Settings as AndroidSettings
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import dev.shed.app.BuildConfig
import dev.shed.app.session
import dev.shed.app.settings
import kotlinx.coroutines.launch

// Laid out as Sink's Settings: a card per topic on the lowest surface.
@Composable
fun SettingsScreen(onBack: () -> Unit, onCheckForUpdates: suspend () -> String?) {
	val ctx = LocalContext.current
	val settings = ctx.settings
	val account = LocalApi.current.account
	val me = LocalMe.current
	val scope = rememberCoroutineScope()
	val haptics = rememberHaptics()
	val dynamicColor by settings.dynamicColor.collectAsState(initial = false)
	val themeMode by settings.themeMode.collectAsState(initial = "auto")
	var checking by remember { mutableStateOf(false) }
	// Re-read when coming back from the system's battery screen.
	val power = ctx.getSystemService(PowerManager::class.java)
	var exempt by remember { mutableStateOf(power.isIgnoringBatteryOptimizations(ctx.packageName)) }
	val lifecycle = LocalLifecycleOwner.current.lifecycle
	LaunchedEffect(lifecycle) { lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) { exempt = power.isIgnoringBatteryOptimizations(ctx.packageName) } }

	Page("Settings", onBack = onBack) {
		Column(
			Modifier.verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, bottom = pageClearance()),
			verticalArrangement = Arrangement.spacedBy(14.dp)
		) {
			Card("Appearance") {
				Text("Theme", style = MaterialTheme.typography.titleSmall)
				SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
					val modes = listOf(Triple("auto", "System", ShedIcons.monitor), Triple("light", "Light", ShedIcons.sun), Triple("dark", "Dark", ShedIcons.moon))
					modes.forEachIndexed { i, (mode, label, icon) ->
						SegmentedButton(
							selected = themeMode == mode,
							onClick = {
								if (themeMode != mode) haptics.tick()
								scope.launch { settings.setThemeMode(mode) }
							},
							shape = SegmentedButtonDefaults.itemShape(i, modes.size),
							icon = { Icon(icon, null, Modifier.size(SegmentedButtonDefaults.IconSize)) }
						) { Text(label) }
					}
				}
				ToggleRow(ShedIcons.palette, "Use wallpaper colours", "Off keeps Shed's purple theme.", dynamicColor) { scope.launch { settings.setDynamicColor(it) } }
			}

			Card("Notifications") {
				Text(
					"Shed keeps a connection to your server open so notifications arrive straight away, without Google's push service.",
					style = MaterialTheme.typography.bodyMedium,
					color = MaterialTheme.colorScheme.onSurfaceVariant
				)
				InfoRow(ShedIcons.bell, if (exempt) "Instant" else "May be delayed", if (exempt) "Android lets Shed keep its connection open." else "Android may close the connection to save battery; Shed then checks every 15 minutes.")
				if (!exempt) OutlinedButton(onClick = {
					haptics.tick()
					@Suppress("BatteryLife")
					ctx.startActivity(Intent(AndroidSettings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, "package:${ctx.packageName}".toUri()))
				}) { Text("Keep notifications instant") }
				OutlinedButton(onClick = {
					haptics.tick()
					ctx.startActivity(Intent(AndroidSettings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(AndroidSettings.EXTRA_APP_PACKAGE, ctx.packageName))
				}) { Text("Notification settings") }
			}

			Card("App") {
				InfoRow(ShedIcons.download, "Version ${BuildConfig.VERSION_NAME}", "New versions come from GitHub releases.")
				OutlinedButton(
					enabled = !checking,
					onClick = {
						haptics.tick()
						checking = true
						scope.launch {
							onCheckForUpdates()?.let { Toast.makeText(ctx, it, Toast.LENGTH_SHORT).show() }
							checking = false
						}
					}
				) { Text(if (checking) "Checking…" else "Check for updates") }
			}

			Card("Account") {
				Row(verticalAlignment = Alignment.CenterVertically) {
					Avatar(me?.avatarUrl ?: "/avatars/${account.login}.svg", 36.dp)
					Spacer(Modifier.width(12.dp))
					Column(Modifier.weight(1f)) {
						Text(me?.fullName?.takeIf { it.isNotBlank() } ?: account.login, style = MaterialTheme.typography.titleSmall)
						Text("${account.login} on ${account.server.substringAfter("://")}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
					}
				}
				Text("Revoke this phone's token from Settings → Tokens on the web.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
				OutlinedButton(
					onClick = { haptics.reject(); scope.launch { ctx.session.signOut() } },
					colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
					border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.5f))
				) { Text("Sign out") }
			}
		}
	}
}

@Composable
private fun Card(title: String, content: @Composable ColumnScope.() -> Unit) {
	Surface(shape = RoundedCornerShape(24.dp), color = MaterialTheme.colorScheme.surfaceContainerLow, modifier = Modifier.fillMaxWidth()) {
		Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
			Text(title, style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold))
			content()
		}
	}
}

@Composable
private fun InfoRow(icon: ImageVector, title: String, sub: String) {
	Row(verticalAlignment = Alignment.CenterVertically) {
		IconBadge(icon)
		Spacer(Modifier.width(12.dp))
		Column(Modifier.weight(1f)) {
			Text(title, style = MaterialTheme.typography.titleSmall)
			Text(sub, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
		}
	}
}

@Composable
fun ToggleRow(icon: ImageVector?, title: String, sub: String, checked: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
	val haptics = rememberHaptics()
	// The whole row flips the switch: a bigger target, and one announcement for TalkBack.
	Row(
		Modifier.clip(RoundedCornerShape(16.dp)).toggleable(checked, enabled = enabled, role = Role.Switch) { haptics.toggle(it); onChange(it) }.padding(vertical = 4.dp),
		verticalAlignment = Alignment.CenterVertically
	) {
		if (icon != null) {
			IconBadge(icon)
			Spacer(Modifier.width(12.dp))
		}
		Column(Modifier.weight(1f)) {
			Text(title, style = MaterialTheme.typography.titleSmall)
			Text(sub, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
		}
		Spacer(Modifier.width(12.dp))
		Switch(
			checked = checked,
			onCheckedChange = null,
			thumbContent = if (checked) ({ Icon(ShedIcons.check, null, Modifier.size(SwitchDefaults.IconSize)) }) else null,
			enabled = enabled
		)
	}
}

@Composable
private fun IconBadge(icon: ImageVector) {
	Box(
		Modifier.size(36.dp).clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.secondaryContainer),
		Alignment.Center
	) { Icon(icon, null, Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSecondaryContainer) }
}
