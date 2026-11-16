package dev.shed.app

import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import androidx.core.net.toUri
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.Response
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume

// Keeps GET /api/v1/notifications/stream open while signed in and reconnects with backoff, straight away when the network comes back.
// Shed pings every 20 s, so a read timeout of 60 s spots a dead connection.
class StreamService : Service() {
	private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
	private val networkUp = Channel<Unit>(Channel.CONFLATED)
	private val sse = EventSources.createFactory(Api.http.newBuilder().readTimeout(60, TimeUnit.SECONDS).build())
	private var started = false
	private val callback = object : ConnectivityManager.NetworkCallback() {
		override fun onAvailable(network: Network) {
			networkUp.trySend(Unit)
		}
	}

	override fun onBind(intent: Intent?): IBinder? = null

	override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
		val tap = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
		val n = NotificationCompat.Builder(this, Notifier.CONNECTION)
			.setSmallIcon(R.drawable.ic_notification)
			.setContentTitle("Listening for Shed notifications")
			.setContentIntent(tap)
			.setOngoing(true)
			.setPriority(NotificationCompat.PRIORITY_MIN)
			.build()
		ServiceCompat.startForeground(this, 1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
		if (!started) {
			started = true
			getSystemService(ConnectivityManager::class.java).registerNetworkCallback(
				NetworkRequest.Builder().addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build(), callback
			)
			scope.launch {
				session.state.collectLatest { s ->
					when (s) {
						is AuthState.SignedIn -> listen(s.account)
						is AuthState.SignedOut -> stopSelf()
						AuthState.Loading -> Unit
					}
				}
			}
		}
		return START_STICKY
	}

	override fun onDestroy() {
		scope.cancel()
		runCatching { getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(callback) }
		super.onDestroy()
	}

	private suspend fun listen(account: Account) {
		var wait = 2_000L
		while (true) {
			if (connectOnce(account)) wait = 2_000L
			withTimeoutOrNull(wait) { networkUp.receive() }
			wait = (wait * 2).coerceAtMost(60_000L)
		}
	}

	// Returns once the stream ends; true if it had connected.
	private suspend fun connectOnce(account: Account): Boolean = suspendCancellableCoroutine { cont ->
		var opened = false
		val api = Api(account)
		val done = { if (cont.isActive) cont.resume(opened) }
		val es = sse.newEventSource(api.request("/notifications/stream").header("accept", "text/event-stream").build(), object : EventSourceListener() {
			override fun onOpen(eventSource: EventSource, response: Response) {
				opened = true
				scope.launch { runCatching { Notifier.catchUp(this@StreamService, api) } }
			}

			override fun onEvent(eventSource: EventSource, id: String?, type: String?, data: String) {
				if (type != "notification") return
				runCatching { Notifier.post(this@StreamService, Api.json.decodeFromString<StreamEvent>(data)) }
					.onFailure { Log.w("shed", "bad stream event", it) }
			}

			override fun onClosed(eventSource: EventSource) = done()

			override fun onFailure(eventSource: EventSource, t: Throwable?, response: Response?) {
				if (response?.code == 401) scope.launch { session.signOut() }
				done()
			}
		})
		cont.invokeOnCancellation { es.cancel() }
	}

	companion object {
		// Allowed from the foreground, after boot, and from the background when the app is exempt from battery optimisation.
		fun start(ctx: Context) {
			runCatching { ContextCompat.startForegroundService(ctx, Intent(ctx, StreamService::class.java)) }
				.onFailure { Log.i("shed", "stream service not started: ${it.message}") }
		}
	}
}
