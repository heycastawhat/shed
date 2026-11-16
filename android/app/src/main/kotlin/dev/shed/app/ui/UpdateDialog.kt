package dev.shed.app.ui

import androidx.compose.foundation.layout.Row
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import dev.shed.app.BuildConfig
import dev.shed.app.Update

/** "Shed 0.3.0 is out": Download opens the APK in the browser, which saves it; tapping that installs over this one. */
@Composable
fun UpdateDialog(update: Update, onDownload: () -> Unit, onSkip: () -> Unit, onLater: () -> Unit) {
	AlertDialog(
		onDismissRequest = onLater,
		icon = { Icon(ShedIcons.download, null) },
		title = { Text("Shed ${update.version} is out") },
		text = { Text("You have ${BuildConfig.VERSION_NAME}. Download the new APK, then open it to install. Your sign-in stays as it is.") },
		confirmButton = { TextButton(onClick = onDownload) { Text("Download") } },
		dismissButton = {
			Row {
				TextButton(onClick = onSkip) { Text("Skip this version") }
				TextButton(onClick = onLater) { Text("Later") }
			}
		}
	)
}
