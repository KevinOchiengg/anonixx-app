const PRODUCTION_URL = 'https://anonixx-app.onrender.com';

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || PRODUCTION_URL;

if (__DEV__) {
  console.log('🔗 Backend:', API_BASE_URL);
}

export default { API_BASE_URL };
