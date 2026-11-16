package dev.shed.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.UriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import dev.shed.app.ApiError
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

@Serializable private data class WikiPageRef(val title: String, val sub_url: String)
@Serializable private data class WikiPage(val title: String, val sub_url: String, val content: String = "")

// A repo's wiki: a page (Home by default) with the list of pages, and editing for those who can write.
@Composable
fun WikiScreen(r: WikiRoute) {
	val api = LocalApi.current
	val nav = LocalNav.current
	val send = rememberSend()
	val base = "/repos/${r.owner}/${r.repo}/wiki"
	val name = r.page.ifEmpty { "Home" }
	var editing by remember { mutableStateOf<String?>(null) }
	var menu by remember { mutableStateOf(false) }
	val l = rememberLoad(api, r) {
		val pages = api.get<List<WikiPageRef>>("$base/pages")
		val page = try { api.get<WikiPage>("$base/page/${java.net.URLEncoder.encode(name, "UTF-8")}") } catch (e: ApiError) { if (e.status == 404) null else throw e }
		pages to page
	}
	BackPage(name.replace('-', ' '), "${r.owner}/${r.repo} wiki", trailing = {
		Box {
			IconButton(onClick = { menu = true }) { Icon(ShedIcons.more, "More") }
			DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
				DropdownMenuItem(text = { Text("Edit page") }, onClick = { menu = false; editing = name })
				DropdownMenuItem(text = { Text("New page") }, onClick = { menu = false; editing = "" })
				DropdownMenuItem(text = { Text("Delete page") }, onClick = { menu = false; send { api.send("DELETE", "$base/page/${java.net.URLEncoder.encode(name, "UTF-8")}"); nav.popBackStack() } })
			}
		}
	}) {
		Loading(l) { (pages, page) ->
			// Links between pages open them here.
			val handler = LocalUriHandler.current
			val wikiLinks = remember(handler) {
				object : UriHandler {
					override fun openUri(uri: String) {
						val prefix = "${api.account.server}/${r.owner}/${r.repo}/wiki/"
						val local = if (!uri.contains("://")) uri else if (uri.startsWith(prefix)) uri.removePrefix(prefix) else null
						if (local != null) nav.navigate(WikiRoute(r.owner, r.repo, local.substringBefore('#'))) else handler.openUri(uri)
					}
				}
			}
			LazyColumn(contentPadding = PaddingValues(start = 20.dp, end = 20.dp, bottom = pageClearance())) {
				item {
					if (page == null) EmptyState("No page called $name", "Create it from the menu.", ShedIcons.wiki)
					else CompositionLocalProvider(LocalUriHandler provides wikiLinks) { MarkdownText(page.content) }
				}
				if (pages.size > 1) {
					item { SectionLabel("Pages", Modifier.padding(top = 24.dp, bottom = 8.dp)) }
					items(pages.filter { it.sub_url != name }, key = { it.sub_url }) { p -> Place(ShedIcons.file, p.title, "") { nav.navigate(WikiRoute(r.owner, r.repo, p.sub_url)) } }
				}
			}
			editing?.let { target ->
				val current = if (target == name) page?.content.orEmpty() else ""
				var title by remember { mutableStateOf(target.replace('-', ' ')) }
				ComposeSheet(if (target.isEmpty()) "New page" else "Edit ${title}", initial = current, action = "Save", extra = {
					androidx.compose.material3.OutlinedTextField(title, { title = it }, label = { Text("Title") }, singleLine = true, modifier = Modifier.fillMaxWidth())
				}, onDismiss = { editing = null }) { text ->
					val body = buildJsonObject { put("title", title); put("content", text) }.toString()
					if (target.isEmpty() || page == null) api.send("POST", "$base/new", body) else api.send("PATCH", "$base/page/${java.net.URLEncoder.encode(target, "UTF-8")}", body)
					l.reload()
				}
			}
		}
	}
}
