plugins {
	alias(libs.plugins.android.application)
	alias(libs.plugins.kotlin.compose)
	alias(libs.plugins.kotlin.serialization)
	alias(libs.plugins.roborazzi)
}


android {
	namespace = "dev.shed.app"
	compileSdk = 37

	defaultConfig {
		applicationId = "dev.shed.app"
		minSdk = 29
		targetSdk = 37
		// CI sets these from the release tag (v0.1.2 -> 0.1.2, code from the run number).
		versionCode = providers.environmentVariable("SHED_VERSION_CODE").orNull?.toInt() ?: 1
		versionName = providers.environmentVariable("SHED_VERSION_NAME").orNull ?: "0.1.0-dev"
	}

	// Release key from the environment (GitHub Actions secrets). Without it, release builds use the debug key,
	// which is fine for trying a build but can't update an APK from a GitHub release.
	val keystore = providers.environmentVariable("SHED_KEYSTORE").orNull
	signingConfigs {
		if (keystore != null) create("release") {
			storeFile = file(keystore)
			storePassword = providers.environmentVariable("SHED_KEYSTORE_PASSWORD").get()
			keyAlias = providers.environmentVariable("SHED_KEY_ALIAS").get()
			keyPassword = providers.environmentVariable("SHED_KEY_PASSWORD").get()
		}
	}

	buildTypes {
		release {
			isMinifyEnabled = true
			isShrinkResources = true
			proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
			signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
		}
	}

	// Screenshot tests (src/test): Robolectric renders the real screens against a fake Shed and Roborazzi saves them,
	// so layouts can be checked without a device: ./gradlew :app:recordRoborazziDebug -> app/build/outputs/roborazzi.
	testOptions { unitTests.isIncludeAndroidResources = true }

	buildFeatures {
		compose = true
		// BuildConfig.VERSION_NAME for Settings and the update check.
		buildConfig = true
	}
}

kotlin { jvmToolchain(21) }

dependencies {
	implementation(platform(libs.compose.bom))
	implementation(libs.compose.ui)
	implementation(libs.compose.material3)
	implementation(libs.compose.tooling.preview)
	debugImplementation(libs.compose.tooling)
	debugImplementation(libs.compose.ui.test.manifest)
	testImplementation(platform(libs.compose.bom))
	testImplementation(libs.compose.ui.test)
	testImplementation(libs.junit)
	testImplementation(libs.robolectric)
	testImplementation(libs.roborazzi)
	testImplementation(libs.roborazzi.compose)
	testImplementation(libs.mockwebserver)
	implementation(libs.activity.compose)
	implementation(libs.core.ktx)
	implementation(libs.lifecycle.viewmodel.compose)
	implementation(libs.lifecycle.runtime.compose)
	implementation(libs.navigation.compose)
	implementation(libs.browser)
	implementation(libs.datastore.preferences)
	implementation(libs.okhttp)
	implementation(libs.okhttp.sse)
	implementation(libs.work.runtime)
	implementation(libs.serialization.json)
	implementation(libs.coroutines.android)
	implementation(libs.coil.compose)
	implementation(libs.coil.okhttp)
	implementation(libs.coil.svg)
	implementation(libs.markdown.m3)
	implementation(libs.markdown.coil3)
}
