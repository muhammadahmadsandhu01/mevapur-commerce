import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export const adminApi = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Add token if exists
adminApi.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
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
adminApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        window.location.href = '/login';
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
    adminNotes: notes
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

export const createProduct = async (productData: any) => {
  const response = await adminApi.post('/products', productData);
  return response.data;
};

export const updateProduct = async (id: string, productData: any) => {
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

export const createCategory = async (categoryData: any) => {
  const response = await adminApi.post('/categories', categoryData);
  return response.data;
};

export const updateCategory = async (id: string, categoryData: any) => {
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

export const createBrand = async (brandData: any) => {
  const response = await adminApi.post('/brands', brandData);
  return response.data;
};

export const updateBrand = async (id: string, brandData: any) => {
  const response = await adminApi.put(`/brands/${id}`, brandData);
  return response.data;
};

export const deleteBrand = async (id: string) => {
  const response = await adminApi.delete(`/brands/${id}`);
  return response.data;
};