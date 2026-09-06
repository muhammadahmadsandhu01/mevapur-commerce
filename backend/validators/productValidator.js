const { z } = require('zod');
const mongoose = require('mongoose');

const objectId = z.string().refine(
  (val) => mongoose.isObjectIdOrHexString(val),
  'A valid MongoDB ObjectId is required'
);

const attributeSchema = z.object({
  name: z.string().trim().min(1, 'Attribute name is required').max(50),
  value: z.string().trim().min(1, 'Attribute value is required').max(100)
}).strict();

const variantSchema = z.object({
  _id: objectId.optional(),
  sku: z.string().trim().toUpperCase().min(1, 'Variant SKU is required').max(100)
    .regex(/^[A-Z0-9._-]+$/, 'SKU must contain only uppercase alphanumeric characters, dots, hyphens, and underscores'),
  barcode: z.string().trim().max(100).optional().default(''),
  attributes: z.array(attributeSchema).min(1, 'At least one attribute is required per variant').max(10),
  price: z.number().finite().gt(0, 'Variant price must be greater than zero'),
  salePrice: z.number().finite().min(0).optional().default(0),
  stock: z.number().int().min(0, 'Variant stock cannot be negative').default(0),
  initialStock: z.number().int().min(0, 'Initial stock cannot be negative').optional(),
  weight: z.number().finite().min(0).max(100000).optional(),
  mediaAssetIds: z.array(objectId).max(10).default([]),
  images: z.array(z.string().url().max(1000)).max(10).optional().default([]),
  isDefault: z.boolean().default(false)
}).strict().superRefine((data, ctx) => {
  if (data.salePrice > 0 && data.salePrice >= data.price) {
    ctx.addIssue({
      code: 'custom',
      path: ['salePrice'],
      message: 'Sale price must be strictly less than regular price'
    });
  }
});

const variantUpdateSchema = z.object({
  _id: objectId.optional(),
  sku: z.string().trim().toUpperCase().min(1).max(100)
    .regex(/^[A-Z0-9._-]+$/).optional(),
  barcode: z.string().trim().max(100).optional(),
  attributes: z.array(attributeSchema).min(1).max(10).optional(),
  price: z.number().finite().gt(0).optional(),
  salePrice: z.number().finite().min(0).optional(),
  weight: z.number().finite().min(0).max(100000).optional(),
  mediaAssetIds: z.array(objectId).max(10).optional(),
  images: z.array(z.string().url().max(1000)).max(10).optional(),
  isDefault: z.boolean().optional()
}).strict().superRefine((data, ctx) => {
  if (data.price !== undefined && data.salePrice !== undefined && data.salePrice > 0 && data.salePrice >= data.price) {
    ctx.addIssue({
      code: 'custom',
      path: ['salePrice'],
      message: 'Sale price must be strictly less than regular price'
    });
  }
});

const validateVariantCombinations = (data, ctx) => {
  if (data.variants && data.variants.length > 0) {
    const seenCombos = new Set();
    const seenSkus = new Set();
    let defaultCount = 0;

    data.variants.forEach((v, index) => {
      // 1. Normalized attribute comparison
      if (Array.isArray(v.attributes)) {
        const comboKey = v.attributes
          .map(a => `${a.name.trim().toLowerCase()}:${a.value.trim().toLowerCase()}`)
          .sort()
          .join('|');
        if (seenCombos.has(comboKey)) {
          ctx.addIssue({
            code: 'custom',
            path: ['variants', index],
            message: 'Duplicate variant attribute combination'
          });
        }
        seenCombos.add(comboKey);
      }

      // 2. Duplicate variant SKU within product
      if (v.sku) {
        const normSku = v.sku.trim().toUpperCase();
        if (seenSkus.has(normSku)) {
          ctx.addIssue({
            code: 'custom',
            path: ['variants', index, 'sku'],
            message: `Duplicate variant SKU '${normSku}' within the same product`
          });
        }
        seenSkus.add(normSku);
      }

      if (v.isDefault) defaultCount += 1;
    });

    if (defaultCount > 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['variants'],
        message: 'Only one variant can be designated as default'
      });
    }
  }
};

const validateProtectedFields = (data, ctx) => {
  if ('isActive' in data) {
    ctx.addIssue({
      code: 'custom',
      path: ['isActive'],
      message: "isActive is a derived system field. Use 'status' to control product lifecycle."
    });
  }
  if ('stock' in data && data.stock !== undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['stock'],
      message: "Direct stock edits are prohibited. Use initialStock on creation or /api/inventory/adjust for adjustments."
    });
  }
  if ('discount' in data) {
    ctx.addIssue({
      code: 'custom',
      path: ['discount'],
      message: 'discount is a derived calculation and cannot be assigned directly.'
    });
  }
  if ('soldCount' in data || 'rating' in data || 'reviewCount' in data || 'views' in data) {
    ctx.addIssue({
      code: 'custom',
      message: 'System counters and metrics cannot be assigned directly.'
    });
  }
};

// 1. DRAFT CREATE SCHEMA
const draftCreateSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required').max(200),
  slug: z.string().trim().toLowerCase().min(1).max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens').optional(),
  shortDescription: z.string().trim().max(500).optional().default(''),
  description: z.string().trim().max(10000).optional().default(''),
  category: objectId.nullable().optional(),
  subcategory: objectId.nullable().optional(),
  brand: objectId.nullable().optional(),
  sku: z.string().trim().toUpperCase().max(100).regex(/^[A-Z0-9._-]+$/).nullable().optional(),
  barcode: z.string().trim().max(100).optional().default(''),
  costPrice: z.number().finite().min(0).max(100000000).optional().default(0),
  price: z.number().finite().min(0).max(100000000).optional().default(0),
  originalPrice: z.number().finite().min(0).max(100000000).optional().default(0),
  initialStock: z.number().int().min(0).max(1000000).optional().default(0),
  lowStockThreshold: z.number().int().min(0).max(10000).optional().default(10),
  isFeatured: z.boolean().optional().default(false),
  isNewArrival: z.boolean().optional().default(false),
  isBestSeller: z.boolean().optional().default(false),
  isTrending: z.boolean().optional().default(false),
  allowBackorders: z.boolean().optional().default(false),
  trackInventory: z.boolean().optional().default(true),
  tags: z.array(z.string().trim().max(100)).max(50).optional().default([]),
  ingredients: z.string().trim().max(5000).optional().default(''),
  nutritionalFacts: z.string().trim().max(5000).optional().default(''),
  storageInstructions: z.string().trim().max(5000).optional().default(''),
  shelfLife: z.string().trim().max(500).optional().default(''),
  countryOfOrigin: z.string().trim().max(200).optional().default('Pakistan'),
  weight: z.number().finite().min(0).max(100000).optional(),
  dimensions: z.object({
    length: z.number().min(0).optional(),
    width: z.number().min(0).optional(),
    height: z.number().min(0).optional(),
    unit: z.string().trim().max(20).optional()
  }).strict().optional(),
  shippingClass: z.string().trim().max(100).optional().default('standard'),
  freeShipping: z.boolean().optional().default(false),
  taxClass: z.string().trim().max(100).optional().default('standard'),
  attributes: z.array(attributeSchema).max(30).optional().default([]),
  variants: z.array(variantSchema).max(50).optional().default([]),
  mediaAssetIds: z.array(objectId).max(20).optional().default([]),
  images: z.array(z.string().url().max(1000)).max(20).optional().default([]),
  primaryMediaAssetId: objectId.nullable().optional(),
  videoUrl: z.string().url().max(500).optional().or(z.literal('')),
  seo: z.object({
    metaTitle: z.string().trim().max(100).optional(),
    metaDescription: z.string().trim().max(300).optional(),
    keywords: z.string().trim().max(200).optional(),
    canonicalUrl: z.string().url().max(500).optional().or(z.literal(''))
  }).strict().optional(),
  publishDate: z.string().optional().or(z.date()).optional(),
  enableReviews: z.boolean().optional().default(true),
  allowWishlist: z.boolean().optional().default(true),
  allowCompare: z.boolean().optional().default(true),
  allowCOD: z.boolean().optional().default(true),
  relatedProducts: z.array(objectId).max(50).optional().default([]),
  status: z.literal('draft').default('draft'),
  isActive: z.any().optional(),
  stock: z.any().optional(),
  discount: z.any().optional()
}).strict().superRefine((data, ctx) => {
  validateProtectedFields(data, ctx);
  validateVariantCombinations(data, ctx);
});

// 2. PUBLISHED CREATE SCHEMA
const publishedCreateSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required').max(200),
  slug: z.string().trim().toLowerCase().min(1).max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens').optional(),
  shortDescription: z.string().trim().max(500).optional().default(''),
  description: z.string().trim().min(1, 'Description is required for published products').max(10000),
  category: objectId,
  subcategory: objectId.nullable().optional(),
  brand: objectId.nullable().optional(),
  sku: z.string().trim().toUpperCase().max(100).regex(/^[A-Z0-9._-]+$/).nullable().optional(),
  barcode: z.string().trim().max(100).optional().default(''),
  costPrice: z.number().finite().min(0).max(100000000).optional().default(0),
  price: z.number().finite().min(0).max(100000000).optional().default(0),
  originalPrice: z.number().finite().min(0).max(100000000).optional().default(0),
  initialStock: z.number().int().min(0).max(1000000).optional().default(0),
  lowStockThreshold: z.number().int().min(0).max(10000).optional().default(10),
  isFeatured: z.boolean().optional().default(false),
  isNewArrival: z.boolean().optional().default(false),
  isBestSeller: z.boolean().optional().default(false),
  isTrending: z.boolean().optional().default(false),
  allowBackorders: z.boolean().optional().default(false),
  trackInventory: z.boolean().optional().default(true),
  tags: z.array(z.string().trim().max(100)).max(50).optional().default([]),
  ingredients: z.string().trim().max(5000).optional().default(''),
  nutritionalFacts: z.string().trim().max(5000).optional().default(''),
  storageInstructions: z.string().trim().max(5000).optional().default(''),
  shelfLife: z.string().trim().max(500).optional().default(''),
  countryOfOrigin: z.string().trim().max(200).optional().default('Pakistan'),
  weight: z.number().finite().min(0).max(100000).optional(),
  dimensions: z.object({
    length: z.number().min(0).optional(),
    width: z.number().min(0).optional(),
    height: z.number().min(0).optional(),
    unit: z.string().trim().max(20).optional()
  }).strict().optional(),
  shippingClass: z.string().trim().max(100).optional().default('standard'),
  freeShipping: z.boolean().optional().default(false),
  taxClass: z.string().trim().max(100).optional().default('standard'),
  attributes: z.array(attributeSchema).max(30).optional().default([]),
  variants: z.array(variantSchema).max(50).optional().default([]),
  mediaAssetIds: z.array(objectId).max(20).optional().default([]),
  images: z.array(z.string().url().max(1000)).max(20).optional().default([]),
  primaryMediaAssetId: objectId.nullable().optional(),
  videoUrl: z.string().url().max(500).optional().or(z.literal('')),
  seo: z.object({
    metaTitle: z.string().trim().max(100).optional(),
    metaDescription: z.string().trim().max(300).optional(),
    keywords: z.string().trim().max(200).optional(),
    canonicalUrl: z.string().url().max(500).optional().or(z.literal(''))
  }).strict().optional(),
  publishDate: z.string().optional().or(z.date()).optional(),
  enableReviews: z.boolean().optional().default(true),
  allowWishlist: z.boolean().optional().default(true),
  allowCompare: z.boolean().optional().default(true),
  allowCOD: z.boolean().optional().default(true),
  relatedProducts: z.array(objectId).max(50).optional().default([]),
  status: z.literal('published').default('published'),
  isActive: z.any().optional(),
  stock: z.any().optional(),
  discount: z.any().optional()
}).strict().superRefine((data, ctx) => {
  validateProtectedFields(data, ctx);
  validateVariantCombinations(data, ctx);
  const hasMedia = (Array.isArray(data.mediaAssetIds) && data.mediaAssetIds.length > 0)
    || (Array.isArray(data.images) && data.images.length > 0);
  if (!hasMedia) {
    ctx.addIssue({
      code: 'custom',
      path: ['mediaAssetIds'],
      message: 'At least one product image is required for publication'
    });
  }
  if ((!data.variants || data.variants.length === 0) && data.price <= 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['price'],
      message: 'Price must be strictly greater than zero for simple products'
    });
  }
  if (data.originalPrice > 0 && data.price > 0 && data.originalPrice < data.price) {
    ctx.addIssue({
      code: 'custom',
      path: ['originalPrice'],
      message: 'Original strikethrough price must be greater than or equal to current price'
    });
  }
  if (data.variants && data.variants.length > 0) {
    if (!data.variants.some(v => v.isDefault)) {
      ctx.addIssue({
        code: 'custom',
        path: ['variants'],
        message: 'Exactly one variant must be designated as default'
      });
    }
  }
});

// 3. PRODUCT UPDATE SCHEMA (PATCH without defaults)
const productUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  slug: z.string().trim().toLowerCase().min(1).max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  shortDescription: z.string().trim().max(500).optional(),
  description: z.string().trim().max(10000).optional(),
  category: objectId.nullable().optional(),
  subcategory: objectId.nullable().optional(),
  brand: objectId.nullable().optional(),
  sku: z.string().trim().toUpperCase().max(100).regex(/^[A-Z0-9._-]+$/).nullable().optional(),
  barcode: z.string().trim().max(100).optional(),
  costPrice: z.number().finite().min(0).max(100000000).optional(),
  price: z.number().finite().min(0).max(100000000).optional(),
  originalPrice: z.number().finite().min(0).max(100000000).optional(),
  lowStockThreshold: z.number().int().min(0).max(10000).optional(),
  isFeatured: z.boolean().optional(),
  isNewArrival: z.boolean().optional(),
  isBestSeller: z.boolean().optional(),
  isTrending: z.boolean().optional(),
  allowBackorders: z.boolean().optional(),
  trackInventory: z.boolean().optional(),
  tags: z.array(z.string().trim().max(100)).max(50).optional(),
  ingredients: z.string().trim().max(5000).optional(),
  nutritionalFacts: z.string().trim().max(5000).optional(),
  storageInstructions: z.string().trim().max(5000).optional(),
  shelfLife: z.string().trim().max(500).optional(),
  countryOfOrigin: z.string().trim().max(200).optional(),
  weight: z.number().finite().min(0).max(100000).optional(),
  dimensions: z.object({
    length: z.number().min(0).optional(),
    width: z.number().min(0).optional(),
    height: z.number().min(0).optional(),
    unit: z.string().trim().max(20).optional()
  }).strict().optional(),
  shippingClass: z.string().trim().max(100).optional(),
  freeShipping: z.boolean().optional(),
  taxClass: z.string().trim().max(100).optional(),
  attributes: z.array(attributeSchema).max(30).optional(),
  variants: z.array(variantUpdateSchema).max(50).optional(),
  mediaAssetIds: z.array(objectId).max(20).optional(),
  primaryMediaAssetId: objectId.nullable().optional(),
  videoUrl: z.string().url().max(500).optional().or(z.literal('')),
  seo: z.object({
    metaTitle: z.string().trim().max(100).optional(),
    metaDescription: z.string().trim().max(300).optional(),
    keywords: z.string().trim().max(200).optional(),
    canonicalUrl: z.string().url().max(500).optional().or(z.literal(''))
  }).strict().optional(),
  publishDate: z.string().optional().or(z.date()).optional(),
  enableReviews: z.boolean().optional(),
  allowWishlist: z.boolean().optional(),
  allowCompare: z.boolean().optional(),
  allowCOD: z.boolean().optional(),
  relatedProducts: z.array(objectId).max(50).optional(),
  status: z.enum(['draft', 'published', 'inactive', 'archived', 'scheduled']).optional(),
  expectedVersion: z.number().int().min(0, 'expectedVersion must be an integer').optional(),
  isActive: z.any().optional(),
  stock: z.any().optional(),
  discount: z.any().optional()
}).strict().superRefine((data, ctx) => {
  validateProtectedFields(data, ctx);
  validateVariantCombinations(data, ctx);
});

// 4. PUBLICATION MERGED STATE VALIDATION (Used when publishing or updating to published)
const validateMergedPublishedState = (mergedProduct) => {
  const errors = [];
  if (!mergedProduct.name || mergedProduct.name.trim() === '') {
    errors.push({ field: 'name', message: 'Product name is required for publication' });
  }
  if (!mergedProduct.description || mergedProduct.description.trim() === '') {
    errors.push({ field: 'description', message: 'Description is required for publication' });
  }
  if (!mergedProduct.category) {
    errors.push({ field: 'category', message: 'Category is required for publication' });
  }
  const hasImages = (Array.isArray(mergedProduct.mediaAssetIds) && mergedProduct.mediaAssetIds.length > 0)
    || (Array.isArray(mergedProduct.images) && mergedProduct.images.length > 0)
    || Boolean(mergedProduct.primaryImage);
  if (!hasImages) {
    errors.push({ field: 'mediaAssetIds', message: 'At least one product image is required for publication' });
  }

  if (Array.isArray(mergedProduct.variants) && mergedProduct.variants.length > 0) {
    const defaultCount = mergedProduct.variants.filter(v => v.isDefault).length;
    if (defaultCount !== 1) {
      errors.push({ field: 'variants', message: 'Exactly one variant must be designated as default' });
    }
    mergedProduct.variants.forEach((v, i) => {
      if (typeof v.price !== 'number' || v.price <= 0) {
        errors.push({ field: `variants[${i}].price`, message: 'Variant price must be greater than zero' });
      }
      if (v.salePrice > 0 && v.salePrice >= v.price) {
        errors.push({ field: `variants[${i}].salePrice`, message: 'Variant sale price must be less than regular price' });
      }
    });
  } else {
    if (typeof mergedProduct.price !== 'number' || mergedProduct.price <= 0) {
      errors.push({ field: 'price', message: 'Price must be greater than zero for simple products' });
    }
  }

  return errors;
};

// 5. QUERY SCHEMAS
const adminProductQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  keyword: z.string().trim().max(100).optional(),
  status: z.enum(['draft', 'published', 'inactive', 'archived']).optional(),
  category: objectId.optional(),
  brand: objectId.optional(),
  stockStatus: z.enum(['in_stock', 'low_stock', 'out_of_stock']).optional(),
  sortBy: z.enum(['newest', 'price-asc', 'price-desc', 'rating', 'sold-desc']).default('newest')
}).strict();

module.exports = {
  draftCreateSchema,
  publishedCreateSchema,
  productUpdateSchema,
  adminProductQuerySchema,
  validateMergedPublishedState
};
