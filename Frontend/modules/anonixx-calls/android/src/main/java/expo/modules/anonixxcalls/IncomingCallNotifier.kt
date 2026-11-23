package expo.modules.anonixxcalls

import android.app.ActivityManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person

/** The full-screen incoming call: rings over the lock screen with Answer and Decline. */
object IncomingCallNotifier {
  private const val CHANNEL_ID = "anonixx_calls"
  private const val TAG = "anonixx_call"
  const val EXTRA_CALL_ID = "anonixx_call_id"

  data class Call(
    val callId: String,
    val callerName: String,
    val video: Boolean,
    val ringSeconds: Int,
    val token: String,
    val apiBase: String,
  )

  fun isAppInForeground(): Boolean {
    val info = ActivityManager.RunningAppProcessInfo()
    ActivityManager.getMyMemoryState(info)
    return info.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
  }

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val sound = Uri.parse("android.resource://${context.packageName}/${R.raw.anonixx_ringtone}")
    val channel = NotificationChannel(CHANNEL_ID, "Calls", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Incoming voice and video calls"
      setSound(
        sound,
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build(),
      )
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 700, 900, 700, 900)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    manager.createNotificationChannel(channel)
  }

  private fun smallIcon(context: Context): Int {
    val res = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    return if (res != 0) res else context.applicationInfo.icon
  }

  private fun openIntent(context: Context, callId: String, action: String, code: Int): PendingIntent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("anonixx://call/$callId?action=$action")).apply {
      component = launch.component
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
      putExtra(EXTRA_CALL_ID, callId)
    }
    return PendingIntent.getActivity(context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  /** Returns false when the app is open (it shows its own ringing screen) or it can't post. */
  fun show(context: Context, call: Call): Boolean {
    if (isAppInForeground()) return false
    ensureChannel(context)
    val base = call.callId.hashCode()
    val full = openIntent(context, call.callId, "open", base) ?: return false
    val answer = openIntent(context, call.callId, "accept", base + 1) ?: return false
    val decline = PendingIntent.getBroadcast(
      context,
      base + 2,
      Intent(context, CallActionReceiver::class.java).apply {
        action = CallActionReceiver.ACTION_DECLINE
        putExtra(EXTRA_CALL_ID, call.callId)
        putExtra(CallActionReceiver.EXTRA_TOKEN, call.token)
        putExtra(CallActionReceiver.EXTRA_API, call.apiBase)
      },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val caller = Person.Builder().setName(call.callerName).setImportant(true).build()
    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(smallIcon(context))
      .setContentTitle(call.callerName)
      .setContentText(if (call.video) "Incoming video call" else "Incoming voice call")
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setColor(0xFFFF634A.toInt())
      .setContentIntent(full)
      .setFullScreenIntent(full, true)
      .setTimeoutAfter(call.ringSeconds * 1000L)
      .setStyle(NotificationCompat.CallStyle.forIncomingCall(caller, decline, answer).setIsVideo(call.video))
    val notification = builder.build().apply { flags = flags or Notification.FLAG_INSISTENT }
    return try {
      NotificationManagerCompat.from(context).notify(TAG, base, notification)
      true
    } catch (e: SecurityException) {
      false
    }
  }

  fun cancel(context: Context, callId: String) {
    NotificationManagerCompat.from(context).cancel(TAG, callId.hashCode())
  }

  fun canUseFullScreen(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < 34) return true
    val manager = context.getSystemService(NotificationManager::class.java) ?: return false
    return manager.canUseFullScreenIntent()
  }
}
