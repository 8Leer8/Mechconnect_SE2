import { useEffect, useMemo, useState } from "react";
import { AdminLayout } from "../AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PaginationControls } from "@/components/common/PaginationControls";
import { DisputeDetailView } from "@/components/disputes/DisputeDetailView";
import { fetchAdminDisputes, resolveAdminDispute } from "@/services/adminDataService";

const STATUS_TABS = [
  { key: "pending", label: "Pending" },
  { key: "under_review", label: "Under Review" },
  { key: "resolve", label: "Resolve" },
];
const ITEMS_PER_PAGE = 10;

function isOpenStatus(status) {
  const value = String(status || "").toLowerCase();
  return [
    "active",
    "under_admin_review",
    "waiting_for_mechanic_payment",
    "waiting_for_client_verification",
  ].includes(value);
}

function isResolvedStatus(status) {
  return String(status || "").toLowerCase().includes("resolved");
}

function toActionPayload(actionType) {
  if (actionType === "dismiss_dispute") {
    return { action: "dismiss" };
  }
  if (actionType === "uphold_claim_require_refund") {
    return { action: "request_payment" };
  }
  if (actionType === "mechanic_unresponsive_issue_voucher") {
    return { action: "voucher" };
  }
  if (actionType === "force_verify_receipt") {
    return { action: "force_verify" };
  }
  return { action: "dismiss" };
}

function formatDate(value) {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString();
}

export function DisputeCenterPage() {
  const [activeFilter, setActiveFilter] = useState("pending");
  const [disputes, setDisputes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [selectedDispute, setSelectedDispute] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    async function loadDisputes() {
      setIsLoading(true);
      setLoadError("");

      try {
        const data = await fetchAdminDisputes({ limit: 200 });
        setDisputes(data?.results || []);
      } catch (error) {
        setLoadError(error.message || "Failed to load disputes.");
      } finally {
        setIsLoading(false);
      }
    }

    loadDisputes();
  }, []);

  const tabCounts = useMemo(() => {
    const pending = disputes.filter((item) => {
      const status = String(item.status || "").toLowerCase();
      return [
        "active",
        "waiting_for_mechanic_payment",
        "waiting_for_client_verification",
      ].includes(status);
    }).length;
    const underReview = disputes.filter(
      (item) => String(item.status || "").toLowerCase() === "under_admin_review",
    ).length;
    const resolved = disputes.filter((item) => isResolvedStatus(item.status)).length;

    return {
      pending,
      under_review: underReview,
      resolve: resolved,
    };
  }, [disputes]);

  const visibleDisputes = useMemo(() => {
    if (activeFilter === "pending") {
      return disputes.filter((item) => {
        const status = String(item.status || "").toLowerCase();
        return [
          "active",
          "waiting_for_mechanic_payment",
          "waiting_for_client_verification",
        ].includes(status);
      });
    }
    if (activeFilter === "under_review") {
      return disputes.filter((item) => String(item.status || "").toLowerCase() === "under_admin_review");
    }
    if (activeFilter === "resolve") {
      return disputes.filter((item) => isResolvedStatus(item.status));
    }
    return disputes;
  }, [activeFilter, disputes]);

  async function handleAdminAction(caseId, actionType) {
    setActionError("");
    setIsSubmittingAction(true);

    try {
      const payload = toActionPayload(actionType);
      const response = await resolveAdminDispute(caseId, payload);
      const nextStatus = response?.dispute?.status;
      const resolvedAt = response?.dispute?.resolved_at || null;

      setDisputes((previous) =>
        previous.map((item) => {
          if (item.id !== caseId) return item;
          return {
            ...item,
            status: nextStatus || item.status,
            resolved_at: resolvedAt,
            updated_at: new Date().toISOString(),
          };
        }),
      );

      setSelectedDispute((previous) => {
        if (!previous || previous.id !== caseId) return previous;
        return {
          ...previous,
          status: nextStatus || previous.status,
          resolved_at: resolvedAt,
          updated_at: new Date().toISOString(),
        };
      });
    } catch (error) {
      setActionError(error.message || "Failed to apply dispute action.");
      throw error;
    } finally {
      setIsSubmittingAction(false);
    }
  }

  function openDetail(dispute) {
    setActionError("");
    setSelectedDispute(dispute);
    setIsDetailOpen(true);
  }

  function closeDetail() {
    setIsDetailOpen(false);
    setSelectedDispute(null);
    setActionError("");
  }

  const totalPages = useMemo(
    () => Math.max(Math.ceil(visibleDisputes.length / ITEMS_PER_PAGE), 1),
    [visibleDisputes.length],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedDisputes = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return visibleDisputes.slice(start, start + ITEMS_PER_PAGE);
  }, [currentPage, visibleDisputes]);

  return (
    <AdminLayout title="Dispute Center">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Dispute Center</CardTitle>
            <CardDescription>
              Track case progress and coordinate investigations across involved parties.
            </CardDescription>
            {loadError && <p className="text-sm text-red-600">{loadError}</p>}
          </CardHeader>
        </Card>

        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setActiveFilter(tab.key);
                setCurrentPage(1);
              }}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                activeFilter === tab.key
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {tab.label} ({isLoading ? "..." : tabCounts[tab.key]})
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {isLoading &&
            Array.from({ length: 3 }).map((_, index) => (
              <Card key={`skeleton-${index}`}>
                <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="h-5 w-56 animate-pulse rounded bg-[#2A2C2E]" />
                  <div className="h-8 w-24 animate-pulse rounded bg-[#2A2C2E]" />
                </CardContent>
              </Card>
            ))}

          {!isLoading && visibleDisputes.length === 0 && (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">No disputes found.</CardContent>
            </Card>
          )}

          {!isLoading &&
            paginatedDisputes.map((dispute) => (
              <Card key={dispute.id}>
              <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold">Case ID: DISP-{dispute.id}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Parties: {dispute.complainer} vs {dispute.complaint_against}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Booking #{dispute.booking_id} • Created: {formatDate(dispute.created_at)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{dispute.issue_description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={isOpenStatus(dispute.status) ? "secondary" : "outline"} className="capitalize">
                    {dispute.status}
                  </Badge>
                  <Button size="sm" onClick={() => openDetail(dispute)}>Review Case</Button>
                </div>
              </CardContent>
              </Card>
            ))}

          {!isLoading && visibleDisputes.length > 0 && (
            <PaginationControls
              currentPage={currentPage}
              totalItems={visibleDisputes.length}
              pageSize={ITEMS_PER_PAGE}
              onPageChange={setCurrentPage}
            />
          )}
        </div>
      </div>

      <DisputeDetailView
        isOpen={isDetailOpen}
        dispute={selectedDispute}
        onClose={closeDetail}
        onAdminAction={handleAdminAction}
        isSubmitting={isSubmittingAction}
      />

      {actionError ? (
        <div className="fixed bottom-4 right-4 z-[70] max-w-sm rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {actionError}
        </div>
      ) : null}
    </AdminLayout>
  );
}
