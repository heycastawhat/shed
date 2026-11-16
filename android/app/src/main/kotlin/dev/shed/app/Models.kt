package dev.shed.app

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// Shed's Forgejo-compatible JSON, as far as the app reads it. Unknown fields are ignored (Api.json).

@Serializable data class Ref(val ref: String = "", val label: String = "", val sha: String = "")

@Serializable data class Pull(
	val id: Long = 0,
	val number: Long,
	val title: String,
	val body: String? = null,
	val state: String,
	val user: User,
	val labels: List<Label> = emptyList(),
	val assignees: List<User>? = null,
	val milestone: Milestone? = null,
	val comments: Int = 0,
	@SerialName("created_at") val createdAt: String,
	@SerialName("updated_at") val updatedAt: String,
	val draft: Boolean = false,
	val merged: Boolean = false,
	@SerialName("merged_at") val mergedAt: String? = null,
	@SerialName("merged_by") val mergedBy: User? = null,
	val mergeable: Boolean = false,
	@SerialName("merge_base") val mergeBase: String? = null,
	val head: Ref = Ref(),
	val base: Ref = Ref(),
	@SerialName("requested_reviewers") val requestedReviewers: List<User?> = emptyList(),
	val additions: Int = 0,
	val deletions: Int = 0,
	@SerialName("changed_files") val changedFiles: Int = 0,
	@SerialName("auto_merge") val autoMerge: AutoMerge? = null
)

@Serializable data class AutoMerge(val style: String = "", val by: User? = null)

@Serializable data class Milestone(val id: Long, val title: String, val state: String = "open", @SerialName("open_issues") val open: Int = 0, @SerialName("closed_issues") val closed: Int = 0)

@Serializable data class LabelFull(val id: Long, val name: String, val color: String = "", val description: String = "")

// One entry of /issues/:n/timeline: a comment, or an event (label, title, assignee, close, merge, cross reference, …).
@Serializable data class TimelineItem(
	val id: Long,
	val type: String = "comment",
	val user: User? = null,
	val body: String = "",
	@SerialName("created_at") val createdAt: String = "",
	val label: LabelFull? = null,
	@SerialName("old_title") val oldTitle: String? = null,
	@SerialName("new_title") val newTitle: String? = null,
	val assignee: User? = null,
	@SerialName("removed_assignee") val removedAssignee: Boolean = false,
	val milestone: Milestone? = null,
	@SerialName("ref_repo") val refRepo: String? = null,
	@SerialName("ref_number") val refNumber: Long? = null,
	@SerialName("ref_title") val refTitle: String? = null,
	@SerialName("ref_is_pull") val refIsPull: Boolean = false,
	val message: String? = null
)

@Serializable data class Review(
	val id: Long,
	val body: String = "",
	val user: User,
	val state: String,
	@SerialName("commit_id") val commitId: String = "",
	@SerialName("submitted_at") val submittedAt: String = "",
	val stale: Boolean = false,
	val dismissed: Boolean = false
)

@Serializable data class LineComment(
	val id: Long,
	val body: String,
	val user: User,
	@SerialName("created_at") val createdAt: String,
	val path: String = "",
	val position: Int = 0,
	@SerialName("original_position") val originalPosition: Int = 0,
	@SerialName("commit_id") val commitId: String = "",
	@SerialName("diff_hunk") val diffHunk: String = "",
	val resolver: User? = null,
	@SerialName("pull_request_review_id") val reviewId: Long? = null
) {
	val line get() = if (position > 0) position else originalPosition
	val side get() = if (position > 0) "new" else "old"
}

@Serializable data class CommitPerson(val name: String = "", val email: String = "", val date: String = "")
@Serializable data class CommitBody(val message: String = "", val author: CommitPerson = CommitPerson())
@Serializable data class Commit(val sha: String, val commit: CommitBody = CommitBody(), val author: User? = null, val parents: List<Sha> = emptyList()) {
	val title get() = commit.message.substringBefore('\n')
	val description get() = commit.message.substringAfter('\n', "").trim()
}
@Serializable data class Sha(val sha: String)

@Serializable data class Status(
	val id: Long = 0,
	val context: String = "",
	val state: String = "",
	val description: String = "",
	@SerialName("target_url") val targetUrl: String = ""
)
@Serializable data class CombinedStatus(val state: String = "", val statuses: List<Status> = emptyList())

@Serializable data class ChangedFile(val filename: String, val status: String = "", val additions: Int = 0, val deletions: Int = 0, @SerialName("previous_filename") val previous: String? = null)

@Serializable data class Entry(val name: String, val path: String, val type: String, val size: Long = 0, val sha: String = "")
@Serializable data class FileContent(val name: String = "", val path: String = "", val sha: String = "", val size: Long = 0, val content: String? = null, val encoding: String? = null)

@Serializable data class BranchCommit(val id: String = "", val message: String = "", val timestamp: String = "")
@Serializable data class Branch(val name: String, val commit: BranchCommit = BranchCommit(), val protected: Boolean = false)
@Serializable data class TagCommit(val sha: String = "", val created: String = "")
@Serializable data class Tag(val name: String, val message: String = "", val commit: TagCommit = TagCommit())

@Serializable data class Asset(val id: Long = 0, val name: String, val size: Long = 0, @SerialName("browser_download_url") val url: String = "", @SerialName("download_count") val downloads: Int = 0)
@Serializable data class Release(
	val id: Long,
	@SerialName("tag_name") val tag: String,
	val name: String = "",
	val body: String = "",
	val draft: Boolean = false,
	val prerelease: Boolean = false,
	@SerialName("published_at") val publishedAt: String? = null,
	@SerialName("created_at") val createdAt: String = "",
	val author: User? = null,
	val assets: List<Asset> = emptyList()
)

@Serializable data class Run(
	val id: Long,
	@SerialName("index_in_repo") val number: Long,
	val title: String = "",
	val name: String = "",
	@SerialName("workflow_id") val workflow: String = "",
	val event: String = "",
	val status: String = "",
	@SerialName("run_attempt") val attempt: Int = 1,
	@SerialName("commit_sha") val sha: String = "",
	val prettyref: String = "",
	@SerialName("trigger_user") val user: User? = null,
	val created: String = "",
	val started: String = "",
	val stopped: String = "",
	val jobs: List<Job> = emptyList()
)
@Serializable data class Runs(@SerialName("workflow_runs") val runs: List<Run> = emptyList(), @SerialName("total_count") val total: Int = 0)
@Serializable data class Step(val id: Int, val result: String? = null, @SerialName("started_at") val startedAt: String? = null, @SerialName("stopped_at") val stoppedAt: String? = null, @SerialName("log_index") val logIndex: Int = 0, @SerialName("log_length") val logLength: Int = 0)
@Serializable data class Job(
	val id: Long,
	val name: String,
	val status: String = "",
	val result: String? = null,
	val needs: List<String> = emptyList(),
	@SerialName("runs_on") val runsOn: List<String> = emptyList(),
	val attempt: Int = 1,
	@SerialName("started_at") val startedAt: String? = null,
	@SerialName("completed_at") val completedAt: String? = null,
	val runner: String? = null,
	val steps: List<Step> = emptyList(),
	@SerialName("step_names") val stepNames: List<String> = emptyList()
)

@Serializable data class Wrapped<T>(val ok: Boolean = true, val data: List<T> = emptyList())
@Serializable data class CodeHit(val repo: String, val ref: String, val path: String, val line: Int, val text: String)
@Serializable data class Profile(
	val id: Long = 0,
	val login: String = "",
	val username: String = "",
	@SerialName("full_name") val fullName: String = "",
	@SerialName("avatar_url") val avatarUrl: String = "",
	val description: String = "",
	val website: String = "",
	val location: String = "",
	val email: String = "",
	@SerialName("followers_count") val followers: Int = 0,
	@SerialName("following_count") val following: Int = 0,
	val created: String = ""
) {
	val name get() = login.ifEmpty { username }
}

@Serializable data class Token(val t: String, val l: String? = null, val d: String? = null, val i: Boolean? = null)
@Serializable data class Highlighted(val lang: String = "text", val lines: List<List<Token>> = emptyList())

@Serializable data class BlameCommit(val sha: String, val author: String = "", val time: Long = 0, val summary: String = "")
@Serializable data class BlameRange(val sha: String, val start: Int, val count: Int)
@Serializable data class Blame(val commits: Map<String, BlameCommit> = emptyMap(), val ranges: List<BlameRange> = emptyList(), val lines: List<String> = emptyList())

@Serializable data class SshKey(val id: Long, val title: String, val key: String = "", val fingerprint: String = "", @SerialName("created_at") val createdAt: String = "")

// The Agents page (/user/agents).
@Serializable data class Approval(
	val id: String,
	val keyName: String = "",
	val repo: String = "",
	val tool: String = "",
	val args: Map<String, kotlinx.serialization.json.JsonElement> = emptyMap(),
	val reason: String? = null,
	val at: String = ""
)
@Serializable data class AgentActivity(val at: String = "", val name: String = "", val repo: String = "", val action: String = "")
@Serializable data class AgentKey(val id: String, val name: String, val repos: List<String> = emptyList(), val lastUsedAt: String? = null)
@Serializable data class AgentThread(
	val id: String,
	val title: String = "",
	val host: String = "",
	val hostName: String = "",
	val web: String = "",
	val project: String = "",
	val repo: String? = null,
	val model: String = "",
	val updatedAt: String = "",
	val activeRunId: String? = null,
	val pendingRuntimeRequest: PendingRequest? = null
)
@Serializable data class PendingRequest(val id: String = "", val type: String = "")
@Serializable data class Ask(val thread: AgentThread, val request: PendingRequest, val prompt: String? = null, val questions: List<String>? = null)
@Serializable data class ModelChoice(val instanceId: String = "", val slug: String = "", val name: String = "")
@Serializable data class TargetHost(val id: String, val name: String, val models: List<ModelChoice> = emptyList())
@Serializable data class Target(val repo: String, val base: String = "main", val hosts: List<TargetHost> = emptyList())
@Serializable data class T3(val targets: List<Target> = emptyList(), val threads: List<AgentThread> = emptyList(), val asks: List<Ask> = emptyList(), val down: List<DownHost> = emptyList())
@Serializable data class DownHost(val name: String, val error: String = "")
@Serializable data class Agents(val t3: T3? = null, val pending: List<Approval> = emptyList(), val activity: List<AgentActivity> = emptyList(), val keys: List<AgentKey> = emptyList())
@Serializable data class UserSettings(@SerialName("full_name") val fullName: String = "", val description: String = "", val website: String = "", val location: String = "")
@Serializable data class FeedRepo(@SerialName("full_name") val fullName: String)
@Serializable data class FeedItem(
	val id: Long,
	@SerialName("op_type") val op: String,
	@SerialName("act_user") val user: User? = null,
	val repo: FeedRepo,
	@SerialName("ref_name") val ref: String = "",
	val content: String = "",
	val created: String = ""
)
