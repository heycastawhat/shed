plugins {
	alias(libs.plugins.android.application)
	alias(libs.plugins.kotlin.compose)
	alias(libs.plugins.kotlin.serialization)
}

// Release builds are signed with the key CI passes in (SHED_KEYSTORE etc.), so each APK installs over the last one.
val keystore = System.getenv("SHED_KEYSTORE")?.let(::file)?.takeIf { it.exists() }

android {
	namespace = "dev.shed.app"
	compileSdk = 37

	defaultConfig {
		applicationId = "dev.shed.app"
		minSdk = 29
		targetSdk = 37
		versionCode = System.getenv("SHED_VERSION_CODE")?.toIntOrNull() ?: 1
		versionName = System.getenv("SHED_VERSION_NAME") ?: "dev"
	}

	signingConfigs {
		if (keystore != null) create("release") {
			storeFile = keystore
			storePassword = System.getenv("SHED_KEYSTORE_PASSWORD")
			keyAlias = System.getenv("SHED_KEY_ALIAS")
			keyPassword = System.getenv("SHED_KEY_PASSWORD")
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

	buildFeatures { compose = true }
}

kotlin { jvmToolchain(21) }

dependencies {
	implementation(platform(libs.compose.bom))
	implementation(libs.compose.ui)
	implementation(libs.compose.material3)
	implementation(libs.compose.tooling.preview)
	debugImplementation(libs.compose.tooling)
	implementation(libs.activity.compose)
	implementation(libs.core.ktx)
	implementation(libs.lifecycle.viewmodel.compose)
	implementation(libs.lifecycle.runtime.compose)
	implementation(libs.navigation.compose)
	implementation(libs.browser)
	implementation(libs.datastore.preferences)
	implementation(libs.okhttp)
	implementation(libs.serialization.json)
	implementation(libs.coroutines.android)
	implementation(libs.coil.compose)
	implementation(libs.coil.okhttp)
}
