import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Gavel,
  Scale,
  ShieldCheck,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { API_BASE_URL } from "@/config/env";

function normalizeStatus(value) {
  return String(value || "active").trim().toLowerCase();
}

function humanizeStatus(value) {
  const status = normalizeStatus(value);
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function toMediaUrl(path) {
  if (!path || typeof path !== "string") return "";
  if (/^https?:\/\//i.test(path)) return path;

  try {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return new URL(normalizedPath, API_BASE_URL).toString();
  } catch {
    return path;
  }
}

function statusBadgeClass(status) {
  const value = normalizeStatus(status);

  if (value === "active") {
    return "border-amber-500/40 bg-amber-500/15 text-amber-300";
  }
  if (value === "under_admin_review") {
    return "border-blue-500/40 bg-blue-500/15 text-blue-300";
  }
  if (value === "waiting_for_mechanic_payment") {
    return "border-orange-500/40 bg-orange-500/15 text-orange-300";
  }
  if (value === "waiting_for_client_verification") {
    return "border-cyan-500/40 bg-cyan-500/15 text-cyan-300";
  }
  if (value === "resolved_refunded") {
    return "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";
  }
  if (value === "resolved_dismissed") {
    return "border-slate-500/40 bg-slate-500/15 text-slate-300";
  }
  if (value === "resolved_voucher") {
    return "border-violet-500/40 bg-violet-500/15 text-violet-300";
  }

  return "border-border bg-muted text-foreground";
}

function EvidenceImage({ label, imageUrl, onPreview }) {
  const src = toMediaUrl(imageUrl);

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-orange-300/80">{label}</p>
      <div className="overflow-hidden rounded-md border border-border/70 bg-card/60">
        {src ? (
          <button
            type="button"
            onClick={() => onPreview(src, label)}
            className="w-full text-left"
            title="Click to enlarge"
          >
            <img src={src} alt={label} className="h-48 w-full object-cover" />
          </button>
        ) : (
          <div className="flex h-48 items-center justify-center px-3 text-sm text-muted-foreground">
            No image uploaded.
          </div>
        )}
      </div>
    </div>
  );
}

export function DisputeDetailView({
  isOpen,
  dispute,
  onClose,
  onAdminAction,
  isSubmitting = false,
}) {
  const [preview, setPreview] = useState(null);

  const status = normalizeStatus(dispute?.status);
  const isResolved = useMemo(() => status.includes("resolved"), [status]);
  const isDefensePath = useMemo(
    () => ["under_admin_review", "resolved_dismissed"].includes(status),
    [status],
  );
  const isRefundPath = useMemo(
    () => ["waiting_for_client_verification", "resolved_refunded"].includes(status),
    [status],
  );

  const hasDefenseDescription = Boolean((dispute?.mechanic_defense_description || "").trim());
  const hasDefenseImage = Boolean(dispute?.mechanic_defense_picture);
  const hasRefundReceipt = Boolean(dispute?.refund_receipt_image);

  const showDefenseSection = (isDefensePath || hasDefenseDescription || hasDefenseImage) && !isRefundPath;
  const showRefundSection = (isRefundPath || hasRefundReceipt) && !isDefensePath;

  const primaryActions = useMemo(() => {
    if (status === "active" || status === "under_admin_review") {
      return [
        {
          label: "Dismiss Dispute (In Favor of Mechanic)",
          actionType: "dismiss_dispute",
          className:
            "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25",
          icon: ShieldCheck,
        },
        {
          label: "Uphold Claim (Require Mechanic Refund)",
          actionType: "uphold_claim_require_refund",
          className:
            "border-orange-500/40 bg-orange-500/15 text-orange-300 hover:bg-orange-500/25",
          icon: Gavel,
        },
      ];
    }

    if (status === "waiting_for_mechanic_payment") {
      return [
        {
          label: "Mechanic Unresponsive (Ban & Issue Voucher)",
          actionType: "mechanic_unresponsive_issue_voucher",
          className: "border-red-500/40 bg-red-500/15 text-red-300 hover:bg-red-500/25",
          icon: Ban,
        },
      ];
    }

    if (status === "waiting_for_client_verification") {
      return [
        {
          label: "Force Verify Receipt",
          actionType: "force_verify_receipt",
          className: "border-cyan-500/40 bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25",
          icon: CheckCircle2,
        },
      ];
    }

    return [];
  }, [status]);

  if (!isOpen || !dispute) {
    return null;
  }

  async function handleAdminAction(caseId, actionType) {
    if (!onAdminAction) {
      // Skeleton integration point for backend wiring.
      // eslint-disable-next-line no-console
      console.info("Dispute admin action", { caseId, actionType });
      return;
    }
    await onAdminAction(caseId, actionType);
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4" onClick={onClose}>
        <div
          className="relative w-full max-w-6xl overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>

          <div className="border-b border-border bg-gradient-to-r from-card via-muted/45 to-card px-6 py-5 pr-16">
            <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
              <div>
                <p className="text-lg font-semibold text-foreground">Dispute Case Review</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Compare both sides and apply the exact next transition in the dispute state machine.
                </p>
              </div>

              <Badge className={`mr-2 capitalize ${statusBadgeClass(status)}`}>
                {humanizeStatus(status)}
              </Badge>
            </div>
          </div>

          <div className="max-h-[80vh] space-y-5 overflow-y-auto px-6 py-5">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Case Metadata</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-md border border-border/70 bg-card/60 px-3 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-orange-300/80">Case ID</p>
                  <p className="mt-1 text-sm font-medium text-foreground">DISP-{dispute.id}</p>
                </div>
                <div className="rounded-md border border-border/70 bg-card/60 px-3 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-orange-300/80">Booking ID</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {dispute.booking_id ? `#${dispute.booking_id}` : "-"}
                  </p>
                </div>
                <div className="rounded-md border border-border/70 bg-card/60 px-3 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-orange-300/80">Created At</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{formatDateTime(dispute.created_at)}</p>
                </div>
                <div className="rounded-md border border-border/70 bg-card/60 px-3 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-orange-300/80">Updated At</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{formatDateTime(dispute.updated_at)}</p>
                </div>
                <div className="rounded-md border border-border/70 bg-card/60 px-3 py-2.5 md:col-span-2 lg:col-span-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-orange-300/80">Resolved At</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{formatDateTime(dispute.resolved_at)}</p>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Scale className="size-4 text-orange-400" />
                    Client Claim
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-md border border-border/70 bg-card/60 px-3 py-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-orange-300/80">Complainer</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{dispute.complainer || "-"}</p>
                  </div>

                  <div className="rounded-md border border-border/70 bg-card/60 px-3 py-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-orange-300/80">Issue Description</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                      {dispute.issue_description || "No issue description provided."}
                    </p>
                  </div>

                  <EvidenceImage
                    label="Issue Picture"
                    imageUrl={dispute.issue_picture}
                    onPreview={(url, label) => setPreview({ url, label })}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ShieldCheck className="size-4 text-blue-400" />
                    Mechanic Defense / Response
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-md border border-border/70 bg-card/60 px-3 py-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-orange-300/80">Mechanic</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{dispute.complaint_against || "-"}</p>
                  </div>

                  {showDefenseSection ? (
                    <>
                      <div className="rounded-md border border-border/70 bg-card/60 px-3 py-2.5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-orange-300/80">Defense Description</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                          {dispute.mechanic_defense_description || "No defense description submitted."}
                        </p>
                      </div>

                      <EvidenceImage
                        label="Defense Picture"
                        imageUrl={dispute.mechanic_defense_picture}
                        onPreview={(url, label) => setPreview({ url, label })}
                      />
                    </>
                  ) : null}

                  {showRefundSection ? (
                    <EvidenceImage
                      label="Refund Receipt Image"
                      imageUrl={dispute.refund_receipt_image}
                      onPreview={(url, label) => setPreview({ url, label })}
                    />
                  ) : null}

                  {!showDefenseSection && !showRefundSection ? (
                    <div className="rounded-md border border-border/70 bg-card/60 px-3 py-3 text-sm text-muted-foreground">
                      No mechanic evidence uploaded yet.
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Admin Action Panel</CardTitle>
              </CardHeader>
              <CardContent>
                {isResolved ? (
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-300">
                    This case is closed.
                  </div>
                ) : primaryActions.length === 0 ? (
                  <div className="rounded-md border border-border/70 bg-card/60 px-3 py-3 text-sm text-muted-foreground">
                    No available transition for this status.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    {primaryActions.map((action) => {
                      const Icon = action.icon;
                      return (
                        <Button
                          key={action.actionType}
                          type="button"
                          variant="outline"
                          className={`justify-start gap-2 ${action.className}`}
                          disabled={isSubmitting}
                          onClick={() => handleAdminAction(dispute.id, action.actionType)}
                        >
                          <Icon className="size-4" />
                          {action.label}
                        </Button>
                      );
                    })}
                  </div>
                )}

                {!isResolved ? (
                  <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <p>
                      Actions here should also unlock or keep mechanic restrictions in sync with your backend dispute flow rules.
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {preview ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="w-full max-w-4xl overflow-hidden rounded-xl border border-border bg-background"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-semibold text-foreground">{preview.label}</p>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close image preview"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="bg-black/70 p-3">
              <img
                src={preview.url}
                alt={preview.label}
                className="max-h-[75vh] w-full rounded-md object-contain"
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
