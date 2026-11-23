import AVFoundation
import ExpoModulesCore
import UIKit

/// iOS side: proximity and audio routes. Full-screen ringing on iPhone needs CallKit with
/// VoIP pushes, so the incoming-call functions report false and the app keeps using alerts.
public class AnonixxCallsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AnonixxCalls")

    Function("showIncomingCall") { (_: [String: Any]) -> Bool in
      return false
    }

    Function("cancelIncomingCall") { (_: String) in }

    Function("canRingFullScreen") { () -> Bool in
      return false
    }

    Function("openFullScreenSettings") { }

    Function("setProximity") { (enabled: Bool) in
      DispatchQueue.main.async {
        UIDevice.current.isProximityMonitoringEnabled = enabled
      }
    }

    Function("audioDevices") { () -> [String: Bool] in
      var bluetooth = false
      var wired = false
      for output in AVAudioSession.sharedInstance().currentRoute.outputs {
        switch output.portType {
        case .bluetoothHFP, .bluetoothA2DP, .bluetoothLE: bluetooth = true
        case .headphones, .usbAudio: wired = true
        default: break
        }
      }
      return ["bluetooth": bluetooth, "wired": wired]
    }

    Function("setAutoPip") { (_: Bool) in }

    Function("enterPip") { () -> Bool in
      return false
    }

    Function("isInPip") { () -> Bool in
      return false
    }

    Function("releaseLockScreen") { }
  }
}
