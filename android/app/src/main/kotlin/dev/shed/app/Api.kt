package dev.shed.app

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

class ApiError(val status: Int, message: String) : Exception(message)

// Shed's Forgejo-compatible REST API, /api/v1, with the app's personal token.
class Api(val account: Account) {
	suspend inline fun <reified T> get(path: String): T =
		call(request(path).build()) { json.decodeFromString<T>(it) }

	suspend fun text(path: String): String = call(request(path).header("accept", "*/*").build()) { it }

	// A write; the reply is ignored.
	suspend fun send(method: String, path: String, body: String? = null) {
		val rb = (body ?: if (method == "GET" || method == "DELETE") null else "{}")?.toRequestBody("application/json".toMediaType())
		call(request(path).method(method, rb).build()) { }
	}

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

@Serializable data class User(
	val login: String,
	@SerialName("full_name") val fullName: String? = null,
	@SerialName("avatar_url") val avatarUrl: String = ""
)

@Serializable data class Label(val name: String, val color: String = "")

@Serializable data class PullMeta(val merged: Boolean = false, val draft: Boolean = false)

@Serializable data class RepoRef(
	@SerialName("full_name") val fullName: String,
	val name: String = "",
	val owner: User? = null
)

// An issue or a pull request, as /issues and /repos/issues/search return it.
@Serializable data class Issue(
	val id: Long = 0,
	val number: Long,
	val title: String,
	val body: String? = null,
	val state: String,
	val user: User,
	val labels: List<Label> = emptyList(),
	val comments: Int = 0,
	@SerialName("created_at") val createdAt: String,
	@SerialName("updated_at") val updatedAt: String,
	@SerialName("pull_request") val pullRequest: PullMeta? = null,
	val repository: RepoRef? = null
)

@Serializable data class Comment(
	val id: Long,
	val body: String,
	val user: User,
	@SerialName("created_at") val createdAt: String
)

@Serializable data class RepoInfo(
	val id: Long,
	val name: String,
	@SerialName("full_name") val fullName: String,
	val owner: User,
	val description: String = "",
	val private: Boolean = false,
	val fork: Boolean = false,
	val archived: Boolean = false,
	@SerialName("default_branch") val defaultBranch: String = "main",
	@SerialName("stars_count") val stars: Int = 0,
	@SerialName("forks_count") val forks: Int = 0,
	@SerialName("open_issues_count") val openIssues: Int = 0,
	@SerialName("open_pr_counter") val openPulls: Int = 0,
	@SerialName("updated_at") val updatedAt: String = ""
)
