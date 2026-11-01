package om.salalah.infoscreen

import java.time.ZoneId

object Config {
    const val CITY_NAME = "صلالة"
    const val COUNTRY_NAME = "سلطنة عُمان"
    const val LATITUDE = 17.0151
    const val LONGITUDE = 54.0924
    const val TIMEZONE = "Asia/Muscat"
    val ZONE: ZoneId = ZoneId.of(TIMEZONE)

    // Aladhan custom method (99), calibrated against the Ministry of Awqaf (mara.gov.om)
    // Salalah tables for Jan/Apr/Jul/Nov 2026: Fajr and Isha at 18° match the ministry to
    // the minute; Dhuhr/Asr/Maghrib need the ministry's precaution minutes added via tune.
    const val METHOD_SETTINGS = "18,null,18"

    // Order: Imsak,Fajr,Sunrise,Dhuhr,Asr,Maghrib,Sunset,Isha,Midnight
    const val TUNE = "0,0,0,5,6,5,0,0,0"

    // Bump when METHOD_SETTINGS or TUNE change so cached months are refetched.
    const val PRAYER_CACHE_VERSION = 1

    val NEWS_FEEDS = listOf(
        "الرؤية" to "https://www.alroya.om/rss",
        "بي بي سي" to "https://feeds.bbci.co.uk/arabic/rss.xml",
        "سكاي نيوز" to "https://www.skynewsarabia.com/rss",
        "الجزيرة" to "https://www.aljazeera.net/aljazeerarss/a7c186be-1baa-4bd4-9d80-a84db769f779/73d0e1b4-532f-45ef-b135-bfdff8b8cab9",
    )
    const val HEADLINES_PER_FEED = 8
}
