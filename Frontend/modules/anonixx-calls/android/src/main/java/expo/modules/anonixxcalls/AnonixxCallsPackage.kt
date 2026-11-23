package expo.modules.anonixxcalls

import android.content.Context
import expo.modules.core.interfaces.Package
import expo.modules.core.interfaces.ReactActivityLifecycleListener

class AnonixxCallsPackage : Package {
  override fun createReactActivityLifecycleListeners(activityContext: Context): List<ReactActivityLifecycleListener?> {
    return listOf(CallLifecycleListener())
  }
}
