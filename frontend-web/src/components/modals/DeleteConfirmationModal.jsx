import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DeleteConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  isDeleting,
  itemName,
  itemType,
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
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

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/15">
              <AlertTriangle className="size-5 text-red-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                Delete {itemType}
              </h3>
            </div>
          </div>
        </div>

        <div className="px-6 py-5">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete{" "}
            <span className="font-medium text-foreground">
              &quot;{itemName}&quot;
            </span>
            ? This action cannot be undone.
          </p>

          <div className="mt-6 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-lg"
              onClick={onClose}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-lg bg-red-600 text-white hover:bg-red-700"
              onClick={onConfirm}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
