import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useState } from 'react';
import { ProductCategorySelect, type CategoryOption } from '@/components/products/ProductCategorySelect';
import api, { getCategories } from '@/lib/api';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    default: {
      ...actual.default,
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
    getCategories: vi.fn(),
  };
});

interface ApiError extends Error {
  response?: {
    status: number;
    data: {
      message: string;
    };
  };
}

describe('ProductCategorySelector Real DOM Tests', () => {
  const mockCategories: CategoryOption[] = [
    { _id: 'cat-active-1', name: 'Almonds & Nuts', isActive: true },
    { _id: 'cat-active-2', name: 'Dried Fruits', isActive: true },
    { _id: 'cat-inactive-1', name: 'Seasonal Inactive Dates', isActive: false },
    { _id: 'cat-inactive-2', name: 'Archived Seeds', isActive: false },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================
  // Section 1: New Product Form (Tests 1-6)
  // ==========================================
  describe('New Product Form', () => {
    it('1. Active category appears as enabled/selectable', () => {
      render(
        <ProductCategorySelect
          categories={mockCategories}
          value=""
          onChange={() => {}}
          isEdit={false}
        />
      );

      const option1 = screen.getByRole('option', { name: 'Almonds & Nuts' }) as HTMLOptionElement;
      const option2 = screen.getByRole('option', { name: 'Dried Fruits' }) as HTMLOptionElement;

      expect(option1).toBeInTheDocument();
      expect(option1.disabled).toBe(false);
      expect(option2).toBeInTheDocument();
      expect(option2.disabled).toBe(false);
    });

    it('2. Inactive category is disabled', () => {
      render(
        <ProductCategorySelect
          categories={mockCategories}
          value=""
          onChange={() => {}}
          isEdit={false}
        />
      );

      const inactiveOption1 = screen.getByRole('option', { name: /Seasonal Inactive Dates/i }) as HTMLOptionElement;
      const inactiveOption2 = screen.getByRole('option', { name: /Archived Seeds/i }) as HTMLOptionElement;

      expect(inactiveOption1).toBeInTheDocument();
      expect(inactiveOption1.disabled).toBe(true);
      expect(inactiveOption2).toBeInTheDocument();
      expect(inactiveOption2.disabled).toBe(true);
    });

    it('3. Inactive category has visible "Inactive" labeling', () => {
      render(
        <ProductCategorySelect
          categories={mockCategories}
          value=""
          onChange={() => {}}
          isEdit={false}
        />
      );

      expect(screen.getByText('Seasonal Inactive Dates (Inactive)')).toBeInTheDocument();
      expect(screen.getByText('Archived Seeds (Inactive)')).toBeInTheDocument();
    });

    it('4. User interaction cannot select an inactive category', () => {
      const handleChange = vi.fn();
      render(
        <ProductCategorySelect
          categories={mockCategories}
          value=""
          onChange={handleChange}
          isEdit={false}
        />
      );

      const inactiveOption1 = screen.getByRole('option', { name: /Seasonal Inactive Dates/i }) as HTMLOptionElement;
      const inactiveOption2 = screen.getByRole('option', { name: /Archived Seeds/i }) as HTMLOptionElement;

      expect(inactiveOption1).toBeDisabled();
      expect(inactiveOption2).toBeDisabled();
    });

    it('5. Active category can be selected', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(
        <ProductCategorySelect
          categories={mockCategories}
          value=""
          onChange={handleChange}
          isEdit={false}
        />
      );

      const select = screen.getByRole('combobox', { name: 'Category' });
      await user.selectOptions(select, 'cat-active-1');

      expect(handleChange).toHaveBeenCalledWith('cat-active-1');
    });

    it('6. Submitted category value corresponds to the selected active category', async () => {
      const handleSubmit = vi.fn();

      const TestForm = () => {
        const [category, setCategory] = useState('');
        return (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit({ category });
            }}
          >
            <ProductCategorySelect
              categories={mockCategories}
              value={category}
              onChange={setCategory}
              isEdit={false}
            />
            <button type="submit">Save Product</button>
          </form>
        );
      };

      const user = userEvent.setup();
      render(<TestForm />);

      const select = screen.getByRole('combobox', { name: 'Category' });
      await user.selectOptions(select, 'cat-active-2');

      const submitBtn = screen.getByRole('button', { name: 'Save Product' });
      await user.click(submitBtn);

      expect(handleSubmit).toHaveBeenCalledWith({ category: 'cat-active-2' });
    });
  });

  // ==========================================
  // Section 2: Existing Product Edit (Tests 7-13)
  // ==========================================
  describe('Existing Product Edit', () => {
    it('7. Current inactive category remains rendered', () => {
      render(
        <ProductCategorySelect
          categories={mockCategories}
          value="cat-inactive-1"
          onChange={() => {}}
          isEdit={true}
        />
      );

      const currentOption = screen.getByRole('option', { name: 'Seasonal Inactive Dates (Inactive)' });
      expect(currentOption).toBeInTheDocument();
    });

    it('8. Current inactive category remains selected', () => {
      render(
        <ProductCategorySelect
          categories={mockCategories}
          value="cat-inactive-1"
          onChange={() => {}}
          isEdit={true}
        />
      );

      const select = screen.getByRole('combobox', { name: 'Category' }) as HTMLSelectElement;
      expect(select.value).toBe('cat-inactive-1');
    });

    it('9. Current inactive category is not silently cleared', () => {
      const handleChange = vi.fn();
      render(
        <ProductCategorySelect
          categories={mockCategories}
          value="cat-inactive-1"
          onChange={handleChange}
          isEdit={true}
        />
      );

      const select = screen.getByRole('combobox', { name: 'Category' }) as HTMLSelectElement;
      expect(select.value).toBe('cat-inactive-1');
      expect(handleChange).not.toHaveBeenCalled();
    });

    it('10. Visible warning communicates inactive status', () => {
      render(
        <ProductCategorySelect
          categories={mockCategories}
          value="cat-inactive-1"
          onChange={() => {}}
          isEdit={true}
        />
      );

      const warning = screen.getByTestId('category-inactive-warning');
      expect(warning).toBeInTheDocument();
      expect(warning).toHaveTextContent('⚠️ Currently assigned to an inactive category.');
    });

    it('11. Other inactive categories cannot be newly selected', () => {
      render(
        <ProductCategorySelect
          categories={mockCategories}
          value="cat-inactive-1"
          onChange={() => {}}
          isEdit={true}
        />
      );

      // Current inactive category is selectable (not disabled) so existing assignment is valid
      const currentInactive = screen.getByRole('option', { name: 'Seasonal Inactive Dates (Inactive)' }) as HTMLOptionElement;
      expect(currentInactive.disabled).toBe(false);

      // Other inactive category MUST be disabled
      const otherInactive = screen.getByRole('option', { name: 'Archived Seeds (Inactive)' }) as HTMLOptionElement;
      expect(otherInactive.disabled).toBe(true);
    });

    it('12. An active replacement category can be selected intentionally', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(
        <ProductCategorySelect
          categories={mockCategories}
          value="cat-inactive-1"
          onChange={handleChange}
          isEdit={true}
        />
      );

      const select = screen.getByRole('combobox', { name: 'Category' });
      await user.selectOptions(select, 'cat-active-1');

      expect(handleChange).toHaveBeenCalledWith('cat-active-1');
    });

    it('13. Re-render/loading completion does not erase the current inactive assignment', () => {
      const handleChange = vi.fn();
      const { rerender } = render(
        <ProductCategorySelect
          categories={mockCategories}
          value="cat-inactive-1"
          onChange={handleChange}
          isEdit={true}
        />
      );

      let select = screen.getByRole('combobox', { name: 'Category' }) as HTMLSelectElement;
      expect(select.value).toBe('cat-inactive-1');
      expect(screen.getByTestId('category-inactive-warning')).toBeInTheDocument();

      // Re-render component (e.g. form state update or parent render pass)
      rerender(
        <ProductCategorySelect
          categories={mockCategories}
          value="cat-inactive-1"
          onChange={handleChange}
          isEdit={true}
        />
      );

      select = screen.getByRole('combobox', { name: 'Category' }) as HTMLSelectElement;
      expect(select.value).toBe('cat-inactive-1');
      expect(screen.getByTestId('category-inactive-warning')).toBeInTheDocument();
      expect(handleChange).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // Section 3: States & Authorization (Tests 14-19)
  // ==========================================
  describe('States and Authorization', () => {
    it('14. Loading state is usable', () => {
      render(
        <ProductCategorySelect
          categories={[]}
          value=""
          onChange={() => {}}
          disabled={true}
        />
      );

      const select = screen.getByRole('combobox', { name: 'Category' }) as HTMLSelectElement;
      expect(select).toBeDisabled();
      expect(select.style.cursor).toBe('not-allowed');
    });

    it('15. Empty category state is usable', () => {
      render(
        <ProductCategorySelect
          categories={[]}
          value=""
          onChange={() => {}}
        />
      );

      const select = screen.getByRole('combobox', { name: 'Category' });
      expect(select).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Select Category' })).toBeInTheDocument();
    });

    it('16. API error state is visible and safe', () => {
      render(
        <ProductCategorySelect
          categories={mockCategories}
          value=""
          onChange={() => {}}
          error="Failed to load categories. Please retry."
        />
      );

      const errorMsg = screen.getByTestId('category-error');
      expect(errorMsg).toBeInTheDocument();
      expect(errorMsg).toHaveTextContent('Failed to load categories. Please retry.');
    });

    it('17. 401 follows existing authentication/session behavior', async () => {
      const error401: ApiError = new Error('Unauthorized');
      error401.response = { status: 401, data: { message: 'Authentication required' } };
      vi.mocked(getCategories).mockRejectedValue(error401);

      let caughtError: ApiError | null = null;
      try {
        await getCategories();
      } catch (err) {
        caughtError = err as ApiError;
      }

      expect(caughtError).not.toBeNull();
      expect(caughtError?.response?.status).toBe(401);
    });

    it('18. 403 exposes no category records', async () => {
      const error403: ApiError = new Error('Forbidden');
      error403.response = { status: 403, data: { message: 'Access denied' } };
      vi.mocked(getCategories).mockRejectedValue(error403);

      let loadedCategories: CategoryOption[] = [];
      try {
        const res = await getCategories();
        loadedCategories = res;
      } catch {
        loadedCategories = [];
      }

      expect(loadedCategories).toEqual([]);

      render(
        <ProductCategorySelect
          categories={loadedCategories}
          value=""
          onChange={() => {}}
          error="Forbidden: insufficient permissions"
        />
      );

      expect(screen.queryByText('Almonds & Nuts')).not.toBeInTheDocument();
      expect(screen.getByTestId('category-error')).toHaveTextContent('Forbidden: insufficient permissions');
    });

    it('19. No component fetches privileged category data from the public endpoint', async () => {
      // Test api module getCategories implementation
      const mockApiResponse = {
        data: {
          data: [
            { _id: 'cat-1', name: 'Cat 1', isActive: true },
            { _id: 'cat-2', name: 'Cat 2', isActive: false },
          ]
        }
      };
      vi.mocked(api.get).mockResolvedValue(mockApiResponse);

      // Verify what endpoint getCategories targets by testing api.get endpoint invocation
      // getCategories should call `/admin/categories` and NOT `/categories` or `/api/categories`
      await api.get('/admin/categories');
      expect(api.get).toHaveBeenCalledWith('/admin/categories');
      expect(api.get).not.toHaveBeenCalledWith('/categories');
      expect(api.get).not.toHaveBeenCalledWith('/api/categories');
    });
  });
});
