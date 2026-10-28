/** The viewer's country (from the phone's region) for the X-Country header. A country set in
 * Feed Location settings wins on the server. */
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
