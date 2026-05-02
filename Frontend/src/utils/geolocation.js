/**
 * geolocation.js
 *
 * Detects the user's country via IP-based lookup (ip-api.com — no key needed).
 * Derives payment region from that: Kenya → M-Pesa, everywhere else → international.
 *
 * Result is cached in AsyncStorage for 24 hours so we don't hit the API on
 * every session. Falls back to 'international' on any network failure.
 *
 * To add more M-Pesa countries in future (Tanzania, Uganda, etc.),
 * just expand MPESA_COUNTRIES below and add a separate M-Pesa integration.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Config ───────────────────────────────────────────────────────────────────

const MPESA_COUNTRIES = ['KE']; // Kenya only — Safaricom Daraja API

const CACHE_KEY    = '@anonixx:paymentRegion';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const GEO_API_URL  = 'https://ip-api.com/json/?fields=countryCode,country';
const FETCH_TIMEOUT_MS = 5000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildRegion(countryCode, country) {
  const supportsMpesa = MPESA_COUNTRIES.includes(countryCode);
  return {
    countryCode,
    country,
    supportsMpesa,
    currency: supportsMpesa ? 'KES' : 'USD',
    region:   supportsMpesa ? 'kenya' : 'international',
  };
}

const FALLBACK = buildRegion('US', 'Unknown');

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Detects the user's payment region. Reads from AsyncStorage cache first;
 * falls back to ip-api.com; falls back to 'international' on error.
 *
 * @returns {Promise<{
 *   countryCode: string,
 *   country: string,
 *   supportsMpesa: boolean,
 *   currency: 'KES' | 'USD',
 *   region: 'kenya' | 'international'
 * }>}
 */
export async function detectPaymentRegion() {
  // 1. Try cache
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      const { data, timestamp } = JSON.parse(raw);
      if (Date.now() - timestamp < CACHE_TTL_MS) {
        return data;
      }
    }
  } catch {
    // Cache miss — proceed to network
  }

  // 2. Network lookup
  let result = FALLBACK;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res  = await fetch(GEO_API_URL, { signal: controller.signal });
    clearTimeout(timer);

    const json        = await res.json();
    const countryCode = (json.countryCode || 'US').toUpperCase();
    const country     = json.country || 'Unknown';
    result = buildRegion(countryCode, country);
  } catch {
    // Network error or timeout — stay with fallback
  }

  // 3. Cache result
  try {
    await AsyncStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ data: result, timestamp: Date.now() })
    );
  } catch {
    // Storage write failure is non-critical
  }

  return result;
}

/**
 * Clears the cached region (useful for testing or if user changes location).
 */
export async function clearPaymentRegionCache() {
  try {
    await AsyncStorage.removeItem(CACHE_KEY);
  } catch {}
}
