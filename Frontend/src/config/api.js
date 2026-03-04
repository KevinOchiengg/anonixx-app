/**
 * API Configuration for Anonixx
 */

const BACKENDS = {
  production: 'https://anonixx-app.onrender.com',
  ngrok: 'https://ulysses-apronlike-alethia.ngrok-free.dev',
  localhost: 'http://192.168.100.22:8000', // ✅ LAN IP — works on phone + emulator
};

// Switch between backends here
export const API_BASE_URL = __DEV__
  ? BACKENDS.localhost // use ngrok if testing outside LAN
  : BACKENDS.production;

// Debug info
if (__DEV__) {
  console.log('🔗 Backend:', API_BASE_URL);
}

export default { API_BASE_URL, BACKENDS };
