import { useEffect, useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { AdminLayout } from "../AdminLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PaginationControls } from "@/components/common/PaginationControls";
import { BookingDetailsModal } from "@/components/modals/BookingDetailsModal";
import { fetchAdminBookings, fetchAdminBookingsOverview } from "@/services/adminDataService";

const ITEMS_PER_PAGE = 10;
const REQUEST_TYPE_TABS = [
  { key: "custom", label: "Custom" },
  { key: "direct", label: "Direct" },
  { key: "emergency", label: "Emergency" },
  { key: "broadcast", label: "Broadcast" },
];

const STATUS_FILTERS = [
  { key: "all", label: "All Status" },
  { key: "accepted", label: "Accepted" },
  { key: "on_the_way", label: "On The Way" },
  { key: "active", label: "Active" },
  { key: "paused", label: "Paused" },
  { key: "finished", label: "Finished" },
  { key: "pending_payment", label: "Pending Payment" },
  { key: "completed", label: "Completed" },
  { key: "reworked", label: "Reworked" },
  { key: "cancelled", label: "Cancelled" },
  { key: "disputed", label: "Disputed" },
];

function formatCount(value, isLoading) {
  if (isLoading) {
    return "...";
  }
  if (value === null || value === undefined) {
    return "—";
  }
  return Number(value).toLocaleString();
}

function formatDateTime(value) {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString();
}

function formatTypeLabel(value) {
  if (!value) {
    return "Unknown";
  }

  return String(value)
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getTableStatusClass(status) {
  const value = String(status || "").toLowerCase();

  if (value === "accepted") {
    return "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";
  }
  if (value === "on_the_way") {
    return "border-cyan-500/40 bg-cyan-500/15 text-cyan-300";
  }
  if (value === "active") {
    return "border-blue-500/40 bg-blue-500/15 text-blue-300";
  }
  if (value === "paused") {
    return "border-amber-500/40 bg-amber-500/15 text-amber-300";
  }
  if (value === "finished") {
    return "border-indigo-500/40 bg-indigo-500/15 text-indigo-300";
  }
  if (value === "pending_payment") {
    return "border-orange-500/40 bg-orange-500/15 text-orange-300";
  }
  if (value === "completed") {
    return "border-green-500/40 bg-green-500/15 text-green-300";
  }
  if (value === "reworked") {
    return "border-violet-500/40 bg-violet-500/15 text-violet-300";
  }
  if (value === "cancelled" || value === "disputed") {
    return "border-red-500/40 bg-red-500/15 text-red-300";
  }

  return "border-border bg-muted/60 text-muted-foreground";
}

function BookingSkeletonRow() {
  return (
    <div className="grid grid-cols-6 gap-4 border-b py-4 last:border-b-0">
      {Array.from({ length: 6 }).map((_, idx) => (
        <div key={idx} className="h-4 animate-pulse rounded bg-[#2A2C2E]" />
      ))}
    </div>
  );
}

export function RequestsBookingsPage() {
  const [overview, setOverview] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeRequestType, setActiveRequestType] = useState(REQUEST_TYPE_TABS[0].key);
  const [activeStatusFilter, setActiveStatusFilter] = useState("all");
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      setLoadError("");

      const [overviewResult, bookingsResult] = await Promise.allSettled([
        fetchAdminBookingsOverview(),
        fetchAdminBookings({ limit: 200 }),
      ]);

      if (overviewResult.status === "fulfilled") {
        setOverview(overviewResult.value);
      } else {
        setOverview(null);
      }

      if (bookingsResult.status === "fulfilled") {
        setBookings(bookingsResult.value?.results || []);
      } else {
        setBookings([]);
      }

      if (overviewResult.status === "rejected" || bookingsResult.status === "rejected") {
        setLoadError("Some booking data could not be loaded.");
      }

      setIsLoading(false);
    }

    loadData();
  }, []);

  const stats = useMemo(
    () => [
      { label: "Total", value: overview?.bookings_total },
      { label: "Pending", value: overview?.pending_disputes },
      { label: "Active", value: overview?.active_bookings },
      { label: "Completed", value: overview?.completed_bookings },
    ],
    [overview],
  );

  const tabCounts = useMemo(() => {
    const counts = {};
    for (const tab of REQUEST_TYPE_TABS) {
      counts[tab.key] = bookings.filter((booking) => booking.request_type === tab.key).length;
    }
    return counts;
  }, [bookings]);

  const filteredBookings = useMemo(() => {
    return bookings.filter((booking) => {
      const matchesType = booking.request_type === activeRequestType;
      const matchesStatus = activeStatusFilter === "all" || booking.status === activeStatusFilter;
      return matchesType && matchesStatus;
    });
  }, [bookings, activeRequestType, activeStatusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeRequestType, activeStatusFilter]);

  const totalPages = useMemo(
    () => Math.max(Math.ceil(filteredBookings.length / ITEMS_PER_PAGE), 1),
    [filteredBookings.length],
  );

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedBookings = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredBookings.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredBookings, currentPage]);

  return (
    <AdminLayout title="Requests & Bookings">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Requests & Bookings</CardTitle>
            <CardDescription>
              Observe booking flow status and inspect active operational records.
            </CardDescription>
            {loadError && <p className="text-sm text-red-600">{loadError}</p>}
          </CardHeader>
        </Card>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((item) => (
            <Card key={item.label}>
              <CardHeader className="pb-2">
                <CardDescription>{item.label}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{formatCount(item.value, isLoading)}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Booking Records</CardTitle>
            <CardDescription>
              Review bookings by request type and inspect complete transaction context.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="flex flex-wrap gap-2">
                {REQUEST_TYPE_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveRequestType(tab.key)}
                    className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                      activeRequestType === tab.key
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {tab.label} ({isLoading ? "..." : tabCounts[tab.key]})
                  </button>
                ))}
              </div>

              <div className="w-full space-y-1.5 md:ml-auto md:w-64">
                <label htmlFor="booking-status-filter" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Status Filter
                </label>
                <select
                  id="booking-status-filter"
                  value={activeStatusFilter}
                  onChange={(event) => setActiveStatusFilter(event.target.value)}
                  className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                >
                  {STATUS_FILTERS.map((statusOption) => (
                    <option key={statusOption.key} value={statusOption.key}>
                      {statusOption.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-md border">
              <div className="grid grid-cols-6 gap-4 border-b bg-muted/40 px-4 py-3 text-sm font-medium">
                <span>Client</span>
                <span>Mechanic</span>
                <span>Date</span>
                <span>Status</span>
                <span>Amount</span>
                <span>Action</span>
              </div>
              <div className="px-4">
                {isLoading && (
                  <>
                    <BookingSkeletonRow />
                    <BookingSkeletonRow />
                    <BookingSkeletonRow />
                  </>
                )}

                {!isLoading && filteredBookings.length === 0 && (
                  <div className="py-6 text-sm text-muted-foreground">
                    No {formatTypeLabel(activeRequestType).toLowerCase()} booking records found for the selected status.
                  </div>
                )}

                {!isLoading &&
                  paginatedBookings.map((booking) => (
                    <div key={booking.id} className="grid grid-cols-6 gap-4 border-b py-4 last:border-b-0 text-sm">
                      <span>{booking.client_username || "—"}</span>
                      <span>{booking.provider_username || booking.shop_name || "—"}</span>
                      <span>{formatDateTime(booking.booked_at)}</span>
                      <span>
                        <Badge variant="outline" className={`capitalize ${getTableStatusClass(booking.status)}`}>
                          {formatTypeLabel(booking.status)}
                        </Badge>
                      </span>
                      <span>{booking.amount_fee ? `PHP ${Number(booking.amount_fee).toLocaleString()}` : "—"}</span>
                      <span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-lg border-primary/35 bg-primary/10 text-primary hover:bg-primary/20"
                          onClick={() => setSelectedBooking(booking)}
                        >
                          <Eye className="size-4" />
                          View Details
                        </Button>
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            {!isLoading && filteredBookings.length > 0 && (
              <PaginationControls
                currentPage={currentPage}
                totalItems={filteredBookings.length}
                pageSize={ITEMS_PER_PAGE}
                onPageChange={setCurrentPage}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <BookingDetailsModal booking={selectedBooking} onClose={() => setSelectedBooking(null)} />
    </AdminLayout>
  );
}
