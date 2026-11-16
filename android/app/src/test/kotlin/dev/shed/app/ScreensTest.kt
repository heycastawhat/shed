package dev.shed.app

import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import com.github.takahirom.roborazzi.captureRoboImage
import dev.shed.app.ui.Shell
import dev.shed.app.ui.theme.ShedTheme
import kotlinx.coroutines.flow.emptyFlow
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

// Renders the real shell against a fake Shed and saves each screen (app/build/outputs/roborazzi), light and dark,
// at a Pixel 9's size, so layouts can be checked without a device.
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w412dp-h915dp-xxhdpi")
class ScreensTest {
	@get:Rule val rule = createComposeRule()
	private val server = MockWebServer()

	@Before fun start() {
		server.dispatcher = object : Dispatcher() {
			override fun dispatch(request: RecordedRequest): MockResponse {
				val path = request.url.encodedPath.removePrefix("/api/v1")
				val q = request.url.query.orEmpty()
				val body = when {
					path.startsWith("/avatars/") -> return MockResponse.Builder().addHeader("content-type", "image/svg+xml").body(avatar(path)).build()
					path == "/user" -> USER
					path == "/notifications/new" -> """{"new":2}"""
					path == "/notifications" -> NOTIFICATIONS
					path == "/repos/issues/search" && "review_requested" in q -> "[${pull(12, "Fix flaky clone test over SSH", "kiwi", labels = """[{"name":"ci","color":"5b5bd6"}]""")}]"
					path == "/repos/issues/search" && "mentioned" in q -> "[${pull(9, "Stacked PRs: retarget on merge", "kiwi", comments = 4)}]"
					path == "/repos/issues/search" -> "[${pull(14, "Add blame endpoint", "ada")},${pull(15, "Draft: syntax tokens API", "ada", draft = true)}]"
					path == "/user/repos" -> REPOS
					path == "/repos/ada/garden" -> repo("garden", "Plants, watering schedules and a small web UI", 3, 2)
					path.startsWith("/repos/ada/garden/raw/README") -> "# Garden\n\nKeeps track of **what to water** and when.\n\n- Schedules\n- Reminders\n\n```sh\nbun run dev\n```\n"
					path == "/repos/ada/garden/issues/12" -> pull(12, "Fix flaky clone test over SSH", "kiwi", body = "The SSH clone test sometimes times out on CI.\n\nThis waits for the server's banner first.")
					path == "/repos/ada/garden/issues/12/comments" -> COMMENTS
					path == "/repos/ada/garden/issues/12/timeline" -> TIMELINE
					path == "/repos/ada/garden/pulls/12" -> PULL
					path == "/repos/ada/garden/pulls/12/reviews" -> REVIEWS
					path == "/repos/ada/garden/pulls/12/comments" -> LINE_COMMENTS
					path == "/repos/ada/garden/pulls/12/commits" -> COMMITS
					path.startsWith("/repos/ada/garden/compare/") -> return MockResponse.Builder().addHeader("content-type", "text/plain").body(DIFF).build()
					path == "/highlight" -> HIGHLIGHT
					path == "/repos/ada/garden/contents" -> TREE
					path == "/repos/ada/garden/contents/src/clone.ts" -> """{"name":"clone.ts","path":"src/clone.ts","size":120,"encoding":"base64","content":"${java.util.Base64.getEncoder().encodeToString(CODE.toByteArray())}"}"""
					path == "/repos/ada/garden/actions/runs" -> """{"workflow_runs":[${run(4, "success")},${run(5, "running")}],"total_count":2}"""
					path == "/repos/ada/garden/actions/runs/5" -> run(5, "running", jobs = true)
					path.startsWith("/repos/ada/garden/actions/jobs/") -> return MockResponse.Builder().addHeader("content-type", "text/plain").body(LOG).build()
					path == "/user/agents" -> AGENTS
					else -> return MockResponse.Builder().code(404).body("""{"message":"not found"}""").build()
				}
				return MockResponse.Builder().addHeader("content-type", "application/json").body(body).build()
			}
		}
		server.start()
	}

	@After fun stop() = server.close()

	private fun shell(dark: Boolean) {
		BASE = server.url("/").toString().trimEnd('/')
		rule.setContent { ShedTheme(mode = if (dark) "dark" else "light") { Shell(Account(BASE, "ada", "token"), emptyFlow()) } }
	}

	private var current = "start"

	// On a timeout, a screenshot of what was there instead (an error, a spinner) says why.
	private fun waitFor(text: String) = try {
		rule.waitUntil(10_000) { rule.onAllNodes(hasText(text, substring = true)).fetchSemanticsNodes().isNotEmpty() }
	} catch (e: Throwable) {
		shot("failed-$current")
		throw AssertionError("Waiting for \"$text\" on $current; requests: ${server.requestCount}", e)
	}
	private fun tap(description: String) = rule.onNode(hasContentDescription(description, substring = true)).performClick()
	private fun shot(name: String) = rule.onRoot().captureRoboImage("build/outputs/roborazzi/$name.png")
	private fun at(name: String) { current = name }

	private fun tour(theme: String) {
		at("$theme-home")
		waitFor("Fix flaky clone test")
		shot("$theme-home")
		tap("Changes")
		at("$theme-changes")
		waitFor("Fix flaky clone test")
		rule.onNode(hasText("Created")).performClick()
		waitFor("Add blame endpoint")
		shot("$theme-changes")
		tap("Repos")
		at("$theme-repos")
		waitFor("garden")
		shot("$theme-repos")
		rule.onNode(hasText("Plants, watering", substring = true)).performClick()
		at("$theme-repo")
		waitFor("what to water")
		shot("$theme-repo")
		rule.onNode(hasContentDescription("Back")).performClick()
		tap("Inbox")
		at("$theme-inbox")
		waitFor("Release 0.4")
		shot("$theme-inbox")
		rule.onNode(hasText("Fix flaky clone test", substring = true)).performClick()
		at("$theme-thread")
		waitFor("banner first")
		shot("$theme-thread")
		rule.onNode(hasText("Files", substring = true)).performClick()
		at("$theme-files")
		waitFor("waitForBanner")
		shot("$theme-files")
		rule.onNode(hasContentDescription("Back")).performClick()
		tap("Agents")
		at("$theme-agents")
		waitFor("wants to")
		shot("$theme-agents")
		tap("Repos")
		rule.onNode(hasText("Plants, watering", substring = true)).performClick()
		waitFor("what to water")
		rule.onNode(hasText("Code")).performClick()
		at("$theme-tree")
		waitFor("clone.ts")
		shot("$theme-tree")
		rule.onNode(hasText("clone.ts")).performClick()
		at("$theme-file")
		waitFor("banner")
		shot("$theme-file")
		rule.onNode(hasContentDescription("Back")).performClick()
		rule.onNode(hasContentDescription("Back")).performClick()
		rule.onNode(hasText("Actions")).performClick()
		at("$theme-runs")
		waitFor("Run tests")
		rule.onAllNodes(hasText("Run tests", substring = true))[1].performClick()
		at("$theme-run")
		waitFor("bun test")
		shot("$theme-run")
		rule.onNode(hasContentDescription("Back")).performClick()
		rule.onNode(hasContentDescription("Back")).performClick()
		rule.onNode(hasContentDescription("Back")).performClick()
		tap("Settings")
		at("$theme-settings")
		waitFor("Appearance")
		shot("$theme-settings")
	}

	@Test fun light() {
		shell(dark = false)
		tour("light")
	}

	@Test fun dark() {
		shell(dark = true)
		tour("dark")
	}

	private companion object {
		const val USER = """{"id":1,"login":"ada","full_name":"Ada","avatar_url":"/avatars/ada.svg"}"""
		var BASE = ""
		val NOW: String = java.time.Instant.now().minusSeconds(3 * 3600).toString()
		// A coloured circle with the initial, like Shed's generated avatars.
		fun avatar(path: String): String {
			val name = path.substringAfterLast('/').substringBefore('.')
			val fill = listOf("#5b5bd6", "#8b5cf6", "#3e8fb0", "#c2703a", "#3f9a78")[name.hashCode().mod(5)]
			return """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="$fill"/>""" +
				"""<text x="16" y="21" font-size="15" text-anchor="middle" fill="#fff" font-family="sans-serif">${name.first().uppercase()}</text></svg>"""
		}
		fun user(login: String) = """{"login":"$login","avatar_url":"/avatars/$login.svg"}"""
		fun pull(n: Int, title: String, by: String, labels: String = "[]", comments: Int = 0, draft: Boolean = false, body: String = "") =
			"""{"id":$n,"number":$n,"title":"$title","body":${kotlinx.serialization.json.JsonPrimitive(body)},"state":"open","user":${user(by)},"labels":$labels,"comments":$comments,""" +
				""""created_at":"$NOW","updated_at":"$NOW","pull_request":{"merged":false,"draft":$draft},"repository":{"full_name":"ada/garden","name":"garden"}}"""
		fun repo(name: String, description: String, pulls: Int, issues: Int, private: Boolean = false) =
			"""{"id":${name.length},"name":"$name","full_name":"ada/$name","owner":${user("ada")},"description":"$description","private":$private,"default_branch":"main",""" +
				""""stars_count":4,"open_pr_counter":$pulls,"open_issues_count":$issues,"updated_at":"$NOW"}"""
		val REPOS = "[${repo("garden", "Plants, watering schedules and a small web UI", 3, 2)},${repo("dotfiles", "Shell, editor and terminal setup", 0, 0, private = true)},${repo("notes", "", 1, 5)}]"
		fun thread(id: Int, title: String, type: String, state: String, unread: Boolean, n: Int) =
			"""{"id":$id,"unread":$unread,"pinned":false,"updated_at":"$NOW","repository":{"full_name":"ada/garden"},""" +
				""""subject":{"title":"$title","type":"$type","state":"$state","html_url":"$BASE/ada/garden/${if (type == "Pull") "pulls" else "issues"}/$n"}}"""
		val NOTIFICATIONS get() = "[${thread(1, "Fix flaky clone test over SSH", "Pull", "open", true, 12)},${thread(2, "Release 0.4 checklist", "Issue", "open", true, 7)},${thread(3, "Move CI to the new runner", "Pull", "merged", false, 5)}]"
		val PULL get() = pull(12, "Fix flaky clone test over SSH", "kiwi", body = "The SSH clone test sometimes times out on CI.").dropLast(1) +
			""","head":{"ref":"ssh-banner","label":"ssh-banner","sha":"bbbbbbb"},"base":{"ref":"main","sha":"aaaaaaa"},"merge_base":"aaaaaaa","mergeable":true,"additions":3,"deletions":1,"changed_files":1,"requested_reviewers":[${user("ada")}]}"""
		val TIMELINE get() = """[{"id":1000000001,"type":"label","user":${user("kiwi")},"created_at":"$NOW","body":"1","label":{"id":1,"name":"ci","color":"5b5bd6"}},""" +
			"""{"id":1,"type":"comment","body":"Looks good. Can we keep the old timeout as a fallback?","user":${user("ada")},"created_at":"$NOW"}]"""
		val REVIEWS get() = """[{"id":7,"body":"One question inline.","user":${user("ada")},"state":"COMMENT","submitted_at":"$NOW"}]"""
		val LINE_COMMENTS get() = """[{"id":30,"body":"Is 5 s enough on the runner?","user":${user("ada")},"created_at":"$NOW","path":"src/clone.ts","position":3,"pull_request_review_id":7,"diff_hunk":"@@ -1,3 +1,4 @@\n const ssh = connect()\n-await clone(ssh)\n+await waitForBanner(ssh, 5000)"}]"""
		val COMMITS get() = """[{"sha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","commit":{"message":"Wait for the SSH banner","author":{"name":"kiwi","date":"$NOW"}},"author":${user("kiwi")}}]"""
		const val CODE = "const ssh = connect()\n// The server says hello first: wait for its banner.\nawait waitForBanner(ssh, 5000)\nawait clone(ssh)\n"
		const val DIFF = "diff --git a/src/clone.ts b/src/clone.ts\nindex 1111111..2222222 100644\n--- a/src/clone.ts\n+++ b/src/clone.ts\n@@ -1,3 +1,4 @@\n const ssh = connect()\n-await clone(ssh)\n+// The server says hello first: wait for its banner.\n+await waitForBanner(ssh, 5000)\n+await clone(ssh)\n"
		const val HIGHLIGHT = """{"lang":"text","lines":[]}"""
		val TREE get() = """[{"name":"src","path":"src","type":"dir"},{"name":"README.md","path":"README.md","type":"file","size":80},{"name":"clone.ts","path":"src/clone.ts","type":"file","size":120}]"""
		fun run(n: Int, status: String, jobs: Boolean = false) = """{"id":$n,"index_in_repo":$n,"title":"Run tests","name":"ci","workflow_id":"ci.yml","event":"push","status":"$status","commit_sha":"bbbbbbb","prettyref":"main","trigger_user":${user("kiwi")},"created":"$NOW"""" +
			(if (jobs) ""","jobs":[{"id":9,"name":"test","status":"$status","steps":[{"id":0,"result":"success","log_index":1,"log_length":2},{"id":1,"log_index":3,"log_length":2,"started_at":"$NOW"}],"step_names":["Check out","Run bun test"]}]""" else "") + "}"
		const val LOG = "2026-11-16T09:00:00.000Z Set up runner\n2026-11-16T09:00:01.000Z Checking out\n2026-11-16T09:00:02.000Z Done\n2026-11-16T09:00:03.000Z $ bun test\n2026-11-16T09:00:04.000Z 108 pass"
		val AGENTS get() = """{"pending":[{"id":"a1","keyName":"Claude","repo":"ada/garden","tool":"merge_pull_request","args":{"number":12},"at":"$NOW"}],"activity":[{"at":"$NOW","name":"Claude","repo":"ada/garden","action":"opened #12"}],"keys":[{"id":"k1","name":"Claude","repos":["ada/garden"]}],"t3":null}"""
		val COMMENTS = """[{"id":1,"body":"Looks good. Can we keep the old timeout as a fallback?","user":${user("ada")},"created_at":"$NOW"},""" +
			"""{"id":2,"body":"Done in the second commit.","user":${user("kiwi")},"created_at":"$NOW"}]"""
	}
}
