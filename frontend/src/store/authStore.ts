import { create } from 'zustand';
import axios from 'axios';
import {
  acceptAuthentication,
  authHttp,
  clearAuthentication,
  logoutAuthentication,
  refreshAuthentication,
  setInvalidationHandler,
  type AuthPayload,
} from '@/lib/authSession';

export interface User {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  role?: string;
  isVerified: boolean;
  createdAt?: string;
}

interface AuthResult {
  success: boolean;
  message: string;
  code?: string;
  requiresEmailVerification?: boolean;
  emailDeliveryFailed?: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  bootstrap: () => Promise<void>;
  login: (
    email: string,
    password: string,
    rememberMe: boolean
  ) => Promise<AuthResult>;
  register: (data: {
    fullName: string;
    email: string;
    phone?: string;
    password: string;
    redirect?: string;
  }) => Promise<AuthResult>;
  verifyEmail: (token: string) => Promise<AuthResult>;
  resendVerification: (email: string, redirect?: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<AuthResult>;
  resetPassword: (token: string, newPassword: string) => Promise<AuthResult>;
  updateUser: (data: Partial<User>) => void;
}

interface ErrorResponse {
  error?: { message?: string; code?: string };
  message?: string;
  code?: string;
}

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
        if (payload) {
          set({
            user: payload.user,
            token: payload.accessToken,
            isAuthenticated: true,
          });
        } else {
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

  login: async (email, password, rememberMe) => {
    void rememberMe;
    try {
      const response = await authHttp.post('/auth/login', { email, password });
      const payload = acceptAuthentication(
        response.data.data as AuthPayload<User>
      );
      set({
        user: payload.user,
        token: payload.accessToken,
        isAuthenticated: true,
        isInitialized: true,
      });
      return { success: true, message: 'Login successful!' };
    } catch (error) {
      clearAuthentication();
      const code = axios.isAxiosError<ErrorResponse>(error)
        ? (error.response?.data?.error?.code || error.response?.data?.code)
        : undefined;
      return {
        success: false,
        code,
        message: errorMessage(error, 'Invalid email or password'),
      };
    }
  },

  register: async (data) => {
    try {
      const response = await authHttp.post('/auth/register', data);
      const resData = response.data?.data;
      if (resData?.requiresEmailVerification) {
        clearAuthentication();
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isInitialized: true,
        });
        return {
          success: true,
          requiresEmailVerification: true,
          emailDeliveryFailed: Boolean(resData.emailDeliveryFailed),
          message: response.data?.message || 'Registration successful! Please check your email to verify your account.',
        };
      }
      const payload = acceptAuthentication(
        resData as AuthPayload<User>
      );
      set({
        user: payload.user,
        token: payload.accessToken,
        isAuthenticated: true,
        isInitialized: true,
      });
      return { success: true, requiresEmailVerification: false, message: 'Registration successful!' };
    } catch (error) {
      clearAuthentication();
      const code = axios.isAxiosError<ErrorResponse>(error)
        ? (error.response?.data?.error?.code || error.response?.data?.code)
        : undefined;
      return {
        success: false,
        code,
        requiresEmailVerification: false,
        message: errorMessage(error, 'Registration failed'),
      };
    }
  },

  verifyEmail: async (token: string) => {
    try {
      const response = await authHttp.post('/auth/verify-email', { token });
      return {
        success: true,
        message: response.data?.message || 'Email verified successfully!',
      };
    } catch (error) {
      const code = axios.isAxiosError<ErrorResponse>(error)
        ? (error.response?.data?.error?.code || error.response?.data?.code)
        : undefined;
      return {
        success: false,
        code,
        message: errorMessage(error, 'Verification failed or token has expired'),
      };
    }
  },

  resendVerification: async (email: string, redirect?: string) => {
    try {
      const response = await authHttp.post('/auth/resend-verification', { email, redirect });
      return {
        success: true,
        message: response.data?.message || 'If an unverified account exists with this email, a verification link has been sent.',
      };
    } catch (error) {
      return {
        success: false,
        message: errorMessage(error, 'Failed to resend verification email'),
      };
    }
  },

  forgotPassword: async (email) => {
    try {
      const response = await authHttp.post('/auth/forgot-password', { email });
      return {
        success: true,
        message: response.data.message
          || 'Password reset instructions have been sent',
      };
    } catch (error) {
      return {
        success: false,
        message: errorMessage(error, 'Failed to send reset instructions'),
      };
    }
  },

  resetPassword: async (resetToken, newPassword) => {
    try {
      await authHttp.post('/auth/reset-password', {
        resetToken,
        newPassword,
      });
      clearAuthentication();
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isInitialized: true,
      });
      return { success: true, message: 'Password reset successful!' };
    } catch (error) {
      return {
        success: false,
        message: errorMessage(error, 'Password reset failed'),
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

  updateUser: (data) => {
    const currentUser = get().user;
    if (currentUser) set({ user: { ...currentUser, ...data } });
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
