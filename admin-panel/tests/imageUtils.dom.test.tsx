import { describe, it, expect } from 'vitest';
import { resolveImageUrl } from '@/lib/imageUtils';
import { PRODUCT_PLACEHOLDER } from '@/lib/placeholder';

describe('Robust Image URL Resolver (resolveImageUrl)', () => {
  it('returns PRODUCT_PLACEHOLDER for null, undefined, or empty values', () => {
    expect(resolveImageUrl(undefined)).toBe(PRODUCT_PLACEHOLDER);
    expect(resolveImageUrl(null)).toBe(PRODUCT_PLACEHOLDER);
    expect(resolveImageUrl('')).toBe(PRODUCT_PLACEHOLDER);
    expect(resolveImageUrl('   ')).toBe(PRODUCT_PLACEHOLDER);
    expect(resolveImageUrl({})).toBe(PRODUCT_PLACEHOLDER);
    expect(resolveImageUrl({ url: '' })).toBe(PRODUCT_PLACEHOLDER);
    expect(resolveImageUrl({ url: null })).toBe(PRODUCT_PLACEHOLDER);
    expect(resolveImageUrl({ path: '' })).toBe(PRODUCT_PLACEHOLDER);
  });

  it('resolves simple string image paths', () => {
    expect(resolveImageUrl('/uploads/product-images/shoe-1.webp')).toBe(
      '/uploads/product-images/shoe-1.webp'
    );
    expect(resolveImageUrl('uploads/product-images/shoe-1.webp')).toBe(
      '/uploads/product-images/shoe-1.webp'
    );
    expect(resolveImageUrl('data:image/svg+xml;base64,12345')).toBe(
      'data:image/svg+xml;base64,12345'
    );
    expect(resolveImageUrl('blob:http://localhost:3000/123-456')).toBe(
      'blob:http://localhost:3000/123-456'
    );
  });

  it('resolves object formats with .url, .path, .secure_url, or .src', () => {
    expect(resolveImageUrl({ url: '/uploads/product-images/bag.webp' })).toBe(
      '/uploads/product-images/bag.webp'
    );
    expect(resolveImageUrl({ path: '/uploads/product-images/bag.webp' })).toBe(
      '/uploads/product-images/bag.webp'
    );
    expect(resolveImageUrl({ secure_url: 'https://cdn.example.com/bag.webp' })).toBe(
      'https://cdn.example.com/bag.webp'
    );
    expect(resolveImageUrl({ src: '/uploads/product-images/bag.webp' })).toBe(
      '/uploads/product-images/bag.webp'
    );
  });

  it('maps media.mock.mevapur.test upload URLs to local /uploads route', () => {
    expect(
      resolveImageUrl('https://media.mock.mevapur.test/products/2026/09/sample.webp')
    ).toBe('/uploads/products/2026/09/sample.webp');
    expect(
      resolveImageUrl('https://cdn.mock.mevapur.test/products/2026/09/sample.webp')
    ).toBe('/uploads/products/2026/09/sample.webp');
    expect(
      resolveImageUrl({ url: 'https://media.mock.mevapur.test/products/2026/09/sample.webp' })
    ).toBe('/uploads/products/2026/09/sample.webp');
    expect(
      resolveImageUrl({ url: 'https://media.mock.mevapur.test/sample.webp' })
    ).toBe('/uploads/sample.webp');
    expect(
      resolveImageUrl('https://media.mock.mevapur.test/uploads/products/item.webp')
    ).toBe('/uploads/products/item.webp');
  });

  it('falls back to PRODUCT_PLACEHOLDER on non-resolving mock domains without path or unhandled mock domains', () => {
    expect(
      resolveImageUrl('https://media.mock.mevapur.test')
    ).toBe(PRODUCT_PLACEHOLDER);
    expect(
      resolveImageUrl('https://media.mock.mevapur.test/')
    ).toBe(PRODUCT_PLACEHOLDER);
    expect(
      resolveImageUrl('https://harzaar.com/images/sample.webp')
    ).toBe(PRODUCT_PLACEHOLDER);
  });

  it('preserves valid external URLs', () => {
    expect(
      resolveImageUrl('https://images.unsplash.com/photo-1542291026-7eec264c27ff')
    ).toBe('https://images.unsplash.com/photo-1542291026-7eec264c27ff');
    expect(
      resolveImageUrl({ url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff' })
    ).toBe('https://images.unsplash.com/photo-1542291026-7eec264c27ff');
  });
});
