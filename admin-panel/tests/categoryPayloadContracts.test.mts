import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareCategoryPayload } from '../src/lib/categoryHelpers.ts';

test('Admin category payload helper normalizes empty parentId to null on creation', () => {
  const formWithEmptyParent = {
    name: 'Dry Fruits',
    slug: 'dry-fruits',
    description: 'All premium dry fruits',
    image: '',
    icon: '🥜',
    parentId: '',
    displayOrder: 0,
    isActive: true,
    isFeatured: false,
    seoTitle: 'Dry Fruits',
    seoDescription: 'Buy dry fruits online'
  };

  const payload = prepareCategoryPayload(formWithEmptyParent);
  assert.equal(payload.parentId, null, 'Empty string parentId must be normalized to null');
  assert.equal(payload.name, 'Dry Fruits');
});

test('Admin category payload helper normalizes whitespace-only parentId to null', () => {
  const formWithWhitespaceParent = {
    name: 'Organic Nuts',
    parentId: '    ',
    displayOrder: 1,
    isActive: true,
    isFeatured: false
  };

  const payload = prepareCategoryPayload(formWithWhitespaceParent);
  assert.equal(payload.parentId, null, 'Whitespace-only parentId must be normalized to null');
});

test('Admin category payload helper preserves explicit null parentId', () => {
  const formWithNullParent = {
    name: 'Beverages',
    parentId: null,
    displayOrder: 2,
    isActive: true,
    isFeatured: false
  };

  const payload = prepareCategoryPayload(formWithNullParent);
  assert.equal(payload.parentId, null, 'Explicit null parentId must remain null');
});

test('Admin category payload helper preserves valid parentId when creating child category', () => {
  const validParentId = '66d0a1b2c3d4e5f6a7b8c9d0';
  const childForm = {
    name: 'Almonds',
    slug: 'almonds',
    description: 'Fresh almonds',
    image: '',
    icon: '',
    parentId: validParentId,
    displayOrder: 1,
    isActive: true,
    isFeatured: false
  };

  const payload = prepareCategoryPayload(childForm);
  assert.equal(payload.parentId, validParentId, 'Valid parentId string must be preserved');
});

test('Admin category payload helper allows clearing parent category on edit', () => {
  // Category previously had a parent, now user selects "No Parent (Main Category)"
  const editFormClearingParent = {
    name: 'Promoted Category',
    slug: 'promoted-category',
    description: 'Promoted to main category',
    parentId: '', // User selected "No Parent"
    displayOrder: 0,
    isActive: true,
    isFeatured: true
  };

  const payload = prepareCategoryPayload(editFormClearingParent);
  assert.equal(payload.parentId, null, 'Clearing parentId in edit form must send explicit null');
});

test('Admin category payload helper trims name and slug strings', () => {
  const form = {
    name: '  Walnuts & Cashews  ',
    slug: '  walnuts-cashews  ',
    parentId: '  66d0a1b2c3d4e5f6a7b8c9d0  ',
    displayOrder: 0,
    isActive: true,
    isFeatured: false
  };

  const payload = prepareCategoryPayload(form);
  assert.equal(payload.name, 'Walnuts & Cashews');
  assert.equal(payload.slug, 'walnuts-cashews');
  assert.equal(payload.parentId, '66d0a1b2c3d4e5f6a7b8c9d0');
});
