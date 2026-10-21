/**
 * country.js
 *
 * The viewer's country for the local-first feed (Backend/app/utils/feed_mix.py),
 * sent to the API as the X-Country header (ISO alpha-2, e.g. "KE").
 *
 * Read from the phone's region setting — no network call, no permission, and
 * no wrong guess when a lookup fails (the old payment-region lookup used to
 * fall back to "US"). A country the user sets in Feed Location settings
 * always wins on the server.
 */
import { NativeModules, Platform } from 'react-native';

let cached;

function regionOf(locale) {
  const m = /[-_]([A-Z]{2})(?:\b|[-_@.])/.exec(locale || '');
  return m ? m[1] : null;
}

export function deviceCountry() {
  if (cached !== undefined) return cached;
  let code = null;
  try {
    const native = Platform.OS === 'ios'
      ? NativeModules.SettingsManager?.settings?.AppleLocale
        || NativeModules.SettingsManager?.settings?.AppleLanguages?.[0]
      : NativeModules.I18nManager?.localeIdentifier;
    code = regionOf(native) || regionOf(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    code = null;
  }
  cached = code;
  return code;
}

export const countryHeader = () => {
  const c = deviceCountry();
  return c ? { 'X-Country': c } : {};
};
