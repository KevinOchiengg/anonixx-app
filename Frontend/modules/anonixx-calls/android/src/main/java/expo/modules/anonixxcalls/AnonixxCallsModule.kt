package expo.modules.anonixxcalls

import android.content.Context
import android.content.Intent
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AnonixxCallsModule : Module() {
  private var proximityLock: PowerManager.WakeLock? = null

  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("No React context")

  override fun definition() = ModuleDefinition {
    Name("AnonixxCalls")

    Function("showIncomingCall") { call: Map<String, Any> ->
      val callId = call["callId"] as? String ?: return@Function false
      IncomingCallNotifier.show(
        context,
        IncomingCallNotifier.Call(
          callId = callId,
          callerName = (call["callerName"] as? String)?.takeIf { it.isNotBlank() } ?: "Someone",
          video = call["video"] as? Boolean ?: false,
          ringSeconds = (call["ringSeconds"] as? Number)?.toInt() ?: 45,
          token = call["token"] as? String ?: "",
          apiBase = call["apiBase"] as? String ?: "",
        ),
      )
    }

    Function("cancelIncomingCall") { callId: String ->
      IncomingCallNotifier.cancel(context, callId)
    }

    Function("canRingFullScreen") {
      IncomingCallNotifier.canUseFullScreen(context)
    }

    Function("openFullScreenSettings") {
      if (Build.VERSION.SDK_INT >= 34) {
        val intent = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${context.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
      }
    }

    // Screen off while the phone is at your ear (voice calls on the earpiece).
    Function("setProximity") { enabled: Boolean ->
      val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      if (enabled) {
        if (proximityLock == null && power.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) {
          proximityLock = power.newWakeLock(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, "anonixx:call").apply {
            setReferenceCounted(false)
            acquire(4 * 60 * 60 * 1000L)
          }
        }
      } else {
        proximityLock?.let { if (it.isHeld) it.release(PowerManager.RELEASE_FLAG_WAIT_FOR_NO_PROXIMITY) }
        proximityLock = null
      }
    }

    Function("audioDevices") {
      val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      var bluetooth = false
      var wired = false
      for (d in audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
        when (d.type) {
          AudioDeviceInfo.TYPE_BLUETOOTH_SCO, AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> bluetooth = true
          AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_WIRED_HEADPHONES, AudioDeviceInfo.TYPE_USB_HEADSET -> wired = true
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && d.type == AudioDeviceInfo.TYPE_BLE_HEADSET) bluetooth = true
      }
      mapOf("bluetooth" to bluetooth, "wired" to wired)
    }

    Function("setAutoPip") { enabled: Boolean ->
      CallActivityState.autoPip = enabled
      val activity = appContext.currentActivity ?: return@Function
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        activity.runOnUiThread { CallActivityState.pipParams()?.let { activity.setPictureInPictureParams(it) } }
      }
    }

    Function("enterPip") {
      val activity = appContext.currentActivity ?: return@Function false
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return@Function false
      activity.runOnUiThread { CallActivityState.pipParams()?.let { activity.enterPictureInPictureMode(it) } }
      true
    }

    Function("isInPip") {
      val activity = appContext.currentActivity ?: return@Function false
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && activity.isInPictureInPictureMode
    }

    // After a call that woke the phone, stop showing over the lock screen.
    Function("releaseLockScreen") {
      val activity = appContext.currentActivity ?: return@Function
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
        activity.runOnUiThread {
          activity.setShowWhenLocked(false)
          activity.setTurnScreenOn(false)
        }
      }
    }

    OnDestroy {
      proximityLock?.let { if (it.isHeld) it.release() }
      proximityLock = null
    }
  }
}
