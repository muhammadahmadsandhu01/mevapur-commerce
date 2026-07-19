import axios from "axios";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// =========================
// Request Interceptor
// =========================

api.interceptors.request.use(
  (config) => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("token");

      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// =========================
// Response Interceptor
// =========================

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      typeof window !== "undefined"
    ) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }

    return Promise.reject(error);
  }
);

// =========================
// Interfaces
// =========================

export interface Product {
  _id: string;
  name: string;
  slug: string;
  price: number;
  image: string;

  category?: {
    name: string;
  };
}

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
// Categories
// =========================

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