import axios from 'axios';

const TOKEN_KEY = 'inv_token';

const api = axios.create({ baseURL: '/api' });

// In an Android app built from these screens (the attendance kiosk app, --mode kiosk) the page doesn't come from the
// server, so it calls the server's address: VITE_APP_SERVER by default, changeable in the app. On the web: its own site.
const APP_SERVER = import.meta.env.VITE_APP_SERVER;
const SERVER_KEY = 'inv_app_server';
export const appServer = {
  inApp: Boolean(APP_SERVER),
  default: APP_SERVER,
  get: () => {
    try { return localStorage.getItem(SERVER_KEY) || APP_SERVER; } catch { return APP_SERVER; }
  },
  // Empty goes back to the default
  set: (v) => {
    try {
      const clean = String(v || '').trim().replace(/\/+$/, '');
      if (clean) localStorage.setItem(SERVER_KEY, /^https?:\/\//i.test(clean) ? clean : `http://${clean}`);
      else localStorage.removeItem(SERVER_KEY);
    } catch { /* the default is used */ }
  },
};
if (APP_SERVER) {
  api.interceptors.request.use((config) => ({ ...config, baseURL: `${appServer.get()}/api` }));
}

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
export const setToken = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage blocked: the user simply logs in again next time */ }
};

// Every request carries the login token
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// A 401 means the login has expired or the user was switched off: back to the login screen
api.interceptors.response.use(undefined, (err) => {
  if (err.response?.status === 401 && !err.config.url.startsWith('/auth/')) {
    setToken(null);
    window.dispatchEvent(new Event('inv-logged-out'));
  }
  return Promise.reject(err);
});

export const errorMessage = (err) => err.response?.data?.message || err.message;

export default api;
