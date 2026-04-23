import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/modals/ModalShell";

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
  const requiresRejectionNote =
    !!item &&
    (item.target_type === "specialty_mechanic" || item.target_type === "specialty_shop");

  return (
    <ModalShell
      isOpen={!!item}
      onClose={onClose}
      maxWidth="xl"
      variant="warning"
      overlayClassName="z-[60]"
      title="Reject Verification"
      description="Add a clear reason before rejecting this submission."
      headerClassName="py-5"
      footer={
        <>
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
        </>
      }
    >
        <div className="space-y-4 px-6 py-5">
          <div className="grid grid-cols-1 gap-2 rounded-md border border-border/70 bg-card/70 p-3 text-sm text-foreground">
            <p><span className="font-semibold text-orange-300/80">Type:</span> {formatSourceType(item.kind)}</p>
            <p><span className="font-semibold text-orange-300/80">Name:</span> {item.title}</p>
            <p><span className="font-semibold text-orange-300/80">Submitted:</span> {formatDate(item.date)}</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-orange-400" htmlFor="rejection-note-modal">
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
    </ModalShell>
  );
}
