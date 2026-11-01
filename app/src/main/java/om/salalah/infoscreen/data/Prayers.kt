package om.salalah.infoscreen.data

import om.salalah.infoscreen.Config
import org.json.JSONObject
import java.time.LocalDate
import java.time.LocalTime
import java.time.YearMonth
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

enum class Prayer(val arabic: String, val apiKey: String, val isPrayer: Boolean) {
    FAJR("الفجر", "Fajr", true),
    SUNRISE("الشروق", "Sunrise", false),
    DHUHR("الظهر", "Dhuhr", true),
    ASR("العصر", "Asr", true),
    MAGHRIB("المغرب", "Maghrib", true),
    ISHA("العشاء", "Isha", true);

    fun label(date: LocalDate): String =
        if (this == DHUHR && date.dayOfWeek == java.time.DayOfWeek.FRIDAY) "الجمعة" else arabic
}

data class DayPrayers(val date: LocalDate, val times: Map<Prayer, LocalTime>) {
    fun at(p: Prayer): ZonedDateTime = date.atTime(times.getValue(p)).atZone(Config.ZONE)
}

data class PrayerMoment(val prayer: Prayer, val at: ZonedDateTime)

fun nextPrayer(now: ZonedDateTime, today: DayPrayers?, tomorrow: DayPrayers?): PrayerMoment? {
    today?.let { day ->
        Prayer.entries.filter { it.isPrayer }.forEach { p ->
            val t = day.at(p)
            if (t.isAfter(now)) return PrayerMoment(p, t)
        }
    }
    return tomorrow?.let { PrayerMoment(Prayer.FAJR, it.at(Prayer.FAJR)) }
}

/** The prayer whose time most recently started today, if any. */
fun currentPrayer(now: ZonedDateTime, today: DayPrayers?): PrayerMoment? =
    today?.let { day ->
        Prayer.entries.filter { it.isPrayer }
            .map { PrayerMoment(it, day.at(it)) }
            .lastOrNull { !it.at.isAfter(now) }
    }

class PrayerRepository(private val cache: FileCache) {
    private val months = mutableMapOf<YearMonth, Map<LocalDate, DayPrayers>>()
    private val dateFormat = DateTimeFormatter.ofPattern("dd-MM-yyyy")

    /** Times are fixed per date, so a cached month is used without refetching. Throws on failure. */
    suspend fun day(date: LocalDate): DayPrayers? = month(YearMonth.from(date))[date]

    fun invalidate() {
        months.clear()
        cache.deleteMatching("prayers_")
    }

    private suspend fun month(ym: YearMonth): Map<LocalDate, DayPrayers> {
        months[ym]?.let { return it }
        val name = "prayers_v${Config.PRAYER_CACHE_VERSION}_$ym.json"
        val cached = cache.read(name)?.let { runCatching { parse(it) }.getOrNull() }
        val result = cached ?: Http.get(url(ym)).let { body -> parse(body).also { cache.write(name, body) } }
        months[ym] = result
        return result
    }

    private fun url(ym: YearMonth) =
        "https://api.aladhan.com/v1/calendar/${ym.year}/${ym.monthValue}" +
            "?latitude=${Config.LATITUDE}&longitude=${Config.LONGITUDE}" +
            "&method=99&methodSettings=${Config.METHOD_SETTINGS}" +
            "&tune=${Config.TUNE}&school=0&timezonestring=${Config.TIMEZONE}"

    private fun parse(body: String): Map<LocalDate, DayPrayers> {
        val root = JSONObject(body)
        require(root.optInt("code") == 200) { "Aladhan error: ${root.opt("data")}" }
        val data = root.getJSONArray("data")
        return (0 until data.length()).associate { i ->
            val d = data.getJSONObject(i)
            val date = LocalDate.parse(
                d.getJSONObject("date").getJSONObject("gregorian").getString("date"), dateFormat
            )
            val t = d.getJSONObject("timings")
            date to DayPrayers(date, Prayer.entries.associateWith { LocalTime.parse(t.getString(it.apiKey).take(5)) })
        }
    }
}
