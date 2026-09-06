import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import {
  normalizeProduct,
  getSafeMediaUrl,
  findMatchingVariant,
  getAttributeOptionMatrix,
  normalizePagination,
} from '../src/lib/catalogAdapter.ts';
import type { ProductVariant } from '../src/types/product.ts';

describe('Storefront Catalog Normalization & Integrity Suite', () => {
  test('strictly validates and normalizes published product data', () => {
    const raw = {
      _id: 'prod-12345',
      name: 'Organic Premium Almonds',
      slug: 'organic-premium-almonds',
      description: 'Handpicked organic almonds directly from farms.',
      price: 1200,
      originalPrice: 1500,
      stock: 45,
      sku: 'ALM-ORG-100',
      soldCount: 320,
      rating: 4.8,
      reviewCount: 42,
      category: {
        _id: 'cat-nuts',
        name: 'Dry Fruits & Nuts',
        slug: 'dry-fruits-and-nuts',
      },
      brand: {
        _id: 'brand-mevapur',
        name: 'MevaPur Naturals',
      },
      images: [
        'https://res.cloudinary.com/demo/image/upload/v1/almonds-1.jpg',
        'https://res.cloudinary.com/demo/image/upload/v1/almonds-2.jpg',
      ],
      status: 'published',
      isActive: true,
    };

    const normalized = normalizeProduct(raw);
    assert.ok(normalized);
    assert.equal(normalized._id, 'prod-12345');
    assert.equal(normalized.name, 'Organic Premium Almonds');
    assert.equal(normalized.slug, 'organic-premium-almonds');
    assert.equal(normalized.price, 1200);
    assert.equal(normalized.originalPrice, 1500);
    assert.equal(normalized.stock, 45);
    assert.equal(normalized.rating, 4.8);
    assert.equal(normalized.reviewCount, 42);
    assert.equal(normalized.primaryImage, 'https://res.cloudinary.com/demo/image/upload/v1/almonds-1.jpg');
    assert.equal(normalized.images.length, 2);
  });

  test('strictly preserves numeric zeros for zero-price, zero-stock, and zero-rating', () => {
    const raw = {
      _id: 'prod-zero',
      name: 'Sample Zero Product',
      price: 0,
      stock: 0,
      rating: 0,
      reviewCount: 0,
      soldCount: 0,
      discount: 0,
      status: 'published',
    };

    const normalized = normalizeProduct(raw);
    assert.ok(normalized);
    assert.equal(normalized.price, 0);
    assert.equal(normalized.stock, 0);
    assert.equal(normalized.rating, 0);
    assert.equal(normalized.reviewCount, 0);
    assert.equal(normalized.soldCount, 0);
    assert.equal(normalized.discount, 0);
  });

  test('rejects invalid or incomplete products missing required identity', () => {
    assert.equal(normalizeProduct(null), null);
    assert.equal(normalizeProduct({}), null);
    assert.equal(normalizeProduct({ _id: '123' }), null); // Missing name
    assert.equal(normalizeProduct({ name: 'Product Without ID' }), null); // Missing _id
  });

  test('sanitizes media URLs against unsafe protocols and credentials', () => {
    assert.equal(getSafeMediaUrl('javascript:alert(1)'), '/placeholder.png');
    assert.equal(getSafeMediaUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='), '/placeholder.png');
    assert.equal(getSafeMediaUrl('https://user:password@malicious.com/image.jpg'), '/placeholder.png');
    assert.equal(getSafeMediaUrl(''), '/placeholder.png');
    assert.equal(getSafeMediaUrl(undefined), '/placeholder.png');

    // Safe URLs
    assert.equal(
      getSafeMediaUrl('https://res.cloudinary.com/mevapur/image.jpg'),
      'https://res.cloudinary.com/mevapur/image.jpg'
    );
    assert.equal(getSafeMediaUrl('/placeholder.png'), '/placeholder.png');
  });

  test('correctly resolves matching variant from selected attribute map', () => {
    const variants: ProductVariant[] = [
      {
        _id: 'var-1',
        sku: 'ALM-500G',
        attributes: [
          { name: 'Weight', value: '500g' },
          { name: 'Type', value: 'Roasted' },
        ],
        price: 1200,
        stock: 20,
        images: ['https://res.cloudinary.com/demo/var1.jpg'],
        isDefault: true,
      },
      {
        _id: 'var-2',
        sku: 'ALM-1KG',
        attributes: [
          { name: 'Weight', value: '1kg' },
          { name: 'Type', value: 'Roasted' },
        ],
        price: 2300,
        stock: 10,
        images: ['https://res.cloudinary.com/demo/var2.jpg'],
        isDefault: false,
      },
      {
        _id: 'var-3',
        sku: 'ALM-500G-RAW',
        attributes: [
          { name: 'Weight', value: '500g' },
          { name: 'Type', value: 'Raw' },
        ],
        price: 1100,
        stock: 0,
        images: [],
        isDefault: false,
      },
    ];

    // Default variant when no selection
    const defaultMatch = findMatchingVariant(variants, {});
    assert.ok(defaultMatch);
    assert.equal(defaultMatch._id, 'var-1');

    // Match 1kg Roasted
    const match1Kg = findMatchingVariant(variants, { Weight: '1kg', Type: 'Roasted' });
    assert.ok(match1Kg);
    assert.equal(match1Kg._id, 'var-2');
    assert.equal(match1Kg.price, 2300);

    // Match out of stock 500g Raw
    const matchRaw = findMatchingVariant(variants, { Weight: '500g', Type: 'Raw' });
    assert.ok(matchRaw);
    assert.equal(matchRaw._id, 'var-3');
    assert.equal(matchRaw.stock, 0);

    // Non-existent combination
    const matchNonExistent = findMatchingVariant(variants, { Weight: '1kg', Type: 'Raw' });
    assert.equal(matchNonExistent, null);
  });

  test('computes attribute option availability matrix accurately', () => {
    const variants: ProductVariant[] = [
      {
        _id: 'v1',
        sku: 'S-RED',
        attributes: [{ name: 'Size', value: 'S' }, { name: 'Color', value: 'Red' }],
        price: 100,
        stock: 5,
        images: [],
        isDefault: true,
      },
      {
        _id: 'v2',
        sku: 'M-RED',
        attributes: [{ name: 'Size', value: 'M' }, { name: 'Color', value: 'Red' }],
        price: 120,
        stock: 0,
        images: [],
        isDefault: false,
      },
      {
        _id: 'v3',
        sku: 'L-BLUE',
        attributes: [{ name: 'Size', value: 'L' }, { name: 'Color', value: 'Blue' }],
        price: 140,
        stock: 8,
        images: [],
        isDefault: false,
      },
    ];

    const matrix = getAttributeOptionMatrix(variants, { Color: 'Red' });
    assert.ok(matrix.Size);
    assert.ok(matrix.Color);

    const sizeS = matrix.Size.find((s) => s.value === 'S');
    assert.ok(sizeS);
    assert.equal(sizeS.available, true);
    assert.equal(sizeS.inStock, true);

    const sizeM = matrix.Size.find((s) => s.value === 'M');
    assert.ok(sizeM);
    assert.equal(sizeM.available, true);
    assert.equal(sizeM.inStock, false);

    const sizeL = matrix.Size.find((s) => s.value === 'L');
    assert.ok(sizeL);
    assert.equal(sizeL.available, false); // Not available when Color is Red
  });

  test('normalizes pagination response safely with fallback bounds', () => {
    const meta = normalizePagination({
      page: 2,
      total: 35,
      limit: 10,
    });

    assert.equal(meta.page, 2);
    assert.equal(meta.total, 35);
    assert.equal(meta.limit, 10);
    assert.equal(meta.pages, 4);
    assert.equal(meta.hasNext, true);
    assert.equal(meta.hasPrev, true);

    // Edge case: empty/invalid
    const emptyMeta = normalizePagination(null);
    assert.equal(emptyMeta.page, 1);
    assert.equal(emptyMeta.total, 0);
    assert.equal(emptyMeta.pages, 1);
    assert.equal(emptyMeta.hasNext, false);
    assert.equal(emptyMeta.hasPrev, false);
  });
});

describe('ProductCard Navigation & Cloudflare R2 RemotePattern Contracts', () => {
  test('next.config.js allows exact Cloudflare R2 hostname and /products/** pathname', () => {
    const configPath = path.resolve(process.cwd(), 'next.config.js');
    const require = createRequire(import.meta.url);
    const nextConfig = require(configPath);

    assert.ok(nextConfig.images?.remotePatterns, 'remotePatterns must be defined');
    const r2Pattern = nextConfig.images.remotePatterns.find(
      (p: { hostname: string; pathname?: string; protocol?: string }) =>
        p.hostname === 'pub-98eada4c5a224f8bbb2552f65a93134e.r2.dev'
    );

    assert.ok(r2Pattern, 'Must allow exact R2 hostname pub-98eada4c5a224f8bbb2552f65a93134e.r2.dev');
    assert.equal(r2Pattern.protocol, 'https');
    assert.equal(r2Pattern.pathname, '/products/**');

    // Reject broad wildcard or open hostnames
    const hasUnrestrictedWildcard = nextConfig.images.remotePatterns.some(
      (p: { hostname: string }) => p.hostname === '*' || p.hostname === '**'
    );
    assert.equal(hasUnrestrictedWildcard, false, 'Must not allow unrestricted wildcard image hostnames');
  });

  test('ProductCard navigates using product._id and wraps visible content in semantic Link', () => {
    const cardPath = path.resolve(process.cwd(), 'src/components/products/ProductCard.tsx');
    const source = fs.readFileSync(cardPath, 'utf-8');

    // 1. Navigation target must use product._id with encodeURIComponent
    assert.ok(
      source.includes('const targetHref = `/products/${encodeURIComponent(product._id)}`;'),
      'ProductCard must construct targetHref using product._id'
    );
    assert.equal(
      source.includes('product.slug || product._id'),
      false,
      'ProductCard must not use slug for product detail route'
    );

    // 2. Visible content must be inside the semantic Link, not an invisible absolute overlay
    assert.equal(
      source.includes('className="absolute inset-0 z-0"'),
      false,
      'Fragile invisible z-0 overlay link must be eliminated'
    );
    assert.ok(
      source.includes('<Link\n        href={targetHref}') || source.includes('<Link href={targetHref}'),
      'Semantic Link must wrap card content'
    );

    // 3. Wishlist button must remain outside the Link as an absolute sibling with high z-index
    const linkIndex = source.indexOf('<Link');
    const linkCloseIndex = source.indexOf('</Link>');
    const wishlistButtonIndex = source.indexOf('onClick={toggleWishlist}');

    assert.ok(linkIndex !== -1, 'Link must exist');
    assert.ok(linkCloseIndex !== -1, '</Link> must exist');
    assert.ok(wishlistButtonIndex !== -1, 'Wishlist button must exist');
    assert.ok(
      wishlistButtonIndex > linkCloseIndex,
      'Wishlist button must be outside <Link>...</Link> to prevent triggering product detail navigation'
    );

    // 4. Wishlist click must call preventDefault and stopPropagation
    assert.ok(
      source.includes('event.preventDefault();') && source.includes('event.stopPropagation();'),
      'Wishlist button click handler must stop event propagation'
    );
  });
});
