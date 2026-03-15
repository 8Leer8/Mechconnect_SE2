import { useEffect, useMemo, useState } from "react";
import { Check, Eye } from "lucide-react";
import { AdminLayout } from "../AdminLayout";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { VerificationDetailsModal } from "@/components/modals/VerificationDetailsModal";
import { VerificationRejectModal } from "@/components/modals/VerificationRejectModal";
import { cn } from "@/lib/utils";
import {
  fetchAdminVerificationQueue,
  submitAdminVerificationDecision,
} from "@/services/adminDataService";

const filterItems = [
  { key: "mechanic", label: "Mechanic" },
  { key: "shops", label: "Shops" },
  { key: "specialty", label: "Specialty" },
];
const ITEMS_PER_PAGE = 10;

function getInitialsFromLabel(value) {
  if (!value) {
    return "NA";
  }
  const words = value.split(" ").filter(Boolean);
  if (words.length === 0) {
    return "NA";
  }
  return words
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}

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

export function VerificationQueuePage() {
  const [activeFilter, setActiveFilter] = useState("mechanic");
  const [queueData, setQueueData] = useState({
    mechanic_results: [],
    shop_results: [],
    specialty_results: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedItem, setSelectedItem] = useState(null);
  const [rejectItem, setRejectItem] = useState(null);
  const [rejectionNote, setRejectionNote] = useState("");
  const [actionError, setActionError] = useState("");
  const [processingKey, setProcessingKey] = useState("");

  function itemKey(item) {
    return `${item.target_type}-${item.id}`;
  }

  useEffect(() => {
    async function loadQueue() {
      setIsLoading(true);
      setLoadError("");

      try {
        const data = await fetchAdminVerificationQueue();
        setQueueData({
          mechanic_results: data?.mechanic_results || [],
          shop_results: data?.shop_results || [],
          specialty_results: data?.specialty_results || [],
        });
      } catch (error) {
        setLoadError(error.message || "Failed to load verification queue.");
      } finally {
        setIsLoading(false);
      }
    }

    loadQueue();
  }, []);

  function buildMechanicItems() {
    return (queueData.mechanic_results || []).map((item) => ({
      ...item,
      kind: "mechanic",
      title: [item.firstname, item.lastname].filter(Boolean).join(" ") || item.username,
      subtitle: item.email || item.username,
      detail: `${item.documents_count || 0} uploaded document(s)`,
      date: item.requested_at,
    }));
  }

  function buildShopItems() {
    return (queueData.shop_results || []).map((item) => ({
      ...item,
      kind: "shop",
      title: item.shop_name,
      subtitle: item.email || item.owner_username,
      detail: `Owner: ${item.owner_username} • Shop docs: ${item.shop_documents_count || 0} • Owner docs: ${item.owner_documents_count || 0}`,
      date: item.created_at,
    }));
  }

  function buildSpecialtyItems() {
    return (queueData.specialty_results || []).map((item) => ({
      ...item,
      kind: "specialty",
      title: `${item.provider_name} • ${item.specialty_name}`,
      subtitle: item.provider_email || item.provider_name,
      detail: `${formatSourceType(item.source_type)} source`,
      date: item.requested_at,
    }));
  }

  const displayItems = useMemo(() => {
    if (activeFilter === "mechanic") {
      return buildMechanicItems();
    }
    if (activeFilter === "shops") {
      return buildShopItems();
    }
    return buildSpecialtyItems();
  }, [activeFilter, queueData.mechanic_results, queueData.shop_results, queueData.specialty_results]);

  const tabCounts = useMemo(
    () => ({
      mechanic: (queueData.mechanic_results || []).length,
      shops: (queueData.shop_results || []).length,
      specialty: (queueData.specialty_results || []).length,
    }),
    [queueData.mechanic_results, queueData.shop_results, queueData.specialty_results],
  );

  const totalPages = useMemo(
    () => Math.max(Math.ceil(displayItems.length / ITEMS_PER_PAGE), 1),
    [displayItems.length],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return displayItems.slice(start, start + ITEMS_PER_PAGE);
  }, [currentPage, displayItems]);

  function removeItemFromQueue(targetType, targetId) {
    setQueueData((prev) => {
      if (targetType === "mechanic") {
        return {
          ...prev,
          mechanic_results: (prev.mechanic_results || []).filter((entry) => entry.id !== targetId),
        };
      }
      if (targetType === "shop") {
        return {
          ...prev,
          shop_results: (prev.shop_results || []).filter((entry) => entry.id !== targetId),
        };
      }
      return {
        ...prev,
        specialty_results: (prev.specialty_results || []).filter(
          (entry) => !(entry.id === targetId && entry.target_type === targetType),
        ),
      };
    });
  }

  async function handleDecision(item, decision, note = "") {
    const key = itemKey(item);
    setActionError("");
    setProcessingKey(key);

    try {
      await submitAdminVerificationDecision({
        target_type: item.target_type,
        target_id: item.id,
        decision,
        rejection_note: note,
      });

      removeItemFromQueue(item.target_type, item.id);
      if (selectedItem && selectedItem.id === item.id && selectedItem.target_type === item.target_type) {
        setSelectedItem(null);
      }
      if (rejectItem && rejectItem.id === item.id && rejectItem.target_type === item.target_type) {
        setRejectItem(null);
        setRejectionNote("");
      }
    } catch (error) {
      setActionError(error.message || "Failed to process verification action.");
    } finally {
      setProcessingKey("");
    }
  }

  function openDetails(item) {
    setSelectedItem(item);
    setRejectItem(null);
    setRejectionNote("");
    setActionError("");
  }

  function openRejectModal(item) {
    setSelectedItem(null);
    setRejectItem(item);
    setRejectionNote("");
    setActionError("");
  }

  const isDetailsModalProcessing = selectedItem ? processingKey === itemKey(selectedItem) : false;
  const isRejectModalProcessing = rejectItem ? processingKey === itemKey(rejectItem) : false;

  return (
    <AdminLayout title="Verification Queue">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Verification Queue</CardTitle>
            <CardDescription>
              Review pending mechanic, shop, and specialty verification submissions.
            </CardDescription>
            {loadError && <p className="text-sm text-red-600">{loadError}</p>}
          </CardHeader>
        </Card>

        <div className="flex flex-wrap gap-2">
          {filterItems.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => {
                setActiveFilter(filter.key);
                setCurrentPage(1);
              }}
            >
              <Badge
                className={cn(
                  "cursor-pointer px-3 py-1.5",
                  activeFilter === filter.key
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-card text-muted-foreground hover:bg-muted",
                )}
              >
                {filter.label} ({isLoading ? "..." : tabCounts[filter.key] || 0})
              </Badge>
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {isLoading &&
            Array.from({ length: 3 }).map((_, index) => (
              <Card key={`skeleton-${index}`}>
                <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="h-5 w-48 animate-pulse rounded bg-[#2A2C2E]" />
                  <div className="h-8 w-36 animate-pulse rounded bg-[#2A2C2E]" />
                </CardContent>
              </Card>
            ))}

          {!isLoading && displayItems.length === 0 && (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                No pending verification submissions.
              </CardContent>
            </Card>
          )}

          {!isLoading &&
            paginatedItems.map((item) => (
              <Card key={item.id}>
              <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback>{getInitialsFromLabel(item.title)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-sm text-muted-foreground">{item.subtitle}</p>
                    <p className="text-xs text-muted-foreground">{item.detail}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(item.date)}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="capitalize">{item.kind}</Badge>
                  <Badge className="bg-amber-500 text-black hover:bg-amber-500">Pending</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-lg border-primary/35 bg-primary/10 text-primary hover:bg-primary/20"
                    onClick={() => openDetails(item)}
                  >
                    <Eye className="size-4" />
                    View Details
                  </Button>
                  <Button
                    size="sm"
                    className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={() => handleDecision(item, "approve")}
                    disabled={processingKey === itemKey(item)}
                  >
                    <Check className="size-4" />
                    {processingKey === itemKey(item) ? "Processing..." : "Approve"}
                  </Button>
                </div>
              </CardContent>
              </Card>
            ))}

          {!isLoading && displayItems.length > 0 && (
            <PaginationControls
              currentPage={currentPage}
              totalItems={displayItems.length}
              pageSize={ITEMS_PER_PAGE}
              onPageChange={setCurrentPage}
            />
          )}
        </div>

        <VerificationDetailsModal
          item={selectedItem}
          onClose={() => {
            if (!isDetailsModalProcessing) {
              setSelectedItem(null);
              setActionError("");
            }
          }}
          onApprove={() => selectedItem && handleDecision(selectedItem, "approve")}
          onReject={() => selectedItem && openRejectModal(selectedItem)}
          isProcessing={isDetailsModalProcessing}
          actionError={actionError}
        />

        <VerificationRejectModal
          item={rejectItem}
          rejectionNote={rejectionNote}
          onRejectionNoteChange={setRejectionNote}
          onCancel={() => {
            if (!isRejectModalProcessing && rejectItem) {
              setSelectedItem(rejectItem);
              setRejectItem(null);
              setActionError("");
            }
          }}
          onClose={() => {
            if (!isRejectModalProcessing) {
              setRejectItem(null);
              setRejectionNote("");
              setActionError("");
            }
          }}
          onSubmitReject={() => rejectItem && handleDecision(rejectItem, "reject", rejectionNote)}
          isProcessing={isRejectModalProcessing}
          actionError={actionError}
        />
      </div>
    </AdminLayout>
  );
}
