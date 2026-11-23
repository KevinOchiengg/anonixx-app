package expo.modules.anonixxcalls

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import java.net.HttpURLConnection
import java.net.URL

/** Decline from the notification: tells the server without opening the app. */
class CallActionReceiver : BroadcastReceiver() {
  companion object {
    const val ACTION_DECLINE = "expo.modules.anonixxcalls.DECLINE"
    const val EXTRA_TOKEN = "anonixx_token"
    const val EXTRA_API = "anonixx_api"
  }

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != ACTION_DECLINE) return
    val callId = intent.getStringExtra(IncomingCallNotifier.EXTRA_CALL_ID) ?: return
    val token = intent.getStringExtra(EXTRA_TOKEN).orEmpty()
    val api = intent.getStringExtra(EXTRA_API).orEmpty()
    IncomingCallNotifier.cancel(context, callId)
    if (token.isEmpty() || api.isEmpty()) return
    val pending = goAsync()
    Thread {
      try {
        val conn = URL("$api/drop-calls/$callId/decline").openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.connectTimeout = 8000
        conn.readTimeout = 8000
        conn.setRequestProperty("Authorization", "Bearer $token")
        conn.responseCode
        conn.disconnect()
      } catch (_: Exception) {
        // the call stops ringing by itself
      } finally {
        pending.finish()
      }
    }.start()
  }
}
