import axios, {
  type AxiosError,
  type InternalAxiosRequestConfig,
} from "axios";
import {
  clearAuthentication,
  getAccessToken,
  refreshAuthentication,
} from "./authSession.ts";
import { publicApiBaseUrl } from "../config/publicConfig.ts";
import {
  normalizeProduct,
  normalizePagination,
  getSafeMediaUrl,
} from "./catalogAdapter.ts";
import type {
  Product,
  Category,
  Brand,
  PaginationMeta,
} from "../types/product.ts";

const api = axios.create({
  baseURL: publicApiBaseUrl,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

interface RetryRequestConfig extends InternalAxiosRequestConfig {
  _authRetry?: boolean;
}

api.interceptors.request.use(
  (config) => {
    if (typeof window === 'undefined') {
      const runtimeUrl = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL;
      if (runtimeUrl) {
        try {
          const parsed = new URL(runtimeUrl);
          config.baseURL = `${parsed.origin}/api`;
        } catch {
          // Fallback to static baseURL
        }
      }
    }
    const token = getAccessToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const request = error.config as RetryRequestConfig | undefined;
    const url = request?.url || "";
    const nonRetryable = [
      "/auth/login",
      "/auth/register",
      "/auth/refresh",
      "/auth/csrf-token",
      "/auth/forgot-password",
      "/auth/reset-password",
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
        typeof window !== "undefined"
        && window.location.pathname !== "/login"
      ) {
        window.location.replace("/login");
      }
    }

    return Promise.reject(error);
  }
);

// =========================
// Search Autocomplete Suggestion Interface
// =========================

export interface SearchSuggestion {
  _id: string;
  name: string;
  slug: string;
  image: string;
  price: number;
  category?: {
    name: string;
  };
}

// =========================
// Categories & Brands
// =========================

export const getCategories = async (): Promise<Category[]> => {
  try {
    const response = await api.get("/categories");
    if (!response.data?.success || !Array.isArray(response.data.data)) {
      return [];
    }
    return response.data.data.map((cat: Record<string, unknown>) => ({
      _id: String(cat._id || ''),
      name: String(cat.name || ''),
      slug: String(cat.slug || cat._id || ''),
      description: cat.description ? String(cat.description) : undefined,
      image: getSafeMediaUrl(cat.image ? String(cat.image) : undefined),
      parentId: cat.parentId ? String(cat.parentId) : null,
      isActive: cat.isActive !== undefined ? Boolean(cat.isActive) : true,
      displayOrder: typeof cat.displayOrder === 'number' ? cat.displayOrder : 0,
    })).filter((cat: Category) => Boolean(cat._id && cat.name));
  } catch {
    return [];
  }
};

export const getBrands = async (): Promise<Brand[]> => {
  try {
    const response = await api.get("/brands");
    if (!response.data?.success || !Array.isArray(response.data.data)) {
      return [];
    }
    return response.data.data.map((brand: Record<string, unknown>) => ({
      _id: String(brand._id || ''),
      name: String(brand.name || ''),
      slug: String(brand.slug || brand._id || ''),
      logo: getSafeMediaUrl(brand.logo ? String(brand.logo) : undefined),
      description: brand.description ? String(brand.description) : undefined,
      isActive: brand.isActive !== undefined ? Boolean(brand.isActive) : true,
    })).filter((brand: Brand) => Boolean(brand._id && brand.name));
  } catch {
    return [];
  }
};

// =========================
// Products & Catalog API
// =========================

export interface GetProductsParams {
  category?: string;
  subcategory?: string;
  brand?: string;
  minPrice?: number | string;
  maxPrice?: number | string;
  rating?: number | string;
  inStock?: string;
  sortBy?: string;
  page?: number | string;
  limit?: number | string;
  keyword?: string;
  signal?: AbortSignal;
}

export interface ProductsResponse {
  success: boolean;
  data: Product[];
  pagination: PaginationMeta;
}

export const getProducts = async (
  params?: GetProductsParams
): Promise<ProductsResponse> => {
  const queryParams = new URLSearchParams();

  if (params?.category) queryParams.set("category", params.category);
  if (params?.subcategory) queryParams.set("subcategory", params.subcategory);
  if (params?.brand) queryParams.set("brand", params.brand);
  if (params?.minPrice !== undefined && params.minPrice !== "") queryParams.set("minPrice", String(params.minPrice));
  if (params?.maxPrice !== undefined && params.maxPrice !== "") queryParams.set("maxPrice", String(params.maxPrice));
  if (params?.rating) queryParams.set("rating", String(params.rating));
  if (params?.inStock) queryParams.set("inStock", params.inStock);
  if (params?.sortBy) queryParams.set("sortBy", params.sortBy);
  if (params?.page) queryParams.set("page", String(params.page));
  if (params?.limit) queryParams.set("limit", String(params.limit));
  if (params?.keyword) queryParams.set("keyword", params.keyword.trim());

  const response = await api.get(`/products?${queryParams.toString()}`, {
    signal: params?.signal,
  });

  const rawList = Array.isArray(response.data?.data) ? response.data.data : [];
  const normalizedProducts = rawList
    .map(normalizeProduct)
    .filter((p: Product | null): p is Product => p !== null && p.status === 'published' && p.isActive !== false);

  return {
    success: Boolean(response.data?.success),
    data: normalizedProducts,
    pagination: normalizePagination(response.data?.pagination),
  };
};

export const getProduct = async (idOrSlug: string, signal?: AbortSignal): Promise<Product | null> => {
  if (!idOrSlug || typeof idOrSlug !== 'string') {
    return null;
  }
  const response = await api.get(`/products/${encodeURIComponent(idOrSlug.trim())}`, { signal });
  if (!response.data?.success || !response.data?.data) {
    return null;
  }
  return normalizeProduct(response.data.data);
};

export const getTopProducts = async (limit = 8, signal?: AbortSignal): Promise<Product[]> => {
  try {
    const response = await api.get(`/products/top?limit=${limit}`, { signal });
    if (!response.data?.success || !Array.isArray(response.data.data)) {
      return [];
    }
    return response.data.data
      .map(normalizeProduct)
      .filter((p: Product | null): p is Product => p !== null && p.status === 'published' && p.isActive !== false);
  } catch {
    return [];
  }
};

export const getRecommendedProducts = async (limit = 8, signal?: AbortSignal): Promise<Product[]> => {
  try {
    const response = await api.get(`/products/recommended?limit=${limit}`, { signal });
    if (!response.data?.success || !Array.isArray(response.data.data)) {
      return [];
    }
    return response.data.data
      .map(normalizeProduct)
      .filter((p: Product | null): p is Product => p !== null && p.status === 'published' && p.isActive !== false);
  } catch {
    return [];
  }
};

export const getRecentlyViewed = async (ids: string[], signal?: AbortSignal): Promise<Product[]> => {
  if (!ids || ids.length === 0) {
    return [];
  }
  try {
    const response = await api.get(`/products/recently-viewed?ids=${ids.join(',')}`, { signal });
    if (!response.data?.success || !Array.isArray(response.data.data)) {
      return [];
    }
    return response.data.data
      .map(normalizeProduct)
      .filter((p: Product | null): p is Product => p !== null && p.status === 'published' && p.isActive !== false);
  } catch {
    return [];
  }
};

// =========================
// Autocomplete Search
// =========================

export interface SearchProductsOptions {
  keyword: string;
  limit?: number;
  signal?: AbortSignal;
}

export const searchProducts = async ({
  keyword,
  limit = 8,
  signal,
}: SearchProductsOptions): Promise<SearchSuggestion[]> => {
  const query = keyword.trim();

  if (query.length < 2) {
    return [];
  }

  const params = new URLSearchParams({
    keyword: query,
    autocomplete: "true",
    limit: String(limit),
  });

  const response = await api.get(`/products?${params.toString()}`, {
    signal,
  });

  if (!response.data?.success || !Array.isArray(response.data.data)) {
    return [];
  }

  return response.data.data.map((item: Record<string, unknown>) => ({
    _id: String(item._id || item.id || ''),
    name: String(item.name || ''),
    slug: String(item.slug || item._id || ''),
    image: getSafeMediaUrl(item.image ? String(item.image) : item.primaryImage ? String(item.primaryImage) : undefined),
    price: typeof item.price === 'number' ? item.price : parseFloat(String(item.price || 0)) || 0,
    category: item.category && typeof item.category === 'object'
      ? { name: String((item.category as Record<string, unknown>).name || 'Product') }
      : undefined,
  })).filter((item: SearchSuggestion) => Boolean(item._id && item.name));
};

export default api;
