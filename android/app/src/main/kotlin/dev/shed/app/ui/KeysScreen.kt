package dev.shed.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.shed.app.SshKey
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

// SSH keys for git over SSH, as the web's Settings → SSH keys.
@Composable
fun KeysScreen() {
	val api = LocalApi.current
	val send = rememberSend()
	var adding by remember { mutableStateOf(false) }
	val l = rememberLoad(api) { api.get<List<SshKey>>("/user/keys") }
	BackPage("SSH keys") {
		Box(Modifier.fillMaxSize()) {
			Loading(l) { keys ->
				if (keys.isEmpty()) EmptyState("No SSH keys", "Add one to push and pull over SSH.", ShedIcons.key)
				else LazyColumn(contentPadding = PaddingValues(bottom = 100.dp)) {
					items(keys, key = { it.id }) { k ->
						CardRow({}) {
							Row(Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
								ShedIcon(ShedIcons.key, 20.dp)
								Column(Modifier.weight(1f)) {
									Text(k.title, style = MaterialTheme.typography.titleSmall)
									Text(k.fingerprint.ifBlank { k.key.take(40) }, style = CodeStyle, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
									Text("Added ${ago(k.createdAt)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
								}
								TextButton(onClick = { send { api.send("DELETE", "/user/keys/${k.id}"); l.reload() } }) { Text("Remove") }
							}
						}
					}
				}
			}
			ExtendedFloatingActionButton(onClick = { adding = true }, icon = { Icon(ShedIcons.plus, null) }, text = { Text("Add key") }, modifier = Modifier.align(Alignment.BottomEnd).navigationBarsPadding().padding(16.dp))
		}
	}
	if (adding) {
		var title by remember { mutableStateOf("") }
		ComposeSheet("Add an SSH key", action = "Add", extra = {
			OutlinedTextField(title, { title = it }, label = { Text("Name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
		}, onDismiss = { adding = false }) { key ->
			api.send("POST", "/user/keys", buildJsonObject { put("title", title.ifBlank { "Key" }); put("key", key.trim()) }.toString())
			l.reload()
		}
	}
}
