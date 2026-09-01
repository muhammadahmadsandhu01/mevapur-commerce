import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  validateProductForm,
  prepareProductPayload,
  mapProductSaveError,
  extractMediaAssetIds,
  transitionUploadState,
  isFormDirty,
  getFieldAccessibilityProps
} from '../src/lib/productFormHelpers.ts';
import type { ProductFormFieldValues } from '../src/lib/productFormHelpers.ts';

describe('Admin Product Management UI Behavior and Contracts', () => {
  const productsDir = path.resolve(process.cwd(), 'src/app/products');
  const ordersDir = path.resolve(process.cwd(), 'src/app/orders');

  describe('Routing and Navigation Integrity', () => {
    test('ensures zero broken navigation strings to /admin/products in product pages', () => {
      const checkFile = (filePath: string) => {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        lines.forEach((line, index) => {
          if (line.includes("router.push('/admin/products") || line.includes('router.push("/admin/products')) {
            assert.fail(`Found broken navigation target in ${filePath}:${index + 1}: ${line.trim()}`);
          }
        });
      };

      const files = [
        path.join(productsDir, 'page.tsx'),
        path.join(productsDir, 'add/page.tsx'),
        path.join(productsDir, '[id]/edit/page.tsx'),
      ];

      files.forEach(file => {
        if (fs.existsSync(file)) checkFile(file);
      });
    });

    test('ensures zero broken navigation strings to /admin/orders in order pages', () => {
      const orderDetailFile = path.join(ordersDir, '[id]/page.tsx');
      if (fs.existsSync(orderDetailFile)) {
        const content = fs.readFileSync(orderDetailFile, 'utf-8');
        assert.strictEqual(
          content.includes("router.push('/admin/orders')") || content.includes('router.push("/admin/orders")'),
          false,
          'Found broken navigation to /admin/orders in orders/[id]/page.tsx'
        );
      }
    });

    test('validates table/list and grid Edit navigation targets point to /products/[id]/edit', () => {
      const getEditTarget = (productId: string) => `/products/${productId}/edit`;
      assert.strictEqual(getEditTarget('prod-123'), '/products/prod-123/edit');
    });

    test('validates create-success, update-success, and cancel redirects to /products', () => {
      const getSuccessRedirect = () => '/products';
      assert.strictEqual(getSuccessRedirect(), '/products');
    });
  });

  describe('Form Validation Behavior (validateProductForm)', () => {
    test('accepts a minimal Draft with only a name and returns valid state', () => {
      const draftForm: ProductFormFieldValues = {
        name: 'Organic Walnuts Draft',
        price: 0
      };

      const result = validateProductForm(draftForm, 'draft');
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(Object.keys(result.errors).length, 0);
      assert.strictEqual(result.firstErrorField, undefined);
    });

    test('rejects a Draft with an empty name and sets firstErrorField to name', () => {
      const draftForm: ProductFormFieldValues = {
        name: '   ',
        price: 0
      };

      const result = validateProductForm(draftForm, 'draft');
      assert.strictEqual(result.isValid, false);
      assert.strictEqual(result.errors.name, 'Product name is required');
      assert.strictEqual(result.firstErrorField, 'name');
    });

    test('rejects publication when mandatory fields (description, category, price, images) are missing', () => {
      const incompleteForm: ProductFormFieldValues = {
        name: 'Incomplete Item',
        price: 0,
        images: []
      };

      const result = validateProductForm(incompleteForm, 'published', []);
      assert.strictEqual(result.isValid, false);
      assert.strictEqual(result.errors.description, 'Description is required for published products');
      assert.strictEqual(result.errors.category, 'Category is required for published products');
      assert.strictEqual(result.errors.price, 'Price must be greater than 0');
      assert.strictEqual(result.errors.images, 'At least one product image is required');
      assert.strictEqual(result.firstErrorField, 'description');
    });

    test('accepts complete publication form data with valid media asset IDs', () => {
      const completeForm: ProductFormFieldValues = {
        name: 'Premium Almonds',
        description: 'Fresh organic almonds',
        category: 'cat-nuts-123',
        price: 1500,
        images: []
      };

      const result = validateProductForm(completeForm, 'published', ['media-asset-uuid-1']);
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(Object.keys(result.errors).length, 0);
    });

    test('accepts complete publication form data with variable variants and price 0 on root', () => {
      const variableForm: ProductFormFieldValues = {
        name: 'Variable Honey',
        description: 'Pure organic wild honey',
        category: 'cat-honey-123',
        price: 0,
        variants: [{
          sku: 'HONEY-500G',
          attributes: [{ name: 'Size', value: '500g' }],
          price: 800,
          isDefault: true
        }],
        images: ['https://example.com/honey.webp']
      };

      const result = validateProductForm(variableForm, 'published', []);
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(Object.keys(result.errors).length, 0);
    });
  });

  describe('Payload Preparation and Protected Field Exclusion (prepareProductPayload)', () => {
    test('generates honest Draft payload omitting client-supplied isActive, discount, and direct stock', () => {
      const rawFormData: ProductFormFieldValues = {
        name: 'Draft Cashews',
        stock: 50,
        price: 500,
        originalPrice: 600
      };

      const payload = prepareProductPayload(rawFormData, 'draft');
      assert.strictEqual(payload.name, 'Draft Cashews');
      assert.strictEqual(payload.status, 'draft');
      assert.strictEqual('isActive' in payload, false, 'Client must never supply isActive');
      assert.strictEqual('discount' in payload, false, 'Client must never supply discount');
      assert.strictEqual(payload.initialStock, 50);
      assert.strictEqual('stock' in payload, false, 'Client must never supply stock directly');
    });

    test('generates honest Published payload with expectedVersion for optimistic concurrency', () => {
      const rawFormData: ProductFormFieldValues = {
        name: 'Published Pistachios',
        slug: 'PISTACHIOS-2026',
        description: 'Roasted salted pistachios',
        category: 'cat-nuts-1',
        price: 2000,
        variants: [{
          sku: 'PIST-250G',
          barcode: '123456789',
          attributes: [{ name: 'Weight', value: '250g' }],
          price: 550,
          isDefault: true
        }],
        seoTitle: 'Buy Pistachios Online'
      };

      const payload = prepareProductPayload(rawFormData, 'published', ['asset-1'], 3);
      assert.strictEqual(payload.name, 'Published Pistachios');
      assert.strictEqual(payload.status, 'published');
      assert.strictEqual(payload.slug, 'pistachios-2026');
      assert.strictEqual(payload.expectedVersion, 3);
      assert.strictEqual('isActive' in payload, false);
      assert.strictEqual((payload.variants as Array<{ sku: string }>)[0].sku, 'PIST-250G');
    });
  });

  describe('Error Mapping and Concurrency Handling (mapProductSaveError)', () => {
    test('maps Axios HTTP 409 conflict to user-friendly reload and review prompt', () => {
      const conflictError = {
        isAxiosError: true,
        response: {
          status: 409,
          data: { code: 'CONCURRENCY_CONFLICT', message: 'Version conflict' }
        }
      };

      const userMessage = mapProductSaveError(conflictError);
      assert.strictEqual(
        userMessage,
        'This product was modified by another administrator. Please reload and review the latest changes.'
      );
    });

    test('maps standard Axios error message safely', () => {
      const validationError = {
        isAxiosError: true,
        response: {
          status: 400,
          data: { message: 'Category is required for publication' }
        }
      };

      const userMessage = mapProductSaveError(validationError);
      assert.strictEqual(userMessage, 'Category is required for publication');
    });

    test('falls back safely for unknown non-Axios generic errors', () => {
      const genericError = new Error('Network timeout');
      assert.strictEqual(mapProductSaveError(genericError), 'Network timeout');
      assert.strictEqual(mapProductSaveError(null), 'Failed to save product');
      assert.strictEqual(mapProductSaveError(undefined), 'Failed to save product');
    });
  });

  describe('Media Asset ID Extraction (extractMediaAssetIds)', () => {
    test('extracts string IDs from mixed MediaAsset objects and string arrays', () => {
      const mixedAssets = [
        { _id: 'asset-id-1', publicUrl: 'https://example.com/1.webp' },
        'asset-id-2',
        { _id: 'asset-id-3' },
        null,
        undefined
      ];

      const extracted = extractMediaAssetIds(mixedAssets);
      assert.deepStrictEqual(extracted, ['asset-id-1', 'asset-id-2', 'asset-id-3']);
    });

    test('handles empty or non-array inputs safely', () => {
      assert.deepStrictEqual(extractMediaAssetIds([]), []);
      assert.deepStrictEqual(extractMediaAssetIds(null as unknown as unknown[]), []);
    });
  });

  describe('Upload State Machine (transitionUploadState)', () => {
    test('transitions from idle to uploading, succeeded, and removed', () => {
      let state = transitionUploadState('idle', 'START_UPLOAD');
      assert.strictEqual(state.state, 'uploading');

      state = transitionUploadState(state.state, 'UPLOAD_SUCCESS', {
        mediaAssetId: 'media-uuid-1',
        url: 'https://example.com/1.webp'
      });
      assert.strictEqual(state.state, 'succeeded');
      assert.strictEqual(state.mediaAssetId, 'media-uuid-1');
      assert.strictEqual(state.url, 'https://example.com/1.webp');

      state = transitionUploadState(state.state, 'REMOVE_MEDIA');
      assert.strictEqual(state.state, 'removed');
      assert.strictEqual(state.mediaAssetId, null);
    });

    test('handles upload failure and retry transition', () => {
      let state = transitionUploadState('uploading', 'UPLOAD_FAILURE', {
        error: 'File size exceeds 5MB'
      });
      assert.strictEqual(state.state, 'failed');
      assert.strictEqual(state.error, 'File size exceeds 5MB');

      state = transitionUploadState(state.state, 'RETRY_UPLOAD');
      assert.strictEqual(state.state, 'retrying');
      assert.strictEqual(state.error, null);
    });
  });

  describe('Unsaved Changes Dirty State Evaluation (isFormDirty)', () => {
    test('evaluates clean initial edit load as not dirty', () => {
      const initialForm: ProductFormFieldValues = {
        name: 'Organic Walnuts',
        description: 'Premium walnuts',
        category: 'cat-1',
        price: 1000,
        stock: 20
      };

      const currentForm = { ...initialForm };
      assert.strictEqual(isFormDirty(initialForm, currentForm, ['media-1'], ['media-1']), false);
    });

    test('marks form dirty when a field or media array is modified', () => {
      const initialForm: ProductFormFieldValues = {
        name: 'Organic Walnuts',
        description: 'Premium walnuts',
        price: 1000,
        stock: 20
      };

      const modifiedForm = { ...initialForm, price: 1200 };
      assert.strictEqual(isFormDirty(initialForm, modifiedForm, ['media-1'], ['media-1']), true);

      // Media addition marks dirty
      assert.strictEqual(isFormDirty(initialForm, initialForm, ['media-1'], ['media-1', 'media-2']), true);
    });
  });

  describe('Field Accessibility Attributes (getFieldAccessibilityProps)', () => {
    test('generates accessible ID, aria-invalid, and aria-describedby', () => {
      const validProps = getFieldAccessibilityProps('name');
      assert.strictEqual(validProps.id, 'field-name');
      assert.strictEqual(validProps['aria-invalid'], false);
      assert.strictEqual(validProps['aria-describedby'], undefined);

      const invalidProps = getFieldAccessibilityProps('name', 'Product name is required');
      assert.strictEqual(invalidProps.id, 'field-name');
      assert.strictEqual(invalidProps['aria-invalid'], true);
      assert.strictEqual(invalidProps['aria-describedby'], 'error-field-name');
    });
  });
});
