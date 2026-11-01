package om.salalah.infoscreen.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import om.salalah.infoscreen.data.DayPrayers
import om.salalah.infoscreen.data.Prayer
import java.time.ZonedDateTime
import kotlin.random.Random

enum class SkyPhase(val top: Color, val bottom: Color, val stars: Float) {
    NIGHT(Color(0xFF070B1E), Color(0xFF16224A), 1f),
    DAWN(Color(0xFF1F2A5C), Color(0xFF9A5A7E), 0.4f),
    MORNING(Color(0xFF2C6E9E), Color(0xFFD99A6C), 0f),
    DAY(Color(0xFF15558C), Color(0xFF3E8CC4), 0f),
    AFTERNOON(Color(0xFF2A5B8A), Color(0xFFC8873E), 0f),
    SUNSET(Color(0xFF4A2C63), Color(0xFFD9653B), 0f),
    DUSK(Color(0xFF151A3E), Color(0xFF5A2D5E), 0.6f),
}

fun skyPhase(now: ZonedDateTime, day: DayPrayers?): SkyPhase {
    if (day == null) {
        return when (now.hour) {
            in 5..5 -> SkyPhase.DAWN
            in 6..8 -> SkyPhase.MORNING
            in 9..14 -> SkyPhase.DAY
            in 15..16 -> SkyPhase.AFTERNOON
            17 -> SkyPhase.SUNSET
            18 -> SkyPhase.DUSK
            else -> SkyPhase.NIGHT
        }
    }
    val fajr = day.at(Prayer.FAJR)
    val sunrise = day.at(Prayer.SUNRISE)
    val maghrib = day.at(Prayer.MAGHRIB)
    return when {
        now.isBefore(fajr) -> SkyPhase.NIGHT
        now.isBefore(sunrise) -> SkyPhase.DAWN
        now.isBefore(sunrise.plusHours(2)) -> SkyPhase.MORNING
        now.isBefore(day.at(Prayer.ASR)) -> SkyPhase.DAY
        now.isBefore(maghrib.minusMinutes(40)) -> SkyPhase.AFTERNOON
        now.isBefore(maghrib.plusMinutes(20)) -> SkyPhase.SUNSET
        now.isBefore(day.at(Prayer.ISHA)) -> SkyPhase.DUSK
        else -> SkyPhase.NIGHT
    }
}

@Composable
fun SkyBackground(phase: SkyPhase, modifier: Modifier = Modifier) {
    val top by animateColorAsState(phase.top, tween(8_000), label = "top")
    val bottom by animateColorAsState(phase.bottom, tween(8_000), label = "bottom")
    val stars by animateFloatAsState(phase.stars, tween(8_000), label = "stars")
    val points = remember { List(90) { Random(it * 31 + 7).let { r -> Triple(r.nextFloat(), r.nextFloat() * 0.6f, r.nextFloat()) } } }

    Box(modifier.fillMaxSize().background(Brush.verticalGradient(listOf(top, bottom)))) {
        if (stars > 0.01f) {
            Canvas(Modifier.fillMaxSize()) {
                points.forEach { (x, y, s) ->
                    drawCircle(
                        Color.White.copy(alpha = stars * (0.25f + 0.55f * s)),
                        radius = 0.8f + s * 1.8f,
                        center = Offset(x * size.width, y * size.height),
                    )
                }
            }
        }
        // Dim slightly so white text stays readable on the brighter daytime skies.
        Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.18f)))
    }
}
