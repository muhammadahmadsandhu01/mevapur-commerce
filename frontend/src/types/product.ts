export interface ProductAttribute {
  name: string;
  value: string;
}

export interface ProductVariant {
  _id: string;
  sku: string;
  barcode?: string;
  attributes: ProductAttribute[];
  price: number;
  salePrice?: number;
  stock: number;
  images: string[];
  isDefault: boolean;
}

export interface Category {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  icon?: string;
  parentId?: string | null;
  isActive?: boolean;
  displayOrder?: number;
}

export interface Brand {
  _id: string;
  name: string;
  slug: string;
  logo?: string;
  banner?: string;
  description?: string;
  isFeatured?: boolean;
  isActive?: boolean;
}

export interface Product {
  _id: string;
  id?: string;
  name: string;
  slug: string;
  description?: string;
  shortDescription?: string;
  price: number;
  originalPrice?: number;
  stock: number;
  sku?: string;
  soldCount?: number;
  highlights?: string[];
  specifications?: Record<string, string>;
  category?: Category | { _id?: string; name: string; slug?: string; description?: string; image?: string } | null;
  subcategory?: Category | { _id?: string; name: string; slug?: string } | null;
  brand?: Brand | { _id?: string; name: string; slug?: string; logo?: string } | null;
  discount?: number;
  rating: number;
  reviewCount: number;
  numReviews?: number;
  image: string;
  images: string[];
  primaryImage?: string;
  gallery?: string[];
  attributes?: ProductAttribute[];
  variants?: ProductVariant[];
  isFeatured?: boolean;
  isActive?: boolean;
  status?: 'published' | 'draft' | 'inactive' | 'archived';
  views?: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  seo?: {
    metaTitle?: string;
    metaDescription?: string;
    keywords?: string;
  };
}

export interface PaginationMeta {
  page: number;
  pages: number;
  total: number;
  limit: number;
  hasNext: boolean;
  hasPrev: boolean;
}
