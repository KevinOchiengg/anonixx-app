export const BACKENDS = {
  production: 'https://anonixx-app.onrender.com',
  ngrok: 'https://ulysses-apronlike-alethia.ngrok-free.dev',
  localhost: 'http://192.168.100.22:8000',
};

export const API_BASE_URL = BACKENDS.production;

if (__DEV__) {
  console.log('Backend:', API_BASE_URL);
}

export default { API_BASE_URL, BACKENDS };
