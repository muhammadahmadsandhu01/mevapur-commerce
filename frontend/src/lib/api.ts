import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Add token from Zustand store
api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      // ✅ FIXED: Read from Zustand persist storage key
      const authStorage = localStorage.getItem('mevapur-auth-storage');
      let token: string | null = null;
      
      if (authStorage) {
        try {
          const parsed = JSON.parse(authStorage);
          token = parsed.state?.token || null;
        } catch (e) {
          console.error('Failed to parse auth storage', e);
        }
      }

      // Fallback to old key for backward compatibility
      if (!token) {
        token = localStorage.getItem('token');
      }

      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('mevapur-auth-storage');
        localStorage.removeItem('token');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const getCategories = async () => {
  const response = await api.get('/categories');
  return response.data.data || [];
};

export const getBrands = async () => {
  const response = await api.get('/brands');
  return response.data.data || [];
};

export const getProducts = async (params?: {
  category?: string;
  subcategory?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: string;
  page?: number;
  limit?: number;
  keyword?: string;
}) => {
  const queryParams = new URLSearchParams();
  
  if (params?.category) queryParams.append('category', params.category);
  if (params?.subcategory) queryParams.append('subcategory', params.subcategory);
  if (params?.brand) queryParams.append('brand', params.brand);
  if (params?.minPrice) queryParams.append('minPrice', params.minPrice.toString());
  if (params?.maxPrice) queryParams.append('maxPrice', params.maxPrice.toString());
  if (params?.sortBy) queryParams.append('sortBy', params.sortBy);
  if (params?.page) queryParams.append('page', params.page.toString());
  if (params?.limit) queryParams.append('limit', params.limit.toString());
  if (params?.keyword) queryParams.append('keyword', params.keyword);

  const response = await api.get(`/products?${queryParams.toString()}`);
  return response.data;
};

export default api;