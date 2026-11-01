package om.salalah.infoscreen.data

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

object Http {
    suspend fun get(url: String): String = withContext(Dispatchers.IO) {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 15_000
        conn.readTimeout = 20_000
        conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android TV) SalalahInfoScreen/1.0")
        try {
            val code = conn.responseCode
            if (code !in 200..299) throw IOException("HTTP $code for $url")
            conn.inputStream.use { it.readBytes().toString(Charsets.UTF_8) }
        } finally {
            conn.disconnect()
        }
    }
}

/** Last good responses on disk, so the screen still shows data when the network drops. */
class FileCache(context: Context) {
    private val dir = File(context.filesDir, "cache").apply { mkdirs() }

    fun read(name: String): String? = File(dir, name).takeIf { it.exists() }?.readText()

    fun write(name: String, text: String) = File(dir, name).writeText(text)

    fun deleteMatching(prefix: String) {
        dir.listFiles { f -> f.name.startsWith(prefix) }?.forEach { it.delete() }
    }
}
