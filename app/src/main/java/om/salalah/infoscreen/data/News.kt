package om.salalah.infoscreen.data

import android.text.Html
import android.util.Log
import android.util.Xml
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import om.salalah.infoscreen.Config
import org.xmlpull.v1.XmlPullParser
import java.io.StringReader

data class Headline(val source: String, val title: String)

class NewsRepository(private val cache: FileCache) {

    /** Fetches every feed in parallel; a failed feed falls back to its last cached copy. */
    suspend fun load(): List<Headline> = coroutineScope {
        val perFeed = Config.NEWS_FEEDS.mapIndexed { i, (source, url) ->
            async {
                val name = "news_$i.xml"
                val body = try {
                    Http.get(url).also { cache.write(name, it) }
                } catch (e: Exception) {
                    Log.w(TAG, "feed $source failed: ${e.message}")
                    cache.read(name)
                }
                body?.let { runCatching { parse(it) }.getOrNull() }
                    .orEmpty()
                    .take(Config.HEADLINES_PER_FEED)
                    .map { Headline(source, it) }
            }
        }.map { it.await() }
        interleave(perFeed)
    }

    private fun interleave(lists: List<List<Headline>>): List<Headline> {
        val out = mutableListOf<Headline>()
        val max = lists.maxOfOrNull { it.size } ?: 0
        for (i in 0 until max) lists.forEach { l -> l.getOrNull(i)?.let(out::add) }
        return out
    }

    private fun parse(xml: String): List<String> {
        val parser = Xml.newPullParser()
        parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false)
        parser.setInput(StringReader(xml.trimStart('﻿', ' ', '\n', '\r', '\t')))
        val titles = mutableListOf<String>()
        var inItem = false
        while (parser.next() != XmlPullParser.END_DOCUMENT) {
            when (parser.eventType) {
                XmlPullParser.START_TAG -> when (parser.name) {
                    "item", "entry" -> inItem = true
                    "title" -> if (inItem) clean(parser.nextText()).takeIf { it.isNotBlank() }?.let(titles::add)
                }
                XmlPullParser.END_TAG -> if (parser.name == "item" || parser.name == "entry") inItem = false
            }
        }
        return titles.distinct()
    }

    private fun clean(s: String) =
        Html.fromHtml(s, Html.FROM_HTML_MODE_LEGACY).toString().replace(Regex("\\s+"), " ").trim()

    private companion object { const val TAG = "News" }
}
