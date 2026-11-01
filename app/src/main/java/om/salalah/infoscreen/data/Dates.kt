package om.salalah.infoscreen.data

import android.content.Context
import android.icu.util.IslamicCalendar
import android.icu.util.TimeZone
import om.salalah.infoscreen.Config
import java.time.LocalDate
import java.time.LocalTime

object ArabicDates {
    private val hijriMonths = listOf(
        "محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة",
        "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة",
    )
    private val gregorianMonths = listOf(
        "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
        "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
    )
    private val weekdays = listOf("الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد")

    fun weekday(date: LocalDate) = weekdays[date.dayOfWeek.value - 1]

    fun gregorian(date: LocalDate) = "${date.dayOfMonth} ${gregorianMonths[date.monthValue - 1]} ${date.year}م"

    /**
     * Umm al-Qura calendar shifted by [offsetDays], so the screen can follow the
     * moon-sighting announcement in Oman when it differs by a day.
     */
    fun hijri(date: LocalDate, offsetDays: Int): String {
        val cal = IslamicCalendar(TimeZone.getTimeZone(Config.TIMEZONE))
        cal.calculationType = IslamicCalendar.CalculationType.ISLAMIC_UMALQURA
        val shifted = date.plusDays(offsetDays.toLong())
        cal.timeInMillis = shifted.atTime(12, 0).atZone(Config.ZONE).toInstant().toEpochMilli()
        val day = cal.get(IslamicCalendar.DAY_OF_MONTH)
        val month = cal.get(IslamicCalendar.MONTH)
        val year = cal.get(IslamicCalendar.YEAR)
        return "$day ${hijriMonths[month]} $year هـ"
    }

    fun time12(t: LocalTime): String {
        val h = (t.hour % 12).let { if (it == 0) 12 else it }
        return "%d:%02d %s".format(java.util.Locale.US, h, t.minute, if (t.hour < 12) "ص" else "م")
    }
}

class AppSettings(context: Context) {
    private val prefs = context.getSharedPreferences("settings", Context.MODE_PRIVATE)

    var hijriOffset: Int
        get() = prefs.getInt(KEY_HIJRI_OFFSET, 0)
        set(value) = prefs.edit().putInt(KEY_HIJRI_OFFSET, value.coerceIn(-1, 1)).apply()

    private companion object { const val KEY_HIJRI_OFFSET = "hijri_offset" }
}

/** Shared by the activity and the screensaver so both reuse the same in-memory data. */
class AppGraph private constructor(context: Context) {
    private val cache = FileCache(context)
    val prayers = PrayerRepository(cache)
    val weather = WeatherRepository(cache)
    val news = NewsRepository(cache)
    val settings = AppSettings(context)

    companion object {
        @Volatile private var instance: AppGraph? = null
        fun get(context: Context): AppGraph =
            instance ?: synchronized(this) { instance ?: AppGraph(context.applicationContext).also { instance = it } }
    }
}
