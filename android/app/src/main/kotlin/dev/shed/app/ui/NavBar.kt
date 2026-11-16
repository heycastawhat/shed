package dev.shed.app.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

/** A place in the [FloatingNavBar]. */
data class NavPlace(val route: Any, val label: String, val icon: ImageVector, val selectedIcon: ImageVector)

private val GAP = 6.dp

/**
 * The tabs as a floating pill in Sink's colours, but steady: always the same width, centred, every place the same size
 * with its icon and name, and only the selected capsule sliding (with a spring) to the place you pick.
 */
@Composable
fun FloatingNavBar(places: List<NavPlace>, selected: Any?, badges: Map<Any, Int>, onSelect: (NavPlace) -> Unit, modifier: Modifier = Modifier) {
	val colors = navBarColors()
	val index = places.indexOfFirst { it.route == selected }
	BoxWithConstraints(
		modifier
			.widthIn(max = 440.dp)
			.fillMaxWidth()
			.height(TOOLBAR_HEIGHT)
			.shadow(8.dp, CircleShape, ambientColor = Color.Black, spotColor = Color.Black)
			.background(colors.container, CircleShape)
			.padding(GAP)
	) {
		val slot = maxWidth / places.size
		val x by animateDpAsState(slot * index.coerceAtLeast(0), MaterialTheme.motionScheme.defaultSpatialSpec(), label = "nav-capsule")
		if (index >= 0) Box(Modifier.offset(x = x).width(slot).fillMaxHeight().clip(CircleShape).background(colors.indicator))
		Row(Modifier.fillMaxWidth().fillMaxHeight().selectableGroup()) {
			places.forEachIndexed { i, p -> Place(p, i == index, badges[p.route] ?: 0, colors, Modifier.weight(1f)) { onSelect(p) } }
		}
	}
}

@Composable
private fun Place(place: NavPlace, selected: Boolean, badge: Int, colors: NavBarColors, modifier: Modifier, onClick: () -> Unit) {
	val content by animateColorAsState(if (selected) colors.selected else colors.unselected, MaterialTheme.motionScheme.defaultEffectsSpec(), label = "nav-content")
	Column(
		modifier
			.fillMaxHeight()
			.clip(CircleShape)
			.selectable(selected = selected, onClick = onClick, role = Role.Tab, interactionSource = remember { MutableInteractionSource() }, indication = ripple())
			.semantics { contentDescription = if (badge > 0) "${place.label}, $badge new" else place.label },
		horizontalAlignment = Alignment.CenterHorizontally,
		verticalArrangement = Arrangement.Center
	) {
		BadgedBox(badge = { if (badge > 0) Badge { Text(if (badge > 99) "99+" else "$badge") } }) {
			Icon(if (selected) place.selectedIcon else place.icon, null, tint = content, modifier = Modifier.size(22.dp))
		}
		Text(
			place.label,
			style = MaterialTheme.typography.labelSmall,
			fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
			color = content,
			maxLines = 1,
			overflow = TextOverflow.Clip,
			modifier = Modifier.padding(top = 2.dp)
		)
	}
}

private class NavBarColors(val container: Color, val indicator: Color, val selected: Color, val unselected: Color)

// Sink's: a pill a little tinted towards the primary container, the open place's capsule stronger still.
@Composable
private fun navBarColors(): NavBarColors {
	val s = MaterialTheme.colorScheme
	val dark = s.surface.luminance() < 0.5f
	return NavBarColors(
		container = lerp(if (dark) s.surfaceContainer else s.surfaceContainerHigh, s.primaryContainer, if (dark) 0.3f else 0.2f),
		indicator = if (dark) lerp(s.surfaceContainerHighest, s.primaryContainer, 0.85f) else s.primaryContainer,
		selected = if (dark) s.primary else s.onPrimaryContainer,
		unselected = s.onSurfaceVariant
	)
}
