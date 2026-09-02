import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalRecords?: number;
  onPageChange: (page: number) => void;
  style?: React.CSSProperties;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalRecords,
  onPageChange,
  style = {}
}) => {
  if (totalPages <= 1) return null;

  return (
    <nav
      role="navigation"
      aria-label="Pagination Navigation"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 0',
        flexWrap: 'wrap',
        gap: '12px',
        ...style
      }}
    >
      <div style={{ fontSize: '13px', color: 'var(--text-secondary, #6B7280)' }}>
        Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
        {totalRecords !== undefined && ` (${totalRecords} total items)`}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Button
          variant="secondary"
          size="sm"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          aria-label="Go to previous page"
          leftIcon={<ChevronLeft size={16} />}
        >
          Previous
        </Button>

        <Button
          variant="secondary"
          size="sm"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          aria-label="Go to next page"
          rightIcon={<ChevronRight size={16} />}
        >
          Next
        </Button>
      </div>
    </nav>
  );
};
