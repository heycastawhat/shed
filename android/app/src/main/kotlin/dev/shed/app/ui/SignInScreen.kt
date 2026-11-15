package dev.shed.app.ui

import android.app.Activity
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.shed.app.session
import kotlinx.coroutines.launch

@Composable
fun SignInScreen(lastServer: String) {
	val ctx = LocalContext.current
	val session = ctx.session
	val scope = rememberCoroutineScope()
	var server by rememberSaveable { mutableStateOf(lastServer) }
	val error by session.signInError.collectAsStateWithLifecycle()
	val busy by session.signingIn.collectAsStateWithLifecycle()
	val go = { scope.launch { session.startSignIn(ctx as Activity, server) }; Unit }

	Column(
		Modifier.fillMaxSize().safeDrawingPadding().imePadding().padding(24.dp),
		verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically)
	) {
		Text("Shed", style = MaterialTheme.typography.displaySmall)
		Text("Sign in with your Shed's address. You'll finish in the browser, the same way you sign in on the web.", color = MaterialTheme.colorScheme.onSurfaceVariant)
		OutlinedTextField(
			value = server,
			onValueChange = { server = it },
			label = { Text("Shed address") },
			placeholder = { Text("shed.example.com") },
			singleLine = true,
			keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Go),
			keyboardActions = KeyboardActions(onGo = { go() }),
			modifier = Modifier.fillMaxWidth()
		)
		error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
		if (busy) CircularProgressIndicator()
		else Button(onClick = go, enabled = server.isNotBlank(), modifier = Modifier.fillMaxWidth()) { Text("Sign in") }
	}
}
