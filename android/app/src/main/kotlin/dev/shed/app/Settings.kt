package dev.shed.app

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore("settings")

// The app's own preferences, as in Sink's app: appearance and the update check. The account lives in Session.
class Settings(private val context: Context) {
	private object Keys {
		val dynamicColor = booleanPreferencesKey("dynamic_color")
		val themeMode = stringPreferencesKey("theme_mode")
		val updateCheckedAt = longPreferencesKey("update_checked_at")
		val skippedVersion = stringPreferencesKey("skipped_version")
	}

	val dynamicColor: Flow<Boolean> = context.dataStore.data.map { it[Keys.dynamicColor] ?: false }

	/** "auto" follows the system; "light" / "dark" pin it. */
	val themeMode: Flow<String> = context.dataStore.data.map { it[Keys.themeMode] ?: "auto" }

	suspend fun setThemeMode(mode: String) = context.dataStore.edit { it[Keys.themeMode] = mode }

	suspend fun setDynamicColor(on: Boolean) = context.dataStore.edit { it[Keys.dynamicColor] = on }

	/** When the app last asked GitHub for a newer release, so it asks at most once a day. */
	suspend fun updateCheckedAt(): Long = context.dataStore.data.first()[Keys.updateCheckedAt] ?: 0

	suspend fun setUpdateCheckedAt(at: Long) = context.dataStore.edit { it[Keys.updateCheckedAt] = at }

	/** A release the user chose to skip: not offered again (a newer one still is). */
	suspend fun skippedVersion(): String? = context.dataStore.data.first()[Keys.skippedVersion]

	suspend fun skipVersion(version: String) = context.dataStore.edit { it[Keys.skippedVersion] = version }
}
