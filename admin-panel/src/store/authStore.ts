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
            
            // ✅ Check if user is admin (role check)
            if (user.role !== 'admin' && user.role !== 'super_admin') {
              console.log('❌ Access denied - not admin. Role:', user.role);
              return { 
                success: false, 
                message: 'Access denied. Admin only. Your role: ' + user.role 
              };
            }

            set({
              user: {
                id: user.id,
                fullName: user.fullName,
                email: user.email,
                role: user.role
              },
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
          console.error('❌ Error response:', error.response?.data);
          console.error('❌ Error status:', error.response?.status);
          
          let message = 'Login failed';
          
          if (error.response?.data?.message) {
            message = error.response.data.message;
          } else if (error.response?.status === 401) {
            message = 'Invalid email or password';
          } else if (error.response?.status === 403) {
            message = 'Access denied. Admin only.';
          } else if (error.code === 'ERR_NETWORK') {
            message = 'Cannot connect to backend. Please check if backend is running on port 5000.';
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