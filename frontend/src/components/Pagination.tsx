"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  itemsPerPage?: number;
  showItemCount?: boolean;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  itemsPerPage,
  showItemCount = true,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | "...")[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      if (currentPage > 3) {
        pages.push("...");
      }

      // Show pages around current
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - 2) {
        pages.push("...");
      }

      // Always show last page
      pages.push(totalPages);
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  // Calculate item range
  const getItemRange = () => {
    if (!totalItems || !itemsPerPage) return null;
    const start = (currentPage - 1) * itemsPerPage + 1;
    const end = Math.min(currentPage * itemsPerPage, totalItems);
    return { start, end };
  };

  const itemRange = getItemRange();

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      {/* Item count */}
      {showItemCount && itemRange && totalItems && (
        <div className="text-xs text-theme-secondary">
          {itemRange.start}-{itemRange.end} of {totalItems}
        </div>
      )}

      {/* Pagination controls */}
      <div className="flex items-center gap-1 ml-auto">
        {/* First page */}
        <button
          onClick={() => onPageChange(1)}
          disabled={!canGoPrev}
          className={cn(
            "p-1.5 rounded-md transition-colors",
            canGoPrev
              ? "text-theme-secondary hover:text-theme-primary hover:bg-theme-primary"
              : "text-gray-600 cursor-not-allowed"
          )}
          title="First page"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>

        {/* Previous page */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!canGoPrev}
          className={cn(
            "p-1.5 rounded-md transition-colors",
            canGoPrev
              ? "text-theme-secondary hover:text-theme-primary hover:bg-theme-primary"
              : "text-gray-600 cursor-not-allowed"
          )}
          title="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Page numbers */}
        <div className="flex items-center gap-1 mx-1">
          {pageNumbers.map((page, idx) =>
            page === "..." ? (
              <span key={`ellipsis-${idx}`} className="px-2 text-theme-secondary">
                ...
              </span>
            ) : (
              <button
                key={page}
                onClick={() => onPageChange(page)}
                className={cn(
                  "min-w-[28px] h-7 px-2 text-sm rounded-md transition-colors",
                  page === currentPage
                    ? "bg-blue-600 text-white"
                    : "text-theme-secondary hover:text-theme-primary hover:bg-theme-primary"
                )}
              >
                {page}
              </button>
            )
          )}
        </div>

        {/* Next page */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!canGoNext}
          className={cn(
            "p-1.5 rounded-md transition-colors",
            canGoNext
              ? "text-theme-secondary hover:text-theme-primary hover:bg-theme-primary"
              : "text-gray-600 cursor-not-allowed"
          )}
          title="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {/* Last page */}
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={!canGoNext}
          className={cn(
            "p-1.5 rounded-md transition-colors",
            canGoNext
              ? "text-theme-secondary hover:text-theme-primary hover:bg-theme-primary"
              : "text-gray-600 cursor-not-allowed"
          )}
          title="Last page"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
