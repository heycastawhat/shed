package dev.shed.app.ui

import android.util.Base64
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import coil3.compose.AsyncImage
import dev.shed.app.ApiError
import dev.shed.app.Blame
import dev.shed.app.Branch
import dev.shed.app.Commit
import dev.shed.app.Entry
import dev.shed.app.FileContent
import dev.shed.app.Release
import dev.shed.app.RepoInfo
import dev.shed.app.Tag
import dev.shed.app.Token
import java.net.URLEncoder
import kotlinx.serialization.json.put

private fun enc(path: String) = path.split('/').joinToString("/") { URLEncoder.encode(it, "UTF-8").replace("+", "%20") }

// A branch or tag picker for the code screens' titles.
@Composable
private fun RefButton(owner: String, repo: String, ref: String, onPick: (String) -> Unit) {
	var open by remember { mutableStateOf(false) }
	FilterChip(selected = false, onClick = { open = true }, label = { Text(ref, maxLines = 1, overflow = TextOverflow.Ellipsis) }, leadingIcon = { Icon(ShedIcons.branch, null) }, modifier = Modifier.padding(end = 8.dp))
	if (open) {
		val api = LocalApi.current
		val l = rememberLoad(api, owner, repo) { api.get<List<Branch>>("/repos/$owner/$repo/branches?limit=100").map { it.name } + api.get<List<Tag>>("/repos/$owner/$repo/tags?limit=100").map { it.name } }
		(l.state as? Load.Ok)?.value?.let { refs ->
			PickSheet("Branch or tag", refs, setOf(ref), key = { it }, multi = false, action = "Switch", row = { Text(it) }, onDismiss = { open = false }) { picked -> picked.firstOrNull()?.let(onPick) }
		}
	}
}

// A folder: its entries (folders first), then its README.
@Composable
fun TreeScreen(r: TreeRoute) {
	val api = LocalApi.current
	val nav = LocalNav.current
	val base = "/repos/${r.owner}/${r.repo}"
	val l = rememberLoad(api, r) {
		val list = api.get<List<Entry>>("$base/contents${if (r.path.isEmpty()) "" else "/" + enc(r.path)}?ref=${URLEncoder.encode(r.ref, "UTF-8")}")
			.sortedWith(compareBy({ it.type != "dir" }, { it.name.lowercase() }))
		val readme = list.firstOrNull { it.type == "file" && it.name.lowercase().startsWith("readme") }?.let { f ->
			try { api.text("$base/raw/${enc(f.path)}?ref=${URLEncoder.encode(r.ref, "UTF-8")}") } catch (e: ApiError) { null }
		}
		list to readme
	}
	BackPage(r.path.substringAfterLast('/').ifEmpty { r.repo }, if (r.path.isEmpty()) r.owner else "${r.repo}/${r.path}", trailing = {
		RefButton(r.owner, r.repo, r.ref) { nav.navigate(TreeRoute(r.owner, r.repo, it, "")) }
	}) {
		Loading(l) { (entries, readme) ->
			LazyColumn(contentPadding = PaddingValues(bottom = pageClearance())) {
				item {
					Row(Modifier.padding(horizontal = 12.dp, vertical = 4.dp)) {
						TextButton(onClick = { nav.navigate(CommitsRoute(r.owner, r.repo, r.ref, r.path)) }) { Icon(ShedIcons.history, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("History") }
					}
				}
				items(entries, key = { it.path }) { e ->
					CardRow({
						when (e.type) {
							"dir" -> nav.navigate(TreeRoute(r.owner, r.repo, r.ref, e.path))
							else -> nav.navigate(FileRoute(r.owner, r.repo, r.ref, e.path))
						}
					}) {
						Row(Modifier.padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
							ShedIcon(if (e.type == "dir") ShedIcons.folder else ShedIcons.file, 20.dp, if (e.type == "dir") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
							Text(e.name, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
							if (e.type == "file") Text(size(e.size), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
						}
					}
				}
				if (readme != null) item {
					Surface(shape = RoundedCornerShape(24.dp), color = MaterialTheme.colorScheme.surfaceContainerLow, modifier = Modifier.fillMaxWidth().padding(12.dp)) {
						Column(Modifier.padding(20.dp)) { MarkdownText(readme, repo = RepoRoute(r.owner, r.repo), ref = r.ref, dir = r.path) }
					}
				}
			}
		}
	}
}

fun size(n: Long): String = when {
	n < 1024 -> "$n B"
	n < 1024 * 1024 -> "%.1f KB".format(n / 1024.0)
	else -> "%.1f MB".format(n / 1024.0 / 1024.0)
}

private val IMAGES = setOf("png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "avif")

// A file: highlighted code, a rendered Markdown file (with Code to switch), an image, or blame.
@Composable
fun FileScreen(r: FileRoute) {
	val api = LocalApi.current
	val nav = LocalNav.current
	val ctx = LocalContext.current
	val base = "/repos/${r.owner}/${r.repo}"
	val ext = r.path.substringAfterLast('.', "").lowercase()
	val image = ext in IMAGES
	val markdown = ext == "md" || ext == "markdown"
	var mode by rememberSaveable { mutableStateOf(if (markdown) "preview" else "code") }
	var menu by remember { mutableStateOf(false) }
	var editing by remember { mutableStateOf(false) }
	val send = rememberSend()
	val rawUrl = "${api.account.server}/api/v1$base/raw/${enc(r.path)}?ref=${URLEncoder.encode(r.ref, "UTF-8")}"
	val l = rememberLoad(api, r) {
		if (image) null
		else {
			val f = api.get<FileContent>("$base/contents/${enc(r.path)}?ref=${URLEncoder.encode(r.ref, "UTF-8")}")
			val bytes = f.content?.let { Base64.decode(it, Base64.DEFAULT) }
			f to bytes?.takeIf { b -> b.take(8000).none { it == 0.toByte() } }?.toString(Charsets.UTF_8)
		}
	}
	BackPage(r.path.substringAfterLast('/'), "${r.repo} · ${r.ref}", trailing = {
		Box {
			IconButton(onClick = { menu = true }) { Icon(ShedIcons.more, "More") }
			DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
				if (markdown) DropdownMenuItem(text = { Text(if (mode == "preview") "Show code" else "Show preview") }, onClick = { menu = false; mode = if (mode == "preview") "code" else "preview" })
				if (!image && (l.state as? Load.Ok)?.value?.second != null) DropdownMenuItem(text = { Text("Edit") }, onClick = { menu = false; editing = true })
				if (!image) DropdownMenuItem(text = { Text(if (mode == "blame") "Hide blame" else "Blame") }, onClick = { menu = false; mode = if (mode == "blame") "code" else "blame" })
				DropdownMenuItem(text = { Text("History") }, onClick = { menu = false; nav.navigate(CommitsRoute(r.owner, r.repo, r.ref, r.path)) })
				DropdownMenuItem(text = { Text("Open in browser") }, onClick = {
					menu = false
					CustomTabsIntent.Builder().build().launchUrl(ctx, "${api.account.server}/${r.owner}/${r.repo}/blob/${enc(r.ref)}/${enc(r.path)}".toUri())
				})
			}
		}
	}) {
		if (image) Box(Modifier.fillMaxSize().padding(16.dp), Alignment.Center) { AsyncImage(rawUrl, r.path, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxWidth()) }
		else Loading(l) { pair ->
			val (f, text) = pair!!
			when {
				text == null -> EmptyState(if (f.content == null) "Too big to show" else "Binary file", "${size(f.size)}. Open it in the browser to download it.", ShedIcons.file)
				mode == "blame" -> BlameView(r)
				mode == "preview" -> Column(Modifier.fillMaxSize().verticalScrollState().padding(horizontal = 20.dp).padding(bottom = pageClearance())) {
					MarkdownText(text, repo = RepoRoute(r.owner, r.repo), ref = r.ref, dir = r.path.substringBeforeLast('/', ""))
				}
				else -> CodeView(r.path, text.removeSuffix("\n").split('\n'), Modifier.fillMaxSize(), bottom = pageClearance())
			}
			// Edit and commit straight to this branch, as the web's editor does.
			if (editing && text != null) {
				var message by remember { mutableStateOf("Update ${r.path.substringAfterLast('/')}") }
				ComposeSheet("Edit ${r.path.substringAfterLast('/')}", initial = text, action = "Commit to ${r.ref}", extra = {
					androidx.compose.material3.OutlinedTextField(message, { message = it }, label = { Text("Commit message") }, singleLine = true, modifier = Modifier.fillMaxWidth())
				}, onDismiss = { editing = false }) { changed ->
					api.send("PUT", "$base/contents/${enc(r.path)}", kotlinx.serialization.json.buildJsonObject {
						put("content", Base64.encodeToString(changed.toByteArray(), Base64.NO_WRAP))
						put("sha", f.sha)
						put("message", message)
						put("branch", r.ref)
					}.toString())
					l.reload()
				}
			}
		}
	}
}

@Composable
private fun Modifier.verticalScrollState() = this.then(Modifier.verticalScroll(rememberScrollState()))

// Blame as ranges: each run of lines under the commit that last changed it.
@Composable
private fun BlameView(r: FileRoute) {
	val api = LocalApi.current
	val nav = LocalNav.current
	val l = rememberLoad(api, r, "blame") { api.get<Blame>("/repos/${r.owner}/${r.repo}/blame/${enc(r.path)}?ref=${URLEncoder.encode(r.ref, "UTF-8")}") }
	Loading(l) { b ->
		val tokens = rememberHighlight(r.path, b.lines)
		val dark = isDark()
		val c = MaterialTheme.colorScheme
		LazyColumn(contentPadding = PaddingValues(bottom = pageClearance())) {
			for (range in b.ranges) {
				val commit = b.commits[range.sha]
				item(key = "h${range.start}") {
					Row(
						Modifier.fillMaxWidth().padding(top = 6.dp).background(c.surfaceContainerHigh).clickableRow { nav.navigate(CommitRoute(r.owner, r.repo, range.sha)) }.padding(horizontal = 12.dp, vertical = 6.dp),
						horizontalArrangement = Arrangement.spacedBy(8.dp)
					) {
						Text(commit?.summary ?: range.sha.take(7), style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
						Text("${commit?.author ?: ""} · ${commit?.let { java.time.Instant.ofEpochSecond(it.time).toString().let(::ago) } ?: ""}", style = MaterialTheme.typography.labelMedium, color = c.onSurfaceVariant)
					}
				}
				items((range.start until range.start + range.count).toList(), key = { "l$it" }) { n ->
					Row(Modifier.fillMaxWidth().padding(end = 12.dp)) {
						Text("$n", style = CodeStyle, color = c.onSurfaceVariant.copy(alpha = 0.55f), modifier = Modifier.width(44.dp).padding(end = 8.dp), textAlign = androidx.compose.ui.text.style.TextAlign.End)
						Text(tokensToText(b.lines.getOrElse(n - 1) { "" }, tokens?.getOrNull(n - 1), dark), style = CodeStyle, color = c.onSurface, modifier = Modifier.weight(1f))
					}
				}
			}
		}
	}
}

// History of a branch, or of one path on it, 50 at a time.
@Composable
fun CommitsScreen(r: CommitsRoute) {
	val api = LocalApi.current
	val nav = LocalNav.current
	var pages by rememberSaveable { mutableIntStateOf(1) }
	val l = rememberLoad(api, r, pages) {
		(1..pages).flatMap { p -> api.get<List<Commit>>("/repos/${r.owner}/${r.repo}/commits?sha=${URLEncoder.encode(r.ref, "UTF-8")}&limit=50&page=$p" + if (r.path.isNotEmpty()) "&path=${URLEncoder.encode(r.path, "UTF-8")}" else "") }
	}
	BackPage("Commits", if (r.path.isEmpty()) "${r.repo} · ${r.ref}" else r.path, trailing = {
		RefButton(r.owner, r.repo, r.ref) { nav.navigate(CommitsRoute(r.owner, r.repo, it, r.path)) }
	}) {
		Loading(l) { list ->
			LazyColumn(contentPadding = PaddingValues(bottom = pageClearance())) {
				items(list, key = { it.sha }) { c -> CommitRow(c) { nav.navigate(CommitRoute(r.owner, r.repo, c.sha)) } }
				if (list.size == pages * 50) item { TextButton(onClick = { pages++ }, modifier = Modifier.fillMaxWidth().padding(8.dp)) { Text("Load more") } }
			}
		}
	}
}

// One commit: its message and author, then its diff.
@Composable
fun CommitScreen(r: CommitRoute) {
	val api = LocalApi.current
	val nav = LocalNav.current
	val base = "/repos/${r.owner}/${r.repo}"
	val l = rememberLoad(api, r) { api.get<Commit>("$base/git/commits/${r.sha}") to parseDiff(api.text("$base/git/commits/${r.sha}.diff")) }
	val closed = remember { mutableStateMapOf<String, Boolean>() }
	val tokens = remember { mutableStateMapOf<String, List<List<Token>>>() }
	BackPage(r.sha.take(7), "${r.owner}/${r.repo}") {
		Loading(l) { (c, files) ->
			LaunchedEffect(files) { for (f in files) if (!f.binary && f.lines.size <= 3000 && f.path !in tokens) highlight(api, f.path, f.code)?.let { tokens[f.path] = it } }
			LazyColumn(contentPadding = PaddingValues(bottom = pageClearance())) {
				item {
					Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
						Text(c.title, style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold))
						if (c.description.isNotBlank()) Text(c.description, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
						Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
							Avatar(c.author?.avatarUrl ?: "", 22.dp)
							Text("${c.author?.login ?: c.commit.author.name} committed ${ago(c.commit.author.date)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
						}
						Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
							FilterChip(selected = false, onClick = { nav.navigate(TreeRoute(r.owner, r.repo, c.sha, "")) }, label = { Text("Browse files") }, leadingIcon = { Icon(ShedIcons.code, null) })
							c.parents.forEach { p -> FilterChip(selected = false, onClick = { nav.navigate(CommitRoute(r.owner, r.repo, p.sha)) }, label = { Text("Parent ${p.sha.take(7)}") }) }
						}
						Text("${files.size} files · +${files.sumOf { it.additions }} −${files.sumOf { it.deletions }}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
					}
				}
				for (f in files) {
					val open = closed[f.path] != true
					item(key = "h:${f.path}") { DiffFileHeader(f, open) { closed[f.path] = open } }
					if (open) diffLines(f, tokens[f.path], f.path)
				}
			}
		}
	}
}

// Branches (newest first, the default on top) and tags.
@Composable
fun BranchesScreen(r: BranchesRoute) {
	val api = LocalApi.current
	val nav = LocalNav.current
	var tab by rememberSaveable { mutableIntStateOf(0) }
	val l = rememberLoad(api, r) {
		val repo = api.get<RepoInfo>("/repos/${r.owner}/${r.repo}")
		Triple(repo, api.get<List<Branch>>("/repos/${r.owner}/${r.repo}/branches?limit=100"), api.get<List<Tag>>("/repos/${r.owner}/${r.repo}/tags?limit=100"))
	}
	BackPage("Branches", "${r.owner}/${r.repo}") {
		Loading(l) { (repo, branches, tags) ->
			Column {
				PrimaryTabRow(selectedTabIndex = tab, containerColor = MaterialTheme.colorScheme.surfaceContainerLowest) {
					Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Branches ${branches.size}") })
					Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Tags ${tags.size}") })
				}
				LazyColumn(contentPadding = PaddingValues(top = 8.dp, bottom = pageClearance())) {
					if (tab == 0) items(branches.sortedWith(compareBy<Branch>({ it.name != repo.defaultBranch }).thenByDescending { it.commit.timestamp }), key = { it.name }) { b ->
						CardRow({ nav.navigate(TreeRoute(r.owner, r.repo, b.name, "")) }) {
							Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
								Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
									Text(b.name, style = MaterialTheme.typography.titleSmall.copy(fontFamily = CodeStyle.fontFamily))
									if (b.name == repo.defaultBranch) Text("default", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
									if (b.protected) ShedIcon(ShedIcons.shield, 14.dp)
								}
								Text("${b.commit.message.substringBefore('\n')} · ${ago(b.commit.timestamp)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
							}
						}
					}
					else items(tags, key = { it.name }) { t ->
						CardRow({ nav.navigate(TreeRoute(r.owner, r.repo, t.name, "")) }) {
							Row(Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
								ShedIcon(ShedIcons.tag, 18.dp)
								Text(t.name, style = MaterialTheme.typography.titleSmall.copy(fontFamily = CodeStyle.fontFamily), modifier = Modifier.weight(1f))
								Text(t.commit.sha.take(7), style = CodeStyle, color = MaterialTheme.colorScheme.onSurfaceVariant)
							}
						}
					}
				}
			}
		}
	}
}

@Composable
fun ReleasesScreen(r: ReleasesRoute) {
	val api = LocalApi.current
	val ctx = LocalContext.current
	val nav = LocalNav.current
	val l = rememberLoad(api, r) { api.get<List<Release>>("/repos/${r.owner}/${r.repo}/releases?limit=50") }
	BackPage("Releases", "${r.owner}/${r.repo}") {
		Loading(l) { list ->
			if (list.isEmpty()) EmptyState("No releases", "Releases made on the web show up here.", ShedIcons.release)
			else LazyColumn(contentPadding = PaddingValues(bottom = pageClearance())) {
				items(list, key = { it.id }) { rel ->
					Surface(shape = RoundedCornerShape(24.dp), color = MaterialTheme.colorScheme.surfaceContainerLow, modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)) {
						Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
							Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
								Text(rel.name.ifBlank { rel.tag }, style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold), modifier = Modifier.weight(1f, fill = false))
								if (rel.prerelease) Text("Pre-release", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.tertiary)
								if (rel.draft) Text("Draft", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
							}
							Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
								FilterChip(selected = false, onClick = { nav.navigate(TreeRoute(r.owner, r.repo, rel.tag, "")) }, label = { Text(rel.tag) }, leadingIcon = { Icon(ShedIcons.tag, null) })
								Text("${rel.author?.login ?: ""} · ${ago(rel.publishedAt ?: rel.createdAt)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
							}
							if (rel.body.isNotBlank()) MarkdownText(rel.body, repo = RepoRoute(r.owner, r.repo), ref = rel.tag)
							rel.assets.forEach { a ->
								Row(
									Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surfaceContainerHigh)
										.clickableRow { CustomTabsIntent.Builder().build().launchUrl(ctx, a.url.toUri()) }.padding(12.dp),
									horizontalArrangement = Arrangement.spacedBy(10.dp),
									verticalAlignment = Alignment.CenterVertically
								) {
									ShedIcon(ShedIcons.download, 18.dp)
									Text(a.name, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
									Text(size(a.size), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
								}
							}
						}
					}
				}
			}
		}
	}
}
