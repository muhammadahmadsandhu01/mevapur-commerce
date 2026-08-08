import { create } from 'zustand';
import axios from 'axios';
import { User } from '@/types';
import {
  acceptAuthentication,
  authHttp,
  clearAuthentication,
  logoutAuthentication,
  refreshAuthentication,
  setInvalidationHandler,
  type AuthPayload,
} from '@/lib/authSession';

interface AuthResult {
  success: boolean;
  message: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
}

interface ErrorResponse {
  error?: { message?: string };
  message?: string;
}

const isAdminUser = (user: User) => (
  user.role === 'admin' || user.role === 'super_admin'
);

const errorMessage = (error: unknown, fallback: string) => {
  if (!axios.isAxiosError<ErrorResponse>(error)) return fallback;
  return error.response?.data?.error?.message
    || error.response?.data?.message
    || fallback;
};

let bootstrapInFlight: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isInitialized: false,

  bootstrap: async () => {
    if (get().isInitialized) return;
    if (bootstrapInFlight) return bootstrapInFlight;

    bootstrapInFlight = (async () => {
      try {
        const payload = await refreshAuthentication(true) as
          AuthPayload<User> | null;
        if (payload && isAdminUser(payload.user)) {
          set({
            user: payload.user,
            token: payload.accessToken,
            isAuthenticated: true,
          });
        } else {
          if (payload) await logoutAuthentication();
          set({ user: null, token: null, isAuthenticated: false });
        }
      } catch {
        clearAuthentication();
        set({ user: null, token: null, isAuthenticated: false });
      } finally {
        set({ isInitialized: true });
        bootstrapInFlight = null;
      }
    })();

    return bootstrapInFlight;
  },

  login: async (email, password) => {
    try {
      const response = await authHttp.post('/auth/login', { email, password });
      const payload = acceptAuthentication(
        response.data.data as AuthPayload<User>
      );

      if (!isAdminUser(payload.user)) {
        await logoutAuthentication();
        return {
          success: false,
          message: 'Access denied. Admin privileges are required.',
        };
      }

      set({
        user: payload.user,
        token: payload.accessToken,
        isAuthenticated: true,
        isInitialized: true,
      });
      return { success: true, message: 'Login successful!' };
    } catch (error) {
      clearAuthentication();
      return {
        success: false,
        message: errorMessage(error, 'Login failed'),
      };
    }
  },

  logout: async () => {
    const request = logoutAuthentication();
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      isInitialized: true,
    });
    await request.catch(() => undefined);
  },
}));

setInvalidationHandler(() => {
  useAuthStore.setState({
    user: null,
    token: null,
    isAuthenticated: false,
    isInitialized: true,
  });
});
