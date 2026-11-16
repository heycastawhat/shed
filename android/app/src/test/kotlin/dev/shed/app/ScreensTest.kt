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
					else -> return MockResponse.Builder().code(404).body("""{"message":"not found"}""").build()
				}
				return MockResponse.Builder().addHeader("content-type", "application/json").body(body).build()
			}
		}
		server.start()
	}

	@After fun stop() = server.close()

	private fun shell(dark: Boolean) = rule.setContent {
		ShedTheme(mode = if (dark) "dark" else "light") { Shell(Account(server.url("/").toString().trimEnd('/'), "ada", "token"), emptyFlow()) }
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
				""""subject":{"title":"$title","type":"$type","state":"$state","html_url":"http://shed/ada/garden/${if (type == "Pull") "pulls" else "issues"}/$n"}}"""
		val NOTIFICATIONS = "[${thread(1, "Fix flaky clone test over SSH", "Pull", "open", true, 12)},${thread(2, "Release 0.4 checklist", "Issue", "open", true, 7)},${thread(3, "Move CI to the new runner", "Pull", "merged", false, 5)}]"
		val COMMENTS = """[{"id":1,"body":"Looks good. Can we keep the old timeout as a fallback?","user":${user("ada")},"created_at":"$NOW"},""" +
			"""{"id":2,"body":"Done in the second commit.","user":${user("kiwi")},"created_at":"$NOW"}]"""
	}
}
