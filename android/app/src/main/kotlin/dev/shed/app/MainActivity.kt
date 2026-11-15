package dev.shed.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import dev.shed.app.ui.InboxScreen
import dev.shed.app.ui.ShedTheme
import dev.shed.app.ui.SignInScreen
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
	override fun onCreate(savedInstanceState: Bundle?) {
		enableEdgeToEdge()
		super.onCreate(savedInstanceState)
		handle(intent)
		setContent { ShedTheme { Surface(Modifier.fillMaxSize()) { App() } } }
	}

	override fun onNewIntent(intent: Intent) {
		super.onNewIntent(intent)
		handle(intent)
	}

	private fun handle(intent: Intent) {
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
			is AuthState.SignedIn -> InboxScreen(s.account)
		}
	}
}
