import axios, {
  type AxiosError,
  type InternalAxiosRequestConfig,
} from "axios";
import {
  clearAuthentication,
  getAccessToken,
  refreshAuthentication,
} from "@/lib/authSession";
import { publicApiBaseUrl } from "@/config/publicConfig";

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
        window.location.assign("/login");
      }
    }

    return Promise.reject(error);
  }
);

// =========================
// Interfaces
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

export const getCategories = async () => {
  const response = await api.get("/categories");

  return response.data.data || [];
};

// =========================
// Brands
// =========================

export const getBrands = async () => {
  const response = await api.get("/brands");

  return response.data.data || [];
};

// =========================
// Products
// =========================

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

  if (params?.category)
    queryParams.append("category", params.category);

  if (params?.subcategory)
    queryParams.append("subcategory", params.subcategory);

  if (params?.brand)
    queryParams.append("brand", params.brand);

  if (params?.minPrice)
    queryParams.append("minPrice", params.minPrice.toString());

  if (params?.maxPrice)
    queryParams.append("maxPrice", params.maxPrice.toString());

  if (params?.sortBy)
    queryParams.append("sortBy", params.sortBy);

  if (params?.page)
    queryParams.append("page", params.page.toString());

  if (params?.limit)
    queryParams.append("limit", params.limit.toString());

  if (params?.keyword)
    queryParams.append("keyword", params.keyword);

  const response = await api.get(
    `/products?${queryParams.toString()}`
  );

  return response.data;
};

// =========================
// Search
// =========================

interface SearchProductsOptions {
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

  const response = await api.get(
    `/products?${params.toString()}`,
    {
      signal,
    }
  );

  if (!response.data?.success) {
    return [];
  }

  return response.data.data ?? [];
};

export default api;
