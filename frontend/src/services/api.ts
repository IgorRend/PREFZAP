import axios from 'axios';
import { disconnectSocket } from './socket';

const api = axios.create({
    baseURL: '/api',
    headers: { 'Content-Type': 'application/json' },
});

// JWT interceptor
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }

    // Inject x-tenant-id for multi-tenant architecture if Super Admin is managing a tenant
    const managementContextStr = localStorage.getItem('managementContext');
    if (managementContextStr) {
        try {
            const context = JSON.parse(managementContextStr);
            if (context?.id) {
                config.headers['x-tenant-id'] = context.id;
            }
        } catch (e) {}
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            disconnectSocket();
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

export default api;
