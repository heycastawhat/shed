package dev.shed.app

import android.app.Activity
import android.content.Context
import android.net.Uri
import android.os.Build
import android.util.Base64
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.net.toUri
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.security.MessageDigest
import java.security.SecureRandom

private val Context.prefs by preferencesDataStore("shed")
private val SERVER = stringPreferencesKey("server")
private val LOGIN = stringPreferencesKey("login")
private val TOKEN = stringPreferencesKey("token")
private val PENDING = stringPreferencesKey("pending")

data class Account(val server: String, val login: String, val token: String)

sealed interface AuthState {
	data object Loading : AuthState
	data class SignedOut(val lastServer: String) : AuthState
	data class SignedIn(val account: Account) : AuthState
}

@Serializable private data class Pending(val server: String, val verifier: String, val state: String)
@Serializable private data class TokenReply(val token: String, val login: String)
@Serializable private data class TokenRequest(val code: String, val code_verifier: String, val device: String)

// Sign-in is OAuth's code flow with PKCE against Shed itself (see src/lib/server/appauth.ts): a browser tab does the real sign-in,
// so passkeys and the identity provider work as on the web, and the app only ever holds a Shed token.
class Session(private val ctx: Context) {
	private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

	val state: StateFlow<AuthState> = ctx.prefs.data
		.map { p ->
			val token = p[TOKEN]?.let(Crypt::open)
			val server = p[SERVER]
			val login = p[LOGIN]
			if (server != null && login != null && token != null) AuthState.SignedIn(Account(server, login, token)) else AuthState.SignedOut(server ?: "")
		}
		.stateIn(scope, SharingStarted.Eagerly, AuthState.Loading)

	val signInError = MutableStateFlow<String?>(null)
	val signingIn = MutableStateFlow(false)

	suspend fun startSignIn(activity: Activity, input: String) {
		val server = normalise(input) ?: return run { signInError.value = "Enter your Shed's address, e.g. https://shed.example.com" }
		val p = Pending(server, random(48), random(16))
		ctx.prefs.edit { it[PENDING] = Json.encodeToString(p); it[SERVER] = server }
		val challenge = b64(MessageDigest.getInstance("SHA-256").digest(p.verifier.toByteArray()))
		val url = "$server/login/app".toUri().buildUpon()
			.appendQueryParameter("redirect_uri", "shed://callback")
			.appendQueryParameter("code_challenge", challenge)
			.appendQueryParameter("code_challenge_method", "S256")
			.appendQueryParameter("state", p.state)
			.build()
		signInError.value = null
		CustomTabsIntent.Builder().build().launchUrl(activity, url)
	}

	suspend fun finishSignIn(uri: Uri) {
		val raw = ctx.prefs.data.first()[PENDING]
		ctx.prefs.edit { it.remove(PENDING) }
		val p = raw?.let { runCatching { Json.decodeFromString<Pending>(it) }.getOrNull() }
		signInError.value = when {
			p == null || uri.getQueryParameter("state") != p.state -> "That sign-in link is stale; try again"
			uri.getQueryParameter("error") != null -> "Sign-in was cancelled"
			else -> {
				signingIn.value = true
				try {
					val body = Json.encodeToString(TokenRequest(uri.getQueryParameter("code") ?: "", p.verifier, Build.MODEL))
					val req = Request.Builder().url("${p.server}/login/app/token").post(body.toRequestBody("application/json".toMediaType())).build()
					val reply = Api.call(req) { Api.json.decodeFromString<TokenReply>(it) }
					ctx.prefs.edit { it[LOGIN] = reply.login; it[TOKEN] = Crypt.seal(reply.token) }
					null
				} catch (e: Exception) {
					"Couldn't finish signing in: ${e.message}"
				} finally {
					signingIn.value = false
				}
			}
		}
	}

	suspend fun signOut() = ctx.prefs.edit { it.remove(TOKEN); it.remove(LOGIN) }

	private companion object {
		val rng = SecureRandom()
		fun b64(b: ByteArray): String = Base64.encodeToString(b, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
		fun random(n: Int) = b64(ByteArray(n).also(rng::nextBytes))
		fun normalise(input: String): String? {
			val s = input.trim().trimEnd('/')
			if (s.isEmpty()) return null
			val withScheme = if ("://" in s) s else "https://$s"
			val u = withScheme.toUri()
			return if ((u.scheme == "https" || u.scheme == "http") && !u.host.isNullOrEmpty()) withScheme else null
		}
	}
}
