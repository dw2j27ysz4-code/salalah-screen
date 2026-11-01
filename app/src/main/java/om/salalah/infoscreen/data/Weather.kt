package om.salalah.infoscreen.data

import om.salalah.infoscreen.Config
import org.json.JSONObject
import java.time.LocalDate

data class CurrentWeather(
    val temp: Double,
    val feelsLike: Double,
    val humidity: Int,
    val precipitation: Double,
    val code: Int,
    val windKmh: Double,
)

data class DayForecast(
    val date: LocalDate,
    val code: Int,
    val tMax: Double,
    val tMin: Double,
    val rainMm: Double,
    val rainChance: Int,
    val humidity: Int,
)

/** days[0] is today; days[1..3] are the 3-day outlook. */
data class Weather(val current: CurrentWeather, val days: List<DayForecast>)

class WeatherRepository(private val cache: FileCache) {
    private val cacheName = "weather.json"

    suspend fun load(): Weather {
        val body = Http.get(URL)
        return parse(body).also { cache.write(cacheName, body) }
    }

    fun cached(): Weather? = cache.read(cacheName)?.let { runCatching { parse(it) }.getOrNull() }

    private fun parse(body: String): Weather {
        val root = JSONObject(body)
        val c = root.getJSONObject("current")
        val d = root.getJSONObject("daily")
        val times = d.getJSONArray("time")
        val days = (0 until times.length()).map { i ->
            DayForecast(
                date = LocalDate.parse(times.getString(i)),
                code = d.getJSONArray("weather_code").getInt(i),
                tMax = d.getJSONArray("temperature_2m_max").getDouble(i),
                tMin = d.getJSONArray("temperature_2m_min").getDouble(i),
                rainMm = d.getJSONArray("precipitation_sum").optDouble(i, 0.0),
                rainChance = d.getJSONArray("precipitation_probability_max").optInt(i, 0),
                humidity = d.getJSONArray("relative_humidity_2m_mean").optInt(i, 0),
            )
        }
        return Weather(
            CurrentWeather(
                temp = c.getDouble("temperature_2m"),
                feelsLike = c.getDouble("apparent_temperature"),
                humidity = c.getInt("relative_humidity_2m"),
                precipitation = c.optDouble("precipitation", 0.0),
                code = c.getInt("weather_code"),
                windKmh = c.optDouble("wind_speed_10m", 0.0),
            ),
            days,
        )
    }

    private companion object {
        val URL = "https://api.open-meteo.com/v1/forecast" +
            "?latitude=${Config.LATITUDE}&longitude=${Config.LONGITUDE}" +
            "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m" +
            "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum," +
            "precipitation_probability_max,relative_humidity_2m_mean" +
            "&timezone=${Config.TIMEZONE}&forecast_days=4"
    }
}

/** WMO weather code → Arabic description and icon. */
fun weatherInfo(code: Int, night: Boolean): Pair<String, String> = when (code) {
    0 -> "صافٍ" to if (night) "🌙" else "☀️"
    1 -> "صافٍ غالباً" to if (night) "🌙" else "🌤️"
    2 -> "غائم جزئياً" to "⛅"
    3 -> "غائم" to "☁️"
    45, 48 -> "ضباب" to "🌫️"
    51, 53, 55 -> "رذاذ" to "🌦️"
    56, 57 -> "رذاذ متجمد" to "🌧️"
    61 -> "مطر خفيف" to "🌧️"
    63 -> "مطر متوسط" to "🌧️"
    65 -> "مطر غزير" to "🌧️"
    66, 67 -> "مطر متجمد" to "🌧️"
    71, 73, 75, 77 -> "ثلج" to "❄️"
    80, 81 -> "زخات مطر" to "🌦️"
    82 -> "زخات مطر غزيرة" to "⛈️"
    85, 86 -> "زخات ثلجية" to "❄️"
    95 -> "عاصفة رعدية" to "⛈️"
    96, 99 -> "عاصفة رعدية مع برد" to "⛈️"
    else -> "—" to "🌡️"
}
