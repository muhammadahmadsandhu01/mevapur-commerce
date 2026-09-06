import axios from 'axios';

export interface ProductFormFieldValues {
  name: string;
  slug?: string;
  shortName?: string;
  shortDescription?: string;
  description?: string;
  category?: string | null;
  subcategory?: string | null;
  brand?: string | null;
  sku?: string | null;
  barcode?: string;
  costPrice?: number;
  price: number;
  originalPrice?: number;
  salePrice?: number;
  stock?: number;
  initialStock?: number;
  lowStockAlert?: number;
  isFeatured?: boolean;
  isNewArrival?: boolean;
  isBestSeller?: boolean;
  isTrending?: boolean;
  allowBackorders?: boolean;
  trackInventory?: boolean;
  tags?: string[];
  ingredients?: string;
  nutritionalFacts?: string;
  storageInstructions?: string;
  shelfLife?: string;
  countryOfOrigin?: string;
  weight?: number;
  dimensions?: { length: number; width: number; height: number; unit?: string };
  shippingClass?: string;
  freeShipping?: boolean;
  taxClass?: string;
  publishDate?: string;
  enableReviews?: boolean;
  allowWishlist?: boolean;
  allowCompare?: boolean;
  allowCOD?: boolean;
  relatedProducts?: string[];
  attributes?: Array<{ name: string; value: string }>;
  variants?: Array<{
    _id?: string;
    sku: string;
    barcode?: string;
    weight?: number;
    attributes: Array<{ name: string; value: string }>;
    price: number;
    salePrice?: number;
    stock?: number;
    mediaAssetIds?: string[];
    images?: string[];
    isDefault?: boolean;
  }>;
  images?: string[];
  primaryImage?: string;
  videoUrl?: string;
  seoTitle?: string;
  metaDescription?: string;
  keywords?: string;
  canonicalUrl?: string;
}

export interface FormValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
  firstErrorField?: string;
  firstErrorMessage?: string;
}

export type UploadStateMachineState = 'idle' | 'uploading' | 'failed' | 'retrying' | 'succeeded' | 'removed';

export interface UploadStateTransitionResult {
  state: UploadStateMachineState;
  error?: string | null;
  mediaAssetId?: string | null;
  url?: string | null;
}

/**
 * Deterministic upload state machine transitions.
 */
export function transitionUploadState(
  currentState: UploadStateMachineState,
  action: 'START_UPLOAD' | 'RETRY_UPLOAD' | 'UPLOAD_SUCCESS' | 'UPLOAD_FAILURE' | 'REMOVE_MEDIA' | 'RESET',
  payload?: { mediaAssetId?: string; url?: string; error?: string }
): UploadStateTransitionResult {
  switch (action) {
    case 'START_UPLOAD':
      if (currentState === 'uploading') return { state: 'uploading' };
      return { state: 'uploading', error: null };

    case 'RETRY_UPLOAD':
      return { state: 'retrying', error: null };

    case 'UPLOAD_SUCCESS':
      return {
        state: 'succeeded',
        mediaAssetId: payload?.mediaAssetId || null,
        url: payload?.url || null,
        error: null
      };

    case 'UPLOAD_FAILURE':
      return {
        state: 'failed',
        error: payload?.error || 'Failed to upload image'
      };

    case 'REMOVE_MEDIA':
      return { state: 'removed', mediaAssetId: null, url: null, error: null };

    case 'RESET':
    default:
      return { state: 'idle', error: null, mediaAssetId: null, url: null };
  }
}

/**
 * Validates product form state according to target lifecycle status.
 * Draft allows partial data; Published strictly requires name, description, category, positive price, and images.
 */
export function validateProductForm(
  formData: ProductFormFieldValues,
  status: 'draft' | 'published',
  mediaAssetIds: string[] = []
): FormValidationResult {
  const errors: Record<string, string> = {};

  if (!formData.name || formData.name.trim() === '') {
    errors.name = 'Product name is required';
  }

  if (status === 'published') {
    if (!formData.description || formData.description.trim() === '') {
      errors.description = 'Description is required for published products';
    }

    if (!formData.category) {
      errors.category = 'Category is required for published products';
    }

    const hasVariants = Array.isArray(formData.variants) && formData.variants.length > 0;
    if (!hasVariants && (formData.price === undefined || formData.price <= 0)) {
      errors.price = 'Price must be greater than 0';
    }

    if (hasVariants) {
      const invalidVariant = formData.variants?.find((v) => !v.price || v.price <= 0);
      if (invalidVariant) {
        errors.variants = `Variant '${invalidVariant.sku || 'unnamed'}' price must be greater than 0`;
      }
    }

    const hasImages = (formData.images && formData.images.length > 0) || mediaAssetIds.length > 0;
    if (!hasImages) {
      errors.images = 'At least one product image is required for publication';
    }
  }

  const errorKeys = Object.keys(errors);
  return {
    isValid: errorKeys.length === 0,
    errors,
    firstErrorField: errorKeys[0],
    firstErrorMessage: errorKeys.length > 0 ? errors[errorKeys[0]] : undefined
  };
}

/**
 * Prepares an honest product payload for the backend API.
 * Never includes client-supplied `isActive`, `discount`, or direct `stock` on published mutations.
 */
export function prepareProductPayload(
  formData: ProductFormFieldValues,
  status: 'draft' | 'published',
  mediaAssetIds: string[] = [],
  expectedVersion?: number
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: formData.name.trim(),
    status
  };

  if (expectedVersion !== undefined) {
    payload.expectedVersion = expectedVersion;
  }

  if (formData.slug !== undefined && formData.slug.trim() !== '') {
    payload.slug = formData.slug.trim().toLowerCase();
  }

  if (formData.shortDescription !== undefined) {
    payload.shortDescription = formData.shortDescription;
  }

  if (formData.description !== undefined) {
    payload.description = formData.description;
  }

  if (formData.category !== undefined) {
    payload.category = formData.category || null;
  }

  if (formData.subcategory !== undefined) {
    payload.subcategory = formData.subcategory || null;
  }

  if (formData.brand !== undefined) {
    payload.brand = formData.brand || null;
  }

  if (formData.sku !== undefined) {
    payload.sku = formData.sku ? formData.sku.trim().toUpperCase() : null;
  }

  if (formData.barcode !== undefined) {
    payload.barcode = formData.barcode ? formData.barcode.trim() : '';
  }

  if (formData.costPrice !== undefined) {
    payload.costPrice = Number(formData.costPrice || 0);
  }

  payload.price = Number(formData.price || 0);

  if (formData.originalPrice !== undefined) {
    payload.originalPrice = formData.originalPrice ? Number(formData.originalPrice) : 0;
  }

  if (formData.stock !== undefined || formData.initialStock !== undefined) {
    payload.initialStock = Number(formData.stock ?? formData.initialStock ?? 0);
  }

  if (formData.lowStockAlert !== undefined) {
    payload.lowStockThreshold = Number(formData.lowStockAlert || 10);
  }

  if (formData.isFeatured !== undefined) {
    payload.isFeatured = Boolean(formData.isFeatured);
  }

  if (formData.isNewArrival !== undefined) {
    payload.isNewArrival = Boolean(formData.isNewArrival);
  }

  if (formData.isBestSeller !== undefined) {
    payload.isBestSeller = Boolean(formData.isBestSeller);
  }

  if (formData.isTrending !== undefined) {
    payload.isTrending = Boolean(formData.isTrending);
  }

  if (formData.allowBackorders !== undefined) {
    payload.allowBackorders = Boolean(formData.allowBackorders);
  }

  if (formData.trackInventory !== undefined) {
    payload.trackInventory = Boolean(formData.trackInventory);
  }

  if (formData.tags !== undefined) {
    payload.tags = Array.isArray(formData.tags) ? formData.tags : [];
  }

  if (formData.ingredients !== undefined) {
    payload.ingredients = formData.ingredients;
  }

  if (formData.nutritionalFacts !== undefined) {
    payload.nutritionalFacts = formData.nutritionalFacts;
  }

  if (formData.storageInstructions !== undefined) {
    payload.storageInstructions = formData.storageInstructions;
  }

  if (formData.shelfLife !== undefined) {
    payload.shelfLife = formData.shelfLife;
  }

  if (formData.countryOfOrigin !== undefined) {
    payload.countryOfOrigin = formData.countryOfOrigin;
  }

  if (formData.weight !== undefined) {
    payload.weight = (formData.weight !== null && (formData.weight as unknown) !== '') ? Number(formData.weight) : undefined;
  }

  if (formData.dimensions !== undefined) {
    payload.dimensions = formData.dimensions;
  }

  if (formData.shippingClass !== undefined) {
    payload.shippingClass = formData.shippingClass;
  }

  if (formData.freeShipping !== undefined) {
    payload.freeShipping = Boolean(formData.freeShipping);
  }

  if (formData.taxClass !== undefined) {
    payload.taxClass = formData.taxClass;
  }

  if (formData.publishDate !== undefined) {
    payload.publishDate = formData.publishDate || null;
  }

  if (formData.enableReviews !== undefined) {
    payload.enableReviews = Boolean(formData.enableReviews);
  }

  if (formData.allowWishlist !== undefined) {
    payload.allowWishlist = Boolean(formData.allowWishlist);
  }

  if (formData.allowCompare !== undefined) {
    payload.allowCompare = Boolean(formData.allowCompare);
  }

  if (formData.allowCOD !== undefined) {
    payload.allowCOD = Boolean(formData.allowCOD);
  }

  if (formData.relatedProducts !== undefined) {
    payload.relatedProducts = Array.isArray(formData.relatedProducts) ? formData.relatedProducts : [];
  }

  if (Array.isArray(formData.attributes)) {
    payload.attributes = formData.attributes;
  }

  if (Array.isArray(formData.variants)) {
    payload.variants = formData.variants.map((v) => ({
      _id: v._id || undefined,
      sku: v.sku.trim().toUpperCase(),
      barcode: v.barcode ? v.barcode.trim() : '',
      weight: v.weight !== undefined ? (v.weight === null ? undefined : Number(v.weight)) : undefined,
      attributes: v.attributes,
      price: Number(v.price),
      salePrice: v.salePrice ? Number(v.salePrice) : 0,
      stock: Number(v.stock || 0),
      mediaAssetIds: v.mediaAssetIds || [],
      images: v.images || [],
      isDefault: Boolean(v.isDefault)
    }));
  }

  payload.mediaAssetIds = mediaAssetIds;

  if (formData.videoUrl !== undefined) {
    payload.videoUrl = formData.videoUrl;
  }

  if (formData.seoTitle !== undefined || formData.metaDescription !== undefined || formData.keywords !== undefined || formData.canonicalUrl !== undefined) {
    payload.seo = {
      metaTitle: formData.seoTitle || '',
      metaDescription: formData.metaDescription || '',
      keywords: formData.keywords || '',
      canonicalUrl: formData.canonicalUrl || ''
    };
  }

  return payload;
}

/**
 * Maps error status to user-friendly error copy.
 * Specifically maps HTTP 409 concurrency conflict to a reload and review prompt.
 */
export function mapProductSaveError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (err.response?.status === 409) {
      return 'This product was modified by another administrator. Please reload and review the latest changes.';
    }
    const msg = err.response?.data?.message;
    if (typeof msg === 'string') return msg;
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return 'Failed to save product';
}

/**
 * Safely extracts string IDs from mixed array of MediaAsset objects or IDs.
 */
export function extractMediaAssetIds(rawAssets: unknown[]): string[] {
  if (!Array.isArray(rawAssets)) return [];
  return rawAssets
    .map((item) => {
      if (typeof item === 'object' && item !== null && '_id' in item) {
        return String((item as Record<string, unknown>)._id);
      }
      return typeof item === 'string' ? item : '';
    })
    .filter((id) => id.length > 0);
}

/**
 * Evaluates whether form has unsaved modifications.
 */
export function isFormDirty(
  initialValues: ProductFormFieldValues | null,
  currentValues: ProductFormFieldValues,
  initialMediaIds: string[],
  currentMediaIds: string[]
): boolean {
  if (!initialValues) {
    // For creation: dirty if name is typed or media added or price > 0
    return (
      (currentValues.name && currentValues.name.trim() !== '') ||
      currentMediaIds.length > 0 ||
      Boolean(currentValues.price && currentValues.price > 0)
    );
  }

  if (currentValues.name !== initialValues.name) return true;
  if ((currentValues.description || '') !== (initialValues.description || '')) return true;
  if ((currentValues.shortDescription || '') !== (initialValues.shortDescription || '')) return true;
  if ((currentValues.category || null) !== (initialValues.category || null)) return true;
  if ((currentValues.subcategory || null) !== (initialValues.subcategory || null)) return true;
  if ((currentValues.brand || null) !== (initialValues.brand || null)) return true;
  if (currentValues.price !== initialValues.price) return true;
  if ((currentValues.costPrice || 0) !== (initialValues.costPrice || 0)) return true;
  if ((currentValues.originalPrice || 0) !== (initialValues.originalPrice || 0)) return true;
  if ((currentValues.stock || 0) !== (initialValues.stock || 0)) return true;
  if ((currentValues.lowStockAlert || 10) !== (initialValues.lowStockAlert || 10)) return true;
  if ((currentValues.sku || '') !== (initialValues.sku || '')) return true;
  if ((currentValues.barcode || '') !== (initialValues.barcode || '')) return true;
  if (Boolean(currentValues.isFeatured) !== Boolean(initialValues.isFeatured)) return true;
  if (Boolean(currentValues.isNewArrival) !== Boolean(initialValues.isNewArrival)) return true;
  if (Boolean(currentValues.isBestSeller) !== Boolean(initialValues.isBestSeller)) return true;
  if (Boolean(currentValues.isTrending) !== Boolean(initialValues.isTrending)) return true;
  if (Boolean(currentValues.allowBackorders) !== Boolean(initialValues.allowBackorders)) return true;
  if (Boolean(currentValues.trackInventory) !== Boolean(initialValues.trackInventory)) return true;
  if ((currentValues.ingredients || '') !== (initialValues.ingredients || '')) return true;
  if ((currentValues.nutritionalFacts || '') !== (initialValues.nutritionalFacts || '')) return true;
  if ((currentValues.storageInstructions || '') !== (initialValues.storageInstructions || '')) return true;
  if ((currentValues.shelfLife || '') !== (initialValues.shelfLife || '')) return true;
  if ((currentValues.countryOfOrigin || '') !== (initialValues.countryOfOrigin || '')) return true;
  if ((currentValues.weight || 0) !== (initialValues.weight || 0)) return true;
  if ((currentValues.shippingClass || '') !== (initialValues.shippingClass || '')) return true;
  if (Boolean(currentValues.freeShipping) !== Boolean(initialValues.freeShipping)) return true;
  if ((currentValues.taxClass || '') !== (initialValues.taxClass || '')) return true;
  if ((currentValues.seoTitle || '') !== (initialValues.seoTitle || '')) return true;
  if ((currentValues.metaDescription || '') !== (initialValues.metaDescription || '')) return true;
  if ((currentValues.keywords || '') !== (initialValues.keywords || '')) return true;
  if ((currentValues.canonicalUrl || '') !== (initialValues.canonicalUrl || '')) return true;
  if (Boolean(currentValues.enableReviews) !== Boolean(initialValues.enableReviews)) return true;
  if (Boolean(currentValues.allowWishlist) !== Boolean(initialValues.allowWishlist)) return true;
  if (Boolean(currentValues.allowCompare) !== Boolean(initialValues.allowCompare)) return true;
  if (Boolean(currentValues.allowCOD) !== Boolean(initialValues.allowCOD)) return true;

  if (initialMediaIds.length !== currentMediaIds.length) return true;
  for (let i = 0; i < currentMediaIds.length; i += 1) {
    if (initialMediaIds[i] !== currentMediaIds[i]) return true;
  }

  return false;
}

/**
 * Provides accessible attributes for an input field with validation state.
 */
export function getFieldAccessibilityProps(fieldName: string, errorMessage?: string) {
  return {
    id: `field-${fieldName}`,
    'aria-invalid': Boolean(errorMessage),
    'aria-describedby': errorMessage ? `error-field-${fieldName}` : undefined
  };
}
