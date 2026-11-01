package om.salalah.infoscreen.ui

import android.util.Log
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.LocalContentColor
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.ProvideTextStyle
import androidx.tv.material3.Text
import androidx.tv.material3.darkColorScheme
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import om.salalah.infoscreen.Config
import om.salalah.infoscreen.R
import om.salalah.infoscreen.data.AppGraph
import om.salalah.infoscreen.data.ArabicDates
import om.salalah.infoscreen.data.DayPrayers
import om.salalah.infoscreen.data.Headline
import om.salalah.infoscreen.data.Prayer
import om.salalah.infoscreen.data.PrayerMoment
import om.salalah.infoscreen.data.Weather
import om.salalah.infoscreen.data.currentPrayer
import om.salalah.infoscreen.data.nextPrayer
import om.salalah.infoscreen.data.weatherInfo
import java.time.Duration
import java.time.ZonedDateTime
import kotlin.math.roundToInt
import kotlin.time.Duration.Companion.minutes

private val Tajawal = FontFamily(
    Font(R.font.tajawal_regular, FontWeight.Normal),
    Font(R.font.tajawal_bold, FontWeight.Bold),
    Font(R.font.tajawal_extrabold, FontWeight.ExtraBold),
)
private val Gold = Color(0xFFF4C95D)
private val Panel = Color.Black.copy(alpha = 0.28f)
private val Dim = Color.White.copy(alpha = 0.72f)
private val BaseStyle = TextStyle(
    fontFamily = Tajawal,
    color = Color.White,
    shadow = Shadow(Color.Black.copy(alpha = 0.45f), Offset(0f, 2f), 6f),
)
private const val TAG = "InfoScreen"

@Composable
fun InfoScreenApp(interactive: Boolean) {
    val context = LocalContext.current
    val app = remember { AppGraph.get(context) }
    val now by rememberNow()
    val today = now.toLocalDate()

    var refreshKey by remember { mutableIntStateOf(0) }
    var hijriOffset by remember { mutableIntStateOf(app.settings.hijriOffset) }
    var todayPrayers by remember { mutableStateOf<DayPrayers?>(null) }
    var tomorrowPrayers by remember { mutableStateOf<DayPrayers?>(null) }
    var prayersFailed by remember { mutableStateOf(false) }
    var weather by remember { mutableStateOf(app.weather.cached()) }
    var headlines by remember { mutableStateOf<List<Headline>>(emptyList()) }

    LaunchedEffect(today, refreshKey) {
        while (true) {
            try {
                todayPrayers = app.prayers.day(today)
                tomorrowPrayers = app.prayers.day(today.plusDays(1))
                prayersFailed = false
                break
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w(TAG, "prayer times failed", e)
                prayersFailed = true
                delay(1.minutes)
            }
        }
    }
    LaunchedEffect(refreshKey) {
        while (true) {
            val ok = try {
                weather = app.weather.load(); true
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w(TAG, "weather failed", e); false
            }
            delay(if (ok) 30.minutes else 3.minutes)
        }
    }
    LaunchedEffect(refreshKey) {
        while (true) {
            val loaded = try {
                app.news.load()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w(TAG, "news failed", e); emptyList()
            }
            if (loaded.isNotEmpty()) headlines = loaded
            delay(if (loaded.isNotEmpty()) 20.minutes else 3.minutes)
        }
    }

    MaterialTheme(colorScheme = darkColorScheme()) {
        CompositionLocalProvider(
            LocalLayoutDirection provides LayoutDirection.Rtl,
            LocalContentColor provides Color.White,
        ) {
            ProvideTextStyle(BaseStyle) {
                var showSettings by remember { mutableStateOf(false) }
                val rootFocus = remember { FocusRequester() }
                LaunchedEffect(showSettings) { if (interactive && !showSettings) rootFocus.requestFocus() }

                Box(
                    Modifier
                        .fillMaxSize()
                        .focusRequester(rootFocus)
                        .focusable(enabled = interactive && !showSettings)
                        .onKeyEvent { e ->
                            val open = e.type == KeyEventType.KeyUp &&
                                e.key in setOf(Key.DirectionCenter, Key.Enter, Key.NumPadEnter, Key.Menu)
                            if (open) showSettings = true
                            open
                        }
                ) {
                    Dashboard(
                        now = now,
                        today = todayPrayers,
                        tomorrow = tomorrowPrayers,
                        prayersFailed = prayersFailed,
                        weather = weather,
                        headlines = headlines,
                        hijri = ArabicDates.hijri(today, hijriOffset),
                        showHint = interactive,
                    )
                    if (interactive && showSettings) {
                        SettingsOverlay(
                            offset = hijriOffset,
                            preview = ArabicDates.hijri(today, hijriOffset),
                            onOffset = { hijriOffset = it; app.settings.hijriOffset = it },
                            onRefresh = {
                                app.prayers.invalidate()
                                refreshKey++
                                showSettings = false
                            },
                            onClose = { showSettings = false },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun rememberNow(): State<ZonedDateTime> = produceState(ZonedDateTime.now(Config.ZONE)) {
    while (true) {
        delay(1000L - System.currentTimeMillis() % 1000L)
        value = ZonedDateTime.now(Config.ZONE)
    }
}

@Composable
private fun Dashboard(
    now: ZonedDateTime,
    today: DayPrayers?,
    tomorrow: DayPrayers?,
    prayersFailed: Boolean,
    weather: Weather?,
    headlines: List<Headline>,
    hijri: String,
    showHint: Boolean,
) {
    val next = nextPrayer(now, today, tomorrow)
    // After Isha the row switches to tomorrow's times, with Fajr highlighted.
    val rowDay = if (next != null && next.at.toLocalDate() != now.toLocalDate()) tomorrow else today
    val isNight = today?.let { now.isBefore(it.at(Prayer.SUNRISE)) || !now.isBefore(it.at(Prayer.MAGHRIB)) }
        ?: (now.hour < 6 || now.hour >= 18)

    Box(Modifier.fillMaxSize()) {
        SkyBackground(skyPhase(now, today))
        Column(Modifier.fillMaxSize().padding(start = 32.dp, end = 32.dp, top = 22.dp, bottom = 0.dp)) {
            Row(Modifier.fillMaxWidth().weight(1f)) {
                ClockColumn(now, hijri, next, currentPrayer(now, today), Modifier.weight(1.15f).fillMaxHeight())
                Spacer(Modifier.width(24.dp))
                WeatherPanel(weather, isNight, now, Modifier.weight(1f).fillMaxHeight().padding(bottom = 14.dp))
            }
            PrayerRow(rowDay, next, now, prayersFailed)
            Spacer(Modifier.height(14.dp))
        }
        Column(Modifier.align(Alignment.BottomCenter)) {
            if (showHint) HintLine()
            NewsBar(headlines)
        }
    }
}

@Composable
private fun ClockColumn(
    now: ZonedDateTime,
    hijri: String,
    next: PrayerMoment?,
    current: PrayerMoment?,
    modifier: Modifier,
) {
    Column(modifier) {
        Text("${Config.CITY_NAME} · ${Config.COUNTRY_NAME}", fontSize = 20.sp, color = Dim)
        Row(verticalAlignment = Alignment.Bottom) {
            val h = (now.hour % 12).let { if (it == 0) 12 else it }
            Text("%d:%02d".format(h, now.minute), fontSize = 118.sp, fontWeight = FontWeight.ExtraBold, lineHeight = 118.sp)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.padding(bottom = 20.dp)) {
                Text("%02d".format(now.second), fontSize = 34.sp, fontWeight = FontWeight.Bold, color = Dim)
                Text(if (now.hour < 12) "صباحاً" else "مساءً", fontSize = 22.sp, color = Dim)
            }
        }
        Text(
            "${ArabicDates.weekday(now.toLocalDate())}  ${ArabicDates.gregorian(now.toLocalDate())}",
            fontSize = 26.sp, fontWeight = FontWeight.Bold,
        )
        Text(hijri, fontSize = 26.sp, fontWeight = FontWeight.Bold, color = Gold)
        Spacer(Modifier.weight(1f))
        NextPrayerCard(now, next, current)
    }
}

@Composable
private fun NextPrayerCard(now: ZonedDateTime, next: PrayerMoment?, current: PrayerMoment?) {
    val sinceCurrent = current?.let { Duration.between(it.at, now) }
    val justStarted = sinceCurrent != null && sinceCurrent.toMinutes() < 20
    Column(
        Modifier
            .padding(bottom = 14.dp)
            .background(Panel, RoundedCornerShape(18.dp))
            .border(2.dp, Gold.copy(alpha = 0.7f), RoundedCornerShape(18.dp))
            .padding(horizontal = 22.dp, vertical = 12.dp)
    ) {
        if (justStarted && current != null) {
            Text(
                "حان وقت صلاة ${current.prayer.label(current.at.toLocalDate())} منذ ${sinceCurrent!!.toMinutes()} دقيقة",
                fontSize = 20.sp, color = Gold, fontWeight = FontWeight.Bold,
            )
        }
        if (next == null) {
            Text("جارٍ تحميل أوقات الصلاة…", fontSize = 24.sp, color = Dim)
            return@Column
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column {
                Text("الصلاة القادمة", fontSize = 18.sp, color = Dim)
                Text(
                    "${next.prayer.label(next.at.toLocalDate())}  ${ArabicDates.time12(next.at.toLocalTime())}",
                    fontSize = 30.sp, fontWeight = FontWeight.Bold,
                )
            }
            Spacer(Modifier.width(28.dp))
            Column {
                Text("متبقٍ", fontSize = 18.sp, color = Dim)
                val left = Duration.between(now, next.at).seconds.coerceAtLeast(0)
                Text(
                    "%02d:%02d:%02d".format(left / 3600, left % 3600 / 60, left % 60),
                    fontSize = 40.sp, fontWeight = FontWeight.ExtraBold, color = Gold,
                )
            }
        }
    }
}

@Composable
private fun WeatherPanel(weather: Weather?, isNight: Boolean, now: ZonedDateTime, modifier: Modifier) {
    Column(
        modifier
            .background(Panel, RoundedCornerShape(22.dp))
            .padding(horizontal = 20.dp, vertical = 14.dp)
    ) {
        if (weather == null) {
            Text("جارٍ تحميل الطقس…", fontSize = 22.sp, color = Dim)
            return@Column
        }
        val c = weather.current
        val (desc, icon) = weatherInfo(c.code, isNight)
        val todayF = weather.days.firstOrNull()
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(icon, fontSize = 50.sp)
            Spacer(Modifier.width(12.dp))
            Column {
                Text("${c.temp.roundToInt()}°", fontSize = 54.sp, fontWeight = FontWeight.ExtraBold, lineHeight = 56.sp)
                Text(desc, fontSize = 20.sp)
            }
            Spacer(Modifier.weight(1f))
            Column(horizontalAlignment = Alignment.End) {
                if (now.monthValue in 6..9) {
                    Text(
                        "موسم الخريف",
                        fontSize = 15.sp, color = Color(0xFF0B1026), fontWeight = FontWeight.Bold,
                        modifier = Modifier.background(Color(0xFF9BE3B0), RoundedCornerShape(8.dp))
                            .padding(horizontal = 8.dp, vertical = 2.dp),
                    )
                }
                todayF?.let {
                    Text("العظمى ${it.tMax.roundToInt()}° · الصغرى ${it.tMin.roundToInt()}°", fontSize = 16.sp, color = Dim)
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Stat("💧 الرطوبة", "${c.humidity}%")
            Stat("🌧️ المطر", rainText(c.precipitation, todayF?.rainChance))
            Stat("🌡️ الإحساس", "${c.feelsLike.roundToInt()}°")
            Stat("💨 الرياح", "${c.windKmh.roundToInt()} كم/س")
        }
        Spacer(Modifier.height(10.dp))
        Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(alpha = 0.2f)))
        Spacer(Modifier.height(8.dp))
        Text("توقعات الأيام الثلاثة", fontSize = 16.sp, color = Dim)
        Spacer(Modifier.height(4.dp))
        Row(Modifier.fillMaxWidth().weight(1f), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            weather.days.drop(1).take(3).forEach { d ->
                val (dDesc, dIcon) = weatherInfo(d.code, night = false)
                Column(
                    Modifier.weight(1f).fillMaxHeight()
                        .background(Color.White.copy(alpha = 0.08f), RoundedCornerShape(14.dp))
                        .padding(vertical = 6.dp, horizontal = 6.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.SpaceEvenly,
                ) {
                    Text(ArabicDates.weekday(d.date), fontSize = 17.sp, fontWeight = FontWeight.Bold)
                    Text(dIcon, fontSize = 26.sp)
                    Text("${d.tMax.roundToInt()}° / ${d.tMin.roundToInt()}°", fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    Text(dDesc, fontSize = 13.sp, color = Dim, maxLines = 1)
                    Text("💧 ${d.humidity}%  🌧️ ${d.rainChance}%", fontSize = 13.sp, color = Dim)
                    if (d.rainMm >= 0.1) Text("%.1f مم".format(d.rainMm), fontSize = 13.sp, color = Color(0xFF9FD3FF))
                }
            }
        }
    }
}

private fun rainText(nowMm: Double, chance: Int?): String = when {
    nowMm >= 0.1 -> "%.1f مم".format(nowMm)
    chance != null -> "$chance%"
    else -> "0 مم"
}

@Composable
private fun Stat(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, fontSize = 14.sp, color = Dim)
        Text(value, fontSize = 22.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun PrayerRow(day: DayPrayers?, next: PrayerMoment?, now: ZonedDateTime, failed: Boolean) {
    Row(Modifier.fillMaxWidth().height(104.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        if (day == null) {
            Text(
                if (failed) "تعذّر تحميل أوقات الصلاة — ستتم إعادة المحاولة" else "جارٍ تحميل أوقات الصلاة…",
                fontSize = 24.sp, color = Dim, modifier = Modifier.align(Alignment.CenterVertically),
            )
            return@Row
        }
        Prayer.entries.forEach { p -> PrayerCard(p, day, next, now) }
    }
}

@Composable
private fun RowScope.PrayerCard(p: Prayer, day: DayPrayers, next: PrayerMoment?, now: ZonedDateTime) {
    val at = day.at(p)
    val isNext = next?.prayer == p && next.at == at
    val passed = !at.isAfter(now)
    val shape = RoundedCornerShape(18.dp)
    Column(
        Modifier
            .weight(if (isNext) 1.25f else 1f)
            .fillMaxHeight()
            .background(if (isNext) Gold.copy(alpha = 0.92f) else Panel, shape)
            .then(if (isNext) Modifier else Modifier.border(1.dp, Color.White.copy(alpha = 0.15f), shape))
            .padding(vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        val color = when {
            isNext -> Color(0xFF1A1330)
            passed || !p.isPrayer -> Dim
            else -> Color.White
        }
        val style = if (isNext) BaseStyle.copy(shadow = null) else BaseStyle
        Text(p.label(day.date), fontSize = if (isNext) 28.sp else 24.sp, fontWeight = FontWeight.Bold, color = color, style = style)
        Text(ArabicDates.time12(day.times.getValue(p)), fontSize = if (isNext) 34.sp else 28.sp,
            fontWeight = FontWeight.ExtraBold, color = color, style = style)
    }
}

@Composable
private fun NewsBar(headlines: List<Headline>) {
    val text = remember(headlines) {
        if (headlines.isEmpty()) "جارٍ تحميل الأخبار…"
        else headlines.joinToString("     ◆     ") { "${it.source}: ${it.title}" }
    }
    Row(
        Modifier.fillMaxWidth().height(46.dp).background(Color.Black.copy(alpha = 0.55f)),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.fillMaxHeight().background(Color(0xFFB3261E)).padding(horizontal = 18.dp),
            contentAlignment = Alignment.Center,
        ) { Text("أخبار", fontSize = 22.sp, fontWeight = FontWeight.ExtraBold) }
        NewsTicker(
            text = text,
            style = BaseStyle.copy(fontSize = 22.sp, fontWeight = FontWeight.Bold),
            modifier = Modifier.weight(1f).padding(horizontal = 12.dp),
        )
    }
}

@Composable
private fun HintLine() {
    var visible by remember { mutableStateOf(true) }
    LaunchedEffect(Unit) { delay(12_000); visible = false }
    AnimatedVisibility(visible, enter = fadeIn(), exit = fadeOut()) {
        Text(
            "اضغط OK في الريموت لفتح الإعدادات",
            fontSize = 16.sp, color = Dim,
            modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp, start = 32.dp),
        )
    }
}

@Composable
private fun SettingsOverlay(
    offset: Int,
    preview: String,
    onOffset: (Int) -> Unit,
    onRefresh: () -> Unit,
    onClose: () -> Unit,
) {
    BackHandler(onBack = onClose)
    val first = remember { FocusRequester() }
    LaunchedEffect(Unit) { first.requestFocus() }
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.7f)), contentAlignment = Alignment.Center) {
        Column(
            Modifier.width(620.dp).background(Color(0xFF1B2140), RoundedCornerShape(24.dp)).padding(28.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text("الإعدادات", fontSize = 30.sp, fontWeight = FontWeight.ExtraBold)
            Text("تعديل التاريخ الهجري حسب إعلان رؤية الهلال في سلطنة عُمان", fontSize = 18.sp, color = Dim)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                listOf(-1 to "يوم ناقص (−1)", 0 to "بدون تعديل", 1 to "يوم زائد (+1)").forEach { (v, label) ->
                    Button(
                        onClick = { onOffset(v) },
                        modifier = if (v == offset) Modifier.focusRequester(first) else Modifier,
                    ) { Text(if (v == offset) "✓ $label" else label, fontSize = 18.sp) }
                }
            }
            Text("التاريخ الهجري: $preview", fontSize = 22.sp, color = Gold, fontWeight = FontWeight.Bold)
            Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(alpha = 0.2f)))
            Text(
                "أوقات الصلاة مطابَقة لتقويم وزارة الأوقاف والشؤون الدينية لصلالة.",
                fontSize = 16.sp, color = Dim, textAlign = TextAlign.Start,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(onClick = onRefresh) { Text("تحديث البيانات الآن", fontSize = 18.sp) }
                Button(onClick = onClose) { Text("إغلاق", fontSize = 18.sp) }
            }
        }
    }
}
