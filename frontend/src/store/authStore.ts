import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import axios from 'axios';

export interface User {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  role?: string;
  isVerified: boolean;
  createdAt?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string, rememberMe: boolean) => Promise<{ success: boolean; message: string }>;
  register: (data: { fullName: string; email: string; phone?: string; password: string }) => Promise<{ success: boolean; message: string }>;
  logout: () => void;
  forgotPassword: (email: string) => Promise<{ success: boolean; message: string }>;
  resetPassword: (token: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
  updateUser: (data: Partial<User>) => void;
  checkAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      // ✅ REAL BACKEND API CALL
      login: async (email, password, rememberMe) => {
        try {
          const response = await axios.post(
            `${process.env.NEXT_PUBLIC_API_URL}/auth/login`,
            { email, password },
            { withCredentials: true }
          );

          if (response.data.success) {
            const { user, token } = response.data.data;
            
            set({
              user: {
                id: user.id,
                fullName: user.fullName,
                email: user.email,
                phone: user.phone,
                role: user.role,
                isVerified: true
              },
              token,
              isAuthenticated: true
            });

            return { success: true, message: 'Login successful!' };
          } else {
            return { success: false, message: response.data.message || 'Login failed' };
          }
        } catch (error: any) {
          const message = error.response?.data?.message || 'Invalid email or password';
          return { success: false, message };
        }
      },

      // ✅ REAL BACKEND API CALL
      register: async (data) => {
        try {
          const response = await axios.post(
            `${process.env.NEXT_PUBLIC_API_URL}/auth/register`,
            data,
            { withCredentials: true }
          );

          if (response.data.success) {
            const { user, token } = response.data.data;
            
            set({
              user: {
                id: user.id,
                fullName: user.fullName,
                email: user.email,
                phone: user.phone,
                role: user.role,
                isVerified: true
              },
              token,
              isAuthenticated: true
            });

            return { success: true, message: 'Registration successful!' };
          } else {
            return { success: false, message: response.data.message || 'Registration failed' };
          }
        } catch (error: any) {
          const message = error.response?.data?.message || 'Registration failed';
          return { success: false, message };
        }
      },

      forgotPassword: async (email) => {
        try {
          const response = await axios.post(
            `${process.env.NEXT_PUBLIC_API_URL}/auth/forgot-password`,
            { email }
          );
          return { success: true, message: 'Password reset link sent to your email' };
        } catch (error: any) {
          return { success: false, message: error.response?.data?.message || 'Failed to send reset link' };
        }
      },

      resetPassword: async (token, newPassword) => {
        try {
          const response = await axios.post(
            `${process.env.NEXT_PUBLIC_API_URL}/auth/reset-password`,
            { token, newPassword }
          );
          return { success: true, message: 'Password reset successful!' };
        } catch (error: any) {
          return { success: false, message: error.response?.data?.message || 'Reset failed' };
        }
      },

      logout: () => {
        set({
          user: null,
          token: null,
          isAuthenticated: false
        });
        // Clear localStorage
        if (typeof window !== 'undefined') {
          localStorage.removeItem('mevapur-auth-storage');
        }
      },

      updateUser: (data) => {
        const currentUser = get().user;
        if (currentUser) {
          set({
            user: { ...currentUser, ...data }
          });
        }
      },

      checkAuth: () => {
        const state = get();
        if (state.token && state.user) {
          set({ isAuthenticated: true });
        }
      }
    }),
    {
      name: 'mevapur-auth-storage',
      partialize: (state) => ({ 
        user: state.user, 
        token: state.token,
        isAuthenticated: state.isAuthenticated
      }),
    }
  )
);