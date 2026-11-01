package om.salalah.infoscreen.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.tv.material3.Text
import kotlin.math.roundToInt

/**
 * Arabic news crawl: text enters from the left edge and moves right, so the start of
 * each (right-to-left) headline is read first. Positions are absolute, not mirrored.
 */
@Composable
fun NewsTicker(text: String, style: TextStyle, modifier: Modifier = Modifier, speedDpPerSecond: Float = 70f) {
    val progress = remember { Animatable(0f) }
    var containerWidth by remember { mutableIntStateOf(0) }
    var textWidth by remember { mutableIntStateOf(0) }
    val pxPerSecond = with(LocalDensity.current) { speedDpPerSecond.dp.toPx() }

    LaunchedEffect(text, containerWidth, textWidth) {
        if (containerWidth == 0 || textWidth == 0) return@LaunchedEffect
        val durationMs = ((containerWidth + textWidth) / pxPerSecond * 1000).roundToInt()
        while (true) {
            progress.snapTo(0f)
            progress.animateTo(1f, tween(durationMs, easing = LinearEasing))
        }
    }

    Layout(
        content = { Text(text, style = style, maxLines = 1, softWrap = false) },
        modifier = modifier.clipToBounds(),
    ) { measurables, constraints ->
        val placeable = measurables.first().measure(Constraints(maxHeight = constraints.maxHeight))
        val width = constraints.maxWidth
        if (containerWidth != width) containerWidth = width
        if (textWidth != placeable.width) textWidth = placeable.width
        layout(width, placeable.height) {
            val x = -placeable.width + progress.value * (width + placeable.width)
            placeable.place(x.roundToInt(), 0)
        }
    }
}
