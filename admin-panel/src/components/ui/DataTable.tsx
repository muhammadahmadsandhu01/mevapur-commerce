import React from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T, index: number) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

export interface DataTableProps<T> {
  caption: string;
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
}

export function DataTable<T>({
  caption,
  columns,
  data,
  keyExtractor,
  onRowClick,
  emptyMessage = 'No records found'
}: DataTableProps<T>) {
  return (
    <div
      tabIndex={0}
      role="region"
      aria-label={caption}
      style={{
        width: '100%',
        overflowX: 'auto',
        borderRadius: '12px',
        border: '1px solid var(--border-color, #E5E7EB)',
        backgroundColor: 'var(--card-bg, #FFFFFF)'
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '13.5px',
          textAlign: 'left'
        }}
      >
        <caption
          style={{
            textAlign: 'left',
            padding: '12px 16px',
            fontSize: '12px',
            fontWeight: '600',
            color: 'var(--text-secondary, #6B7280)',
            borderBottom: '1px solid var(--border-color, #E5E7EB)',
            position: 'sr-only' as unknown as undefined
          }}
          className="sr-only"
        >
          {caption}
        </caption>

        <thead>
          <tr style={{ backgroundColor: 'var(--bg-primary, #F9FAFB)', borderBottom: '1px solid var(--border-color, #E5E7EB)' }}>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={{
                  padding: '12px 16px',
                  fontWeight: '600',
                  color: 'var(--text-secondary, #4B5563)',
                  textAlign: col.align || 'left',
                  width: col.width
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                style={{
                  padding: '40px 16px',
                  textAlign: 'center',
                  color: 'var(--text-secondary, #6B7280)'
                }}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, idx) => (
              <tr
                key={keyExtractor(row, idx)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(row); } } : undefined}
                style={{
                  borderBottom: '1px solid var(--border-color, #F3F4F6)',
                  cursor: onRowClick ? 'pointer' : 'default',
                  transition: 'background-color 0.15s'
                }}
                className={onRowClick ? 'hover:bg-slate-50 dark:hover:bg-slate-800' : ''}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{
                      padding: '14px 16px',
                      color: 'var(--text-primary, #111827)',
                      textAlign: col.align || 'left'
                    }}
                  >
                    {col.render ? col.render(row, idx) : (row as Record<string, unknown>)[col.key] as React.ReactNode}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
