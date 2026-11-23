package expo.modules.anonixxcalls

import android.app.Activity
import android.app.PictureInPictureParams
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.Rational
import expo.modules.core.interfaces.ReactActivityLifecycleListener
import java.lang.ref.WeakReference

/** Shared activity state: lock-screen wake-up for calls, and picture-in-picture. */
object CallActivityState {
  var activity: WeakReference<Activity>? = null
  @Volatile var autoPip = false

  fun pipParams(): PictureInPictureParams? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return null
    val builder = PictureInPictureParams.Builder().setAspectRatio(Rational(9, 16))
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) builder.setAutoEnterEnabled(autoPip)
    return builder.build()
  }

  fun wakeForCall(activity: Activity, intent: Intent?) {
    val i = intent ?: return
    if (i.data?.host != "call") return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      activity.setShowWhenLocked(true)
      activity.setTurnScreenOn(true)
    }
    i.getStringExtra(IncomingCallNotifier.EXTRA_CALL_ID)?.let { IncomingCallNotifier.cancel(activity, it) }
  }
}

class CallLifecycleListener : ReactActivityLifecycleListener {
  override fun onCreate(activity: Activity, savedInstanceState: Bundle?) {
    CallActivityState.activity = WeakReference(activity)
    CallActivityState.wakeForCall(activity, activity.intent)
  }

  override fun onResume(activity: Activity) {
    CallActivityState.activity = WeakReference(activity)
  }

  override fun onNewIntent(intent: Intent): Boolean {
    CallActivityState.activity?.get()?.let { CallActivityState.wakeForCall(it, intent) }
    return false
  }

  // Android 8-11: no auto-enter, so go into picture-in-picture when you leave during a video call.
  override fun onUserLeaveHint(activity: Activity) {
    if (!CallActivityState.autoPip) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      CallActivityState.pipParams()?.let { activity.enterPictureInPictureMode(it) }
    }
  }
}
