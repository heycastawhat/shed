package dev.shed.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import dev.shed.app.ui.theme.ShedTheme
import dev.shed.app.ui.Shell
import dev.shed.app.ui.SignInScreen
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
	// Shed web URLs to open, from notification taps; the shell turns them into native screens.
	private val links = Channel<String>(Channel.BUFFERED)

	override fun onCreate(savedInstanceState: Bundle?) {
		enableEdgeToEdge()
		super.onCreate(savedInstanceState)
		if (savedInstanceState == null) handle(intent)
		setContent {
			val dynamic by settings.dynamicColor.collectAsStateWithLifecycle(initialValue = false)
			val mode by settings.themeMode.collectAsStateWithLifecycle(initialValue = "auto")
			ShedTheme(dynamicColor = dynamic, mode = mode) { Surface(Modifier.fillMaxSize()) { App() } }
		}
	}

	override fun onNewIntent(intent: Intent) {
		super.onNewIntent(intent)
		handle(intent)
	}

	private fun handle(intent: Intent) {
		intent.getStringExtra(Notifier.EXTRA_URL)?.takeIf { it.isNotEmpty() }?.let { url ->
			setIntent(Intent(intent).apply { removeExtra(Notifier.EXTRA_URL) })
			links.trySend(url)
			return
		}
		val uri = intent.data ?: return
		if (uri.scheme == "shed" && uri.host == "callback") {
			setIntent(Intent(intent).setData(null))
			lifecycleScope.launch { session.finishSignIn(uri) }
		}
	}

	@Composable
	private fun App() {
		val state by session.state.collectAsStateWithLifecycle()
		when (val s = state) {
			AuthState.Loading -> Box(Modifier.fillMaxSize())
			is AuthState.SignedOut -> SignInScreen(s.lastServer)
			is AuthState.SignedIn -> {
				val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
				LaunchedEffect(s.account) {
					StreamService.start(this@MainActivity)
					CatchUpWorker.schedule(this@MainActivity)
					if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
						ask.launch(Manifest.permission.POST_NOTIFICATIONS)
				}
				Shell(s.account, links.receiveAsFlow())
			}
		}
	}
}
