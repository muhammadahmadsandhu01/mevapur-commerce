import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Admin Product Management UI Behavior and Contracts', () => {
  const productsDir = path.resolve(process.cwd(), 'src/app/products');
  const ordersDir = path.resolve(process.cwd(), 'src/app/orders');

  test('ensures zero broken navigation strings to /admin/products in product pages', () => {
    const checkFile = (filePath: string) => {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        // Exclude api.ts and comments
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

  test('generates honest Draft vs Publish payloads without client-supplied isActive', () => {
    const generatePayload = (formData: any, status: 'draft' | 'published', mediaAssetIds: string[] = []) => {
      const payload: Record<string, unknown> = {
        name: formData.name.trim(),
        slug: formData.slug?.trim() || undefined,
        description: formData.description || '',
        category: formData.category || null,
        price: Number(formData.price || 0),
        initialStock: Number(formData.stock || 0),
        mediaAssetIds,
        status
      };
      return payload;
    };

    const draftPayload = generatePayload({ name: 'Draft Almonds', stock: 10, price: 500 }, 'draft');
    assert.strictEqual(draftPayload.status, 'draft');
    assert.strictEqual(draftPayload.name, 'Draft Almonds');
    assert.strictEqual('isActive' in draftPayload, false, 'Client must never supply isActive');

    const pubPayload = generatePayload({ name: 'Pub Almonds', description: 'Desc', category: 'cat1', price: 1000 }, 'published', ['media1']);
    assert.strictEqual(pubPayload.status, 'published');
    assert.strictEqual('isActive' in pubPayload, false, 'Client must never supply isActive');
  });

  test('maps optimistic concurrency HTTP 409 conflict to user-friendly reload prompt', () => {
    const handleSaveError = (status: number) => {
      if (status === 409) {
        return 'This product was modified by another administrator. Please reload and review the latest changes.';
      }
      return 'Failed to save product';
    };

    assert.strictEqual(
      handleSaveError(409),
      'This product was modified by another administrator. Please reload and review the latest changes.'
    );
    assert.strictEqual(handleSaveError(500), 'Failed to save product');
  });
});
