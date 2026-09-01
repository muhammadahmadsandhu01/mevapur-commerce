import axios from 'axios';

export interface ProductFormFieldValues {
  name: string;
  slug?: string;
  shortDescription?: string;
  description?: string;
  category?: string | null;
  subcategory?: string | null;
  brand?: string | null;
  sku?: string | null;
  price: number;
  originalPrice?: number;
  stock?: number;
  initialStock?: number;
  lowStockAlert?: number;
  isFeatured?: boolean;
  attributes?: Array<{ name: string; value: string }>;
  variants?: Array<{
    _id?: string;
    sku: string;
    barcode?: string;
    attributes: Array<{ name: string; value: string }>;
    price: number;
    salePrice?: number;
    stock?: number;
    isDefault?: boolean;
  }>;
  images?: string[];
  videoUrl?: string;
  seoTitle?: string;
  metaDescription?: string;
  keywords?: string;
}

export interface FormValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
  firstErrorField?: string;
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

    const hasImages = (formData.images && formData.images.length > 0) || mediaAssetIds.length > 0;
    if (!hasImages) {
      errors.images = 'At least one product image is required';
    }
  }

  const errorKeys = Object.keys(errors);
  return {
    isValid: errorKeys.length === 0,
    errors,
    firstErrorField: errorKeys[0]
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

  if (formData.slug && formData.slug.trim() !== '') {
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

  payload.price = Number(formData.price || 0);
  payload.originalPrice = formData.originalPrice ? Number(formData.originalPrice) : 0;

  if (formData.stock !== undefined || formData.initialStock !== undefined) {
    payload.initialStock = Number(formData.stock ?? formData.initialStock ?? 0);
  }

  payload.lowStockThreshold = Number(formData.lowStockAlert || 10);
  payload.isFeatured = Boolean(formData.isFeatured);

  if (Array.isArray(formData.attributes)) {
    payload.attributes = formData.attributes;
  }

  if (Array.isArray(formData.variants)) {
    payload.variants = formData.variants.map((v) => ({
      _id: v._id || undefined,
      sku: v.sku.trim().toUpperCase(),
      barcode: v.barcode || '',
      attributes: v.attributes,
      price: Number(v.price),
      salePrice: v.salePrice ? Number(v.salePrice) : 0,
      stock: Number(v.stock || 0),
      isDefault: Boolean(v.isDefault)
    }));
  }

  payload.mediaAssetIds = mediaAssetIds;

  if (formData.videoUrl !== undefined) {
    payload.videoUrl = formData.videoUrl;
  }

  if (formData.seoTitle || formData.metaDescription || formData.keywords) {
    payload.seo = {
      metaTitle: formData.seoTitle || '',
      metaDescription: formData.metaDescription || '',
      keywords: formData.keywords || ''
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
    // For creation: dirty if name is typed or media added
    return (
      (currentValues.name && currentValues.name.trim() !== '') ||
      currentMediaIds.length > 0 ||
      Boolean(currentValues.price && currentValues.price > 0)
    );
  }

  if (currentValues.name !== initialValues.name) return true;
  if ((currentValues.description || '') !== (initialValues.description || '')) return true;
  if ((currentValues.category || null) !== (initialValues.category || null)) return true;
  if (currentValues.price !== initialValues.price) return true;
  if ((currentValues.stock || 0) !== (initialValues.stock || 0)) return true;
  if ((currentValues.sku || '') !== (initialValues.sku || '')) return true;

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
