import React, { useState, useMemo } from 'react';
import { Search, ChevronLeft, ChevronRight, ChevronsUpDown, Filter, X } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  searchPlaceholder?: string;
  searchKey?: keyof T | ((row: T) => string);
  filterElement?: React.ReactNode;
  actionsElement?: React.ReactNode;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  keyExtractor: (row: T) => string;
}

export function DataTable<T>({
  data,
  columns,
  searchPlaceholder = 'Search records...',
  searchKey,
  filterElement,
  actionsElement,
  onRowClick,
  emptyMessage = 'No records found matching your filters.',
  keyExtractor,
}: DataTableProps<T>) {
  const [searchTerm, setSearchTerm] = useState('');
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Filtering
  const filteredData = useMemo(() => {
    if (!searchTerm.trim() || !searchKey) return data;
    const term = searchTerm.toLowerCase();

    return data.filter((row) => {
      let val = '';
      if (typeof searchKey === 'function') {
        val = searchKey(row);
      } else {
        val = String(row[searchKey] ?? '');
      }
      return val.toLowerCase().includes(term);
    });
  }, [data, searchTerm, searchKey]);

  // Sorting
  const sortedData = useMemo(() => {
    if (!sortColumn) return filteredData;
    return [...filteredData].sort((a: any, b: any) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];
      if (aVal === bVal) return 0;
      if (aVal === undefined || aVal === null) return 1;
      if (bVal === undefined || bVal === null) return -1;
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      return sortDirection === 'asc' ? 1 : -1;
    });
  }, [filteredData, sortColumn, sortDirection]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const handleSort = (colKey: string) => {
    if (sortColumn === colKey) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(colKey);
      setSortDirection('asc');
    }
  };

  return (
    <div className="bg-surface rounded-panel border border-border shadow-card overflow-hidden">
      {/* Search and Filters Toolbar */}
      <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder={searchPlaceholder}
              className="w-full pl-9 pr-8 py-2 text-sm bg-canvas border border-border rounded-control focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-colors"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {filterElement}
          {actionsElement}
        </div>
      </div>

      {/* Table Area */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-text-primary border-collapse">
          <thead>
            <tr className="bg-canvas border-b border-border text-xs font-semibold text-text-secondary uppercase tracking-wider">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 ${col.className ?? ''} ${
                    col.sortable ? 'cursor-pointer hover:bg-zinc-200/50 select-none' : ''
                  }`}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div className="flex items-center gap-1.5">
                    <span>{col.header}</span>
                    {col.sortable && (
                      <ChevronsUpDown className="w-3.5 h-3.5 text-text-secondary opacity-70" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-12 text-center text-text-secondary">
                  <p className="text-sm font-medium">{emptyMessage}</p>
                </td>
              </tr>
            ) : (
              paginatedData.map((row) => (
                <tr
                  key={keyExtractor(row)}
                  onClick={() => onRowClick?.(row)}
                  className={`hover:bg-brand-soft/40 transition-colors ${
                    onRowClick ? 'cursor-pointer' : ''
                  }`}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={`px-4 py-3 text-sm ${col.className ?? ''}`}>
                      {col.render ? col.render(row) : (row as any)[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="px-4 py-3 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-text-secondary">
        <div className="flex items-center gap-2">
          <span>Rows per page:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="border border-border rounded-control bg-canvas px-2 py-1 focus:outline-none focus:border-brand-primary"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span className="ml-2">
            Showing {filteredData.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} to{' '}
            {Math.min(currentPage * pageSize, filteredData.length)} of {filteredData.length} records
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="p-1.5 rounded-control border border-border bg-surface hover:bg-canvas disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-2 font-medium">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages || totalPages === 0}
            className="p-1.5 rounded-control border border-border bg-surface hover:bg-canvas disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
