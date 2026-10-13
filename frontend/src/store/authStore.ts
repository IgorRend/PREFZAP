import { create } from 'zustand';
import api from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';
import { useTicketStore } from './ticketStore';

interface User {
    id: string;
    name: string;
    email: string;
    role: string;
    isSuperAdmin?: boolean;
    online?: boolean;
    tenantId?: string;
    tenantName?: string;
    tenantLogoUrl?: string;
    departments?: { departmentId: string; name: string }[];
}

interface AuthState {
    user: User | null;
    token: string | null;
    isLoading: boolean;
    error: string | null;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    checkAuth: () => Promise<void>;
    clearError: () => void;
    managementContext: { id: string; name: string } | null;
    setManagementContext: (context: { id: string; name: string } | null) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
    user: JSON.parse(localStorage.getItem('user') || 'null'),
    token: localStorage.getItem('token'),
    isLoading: false,
    error: null,
    managementContext: JSON.parse(localStorage.getItem('managementContext') || 'null'),

    setManagementContext: (context) => {
        if (context) {
            localStorage.setItem('managementContext', JSON.stringify(context));
        } else {
            localStorage.removeItem('managementContext');
        }
        set({ managementContext: context });
    },

    login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
            const { data } = await api.post('/auth/login', { email, password });
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            set({ user: data.user, token: data.token, isLoading: false });
            connectSocket(data.token);
        } catch (error: any) {
            set({ error: error.response?.data?.error || 'Erro ao fazer login', isLoading: false });
        }
    },

    logout: async () => {
        try {
            await api.post('/auth/logout');
        } catch { }
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('managementContext');
        disconnectSocket();
        useTicketStore.getState().selectTicket(null);
        set({ user: null, token: null, managementContext: null });
    },

    checkAuth: async () => {
        const token = localStorage.getItem('token');
        if (!token) return;

        try {
            const { data } = await api.get('/auth/me');
            set({ user: data, token });
            connectSocket(token);
        } catch {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            set({ user: null, token: null });
        }
    },

    clearError: () => set({ error: null }),
}));
