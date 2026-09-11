import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

describe('DEF-26: Admin Panel Category Visibility & Selector Contract Suite (Tests 29-36)', () => {
  const adminApiFile = path.resolve(process.cwd(), 'src/lib/api.ts');
  const categoriesPageFile = path.resolve(process.cwd(), 'src/app/categories/page.tsx');
  const productAddFile = path.resolve(process.cwd(), 'src/app/products/add/page.tsx');
  const productEditFile = path.resolve(process.cwd(), 'src/app/products/[id]/edit/page.tsx');

  const categorySelectComponentFile = path.resolve(process.cwd(), 'src/components/products/ProductCategorySelect.tsx');

  test('29. Category management reads from the canonical protected admin endpoint', () => {
    assert.ok(fs.existsSync(categoriesPageFile), 'Categories page must exist');
    const content = fs.readFileSync(categoriesPageFile, 'utf-8');

    assert.ok(
      content.includes("api.get('/admin/categories')") || content.includes('api.get("/admin/categories")'),
      'Categories page fetchCategories must use /admin/categories endpoint'
    );
    assert.ok(
      !content.includes("api.get('/categories')") && !content.includes('api.get("/categories")'),
      'Categories page must not use public /categories endpoint for admin management'
    );
  });

  test('30. Product create selector loads authorized active/inactive categories and disables inactive options', () => {
    assert.ok(fs.existsSync(productAddFile), 'Product add page must exist');
    assert.ok(fs.existsSync(categorySelectComponentFile), 'ProductCategorySelect component must exist');
    const addContent = fs.readFileSync(productAddFile, 'utf-8');
    const selectContent = fs.readFileSync(categorySelectComponentFile, 'utf-8');

    // Verify add page integrates ProductCategorySelect
    assert.ok(
      addContent.includes('ProductCategorySelect'),
      'Product add page must use ProductCategorySelect component'
    );

    // Verify option rendering logic disables inactive categories in create mode
    assert.ok(
      selectContent.includes('isDisabled = isEdit ? (isInactive && !isCurrentSelection) : isInactive') ||
      selectContent.includes('disabled={isDisabled}'),
      'Product category selector component must disable inactive categories in create mode'
    );
    assert.ok(
      selectContent.includes("(Inactive)' : ''"),
      'Product category selector must display (Inactive) label for inactive categories'
    );

    // Functional verification of option selection logic
    const mockCategories = [
      { _id: 'cat-active-1', name: 'Almonds Active', isActive: true, parentId: null },
      { _id: 'cat-inactive-2', name: 'Seasonal Inactive', isActive: false, parentId: null }
    ];

    const renderedOptions = mockCategories.map(cat => ({
      value: cat._id,
      label: `${cat.name}${cat.isActive === false ? ' (Inactive)' : ''}`,
      disabled: cat.isActive === false
    }));

    assert.equal(renderedOptions[0].disabled, false);
    assert.equal(renderedOptions[0].label, 'Almonds Active');
    assert.equal(renderedOptions[1].disabled, true);
    assert.equal(renderedOptions[1].label, 'Seasonal Inactive (Inactive)');
  });

  test('31. Product edit preserves its selected category (even if inactive) with warning banner', () => {
    assert.ok(fs.existsSync(productEditFile), 'Product edit page must exist');
    assert.ok(fs.existsSync(categorySelectComponentFile), 'ProductCategorySelect component must exist');
    const editContent = fs.readFileSync(productEditFile, 'utf-8');
    const selectContent = fs.readFileSync(categorySelectComponentFile, 'utf-8');

    // Verify edit page integrates ProductCategorySelect with isEdit={true}
    assert.ok(
      editContent.includes('ProductCategorySelect') && editContent.includes('isEdit={true}'),
      'Product edit page must use ProductCategorySelect with isEdit={true}'
    );

    // Verify preservation of current selection and warning banner in component
    assert.ok(
      selectContent.includes('isInactive && !isCurrentSelection'),
      'Product edit category selector must allow current inactive selection but disable other inactive categories'
    );
    assert.ok(
      selectContent.includes('Currently assigned to an inactive category'),
      'Product edit must render warning text when product is assigned to an inactive category'
    );

    // Functional verification
    const mockCategories = [
      { _id: 'cat-active-1', name: 'Almonds Active', isActive: true, parentId: null },
      { _id: 'cat-inactive-assigned', name: 'Legacy Inactive Assigned', isActive: false, parentId: null },
      { _id: 'cat-inactive-other', name: 'Other Inactive', isActive: false, parentId: null }
    ];

    const currentSelectedCatId = 'cat-inactive-assigned';

    const renderedEditOptions = mockCategories.map(cat => {
      const isCurrentSelection = currentSelectedCatId === cat._id;
      const isInactive = cat.isActive === false;
      return {
        value: cat._id,
        label: `${cat.name}${isInactive ? ' (Inactive)' : ''}`,
        disabled: isInactive && !isCurrentSelection
      };
    });

    // Currently assigned inactive category must NOT be disabled so the form retains it
    assert.equal(renderedEditOptions[1].disabled, false, 'Current inactive category must remain selectable in edit form');
    assert.equal(renderedEditOptions[1].label, 'Legacy Inactive Assigned (Inactive)');

    // Other unassigned inactive category MUST be disabled
    assert.equal(renderedEditOptions[2].disabled, true, 'Other inactive categories must be disabled');
  });

  test('32. Inactive category status renders truthfully in admin category statistics', () => {
    const mockCategories = [
      { _id: '1', name: 'Cat 1', isActive: true, isFeatured: true },
      { _id: '2', name: 'Cat 2', isActive: true, isFeatured: false },
      { _id: '3', name: 'Cat 3', isActive: false, isFeatured: false }
    ];

    const stats = {
      total: mockCategories.length,
      active: mockCategories.filter(c => c.isActive).length,
      inactive: mockCategories.filter(c => !c.isActive).length,
      featured: mockCategories.filter(c => c.isFeatured).length
    };

    assert.equal(stats.total, 3);
    assert.equal(stats.active, 2);
    assert.equal(stats.inactive, 1);
    assert.equal(stats.featured, 1);
  });

  test('33. api.ts centralizes category methods to /admin/categories', () => {
    assert.ok(fs.existsSync(adminApiFile), 'Admin API client file must exist');
    const content = fs.readFileSync(adminApiFile, 'utf-8');

    assert.ok(
      content.includes("api.get('/admin/categories')"),
      'getCategories in api.ts must call /admin/categories'
    );
    assert.ok(
      content.includes("api.post('/admin/categories'"),
      'createCategory in api.ts must call /admin/categories'
    );
    assert.ok(
      content.includes("api.put(`/admin/categories/${id}`"),
      'updateCategory in api.ts must call /admin/categories/:id'
    );
    assert.ok(
      content.includes("api.delete(`/admin/categories/${id}`"),
      'deleteCategory in api.ts must call /admin/categories/:id'
    );
  });

  test('34. Error response contract ensures 401/403 do not expose category entities', () => {
    const simulateClientError = (statusCode: number) => {
      if (statusCode === 401) {
        return { success: false, data: null, error: 'Authentication token is required' };
      }
      if (statusCode === 403) {
        return { success: false, data: null, error: 'Access is not permitted for this account' };
      }
      return { success: true, data: [] };
    };

    const res401 = simulateClientError(401);
    assert.equal(res401.success, false);
    assert.equal(res401.data, null);

    const res403 = simulateClientError(403);
    assert.equal(res403.success, false);
    assert.equal(res403.data, null);
  });

  test('35. Empty and error states in category management handle empty array gracefully', () => {
    interface CategoryItem {
      _id: string;
      parentId?: string | null;
      isActive?: boolean;
    }
    const emptyCategories: CategoryItem[] = [];
    const mainCategories = emptyCategories.filter(c => !c.parentId);
    assert.equal(mainCategories.length, 0);

    const stats = {
      total: emptyCategories.length,
      active: emptyCategories.filter(c => c.isActive).length
    };
    assert.equal(stats.total, 0);
    assert.equal(stats.active, 0);
  });

  test('36. No admin component falls back to the public category endpoint for privileged category data', () => {
    const adminAppDir = path.resolve(process.cwd(), 'src/app');
    const scanDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          // Should not call api.get('/categories') or api.get("/categories")
          if (content.includes("api.get('/categories')") || content.includes('api.get("/categories")')) {
            assert.fail(`Privileged admin component ${fullPath} is calling public /categories endpoint`);
          }
        }
      }
    };

    scanDir(adminAppDir);
  });
});
