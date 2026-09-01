export const BACKENDS = {
  production: 'https://anonixx-app.onrender.com',
  ngrok: 'https://ulysses-apronlike-alethia.ngrok-free.dev',
  localhost: 'http://172.31.0.147:8000',
};

export const API_BASE_URL = BACKENDS.production;

/**
 * Stripe publishable key (safe to expose in client code — it's public).
 * Replace with your live key before App Store submission:
 *   pk_test_...  →  pk_live_...
 * Or set EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY in your .env file.
 */
export const STRIPE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? 'pk_test_REPLACE_WITH_YOUR_KEY';

/**
 * Tenor GIF search key (safe to expose in client code — it's a public API key).
 * Set EXPO_PUBLIC_TENOR_API_KEY in your .env file to enable GIF search.
 */
export const TENOR_API_KEY =
  process.env.EXPO_PUBLIC_TENOR_API_KEY ?? 'YOUR_TENOR_API_KEY';

export default { API_BASE_URL, BACKENDS, STRIPE_PUBLISHABLE_KEY, TENOR_API_KEY };
