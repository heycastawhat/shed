package dev.shed.app.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.mikepenz.markdown.coil3.Coil3ImageTransformerImpl
import com.mikepenz.markdown.m3.Markdown

// Comments and READMEs. Links and images relative to the server (avatars, attachments) are made absolute first.
@Composable
fun MarkdownText(text: String, modifier: Modifier = Modifier) {
	val server = LocalApi.current.account.server
	val fixed = text.replace(Regex("""(\]\()(/[^)\s]*)""")) { "${it.groupValues[1]}$server${it.groupValues[2]}" }
	Markdown(content = fixed, modifier = modifier, imageTransformer = Coil3ImageTransformerImpl)
}
