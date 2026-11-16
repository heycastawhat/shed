package dev.shed.app

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.Request

class ApiError(val status: Int, message: String) : Exception(message)

// Shed's Forgejo-compatible REST API, /api/v1, with the app's personal token.
class Api(val account: Account) {
	suspend inline fun <reified T> get(path: String): T =
		call(request(path).build()) { json.decodeFromString<T>(it) }

	fun request(path: String): Request.Builder = Request.Builder()
		.url("${account.server}/api/v1$path")
		.header("authorization", "token ${account.token}")
		.header("accept", "application/json")

	companion object {
		val http = OkHttpClient()
		val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

		suspend fun <T> call(req: Request, parse: (String) -> T): T = withContext(Dispatchers.IO) {
			http.newCall(req).execute().use { r ->
				val body = r.body.string()
				if (!r.isSuccessful) {
					val msg = runCatching { json.parseToJsonElement(body).jsonObject["message"]?.jsonPrimitive?.content }.getOrNull()
					throw ApiError(r.code, msg ?: "HTTP ${r.code}")
				}
				parse(body)
			}
		}
	}
}

@Serializable data class Repo(@SerialName("full_name") val fullName: String)

@Serializable data class Subject(
	val title: String,
	val type: String,
	val state: String? = null,
	@SerialName("html_url") val htmlUrl: String = ""
)

@Serializable data class NotificationThread(
	val id: Long,
	val unread: Boolean,
	val pinned: Boolean = false,
	@SerialName("updated_at") val updatedAt: String,
	val repository: Repo,
	val subject: Subject
)

// What /notifications/stream sends: a notification plus who did what.
@Serializable data class StreamEvent(
	val id: Long,
	@SerialName("updated_at") val updatedAt: String,
	val repository: Repo,
	val subject: Subject,
	val number: Long? = null,
	val actor: String? = null,
	val what: String? = null,
	val text: String? = null
)
