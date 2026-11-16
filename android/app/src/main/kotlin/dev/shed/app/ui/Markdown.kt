package dev.shed.app.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import com.mikepenz.markdown.coil3.Coil3ImageTransformerImpl
import com.mikepenz.markdown.m3.Markdown
import com.mikepenz.markdown.m3.markdownTypography

// Comments and READMEs. Links and images relative to the server (avatars, attachments) are made absolute first.
// Headings are scaled to the app's own sizes: the library's defaults start at display size.
// In a repo (READMEs, files), relative links and images resolve against it: images to its raw files, links to its pages.
@Composable
fun MarkdownText(text: String, modifier: Modifier = Modifier, repo: RepoRoute? = null, ref: String = "", dir: String = "") {
	val server = LocalApi.current.account.server
	var fixed = text.replace(Regex("""(\]\()(/[^)\s]*)""")) { "${it.groupValues[1]}$server${it.groupValues[2]}" }
	if (repo != null) {
		val here = if (dir.isEmpty()) "" else "$dir/"
		val api = "$server/api/v1/repos/${repo.owner}/${repo.repo}/raw"
		fixed = fixed
			.replace(Regex("""!\[([^\]]*)\]\((?!https?:|/)([^)\s]+)\)""")) { "![${it.groupValues[1]}]($api/$here${it.groupValues[2]}?ref=$ref)" }
			.replace(Regex("""(?<!!)\[([^\]]*)\]\((?!https?:|#|mailto:|/)([^)\s]+)\)""")) { "[${it.groupValues[1]}]($server/${repo.owner}/${repo.repo}/blob/$ref/$here${it.groupValues[2]})" }
	}
	val t = MaterialTheme.typography
	Markdown(
		content = fixed,
		modifier = modifier,
		imageTransformer = Coil3ImageTransformerImpl,
		typography = markdownTypography(
			h1 = t.headlineSmall.copy(fontWeight = FontWeight.Bold),
			h2 = t.titleLarge.copy(fontWeight = FontWeight.Bold),
			h3 = t.titleMedium.copy(fontWeight = FontWeight.Bold),
			h4 = t.titleSmall.copy(fontWeight = FontWeight.Bold),
			h5 = t.titleSmall,
			h6 = t.labelLarge,
			text = t.bodyLarge,
			paragraph = t.bodyLarge
		)
	)
}
