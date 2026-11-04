export const BACKENDS = {
  production: 'https://anonixx-app.onrender.com',
  ngrok: 'https://ulysses-apronlike-alethia.ngrok-free.dev',
  localhost: 'http://172.31.0.147:8000',
};

export const API_BASE_URL = BACKENDS.production;

// Stripe publishable key (public). Set EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY; use pk_live_ in production.
export const STRIPE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? 'pk_test_REPLACE_WITH_YOUR_KEY';

// Tenor GIF key (public). Set EXPO_PUBLIC_TENOR_API_KEY to enable GIF search.
export const TENOR_API_KEY =
  process.env.EXPO_PUBLIC_TENOR_API_KEY ?? 'YOUR_TENOR_API_KEY';

// Google sign-in: the OAuth "Web application" client ID (public; the same one the website and
// backend GOOGLE_CLIENT_IDS use). Empty hides the Google button.
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

export default { API_BASE_URL, BACKENDS, STRIPE_PUBLISHABLE_KEY, TENOR_API_KEY, GOOGLE_WEB_CLIENT_ID };
