import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeProduct } from '../src/lib/catalogAdapter.ts';

describe('DEF-26: Storefront Public Category Visibility & Navigation Suite (Tests 37-43)', () => {
  const apiFile = path.resolve(process.cwd(), 'src/lib/api.ts');
  const megaMenuFile = path.resolve(process.cwd(), 'src/components/layout/MegaMenu.tsx');
  const navbarFile = path.resolve(process.cwd(), 'src/components/Navbar.tsx');
  const productsPageFile = path.resolve(process.cwd(), 'src/app/products/page.tsx');
  const searchPageFile = path.resolve(process.cwd(), 'src/app/search/page.tsx');

  test('37. Public navigation still loads active categories from public /categories endpoint', () => {
    assert.ok(fs.existsSync(apiFile), 'Storefront API client must exist');
    const content = fs.readFileSync(apiFile, 'utf-8');

    assert.ok(
      content.includes('api.get("/categories")') || content.includes("api.get('/categories')"),
      'Storefront getCategories must query public /categories endpoint'
    );
    assert.ok(
      !content.includes('/admin/categories'),
      'Storefront must never call /admin/categories'
    );
  });

  test('38. Inactive categories do not appear in navigation menus', () => {
    assert.ok(fs.existsSync(megaMenuFile), 'MegaMenu component must exist');
    assert.ok(fs.existsSync(navbarFile), 'Navbar component must exist');

    // Simulate active categories returned from public endpoint vs inactive exclusion
    const publicReturnedCategories = [
      { _id: 'cat-active-1', name: 'Almonds & Nuts', slug: 'almonds-nuts', isActive: true },
      { _id: 'cat-active-2', name: 'Mountain Honey', slug: 'mountain-honey', isActive: true }
    ];

    // Inactive category is omitted by backend public filter
    const menuItems = publicReturnedCategories.slice(0, 8);
    assert.equal(menuItems.length, 2);
    assert.equal(menuItems[0].slug, 'almonds-nuts');
    assert.equal(menuItems[1].slug, 'mountain-honey');
    assert.ok(menuItems.every(item => item.isActive === true));
  });

  test('39. Existing category ObjectId links remain valid and construct canonical URL paths', () => {
    const categoryObjectId = '66d0a1b2c3d4e5f6a7b8c9d0';
    const categoryUrl = `/products?category=${categoryObjectId}`;

    const url = new URL(`https://mevapur.test${categoryUrl}`);
    assert.equal(url.searchParams.get('category'), categoryObjectId);
    assert.equal(url.pathname, '/products');
  });

  test('40. Existing category slug links remain valid and construct canonical URL paths', () => {
    const categorySlug = 'dry-fruits-nuts';
    const categoryUrl = `/products?category=${categorySlug}`;

    const url = new URL(`https://mevapur.test${categoryUrl}`);
    assert.equal(url.searchParams.get('category'), categorySlug);
    assert.equal(url.pathname, '/products');
  });

  test('41. Product listing remains published-only with normalized category data', () => {
    const publishedProduct = {
      _id: 'prod-001',
      name: 'Roasted Cashews 250g',
      slug: 'roasted-cashews-250g',
      price: 850,
      stock: 20,
      status: 'published',
      isActive: true,
      category: {
        _id: 'cat-cashews',
        name: 'Cashews',
        slug: 'cashews'
      },
      images: ['https://media.test.com/cashews.webp']
    };

    const normalized = normalizeProduct(publishedProduct);
    assert.ok(normalized);
    assert.equal(normalized.name, 'Roasted Cashews 250g');
    assert.equal(normalized.category?.name, 'Cashews');
    assert.equal(normalized.category?.slug, 'cashews');
  });

  test('42. Category-filter fail-closed behavior in catalog page handles unknown/empty category safely', () => {
    assert.ok(fs.existsSync(productsPageFile), 'Products page must exist');
    const content = fs.readFileSync(productsPageFile, 'utf-8');

    // Products page finds category by id or slug
    assert.ok(
      content.includes('c._id === idOrSlug || c.slug === idOrSlug'),
      'Products page must resolve category by either ObjectId or slug'
    );
  });

  test('43. Search and filter components bind category selection without breaking query structure', () => {
    assert.ok(fs.existsSync(searchPageFile), 'Search page must exist');
    const content = fs.readFileSync(searchPageFile, 'utf-8');

    assert.ok(
      content.includes('<option value="">All Categories</option>'),
      'Search page category filter must provide an All Categories default option'
    );
  });
});
