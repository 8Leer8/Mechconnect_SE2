import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/modals/ModalShell";

export function DeleteConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  isDeleting,
  itemName,
  itemType,
}) {
  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      variant="danger"
      maxWidth="md"
      title={`Delete ${itemType}`}
      leading={
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/15">
          <AlertTriangle className="size-5 text-red-400" />
        </div>
      }
    >
      <div className="px-6 py-5">
        <p className="text-sm text-muted-foreground">
          Are you sure you want to delete{" "}
          <span className="font-medium text-foreground">&quot;{itemName}&quot;</span>
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
    </ModalShell>
  );
}
