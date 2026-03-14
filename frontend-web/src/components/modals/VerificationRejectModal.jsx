import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

function formatDate(value) {
  if (!value) {
    return "Pending review";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Pending review";
  }
  return date.toLocaleString();
}

function formatSourceType(value) {
  if (!value) {
    return "Not provided";
  }
  return String(value)
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function VerificationRejectModal({
  item,
  rejectionNote,
  onRejectionNoteChange,
  onCancel,
  onClose,
  onSubmitReject,
  isProcessing,
  actionError,
}) {
  if (!item) {
    return null;
  }

  const requiresRejectionNote = item.target_type === "specialty_mechanic" || item.target_type === "specialty_shop";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-xl overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>

        <div className="border-b border-border bg-gradient-to-r from-card via-muted/45 to-card px-6 py-5">
          <p className="text-lg font-semibold text-foreground">Reject Verification</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a clear reason before rejecting this submission.
          </p>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="grid grid-cols-1 gap-2 rounded-md border border-border/70 bg-card/70 p-3 text-sm text-foreground">
            <p><span className="text-muted-foreground">Type:</span> {formatSourceType(item.kind)}</p>
            <p><span className="text-muted-foreground">Name:</span> {item.title}</p>
            <p><span className="text-muted-foreground">Submitted:</span> {formatDate(item.date)}</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="rejection-note-modal">
              Rejection Note {requiresRejectionNote ? "(required)" : "(optional)"}
            </label>
            <textarea
              id="rejection-note-modal"
              value={rejectionNote}
              onChange={(event) => onRejectionNoteChange(event.target.value)}
              placeholder="Explain why this request is rejected"
              className="min-h-28 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {actionError ? (
            <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">{actionError}</p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <Button type="button" variant="outline" className="rounded-lg" onClick={onCancel} disabled={isProcessing}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="rounded-lg"
            onClick={onSubmitReject}
            disabled={isProcessing || (requiresRejectionNote && !rejectionNote.trim())}
          >
            {isProcessing ? "Rejecting..." : "Confirm Reject"}
          </Button>
        </div>
      </div>
    </div>
  );
}
