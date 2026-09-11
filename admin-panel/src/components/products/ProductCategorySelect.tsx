import React from 'react';

export interface CategoryOption {
  _id: string;
  name: string;
  parentId?: string | null;
  isActive?: boolean;
}

export interface ProductCategorySelectProps {
  categories: CategoryOption[];
  value?: string;
  onChange: (value: string) => void;
  error?: string;
  isEdit?: boolean;
  required?: boolean;
  disabled?: boolean;
}

export const ProductCategorySelect: React.FC<ProductCategorySelectProps> = ({
  categories,
  value = '',
  onChange,
  error,
  isEdit = false,
  required = true,
  disabled = false
}) => {
  const currentCategory = categories.find(c => c._id === value);
  const isCurrentInactive = currentCategory?.isActive === false;

  return (
    <div>
      <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
        Category {required && <span style={{ color: 'var(--danger-text)' }}>*</span>}
      </label>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label="Category"
        style={{
          width: '100%',
          padding: '12px 16px',
          border: error ? '2px solid #DC2626' : '1px solid var(--border-color)',
          borderRadius: '8px',
          backgroundColor: 'var(--input-bg)',
          color: 'var(--text-primary)',
          fontSize: '14px',
          outline: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer'
        }}
      >
        <option value="">Select Category</option>
        {categories.filter(c => !c.parentId).map(cat => {
          const isCurrentSelection = value === cat._id;
          const isInactive = cat.isActive === false;
          // In create mode: all inactive categories are disabled.
          // In edit mode: current selection is selectable even if inactive; all other inactive categories are disabled.
          const isDisabled = isEdit ? (isInactive && !isCurrentSelection) : isInactive;

          return (
            <option
              key={cat._id}
              value={cat._id}
              disabled={isDisabled}
            >
              {cat.name}{isInactive ? ' (Inactive)' : ''}
            </option>
          );
        })}
      </select>
      {isCurrentInactive && (
        <p data-testid="category-inactive-warning" style={{ color: '#D97706', fontSize: '12px', marginTop: '4px' }}>
          ⚠️ Currently assigned to an inactive category.
        </p>
      )}
      {error && <p data-testid="category-error" style={{ color: 'var(--danger-text)', fontSize: '12px', marginTop: '4px' }}>{error}</p>}
    </div>
  );
};
