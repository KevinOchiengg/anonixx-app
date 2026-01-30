/**
 * API Configuration for Anonixx
 */

const BACKENDS = {
  production: 'https://anonixx-app.onrender.com',
  ngrok: 'https://ulysses-apronlike-alethia.ngrok-free.dev',
  localhost: 'http://localhost:8000',
}

// Auto-switch: ngrok for dev, production for release builds
export const API_BASE_URL = __DEV__
  ? BACKENDS.ngrok // Development (physical device)
  : BACKENDS.production // Production (app release)

// Debug info
if (__DEV__) {
  console.log('🔗 Backend:', API_BASE_URL)
}

export default { API_BASE_URL, BACKENDS }
