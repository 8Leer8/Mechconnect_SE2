import { useEffect, useMemo, useState } from "react";
import { Download, TrendingUp, Wallet, CircleDollarSign, Hourglass, ChevronDown } from "lucide-react";
import { AdminLayout } from "../AdminLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PaginationControls } from "@/components/common/PaginationControls";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BookingDetailsModal } from "@/components/modals/BookingDetailsModal";
import {
  fetchAdminTransactionsOverview,
  fetchAdminTransactionsLedger,
  fetchAdminBookingDetail,
} from "@/services/adminDataService";

const PAGE_SIZE = 20;

const METHOD_COLORS = {
  cash: "#f97316",
  e_cash: "#22c55e",
  credits: "#facc15",
  unknown: "#9ca3af",
};

function formatCurrency(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  const numberValue = Number(value);
  if (Number.isNaN(numberValue)) {
    return "—";
  }
  return `PHP ${numberValue.toLocaleString()}`;
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

function formatShortDate(value) {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
}

function formatMethodLabel(value) {
  if (!value) {
    return "Unknown";
  }
  if (value === "gcash" || value === "maya" || value === "e_cash") {
    return "E-Cash";
  }
  if (value === "qr") {
    return "Cash";
  }
  return String(value)
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatPaymentStatusLabel(value) {
  if (!value) {
    return "—";
  }
  if (value === "not_paid" || value === "unpaid") {
    return "Not Paid";
  }
  if (value === "initial_paid" || value === "partially_paid") {
    return "Initial Paid";
  }
  if (value === "fully_paid") {
    return "Fully Paid";
  }
  return String(value)
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizeSeries(series = []) {
  const map = new Map();
  series.forEach((entry) => {
    if (!entry?.date) {
      return;
    }
    const key = new Date(entry.date).toISOString().slice(0, 10);
    map.set(key, Number(entry.total) || 0);
  });
  return map;
}

function buildLinePoints(items, width, height, padding) {
  const safeItems = items.length > 0 ? items : [{ label: "No Data", value: 0 }];
  const values = safeItems.map((item) => item.value ?? 0);
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values, 0);
  const range = Math.max(maxValue - minValue, 1);

  return safeItems.map((item, index) => {
    const x =
      padding + (index * (width - padding * 2)) / Math.max(safeItems.length - 1, 1);
    const y =
      height -
      padding -
      (((item.value ?? 0) - minValue) / range) * (height - padding * 2);
    return { x, y, label: item.label, value: item.value ?? 0 };
  });
}

function toLinePath(points) {
  if (points.length === 0) {
    return "";
  }
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function getPieSlicePath(cx, cy, radius, startAngle, endAngle) {
  const angleToPoint = (angle) => {
    const radians = ((angle - 90) * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(radians),
      y: cy + radius * Math.sin(radians),
    };
  };

  const start = angleToPoint(endAngle);
  const end = angleToPoint(startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
    "Z",
  ].join(" ");
}

function KpiCard({ title, value, description, icon: Icon }) {
  return (
    <Card className="border-border/70 bg-card/60">
      <CardHeader className="space-y-0 pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardDescription>{title}</CardDescription>
          <Icon className="size-4 text-orange-300" />
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <p className="text-3xl font-semibold tracking-tight">{formatCurrency(value)}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function FilterSelect({ label, value, options, onChange, disabled }) {
  const selected = options.find((option) => option.value === value) || options[0];

  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full justify-between rounded-md border-border/70 bg-card/60 px-3 text-sm text-foreground"
            disabled={disabled}
          >
            <span className={disabled ? "text-muted-foreground" : "text-foreground"}>
              {selected?.label || "Select"}
            </span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] border-border/70 bg-card/95 text-foreground">
          {options.map((option) => (
            <DropdownMenuItem key={option.value} onClick={() => onChange(option.value)}>
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </label>
  );
}

function RevenueChart({ revenueSeries, payoutSeries }) {
  const width = 520;
  const height = 220;
  const padding = 24;

  const revenueMap = normalizeSeries(revenueSeries);
  const payoutMap = normalizeSeries(payoutSeries);

  const labels = Array.from(new Set([...revenueMap.keys(), ...payoutMap.keys()])).sort();
  const dataPoints = labels.map((label) => ({
    label,
    revenue: revenueMap.get(label) || 0,
    payout: payoutMap.get(label) || 0,
  }));

  const revenuePoints = buildLinePoints(
    dataPoints.map((item) => ({ label: item.label, value: item.revenue })),
    width,
    height,
    padding,
  );
  const payoutPoints = buildLinePoints(
    dataPoints.map((item) => ({ label: item.label, value: item.payout })),
    width,
    height,
    padding,
  );

  const [hoveredPoint, setHoveredPoint] = useState(null);

  const labelIndices = useMemo(() => {
    if (dataPoints.length <= 4) {
      return dataPoints.map((_, index) => index);
    }
    return [0, Math.floor(dataPoints.length / 2), dataPoints.length - 1];
  }, [dataPoints.length]);

  return (
    <Card className="border-border/70 bg-card/60">
      <CardHeader>
        <CardTitle className="text-base">Revenue vs Payouts</CardTitle>
        <CardDescription>Daily movement of money across the platform.</CardDescription>
      </CardHeader>
      <CardContent>
        {dataPoints.length === 0 ? (
          <p className="text-sm text-muted-foreground">No chart data available.</p>
        ) : (
          <div className="space-y-3">
            <svg viewBox={`0 0 ${width} ${height}`} className="h-48 w-full">
              <path
                d={toLinePath(revenuePoints)}
                stroke="#f97316"
                strokeWidth="2"
                fill="none"
              />
              <path
                d={toLinePath(payoutPoints)}
                stroke="#22c55e"
                strokeWidth="2"
                fill="none"
              />
              {revenuePoints.map((point, index) => (
                <circle
                  key={`rev-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r="3"
                  fill="#f97316"
                  onMouseEnter={() => setHoveredPoint({
                    label: point.label,
                    value: point.value,
                    series: "Revenue",
                  })}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
              ))}
              {payoutPoints.map((point, index) => (
                <circle
                  key={`pay-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r="3"
                  fill="#22c55e"
                  onMouseEnter={() => setHoveredPoint({
                    label: point.label,
                    value: point.value,
                    series: "Payouts",
                  })}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
              ))}
              {labelIndices.map((index) => {
                const point = revenuePoints[index];
                if (!point) {
                  return null;
                }
                return (
                  <text
                    key={`label-${index}`}
                    x={point.x}
                    y={height - 6}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#a1a1aa"
                  >
                    {formatShortDate(point.label)}
                  </text>
                );
              })}
            </svg>
            <div className="rounded-md border border-border/70 bg-card/60 px-3 py-2 text-xs text-muted-foreground">
              {hoveredPoint
                ? `${formatShortDate(hoveredPoint.label)} • ${hoveredPoint.series}: ${formatCurrency(hoveredPoint.value)}`
                : "Hover a point to view the exact value."}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#f97316]" /> Revenue
              </span>
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#22c55e]" /> Payouts
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MethodBreakdown({ items }) {
  const size = 220;
  const center = size / 2;
  const radius = 90;

  const safeItems = items.length > 0 ? items : [{ method: "unknown", total: 0 }];
  const total = safeItems.reduce((sum, item) => sum + (item.total || 0), 0);

  let currentAngle = -90;
  const slices = total > 0
    ? safeItems.map((item) => {
        const value = item.total || 0;
        const angle = (value / total) * 360;
        const startAngle = currentAngle;
        const endAngle = currentAngle + angle;
        currentAngle = endAngle;
        return {
          ...item,
          path: getPieSlicePath(center, center, radius, startAngle, endAngle),
        };
      })
    : [];

  return (
    <Card className="border-border/70 bg-card/60">
      <CardHeader>
        <CardTitle className="text-base">Payment Method Mix</CardTitle>
        <CardDescription>Volume split by payment method.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-4 lg:flex-row lg:items-start">
          <svg viewBox={`0 0 ${size} ${size}`} className="h-44 w-44">
            {slices.length > 0 ? (
              slices.map((slice, index) => (
                <path
                  key={`${slice.method}-${index}`}
                  d={slice.path}
                  fill={METHOD_COLORS[slice.method] || METHOD_COLORS.unknown}
                  stroke="rgba(17, 18, 20, 0.8)"
                  strokeWidth="1"
                />
              ))
            ) : (
              <circle cx={center} cy={center} r={radius} fill="#2a2c2e" stroke="#3f3f46" strokeWidth="1" />
            )}
          </svg>

          <div className="w-full space-y-2">
            {safeItems.map((item) => (
              <div key={item.method} className="rounded-md border border-border/70 bg-card/60 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: METHOD_COLORS[item.method] || METHOD_COLORS.unknown }}
                    />
                    <span className="text-sm text-foreground">{formatMethodLabel(item.method)}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {total > 0 ? `${Math.round((item.total / total) * 100)}%` : "--"}
                  </span>
                </div>
                <div className="text-sm font-medium">{formatCurrency(item.total)}</div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function TransactionsOverviewPage() {
  const [overview, setOverview] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [ledgerCount, setLedgerCount] = useState(0);
  const [isOverviewLoading, setIsOverviewLoading] = useState(true);
  const [isLedgerLoading, setIsLedgerLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [ledgerTab, setLedgerTab] = useState("all");
  const [isExporting, setIsExporting] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [bookingModalError, setBookingModalError] = useState("");
  const [isBookingLoading, setIsBookingLoading] = useState(false);

  const ledgerTabs = [
    { key: "all", label: "All Transactions" },
    { key: "payment", label: "Payments" },
    { key: "payout", label: "Payouts" },
    { key: "topup", label: "Top-ups" },
  ];

  const effectiveTypeValue =
    ledgerTab === "all"
      ? undefined
      : ledgerTab;
  const effectiveStatusValue = statusFilter;

  useEffect(() => {
    async function loadOverview() {
      setIsOverviewLoading(true);
      setLoadError("");

      try {
        const data = await fetchAdminTransactionsOverview({
          start_date: startDate || undefined,
          end_date: endDate || undefined,
        });
        setOverview(data);
      } catch (error) {
        setOverview(null);
        setLoadError(error?.message || "Failed to load transaction overview.");
      } finally {
        setIsOverviewLoading(false);
      }
    }

    loadOverview();
  }, [startDate, endDate]);

  useEffect(() => {
    async function loadLedger() {
      setIsLedgerLoading(true);
      setLoadError("");

      try {
        const data = await fetchAdminTransactionsLedger({
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          type: effectiveTypeValue || undefined,
          status: effectiveStatusValue || undefined,
          q: searchQuery || undefined,
          page: currentPage,
          page_size: PAGE_SIZE,
        });
        setLedger(data?.results || []);
        setLedgerCount(data?.count || 0);
      } catch (error) {
        setLedger([]);
        setLedgerCount(0);
        setLoadError(error?.message || "Failed to load transaction ledger.");
      } finally {
        setIsLedgerLoading(false);
      }
    }

    loadLedger();
  }, [startDate, endDate, ledgerTab, statusFilter, searchQuery, currentPage]);

  const revenueSeries = overview?.charts?.revenue_series || [];
  const payoutSeries = overview?.charts?.payout_series || [];
  const methodBreakdown = (overview?.charts?.method_breakdown || []).reduce((acc, item) => {
    const rawMethod = item.method || "unknown";
    const methodKey = rawMethod === "gcash" || rawMethod === "maya"
      ? "e_cash"
      : rawMethod === "qr"
      ? "cash"
      : rawMethod;
    const existing = acc.find((entry) => entry.method === methodKey);
    const value = Number(item.total) || 0;
    if (existing) {
      existing.total += value;
    } else {
      acc.push({ method: methodKey, total: value });
    }
    return acc;
  }, []);

  const kpis = overview?.kpis || {};

  async function handleExport() {
    if (isExporting) {
      return;
    }
    setIsExporting(true);

    const headers = [
      "Date",
      "Transaction ID",
      "Type",
      "Actor",
      "Amount",
      "Status",
      "Reference",
      "Method",
    ];

    try {
      const pageSize = 100;
      let page = 1;
      let allRows = [];
      let totalCount = 0;

      do {
        const data = await fetchAdminTransactionsLedger({
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          type: effectiveTypeValue || undefined,
          status: effectiveStatusValue || undefined,
          q: searchQuery || undefined,
          page,
          page_size: pageSize,
        });
        const results = data?.results || [];
        totalCount = data?.count || 0;
        allRows = allRows.concat(results);
        page += 1;
        if (results.length < pageSize) {
          break;
        }
      } while (allRows.length < totalCount);

      const csvRows = allRows.map((row) => [
        formatDateTime(row.date),
        row.transaction_id || "—",
        row.type || "—",
        row.actor || "—",
        row.amount ?? "—",
        formatPaymentStatusLabel(row.payment_status || row.status),
        row.reference_id || "—",
        formatMethodLabel(row.method),
      ]);

      const csv = [headers, ...csvRows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  }

  async function handleOpenBooking(referenceId) {
    if (!referenceId || isBookingLoading) {
      return;
    }
    setBookingModalError("");
    setIsBookingLoading(true);
    try {
      const data = await fetchAdminBookingDetail(referenceId);
      setSelectedBooking(data);
    } catch (error) {
      setSelectedBooking(null);
      setBookingModalError(error?.message || "Failed to load booking details.");
    } finally {
      setIsBookingLoading(false);
    }
  }

  return (
    <AdminLayout title="Transactions Overview">
      <div className="space-y-5">
        <Card className="border-border/70 bg-card/60">
          <CardHeader>
            <CardTitle className="text-xl">Transactions & Payments</CardTitle>
            <CardDescription>
              Track money movement across bookings, payouts, and wallet top-ups.
            </CardDescription>
            {loadError && <p className="text-sm text-red-400">{loadError}</p>}
          </CardHeader>
        </Card>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Gross Merchandise Value"
            value={kpis.gmv_total}
            description="Total amount processed"
            icon={CircleDollarSign}
          />
          <KpiCard
            title="Net Platform Revenue"
            value={kpis.platform_revenue_total}
            description="Platform fees earned"
            icon={TrendingUp}
          />
          <KpiCard
            title="Total Pending Payouts"
            value={kpis.pending_payout_total}
            description="Unreleased mechanic payouts"
            icon={Hourglass}
          />
          <KpiCard
            title="System Credit Float"
            value={kpis.wallet_float_total}
            description="Total wallet balance"
            icon={Wallet}
          />
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <RevenueChart revenueSeries={revenueSeries} payoutSeries={payoutSeries} />
          <MethodBreakdown items={methodBreakdown} />
        </section>

        <Card className="border-border/70 bg-card/60">
          <CardHeader className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Master Ledger</CardTitle>
                <CardDescription>Every financial event across the platform.</CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={handleExport}
                disabled={isExporting}
              >
                <Download className="mr-2 size-4" />
                {isExporting ? "Exporting..." : "Export CSV"}
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              {ledgerTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setLedgerTab(tab.key);
                    setCurrentPage(1);
                    setStatusFilter("");
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    ledgerTab === tab.key
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Search actor or user
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Search by name"
                  className="h-10 rounded-md border border-border/70 bg-card/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Start date
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => {
                    setStartDate(event.target.value);
                    setCurrentPage(1);
                  }}
                  className="h-10 rounded-md border border-border/70 bg-card/60 px-3 py-2 text-sm text-foreground"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                End date
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => {
                    setEndDate(event.target.value);
                    setCurrentPage(1);
                  }}
                  className="h-10 rounded-md border border-border/70 bg-card/60 px-3 py-2 text-sm text-foreground"
                />
              </label>
              {
                <FilterSelect
                  label="Status"
                  value={effectiveStatusValue}
                  options={[
                    { value: "", label: "All" },
                    { value: "not_paid", label: "Not Paid" },
                    { value: "initial_paid", label: "Initial Paid" },
                    { value: "fully_paid", label: "Fully Paid" },
                  ]}
                  onChange={(value) => {
                    setStatusFilter(value);
                    setCurrentPage(1);
                  }}
                />
              }
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-border/70">
              <div className="overflow-x-auto">
                <div className="min-w-[900px]">
                  <div className="grid grid-cols-7 gap-4 border-b border-border/70 bg-muted/30 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <span>Date & Time</span>
                    <span>Transaction ID</span>
                    <span>Type</span>
                    <span>Actor</span>
                    <span>Amount</span>
                    <span>Status</span>
                    <span>Reference</span>
                  </div>
                  <div className="px-4">
                    {isLedgerLoading && (
                      <div className="py-6 text-sm text-muted-foreground">Loading ledger...</div>
                    )}
                    {!isLedgerLoading && ledger.length === 0 && (
                      <div className="py-6 text-sm text-muted-foreground">No ledger entries found.</div>
                    )}
                    {!isLedgerLoading &&
                      ledger.map((row) => (
                        <div
                          key={row.transaction_id}
                          className="grid grid-cols-7 gap-4 border-b border-border/70 py-3 text-sm last:border-b-0"
                        >
                          <span>{formatDateTime(row.date)}</span>
                          <span className="text-xs text-muted-foreground">{row.transaction_id}</span>
                          <span className="capitalize">{row.type}</span>
                          <span>{row.actor || "—"}</span>
                          <span className="font-semibold text-foreground">{formatCurrency(row.amount)}</span>
                          <span className="text-muted-foreground">
                            {formatPaymentStatusLabel(row.payment_status || row.status)}
                          </span>
                          <span>
                            {row.reference_id ? (
                              <button
                                type="button"
                                onClick={() => handleOpenBooking(row.reference_id)}
                                className="text-xs font-semibold text-orange-300 hover:text-orange-200"
                              >
                                #{row.reference_id}
                              </button>
                            ) : "—"}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>

            <PaginationControls
              currentPage={currentPage}
              totalItems={ledgerCount}
              pageSize={PAGE_SIZE}
              onPageChange={setCurrentPage}
            />
          </CardContent>
        </Card>
      </div>

      {bookingModalError ? (
        <p className="text-sm text-red-400">{bookingModalError}</p>
      ) : null}

      <BookingDetailsModal booking={selectedBooking} onClose={() => setSelectedBooking(null)} />
    </AdminLayout>
  );
}
