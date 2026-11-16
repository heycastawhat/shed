package dev.shed.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.util.concurrent.TimeUnit

// The fallback when Android has stopped the stream service: every 15 minutes, show anything missed and try to restart the service.
class CatchUpWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
	override suspend fun doWork(): Result {
		val s = applicationContext.session.state.first { it != AuthState.Loading }
		if (s !is AuthState.SignedIn) return Result.success()
		StreamService.start(applicationContext)
		return runCatching { Notifier.catchUp(applicationContext, Api(s.account)) }.fold({ Result.success() }, { Result.retry() })
	}

	companion object {
		fun schedule(ctx: Context) = WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
			"catch-up", ExistingPeriodicWorkPolicy.KEEP, PeriodicWorkRequestBuilder<CatchUpWorker>(15, TimeUnit.MINUTES).build()
		)

		fun cancel(ctx: Context) = WorkManager.getInstance(ctx).cancelUniqueWork("catch-up")
	}
}

class BootReceiver : BroadcastReceiver() {
	override fun onReceive(context: Context, intent: Intent) {
		if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
		val pending = goAsync()
		val ctx = context.applicationContext
		kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
			try {
				if (ctx.session.state.first { it != AuthState.Loading } is AuthState.SignedIn) StreamService.start(ctx)
			} finally {
				pending.finish()
			}
		}
	}
}
