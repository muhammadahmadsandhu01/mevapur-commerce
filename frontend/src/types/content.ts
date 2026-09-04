export type ContentType = 'banner' | 'slider' | 'page' | 'blog';

export interface ContentItem {
  _id: string;
  type: ContentType;
  title: string;
  slug: string;
  subtitle?: string;
  description?: string;
  content?: string;
  image?: string;
  images?: Array<{
    url: string;
    alt?: string;
    link?: string;
  }>;
  button?: {
    text?: string;
    link?: string;
  };
  position: number;
  isActive: boolean;
  isFeatured?: boolean;
  category?: string;
  seo?: {
    metaTitle?: string;
    metaDescription?: string;
    keywords?: string;
  };
  startDate?: string;
  endDate?: string;
  views?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface PublicStoreSettings {
  store?: {
    store_name?: string;
    store_email?: string;
    store_phone?: string;
    store_address?: string;
    currency?: string;
  };
  social?: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
    youtube?: string;
    linkedin?: string;
    website?: string;
  };
  storeName?: string;
  logo?: string;
  maintenanceMode?: boolean;
}
