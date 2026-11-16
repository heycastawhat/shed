package dev.shed.app

import android.app.Application
import android.content.Context

class ShedApp : Application() {
	lateinit var session: Session
		private set

	override fun onCreate() {
		super.onCreate()
		session = Session(this)
		Notifier.channels(this)
	}
}

val Context.session: Session get() = (applicationContext as ShedApp).session
