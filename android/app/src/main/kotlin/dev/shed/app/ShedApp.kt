package dev.shed.app

import android.app.Application
import android.content.Context
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import coil3.svg.SvgDecoder

class ShedApp : Application(), SingletonImageLoader.Factory {
	lateinit var session: Session
		private set

	override fun onCreate() {
		super.onCreate()
		session = Session(this)
		Notifier.channels(this)
	}

	// Shed's generated avatars are SVG.
	override fun newImageLoader(context: PlatformContext) = ImageLoader.Builder(context)
		.components {
			add(OkHttpNetworkFetcherFactory(callFactory = { Api.http }))
			add(SvgDecoder.Factory())
		}
		.build()
}

val Context.session: Session get() = (applicationContext as ShedApp).session
