import { useMemo, useState } from "react";
import { X, Pencil, Trash2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ManageCategoriesModal({
  isOpen,
  onClose,
  categories,
  onUpdateCategory,
  onDeleteCategory,
  isProcessing,
  processError,
  onClearError,
}) {
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const uniqueCategories = useMemo(() => {
    return Array.from(new Set(categories.filter(Boolean)));
  }, [categories]);

  function handleStartEdit(category) {
    setEditingId(category);
    setEditValue(category);
    onClearError?.();
  }

  function handleCancelEdit() {
    setEditingId(null);
    setEditValue("");
  }

  function handleSaveEdit(oldName) {
    if (editValue.trim() && editValue.trim() !== oldName) {
      onUpdateCategory(oldName, editValue.trim());
    }
    setEditingId(null);
    setEditValue("");
  }

  function handleStartDelete(category) {
    setDeleteConfirmId(category);
    onClearError?.();
  }

  function handleConfirmDelete(category) {
    onDeleteCategory(category);
    setDeleteConfirmId(null);
  }

  function handleCancelDelete() {
    setDeleteConfirmId(null);
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-border bg-gradient-to-r from-card via-muted/40 to-card px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-6 top-6 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close modal"
          >
            <X className="size-4" />
          </button>

          <div className="flex items-center gap-2">
            <Settings className="size-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Manage Categories</h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Edit or delete service categories. Categories linked to services cannot be deleted.
          </p>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          {uniqueCategories.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              No categories found.
            </p>
          ) : (
            <div className="space-y-2">
              {uniqueCategories.map((category) => (
                <div
                  key={category}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-card/60 px-3 py-2.5"
                >
                  {editingId === category ? (
                    <div className="flex flex-1 items-center gap-2">
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-primary/70 focus:ring-1 focus:ring-primary/20"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveEdit(category);
                          if (e.key === "Escape") handleCancelEdit();
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleSaveEdit(category)}
                        disabled={isProcessing || !editValue.trim()}
                        className="h-7 rounded-md bg-primary px-2 text-xs text-primary-foreground hover:bg-primary/90"
                      >
                        Save
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={handleCancelEdit}
                        disabled={isProcessing}
                        className="h-7 rounded-md px-2 text-xs"
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : deleteConfirmId === category ? (
                    <div className="flex flex-1 items-center justify-between gap-2">
                      <span className="text-sm text-foreground">
                        Delete <strong>{category}</strong>?
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => handleConfirmDelete(category)}
                          disabled={isProcessing}
                          className="h-7 rounded-md px-2 text-xs"
                        >
                          Delete
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={handleCancelDelete}
                          disabled={isProcessing}
                          className="h-7 rounded-md px-2 text-xs"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className="flex-1 truncate text-sm font-medium text-foreground">
                        {category}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleStartEdit(category)}
                          disabled={isProcessing}
                          className="h-7 w-7 rounded-md p-0 text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleStartDelete(category)}
                          disabled={isProcessing}
                          className="h-7 w-7 rounded-md p-0 text-muted-foreground hover:text-red-400"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {processError ? (
            <p className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {processError}
            </p>
          ) : null}
        </div>

        <div className="border-t border-border bg-card/40 px-6 py-4">
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-lg"
              onClick={onClose}
              disabled={isProcessing}
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
