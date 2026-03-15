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
import { cn } from "@/lib/utils";
import { PaginationControls } from "@/components/common/PaginationControls";
import { fetchAdminDisputes } from "@/services/adminDataService";

const filters = ["All", "Open", "Under Review", "Resolved"];
const ITEMS_PER_PAGE = 10;

function toApiStatus(filter) {
  if (filter === "Open") {
    return "pending";
  }
  if (filter === "Resolved") {
    return "solved";
  }
  return undefined;
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
  const [activeFilter, setActiveFilter] = useState("All");
  const [disputes, setDisputes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    async function loadDisputes() {
      setIsLoading(true);
      setLoadError("");

      try {
        const status = toApiStatus(activeFilter);
        const data = await fetchAdminDisputes({ status, limit: 200 });
        setDisputes(data?.results || []);
      } catch (error) {
        setLoadError(error.message || "Failed to load disputes.");
      } finally {
        setIsLoading(false);
      }
    }

    loadDisputes();
  }, [activeFilter]);

  const visibleDisputes = useMemo(() => {
    if (activeFilter !== "Under Review") {
      return disputes;
    }
    return disputes.filter((item) => item.status === "pending");
  }, [activeFilter, disputes]);

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
          {filters.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => {
                setActiveFilter(filter);
                setCurrentPage(1);
              }}
            >
              <Badge
                className={cn(
                  "cursor-pointer px-3 py-1.5",
                  activeFilter === filter
                    ? "bg-[#FF8C00] text-white hover:bg-[#e67e00]"
                    : "bg-[#1A1C1E] text-[#9BA1A6] hover:bg-[#2A2C2E]",
                )}
              >
                {filter}
              </Badge>
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
                  <Badge variant={dispute.status === "pending" ? "secondary" : "outline"} className="capitalize">
                    {dispute.status}
                  </Badge>
                  <Button size="sm" disabled>Review Case</Button>
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
    </AdminLayout>
  );
}
