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

export const adminApi = axios.create({
  baseURL: publicApiBaseUrl,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

interface RetryRequestConfig extends InternalAxiosRequestConfig {
  _authRetry?: boolean;
}

adminApi.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle errors
adminApi.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const request = error.config as RetryRequestConfig | undefined;
    if (
      error.response?.status === 401
      && request
      && !request._authRetry
    ) {
      request._authRetry = true;
      try {
        const refreshed = await refreshAuthentication();
        if (refreshed) {
          request.headers.Authorization = `Bearer ${refreshed.accessToken}`;
          return adminApi(request);
        }
      } catch {
        clearAuthentication(true);
      }

      if (typeof window !== 'undefined') {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  }
);

// Stats fetch karna
export const getAdminStats = async () => {
  const response = await adminApi.get('/orders/stats');
  return response.data.data;
};

// Recent orders fetch karna
export const getRecentOrders = async (limit = 5) => {
  const response = await adminApi.get(`/orders/recent?limit=${limit}`);
  return response.data.data;
};

// All orders with pagination
export const getOrders = async (page = 1, limit = 10, filters = {}) => {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    ...filters
  });
  const response = await adminApi.get(`/orders?${params}`);
  return response.data;
};

// Update order status
export const updateOrderStatus = async (orderId: string, status: string, notes?: string) => {
  const response = await adminApi.put(`/orders/${orderId}/status`, {
    orderStatus: status,
    adminNote: notes
  });
  return response.data;
};

// Products
export const getProducts = async (page = 1, limit = 10, filters = {}) => {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    ...filters
  });
  const response = await adminApi.get(`/products?${params}`);
  return response.data;
};

export const createProduct = async (productData: AdminMutationPayload) => {
  const response = await adminApi.post('/products', productData);
  return response.data;
};

export const updateProduct = async (id: string, productData: AdminMutationPayload) => {
  const response = await adminApi.put(`/products/${id}`, productData);
  return response.data;
};

export const deleteProduct = async (id: string) => {
  const response = await adminApi.delete(`/products/${id}`);
  return response.data;
};

// Categories
export const getCategories = async () => {
  const response = await adminApi.get('/categories');
  return response.data.data;
};

export const createCategory = async (categoryData: AdminMutationPayload) => {
  const response = await adminApi.post('/categories', categoryData);
  return response.data;
};

export const updateCategory = async (id: string, categoryData: AdminMutationPayload) => {
  const response = await adminApi.put(`/categories/${id}`, categoryData);
  return response.data;
};

export const deleteCategory = async (id: string) => {
  const response = await adminApi.delete(`/categories/${id}`);
  return response.data;
};

// Brands
export const getBrands = async () => {
  const response = await adminApi.get('/brands');
  return response.data.data;
};

export const createBrand = async (brandData: AdminMutationPayload) => {
  const response = await adminApi.post('/brands', brandData);
  return response.data;
};

export const updateBrand = async (id: string, brandData: AdminMutationPayload) => {
  const response = await adminApi.put(`/brands/${id}`, brandData);
  return response.data;
};

export const deleteBrand = async (id: string) => {
  const response = await adminApi.delete(`/brands/${id}`);
  return response.data;
};
