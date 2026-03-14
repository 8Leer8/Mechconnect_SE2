import { FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_BASE_URL } from "@/config/env";

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

function toMediaUrl(path) {
  if (!path || typeof path !== "string") {
    return "";
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  try {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return new URL(normalizedPath, API_BASE_URL).toString();
  } catch {
    return path;
  }
}

function DetailRow({ label, value }) {
  return (
    <div className="rounded-md border border-border/70 bg-card/70 px-3 py-2.5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value || "—"}</p>
    </div>
  );
}

function DocumentList({ title, documents }) {
  return (
    <section className="space-y-2.5">
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      {documents.length === 0 ? (
        <p className="rounded-md border border-border/70 bg-card/60 px-3 py-2 text-sm text-muted-foreground">
          No documents uploaded.
        </p>
      ) : (
        <div className="space-y-2">
          {documents.map((document) => (
            <div
              key={document.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/70 bg-card/60 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{document.document_name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatSourceType(document.document_type)} • Uploaded: {formatDate(document.uploaded_at)}
                </p>
              </div>
              <a
                href={toMediaUrl(document.document_url)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-primary/35 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
              >
                <FileText className="size-3.5" />
                View
              </a>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function VerificationDetailsModal({
  item,
  onClose,
  onApprove,
  onReject,
  isProcessing,
  actionError,
}) {
  if (!item) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-3xl overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
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
          <p className="text-lg font-semibold text-foreground">Verification Details</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Review submitted evidence and finalize approval decision.
          </p>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-3">
            <DetailRow label="Type" value={formatSourceType(item.kind)} />
            <DetailRow label="Name" value={item.title} />
            <DetailRow label="Submitted" value={formatDate(item.date)} />
            <DetailRow label="Contact" value={item.subtitle} />
            <DetailRow label="Detail" value={item.detail} />
            {item.specialty_name ? <DetailRow label="Specialty" value={item.specialty_name} /> : null}
            {item.source_type ? <DetailRow label="Proof Source" value={formatSourceType(item.source_type)} /> : null}
            {item.source_description ? <DetailRow label="Source Description" value={item.source_description} /> : null}
          </div>

          {item.kind === "mechanic" ? (
            <DocumentList title="Mechanic Documents" documents={item.documents || []} />
          ) : null}

          {item.kind === "shop" ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <DocumentList title="Shop Documents" documents={item.shop_documents || []} />
              <DocumentList title="Owner Documents" documents={item.owner_documents || []} />
            </div>
          ) : null}

          {item.kind === "specialty" ? (
            <section className="space-y-2.5">
              <h4 className="text-sm font-semibold text-foreground">Specialty Proof</h4>
              {item.proof_document_url ? (
                <a
                  href={toMediaUrl(item.proof_document_url)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-primary/35 bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/20"
                >
                  <FileText className="size-4" />
                  View Proof Document
                </a>
              ) : (
                <p className="rounded-md border border-border/70 bg-card/60 px-3 py-2 text-sm text-muted-foreground">
                  No proof document uploaded.
                </p>
              )}
            </section>
          ) : null}

          {actionError ? (
            <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">{actionError}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-6 py-4">
          <Button type="button" variant="outline" className="rounded-lg" onClick={onClose} disabled={isProcessing}>
            Close
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-lg border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
            onClick={onApprove}
            disabled={isProcessing}
          >
            Approve
          </Button>
          <Button type="button" variant="destructive" className="rounded-lg" onClick={onReject} disabled={isProcessing}>
            Reject
          </Button>
        </div>
      </div>
    </div>
  );
}
