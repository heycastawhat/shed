package dev.shed.app

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import java.time.Instant

// Turns Shed notifications into Android ones, one per thread (a newer one replaces it). The stream and the 15-minute catch-up both
// come through here; "seen" remembers the newest one shown so neither repeats the other.
object Notifier {
	const val ACTIVITY = "activity"
	const val CONNECTION = "connection"
	const val EXTRA_URL = "url"

	private val _changes = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
	val changes = _changes.asSharedFlow()

	fun channels(ctx: Context) {
		val nm = ctx.getSystemService(NotificationManager::class.java)
		nm.createNotificationChannel(NotificationChannel(ACTIVITY, "Activity", NotificationManager.IMPORTANCE_DEFAULT).apply {
			description = "Comments, reviews, mentions and review requests"
		})
		nm.createNotificationChannel(NotificationChannel(CONNECTION, "Connection", NotificationManager.IMPORTANCE_MIN).apply {
			description = "Shown while the app keeps its connection to Shed open. Safe to turn off."
			setShowBadge(false)
		})
	}

	private fun prefs(ctx: Context) = ctx.getSharedPreferences("notifier", Context.MODE_PRIVATE)
	private fun newer(a: String, b: String?) = b == null || runCatching { Instant.parse(a).isAfter(Instant.parse(b)) }.getOrDefault(a > b)

	fun post(ctx: Context, e: StreamEvent) {
		val seen = prefs(ctx).getString("seen", null)
		if (seen == null || newer(e.updatedAt, seen)) prefs(ctx).edit { putString("seen", e.updatedAt) }
		_changes.tryEmit(Unit)
		show(ctx, e)
	}

	// After (re)connecting and every 15 minutes: show unread notifications newer than the last one shown. The very first time,
	// only remember where we are, so signing in doesn't replay the whole inbox.
	suspend fun catchUp(ctx: Context, api: Api) {
		val list = api.get<List<NotificationThread>>("/notifications?limit=50")
		val seen = prefs(ctx).getString("seen", null)
		val fresh = list.filter { newer(it.updatedAt, seen) }
		list.maxByOrNull { Instant.parse(it.updatedAt) }?.let { top -> if (newer(top.updatedAt, seen)) prefs(ctx).edit { putString("seen", top.updatedAt) } }
		if (fresh.isNotEmpty()) _changes.tryEmit(Unit)
		if (seen == null) return
		for (n in fresh) show(ctx, StreamEvent(n.id, n.updatedAt, n.repository, n.subject))
	}

	fun forget(ctx: Context) {
		prefs(ctx).edit { clear() }
		NotificationManagerCompat.from(ctx).cancelAll()
	}

	private fun show(ctx: Context, e: StreamEvent) {
		if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
		val ref = e.repository.fullName + (e.number?.let { "#$it" } ?: "")
		val line = when {
			e.actor != null && e.what != null -> "${e.actor} ${e.what}" + (e.text?.takeIf { it.isNotBlank() }?.let { ": $it" } ?: "")
			else -> listOfNotNull(if (e.subject.type == "Pull") "Pull request" else e.subject.type, e.subject.state).joinToString(" · ")
		}
		val open = Intent(ctx, MainActivity::class.java).putExtra(EXTRA_URL, e.subject.htmlUrl).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
		val n = NotificationCompat.Builder(ctx, ACTIVITY)
			.setSmallIcon(R.drawable.ic_notification)
			.setContentTitle(e.subject.title)
			.setContentText(line)
			.setSubText(ref)
			.setStyle(NotificationCompat.BigTextStyle().bigText(line))
			.setWhen(runCatching { Instant.parse(e.updatedAt).toEpochMilli() }.getOrDefault(System.currentTimeMillis()))
			.setShowWhen(true)
			.setAutoCancel(true)
			.setContentIntent(PendingIntent.getActivity(ctx, e.id.toInt(), open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
			.build()
		NotificationManagerCompat.from(ctx).notify(e.id.toInt(), n)
	}
}
