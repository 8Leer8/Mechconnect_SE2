import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function buildPageItems(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) {
    pages.push("left-ellipsis");
  }

  for (let page = start; page <= end; page += 1) {
    pages.push(page);
  }

  if (end < totalPages - 1) {
    pages.push("right-ellipsis");
  }

  pages.push(totalPages);
  return pages;
}

export function PaginationControls({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  className,
}) {
  if (!totalItems || totalItems <= 0) {
    return null;
  }

  const totalPages = Math.max(Math.ceil(totalItems / pageSize), 1);
  const safePage = Math.min(Math.max(currentPage, 1), totalPages);
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, totalItems);
  const pageItems = buildPageItems(safePage, totalPages);

  return (
    <div
      className={cn(
        "mt-4 flex flex-col gap-3 rounded-lg border border-border/70 bg-card/60 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <p className="text-xs text-muted-foreground">
        Showing <span className="font-medium text-foreground">{start}-{end}</span> of{" "}
        <span className="font-medium text-foreground">{totalItems}</span>
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => onPageChange(safePage - 1)}
          disabled={safePage === 1}
        >
          Previous
        </Button>

        {pageItems.map((item) => {
          if (typeof item !== "number") {
            return (
              <span key={item} className="px-1.5 text-xs text-muted-foreground">
                ...
              </span>
            );
          }

          return (
            <Button
              key={item}
              type="button"
              size="sm"
              variant={safePage === item ? "default" : "outline"}
              className={cn("h-8 min-w-8 px-2", safePage === item ? "bg-[#FF8C00] text-white hover:bg-[#e67e00]" : "")}
              onClick={() => onPageChange(item)}
            >
              {item}
            </Button>
          );
        })}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => onPageChange(safePage + 1)}
          disabled={safePage === totalPages}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
