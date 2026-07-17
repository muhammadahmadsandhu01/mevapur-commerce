import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import axios from 'axios';
import { User } from '@/types';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message: string }>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: async (email, password) => {
        try {
          console.log('🔐 Attempting login...', { email });
          
          const response = await axios.post(
            `${process.env.NEXT_PUBLIC_API_URL}/auth/login`,
            { email, password }
          );

          console.log('✅ Login response:', response.data);

          if (response.data.success) {
            const { user, token } = response.data.data;
            
            // ✅ Strict Admin Check
            if (user.role !== 'admin' && user.role !== 'super_admin') {
              console.log('❌ Access denied - not admin. Role:', user.role);
              return { 
                success: false, 
                message: 'Access denied. Admin privileges required. Your role: ' + (user.role || 'user')
              };
            }

            set({
              user: {
                id: user.id || user._id,
                fullName: user.fullName,
                email: user.email,
                role: user.role
              } as User, // ✅ Type assertion to prevent TS errors
              token,
              isAuthenticated: true
            });

            console.log('✅ Login successful, redirecting...');
            return { success: true, message: 'Login successful!' };
          } else {
            return { success: false, message: 'Login failed' };
          }
        } catch (error: any) {
          console.error('❌ Login error:', error);
          
          let message = 'Login failed';
          if (error.response?.data?.message) {
            message = error.response.data.message;
          } else if (error.response?.status === 401) {
            message = 'Invalid email or password';
          } else if (error.response?.status === 403) {
            message = 'Access denied. Admin only.';
          } else if (error.code === 'ERR_NETWORK') {
            message = 'Cannot connect to backend. Please check if backend is running.';
          } else if (error.message) {
            message = error.message;
          }
          
          return { success: false, message };
        }
      },

      logout: () => {
        set({
          user: null,
          token: null,
          isAuthenticated: false
        });
      }
    }),
    {
      name: 'mevapur-admin-auth',
    }
  )
);