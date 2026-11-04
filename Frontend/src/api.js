import axios from 'axios';

const TOKEN_KEY = 'inv_token';

const api = axios.create({ baseURL: '/api' });

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
