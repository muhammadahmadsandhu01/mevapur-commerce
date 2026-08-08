import axios, {
  type AxiosError,
  type InternalAxiosRequestConfig,
} from 'axios';
import {
  clearAuthentication,
  getAccessToken,
  refreshAuthentication,
} from '@/lib/authSession';
import { publicApiBaseUrl } from '@/config/publicConfig';

type AdminMutationPayload = Record<string, unknown>;

const api = axios.create({
  baseURL: publicApiBaseUrl,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

interface RetryRequestConfig extends InternalAxiosRequestConfig {
  _authRetry?: boolean;
}

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const request = error.config as RetryRequestConfig | undefined;
    const url = request?.url || '';
    const nonRetryable = [
      '/auth/login',
      '/auth/refresh',
      '/auth/csrf-token',
    ].some((path) => url.includes(path));

    if (
      error.response?.status === 401
      && request
      && !request._authRetry
      && !nonRetryable
    ) {
      request._authRetry = true;
      try {
        const refreshed = await refreshAuthentication();
        if (refreshed) {
          request.headers.Authorization = `Bearer ${refreshed.accessToken}`;
          return api(request);
        }
      } catch {
        clearAuthentication(true);
      }

      if (
        typeof window !== 'undefined'
        && window.location.pathname !== '/login'
      ) {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  }
);

// ==========================================
// 🚀 ADMIN HELPER FUNCTIONS
// ==========================================

export const getAdminStats = async () => {
  const response = await api.get('/orders/stats');
  return response.data.data.stats;
};

export const getRecentOrders = async (limit = 5) => {
  const response = await api.get(`/orders/recent?limit=${limit}`);
  return response.data.data.orders;
};

export const getOrders = async (page = 1, limit = 10, filters = {}) => {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    ...filters
  });
  const response = await api.get(`/orders?${params}`);
  return response.data;
};

export const updateOrderStatus = async (orderId: string, status: string, notes?: string) => {
  const response = await api.put(`/orders/${orderId}/status`, {
    orderStatus: status,
    adminNote: notes
  });
  return response.data;
};

export const getProducts = async (page = 1, limit = 10, filters = {}) => {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    ...filters
  });
  const response = await api.get(`/products?${params}`);
  return response.data;
};

export const createProduct = async (productData: AdminMutationPayload) => {
  const response = await api.post('/products', productData);
  return response.data;
};

export const updateProduct = async (id: string, productData: AdminMutationPayload) => {
  const response = await api.put(`/products/${id}`, productData);
  return response.data;
};

export const deleteProduct = async (id: string) => {
  const response = await api.delete(`/products/${id}`);
  return response.data;
};

export const getCategories = async () => {
  const response = await api.get('/categories');
  return response.data.data;
};

export const createCategory = async (categoryData: AdminMutationPayload) => {
  const response = await api.post('/categories', categoryData);
  return response.data;
};

export const updateCategory = async (id: string, categoryData: AdminMutationPayload) => {
  const response = await api.put(`/categories/${id}`, categoryData);
  return response.data;
};

export const deleteCategory = async (id: string) => {
  const response = await api.delete(`/categories/${id}`);
  return response.data;
};

export const getBrands = async () => {
  const response = await api.get('/brands');
  return response.data.data;
};

export const createBrand = async (brandData: AdminMutationPayload) => {
  const response = await api.post('/brands', brandData);
  return response.data;
};

export const updateBrand = async (id: string, brandData: AdminMutationPayload) => {
  const response = await api.put(`/brands/${id}`, brandData);
  return response.data;
};

export const deleteBrand = async (id: string) => {
  const response = await api.delete(`/brands/${id}`);
  return response.data;
};

export default api;
