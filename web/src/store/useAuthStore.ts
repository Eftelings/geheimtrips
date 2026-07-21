import { create } from 'zustand';
import type { User } from '../types/index.js';
import { authApi, ApiError } from '../services/api.js';

/** Set to false to disable the gate and go straight to the app. */
export const GATE_ENABLED = true;

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  hydrated: boolean;

  login:    (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, handle: string, emailOptIn?: boolean, captcha?: string) => Promise<void>;
  logout:   () => void;
  hydrate:  () => Promise<void>;
  updateUser: (data: Partial<User>) => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  loading: false,
  error: null,
  hydrated: false,

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const { token, user } = await authApi.login(email, password);
      localStorage.setItem('gt_token', token);
      set({ user, token, loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof ApiError ? e.message : 'Anmeldung fehlgeschlagen.' });
      throw e;
    }
  },

  register: async (email, password, name, handle, emailOptIn = false, captcha = '') => {
    set({ loading: true, error: null });
    try {
      const { token, user } = await authApi.register(email, password, name, handle, emailOptIn, captcha);
      localStorage.setItem('gt_token', token);
      set({ user, token, loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof ApiError ? e.message : 'Registrierung fehlgeschlagen.' });
      throw e;
    }
  },

  logout: () => {
    localStorage.removeItem('gt_token');
    set({ user: null, token: null });
  },

  hydrate: async () => {
    const token = localStorage.getItem('gt_token');
    if (!token) { set({ hydrated: true }); return; }
    try {
      const { user } = await authApi.me();
      set({ user, token, hydrated: true });
    } catch {
      localStorage.removeItem('gt_token');
      set({ hydrated: true });
    }
  },

  updateUser: async (data) => {
    const { user } = await authApi.updateMe(data);
    set({ user });
  },

  clearError: () => set({ error: null }),
}));
