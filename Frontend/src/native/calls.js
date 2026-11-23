import { requireOptionalNativeModule } from 'expo';

/** The app's own call helpers (modules/anonixx-calls). Missing in Expo Go and older builds, so
 * every call is guarded and falls back to doing nothing. */
const N = requireOptionalNativeModule('AnonixxCalls');

const safe = (fn, fallback) => {
  try { return fn(); } catch { return fallback; }
};

export const nativeCalls = {
  available: !!N,
  showIncomingCall: (call) => safe(() => !!N?.showIncomingCall(call), false),
  cancelIncomingCall: (callId) => safe(() => N?.cancelIncomingCall(String(callId)), undefined),
  canRingFullScreen: () => safe(() => (N ? !!N.canRingFullScreen() : false), false),
  openFullScreenSettings: () => safe(() => N?.openFullScreenSettings(), undefined),
  setProximity: (on) => safe(() => N?.setProximity(!!on), undefined),
  audioDevices: () => safe(() => N?.audioDevices() || { bluetooth: false, wired: false }, { bluetooth: false, wired: false }),
  setAutoPip: (on) => safe(() => N?.setAutoPip(!!on), undefined),
  enterPip: () => safe(() => !!N?.enterPip(), false),
  isInPip: () => safe(() => !!N?.isInPip(), false),
  releaseLockScreen: () => safe(() => N?.releaseLockScreen(), undefined),
};
