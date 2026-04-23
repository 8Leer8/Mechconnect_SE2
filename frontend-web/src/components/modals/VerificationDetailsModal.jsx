import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/modals/ModalShell";
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
      <p className="text-xs font-semibold uppercase tracking-wide text-orange-300/80">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value || "—"}</p>
    </div>
  );
}

function DocumentList({ title, documents }) {
  return (
    <section className="space-y-2.5">
      <h4 className="text-sm font-semibold text-orange-400">{title}</h4>
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
  return (
    <ModalShell
      isOpen={!!item}
      onClose={onClose}
      maxWidth="3xl"
      title="Verification Details"
      description="Review submitted evidence and finalize approval decision."
      headerClassName="py-5"
      footer={
        <>
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
        </>
      }
    >
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
              <h4 className="text-sm font-semibold text-orange-400">Specialty Proof</h4>
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
    </ModalShell>
  );
}
