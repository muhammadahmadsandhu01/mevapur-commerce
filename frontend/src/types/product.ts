export interface ProductAttribute {
  name: string;
  value: string;
}

export interface ProductVariant {
  sku: string;
  barcode?: string;
  attributes: ProductAttribute[]; // e.g., [{ name: "Weight", value: "500g" }]
  price: number;
  salePrice?: number;
  stock: number;
  images: string[];
  isDefault: boolean;
}

export interface Product {
  _id: string;
  id?: string;
  name: string;
  slug?: string;
  description: string;
  shortDescription?: string;
  
  // Backward Compatibility: Root level price/stock for existing components
  price: number;
  originalPrice?: number;
  stock: number;
  
  // New Enterprise Fields (Optional for safety)
  category?: string; // Category ID or Name
  subcategory?: string;
  brand?: string;
  discount?: number;
  rating?: number;
  reviewCount?: number;
  numReviews?: number;
  
  image?: string;
  images?: string[];
  primaryImage?: string;
  gallery?: string[];
  
  // Advanced Features
  attributes?: ProductAttribute[];
  variants?: ProductVariant[];
  isFeatured?: boolean;
  isActive?: boolean;
}

export interface Category {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  icon?: string;
  parentId?: string | null; // null = Main Category, string = Subcategory
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