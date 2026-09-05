import type {
  Product,
  ProductVariant,
  ProductAttribute,
  Category,
  Brand,
  PaginationMeta,
} from '@/types/product';

/**
 * Validates whether a media URL is safe for customer presentation.
 * Rejects javascript:, data: protocols, credential-bearing URLs, and malformed strings.
 */
export function getSafeMediaUrl(
  url?: string | null,
  fallback = '/placeholder.png'
): string {
  if (!url || typeof url !== 'string') {
    return fallback;
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return fallback;
  }

  // Allow safe root-relative static assets
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return fallback;
    }
    // Reject credential-bearing URLs (e.g. https://user:pass@host)
    if (parsed.username || parsed.password) {
      return fallback;
    }
    return trimmed;
  } catch {
    return fallback;
  }
}

/**
 * Pure normalization of a single product from the public backend contract.
 * Returns null if essential identity or required fields are missing or invalid.
 */
export function normalizeProduct(raw: unknown): Product | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const item = raw as Record<string, unknown>;

  const id = String(item._id || item.id || '').trim();
  const name = String(item.name || '').trim();

  if (!id || !name) {
    return null;
  }

  // Canonical slug with fallback to ID
  const slug = String(item.slug || id).trim() || id;

  // Numeric fields strictly validated preserving valid zeros
  const price = typeof item.price === 'number' && !Number.isNaN(item.price) && item.price >= 0
    ? item.price
    : parseFloat(String(item.price || 0)) || 0;

  const originalPrice = typeof item.originalPrice === 'number' && !Number.isNaN(item.originalPrice)
    ? item.originalPrice
    : item.originalPrice !== undefined && item.originalPrice !== null
      ? parseFloat(String(item.originalPrice)) || undefined
      : undefined;

  const stock = typeof item.stock === 'number' && !Number.isNaN(item.stock) && item.stock >= 0
    ? item.stock
    : parseInt(String(item.stock || 0), 10) || 0;

  const rating = typeof item.rating === 'number' && !Number.isNaN(item.rating)
    ? Math.max(0, Math.min(5, item.rating))
    : parseFloat(String(item.rating || 0)) || 0;

  const reviewCount = typeof item.reviewCount === 'number' && !Number.isNaN(item.reviewCount)
    ? Math.max(0, Math.floor(item.reviewCount))
    : typeof item.numReviews === 'number' && !Number.isNaN(item.numReviews)
      ? Math.max(0, Math.floor(item.numReviews))
      : parseInt(String(item.reviewCount || item.numReviews || 0), 10) || 0;

  const soldCount = typeof item.soldCount === 'number' && !Number.isNaN(item.soldCount)
    ? Math.max(0, Math.floor(item.soldCount))
    : parseInt(String(item.soldCount || 0), 10) || 0;

  const discount = typeof item.discount === 'number' && !Number.isNaN(item.discount)
    ? Math.max(0, Math.min(100, Math.floor(item.discount)))
    : parseInt(String(item.discount || 0), 10) || 0;

  // Category resolution
  let category: Category | { _id: string; name: string; slug: string } | undefined = undefined;
  if (item.category && typeof item.category === 'object') {
    const catObj = item.category as Record<string, unknown>;
    const catId = String(catObj._id || '').trim();
    const catName = String(catObj.name || '').trim();
    const catSlug = String(catObj.slug || catId).trim();
    if (catName) {
      category = {
        _id: catId,
        name: catName,
        slug: catSlug,
        description: catObj.description ? String(catObj.description) : undefined,
        image: catObj.image ? getSafeMediaUrl(String(catObj.image)) : undefined,
      };
    }
  }

  // Brand resolution
  let brand: Brand | { _id: string; name: string; slug?: string } | undefined = undefined;
  if (item.brand && typeof item.brand === 'object') {
    const brandObj = item.brand as Record<string, unknown>;
    const brandId = String(brandObj._id || '').trim();
    const brandName = String(brandObj.name || '').trim();
    if (brandName) {
      brand = {
        _id: brandId,
        name: brandName,
        slug: String(brandObj.slug || brandId).trim(),
        logo: brandObj.logo ? getSafeMediaUrl(String(brandObj.logo)) : undefined,
      };
    }
  }

  // Attributes
  const attributes: ProductAttribute[] = Array.isArray(item.attributes)
    ? item.attributes
        .filter((attr) => attr && typeof attr === 'object' && attr.name && attr.value)
        .map((attr) => ({
          name: String(attr.name).trim(),
          value: String(attr.value).trim(),
        }))
    : [];

  // Variants with stable backend IDs
  const variants: ProductVariant[] = Array.isArray(item.variants)
    ? item.variants
        .filter((v) => v && typeof v === 'object' && (v._id || v.sku))
        .map((v, idx) => {
          const varId = String(v._id || `variant-${idx}-${v.sku || 'default'}`).trim();
          const varSku = String(v.sku || `${id}-VAR-${idx + 1}`).trim();
          const varPrice = typeof v.price === 'number' && !Number.isNaN(v.price)
            ? v.price
            : parseFloat(String(v.price || price)) || price;
          const varSalePrice = typeof v.salePrice === 'number' && !Number.isNaN(v.salePrice)
            ? v.salePrice
            : v.salePrice !== undefined && v.salePrice !== null
              ? parseFloat(String(v.salePrice)) || undefined
              : undefined;
          const varStock = typeof v.stock === 'number' && !Number.isNaN(v.stock)
            ? v.stock
            : parseInt(String(v.stock || 0), 10) || 0;
          const varImages = Array.isArray(v.images)
            ? v.images.map((img: unknown) => getSafeMediaUrl(String(img))).filter((img: string) => img !== '/placeholder.png')
            : [];
          const varAttrs: ProductAttribute[] = Array.isArray(v.attributes)
            ? v.attributes
                .filter((a: unknown) => a && typeof a === 'object' && (a as Record<string, unknown>).name)
                .map((a: unknown) => {
                  const typed = a as Record<string, unknown>;
                  return {
                    name: String(typed.name).trim(),
                    value: String(typed.value).trim(),
                  };
                })
            : [];

          return {
            _id: varId,
            sku: varSku,
            barcode: v.barcode ? String(v.barcode).trim() : undefined,
            attributes: varAttrs,
            price: varPrice,
            salePrice: varSalePrice,
            stock: varStock,
            images: varImages,
            isDefault: Boolean(v.isDefault),
          };
        })
    : [];

  // Media Collections
  const rawImages: string[] = [];
  if (Array.isArray(item.images)) {
    rawImages.push(...item.images.map((img) => String(img)));
  }
  if (Array.isArray(item.gallery)) {
    rawImages.push(...item.gallery.map((img) => String(img)));
  }
  if (item.primaryImage) {
    rawImages.unshift(String(item.primaryImage));
  }
  if (item.image) {
    rawImages.unshift(String(item.image));
  }

  const images = Array.from(
    new Set(rawImages.map((img) => getSafeMediaUrl(img)).filter((img) => img !== '/placeholder.png'))
  );

  const primaryImage = images.length > 0 ? images[0] : '/placeholder.png';

  return {
    _id: id,
    id,
    name,
    slug,
    description: String(item.description || ''),
    shortDescription: String(item.shortDescription || ''),
    price,
    originalPrice,
    stock,
    sku: item.sku ? String(item.sku).trim() : undefined,
    category,
    brand,
    rating,
    reviewCount,
    numReviews: reviewCount,
    soldCount,
    discount,
    attributes,
    variants,
    image: primaryImage,
    primaryImage,
    images: images.length > 0 ? images : ['/placeholder.png'],
    gallery: images,
    isFeatured: Boolean(item.isFeatured),
    isActive: item.isActive !== undefined ? Boolean(item.isActive) : true,
    status: (item.status as 'published' | 'draft' | 'inactive' | 'archived') || 'published',
    createdAt: item.createdAt ? String(item.createdAt) : undefined,
    updatedAt: item.updatedAt ? String(item.updatedAt) : undefined,
  };
}

/**
 * Pure resolver to find the matching variant from selected attribute values.
 */
export function findMatchingVariant(
  variants: ProductVariant[] | undefined,
  selectedAttributes: Record<string, string>
): ProductVariant | null {
  if (!variants || variants.length === 0) {
    return null;
  }

  // If no attributes specified, return default variant or first variant
  const selectedEntries = Object.entries(selectedAttributes).filter(([, val]) => Boolean(val));
  if (selectedEntries.length === 0) {
    return variants.find((v) => v.isDefault) || variants[0] || null;
  }

  // Exact match on all selected attributes
  const match = variants.find((v) => {
    return selectedEntries.every(([attrName, attrVal]) => {
      const varAttr = v.attributes.find(
        (a) => a.name.toLowerCase() === attrName.toLowerCase()
      );
      return varAttr && varAttr.value.toLowerCase() === attrVal.toLowerCase();
    });
  });

  return match || null;
}

/**
 * Pure helper to calculate attribute option availability matrix.
 */
export function getAttributeOptionMatrix(
  variants: ProductVariant[] | undefined,
  currentSelection: Record<string, string>
): Record<string, { value: string; inStock: boolean; available: boolean }[]> {
  if (!variants || variants.length === 0) {
    return {};
  }

  const result: Record<string, { value: string; inStock: boolean; available: boolean }[]> = {};

  // Collect all attribute names
  const allAttributeNames = new Set<string>();
  variants.forEach((v) => {
    v.attributes.forEach((a) => allAttributeNames.add(a.name));
  });

  allAttributeNames.forEach((attrName) => {
    const valueMap = new Map<string, { inStock: boolean; available: boolean }>();

    variants.forEach((v) => {
      const thisAttr = v.attributes.find((a) => a.name === attrName);
      if (!thisAttr) return;

      // Check if variant matches current selection for ALL OTHER attributes
      const matchesOther = Object.entries(currentSelection).every(([otherName, otherVal]) => {
        if (otherName === attrName || !otherVal) return true;
        const otherAttr = v.attributes.find((a) => a.name === otherName);
        return otherAttr && otherAttr.value.toLowerCase() === otherVal.toLowerCase();
      });

      const existing = valueMap.get(thisAttr.value);
      const isStockAvailable = (v.stock ?? 0) > 0;

      if (matchesOther) {
        valueMap.set(thisAttr.value, {
          available: true,
          inStock: existing ? existing.inStock || isStockAvailable : isStockAvailable,
        });
      } else if (!existing) {
        valueMap.set(thisAttr.value, {
          available: false,
          inStock: isStockAvailable,
        });
      }
    });

    result[attrName] = Array.from(valueMap.entries()).map(([value, meta]) => ({
      value,
      available: meta.available,
      inStock: meta.inStock,
    }));
  });

  return result;
}

/**
 * Helper to normalize pagination response
 */
export function normalizePagination(raw: unknown, defaultLimit = 12): PaginationMeta {
  if (!raw || typeof raw !== 'object') {
    return { page: 1, pages: 1, total: 0, limit: defaultLimit, hasNext: false, hasPrev: false };
  }

  const p = raw as Record<string, unknown>;
  const page = Math.max(1, parseInt(String(p.page || 1), 10) || 1);
  const total = Math.max(0, parseInt(String(p.total || 0), 10) || 0);
  const limit = Math.max(1, parseInt(String(p.limit || defaultLimit), 10) || defaultLimit);
  const pages = Math.max(1, parseInt(String(p.pages || Math.ceil(total / limit) || 1), 10));

  return {
    page,
    pages,
    total,
    limit,
    hasNext: Boolean(p.hasNext !== undefined ? p.hasNext : page < pages),
    hasPrev: Boolean(p.hasPrev !== undefined ? p.hasPrev : page > 1),
  };
}
