import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export const errorMessage = (err) => err.response?.data?.message || err.message;

export default api;
