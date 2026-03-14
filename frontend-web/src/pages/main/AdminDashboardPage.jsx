import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  Scale,
  ShieldCheck,
  Users,
  Briefcase,
  AlertTriangle,
  Wallet,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { request } from "@/services/httpClient";
import { AdminLayout } from "../AdminLayout";

function getNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatCount(value, isLoading) {
  if (isLoading) {
    return "...";
  }
  if (value === null || value === undefined) {
    return "—";
  }
  return new Intl.NumberFormat().format(value);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return "0%";
  }
  return `${Math.round(value)}%`;
}

function getItemsState(items, isLoading) {
  if (isLoading) {
    return "loading";
  }
  const hasData = items.some((item) => item.value !== null && item.value !== undefined);
  return hasData ? "ready" : "empty";
}

function getMetricText(state, value) {
  if (state === "loading") {
    return "Loading data...";
  }
  if (state === "empty") {
    return "No data";
  }
  return formatCount(value ?? 0, false);
}

function polarToCartesian(cx, cy, radius, angleInDegrees) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}

function getPieSlicePath(cx, cy, radius, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
    "Z",
  ].join(" ");
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

function KpiCard({ title, value, description, icon: Icon, iconClassName, isLoading, badge }) {
  return (
    <Card>
      <CardHeader className="space-y-0 pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardDescription>{title}</CardDescription>
          <Icon className={iconClassName} />
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <p className="text-3xl font-semibold tracking-tight">{formatCount(value, isLoading)}</p>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{description}</p>
          {badge ? (
            <span className="rounded-full border border-border/70 bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
              {badge}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function PieVisualization({ title, subtitle, items, isLoading }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const state = getItemsState(items, isLoading);
  const hasValues = state === "ready";
  const total = items.reduce((sum, item) => sum + (item.value ?? 0), 0);
  const size = 220;
  const center = size / 2;
  const radius = 90;

  let currentAngle = -90;
  const slices =
    hasValues && total > 0
      ? items.map((item, index) => {
          const value = item.value ?? 0;
          const angle = (value / total) * 360;
          const startAngle = currentAngle;
          const endAngle = currentAngle + angle;
          currentAngle = endAngle;

          return {
            ...item,
            index,
            path: getPieSlicePath(center, center, radius, startAngle, endAngle),
          };
        })
      : [];

  const hoveredItem = hoveredIndex !== null ? items[hoveredIndex] : null;
  const hoverText =
    state === "loading"
      ? "Loading data..."
      : state === "empty"
        ? "No data"
        : hoveredItem
          ? `${hoveredItem.label}: ${formatCount(hoveredItem.value ?? 0, false)}`
          : "Hover a slice to view role details.";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-5 lg:flex-row lg:items-start">
          <div className="flex shrink-0 flex-col items-center gap-2">
            <svg viewBox={`0 0 ${size} ${size}`} className="h-44 w-44" role="img" aria-label={title}>
              {slices.length > 0 ? (
                slices.map((slice) => (
                  <path
                    key={slice.label}
                    d={slice.path}
                    fill={slice.color}
                    stroke="rgba(17, 18, 20, 0.8)"
                    strokeWidth="1"
                    className="transition-opacity"
                    style={{ opacity: hoveredIndex === null || hoveredIndex === slice.index ? 1 : 0.55 }}
                    onMouseEnter={() => setHoveredIndex(slice.index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  />
                ))
              ) : (
                <circle cx={center} cy={center} r={radius} fill="#2a2c2e" stroke="#3f3f46" strokeWidth="1" />
              )}
            </svg>

            <div className="text-center">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
              <p className="text-xl font-semibold">{getMetricText(state, total)}</p>
            </div>

            <p className="max-w-44 text-center text-xs text-muted-foreground">{hoverText}</p>
          </div>

          <div className="w-full space-y-2">
            {items.map((item, index) => {
              const value = item.value ?? 0;
              const ratio = total > 0 ? (value / total) * 100 : 0;
              return (
                <div
                  key={item.label}
                  className="rounded-md border border-border/70 bg-card/60 p-2.5"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-sm text-foreground">{item.label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {state === "ready" ? formatPercent(ratio) : "--"}
                    </span>
                  </div>
                  <div className="text-sm font-medium">{getMetricText(state, value)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LineVisualization({ title, subtitle, items, isLoading, color = "#ff8c00" }) {
  const [hoveredPointIndex, setHoveredPointIndex] = useState(null);
  const width = 520;
  const height = 220;
  const padding = 30;
  const state = getItemsState(items, isLoading);
  const hasValues = state === "ready";
  const normalizedItems = items.map((item) => ({ ...item, value: item.value ?? 0 }));
  const points = buildLinePoints(normalizedItems, width, height, padding);
  const yValues = normalizedItems.map((item) => item.value ?? 0);
  const yMax = yValues.length ? Math.max(...yValues) : 0;
  const yMin = yValues.length ? Math.min(...yValues) : 0;
  const yMid = Math.round((yMax + yMin) / 2);
  const hoveredPoint = hoveredPointIndex !== null ? points[hoveredPointIndex] : null;

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-hidden rounded-lg border border-border/70 bg-card/70 p-2">
          <svg viewBox={`0 0 ${width} ${height}`} className="h-52 w-full" role="img" aria-label={title}>
            <defs>
              <linearGradient id="dashboardLineFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.4" />
                <stop offset="100%" stopColor={color} stopOpacity="0.03" />
              </linearGradient>
            </defs>

            {[0.25, 0.5, 0.75].map((ratio) => (
              <line
                key={ratio}
                x1={padding + 4}
                x2={width - padding}
                y1={padding + (height - padding * 2) * ratio}
                y2={padding + (height - padding * 2) * ratio}
                stroke="rgba(148, 163, 184, 0.25)"
                strokeWidth="1"
              />
            ))}

            {[
              { label: formatCount(yMax, false), y: padding },
              { label: formatCount(yMid, false), y: padding + (height - padding * 2) / 2 },
              { label: formatCount(yMin, false), y: height - padding },
            ].map((tick) => (
              <text
                key={`${tick.label}-${tick.y}`}
                x={padding - 4}
                y={tick.y}
                textAnchor="end"
                dominantBaseline="middle"
                fill="rgba(148, 163, 184, 0.95)"
                fontSize="11"
              >
                {tick.label}
              </text>
            ))}

            <path d={areaPath} fill="url(#dashboardLineFill)" />
            <path d={linePath} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />

            {points.map((point, index) => (
              <g key={point.label}>
                <circle cx={point.x} cy={point.y} r="4" fill={color} />
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="10"
                  fill="transparent"
                  onMouseEnter={() => setHoveredPointIndex(index)}
                  onMouseLeave={() => setHoveredPointIndex(null)}
                />
              </g>
            ))}

            {hoveredPoint ? (
              <g pointerEvents="none">
                <rect
                  x={Math.max(42, Math.min(hoveredPoint.x - 58, width - 130))}
                  y={Math.max(8, hoveredPoint.y - 42)}
                  width="116"
                  height="26"
                  rx="6"
                  fill="rgba(17, 18, 20, 0.92)"
                  stroke="rgba(148, 163, 184, 0.35)"
                />
                <text
                  x={Math.max(42, Math.min(hoveredPoint.x - 58, width - 130)) + 58}
                  y={Math.max(8, hoveredPoint.y - 42) + 17}
                  textAnchor="middle"
                  fill="#f4f4f5"
                  fontSize="11"
                >
                  {`${hoveredPoint.label}: ${formatCount(hoveredPoint.value, false)}`}
                </text>
              </g>
            ) : null}
          </svg>
        </div>

        <p className="text-xs text-muted-foreground">
          {state === "loading"
            ? "Loading data..."
            : state === "empty"
              ? "No data"
              : "Hover a point to view the exact value."}
        </p>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {items.map((item) => (
            <div key={item.label} className="rounded-md border border-border/70 bg-card/60 p-2">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="text-sm font-medium">{getMetricText(state, item.value ?? 0)}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function BarVisualization({ title, subtitle, items, isLoading }) {
  const state = getItemsState(items, isLoading);
  const maxValue = items.reduce((max, item) => Math.max(max, item.value ?? 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => {
          const value = item.value ?? 0;
          const widthPercent = maxValue > 0 ? Math.max((value / maxValue) * 100, value > 0 ? 4 : 0) : 0;

          return (
            <div key={item.label} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">{item.label}</span>
                <span className="font-medium text-foreground">
                  {getMetricText(state, value)}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted/60">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${widthPercent}%`, backgroundColor: item.color }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function CompareVisualization({ title, subtitle, left, right, isLoading }) {
  const state = getItemsState([left, right], isLoading);
  const total = (left.value ?? 0) + (right.value ?? 0);
  const leftPercent = total > 0 ? ((left.value ?? 0) / total) * 100 : 0;
  const rightPercent = total > 0 ? ((right.value ?? 0) / total) * 100 : 0;
  const hasValues = state === "ready";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{left.label}</span>
            <span className="font-medium">{getMetricText(state, left.value ?? 0)}</span>
          </div>
          <div className="h-2.5 rounded-full bg-muted/60">
            <div className="h-full rounded-full" style={{ width: `${leftPercent}%`, backgroundColor: left.color }} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{right.label}</span>
            <span className="font-medium">{getMetricText(state, right.value ?? 0)}</span>
          </div>
          <div className="h-2.5 rounded-full bg-muted/60">
            <div className="h-full rounded-full" style={{ width: `${rightPercent}%`, backgroundColor: right.color }} />
          </div>
        </div>

        <div className="rounded-md border border-border/70 bg-card/70 px-3 py-2 text-xs text-muted-foreground">
          {hasValues
            ? `${formatPercent(leftPercent)} vs ${formatPercent(rightPercent)}`
            : "No comparison data available."}
        </div>
      </CardContent>
    </Card>
  );
}

const INITIAL_OVERVIEW = {
  users: null,
  bookings: null,
  shops: null,
  services: null,
  notifications: null,
};

export function AdminDashboardPage() {
  const [overview, setOverview] = useState(INITIAL_OVERVIEW);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const loadDashboardOverview = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");

    const [usersResult, bookingsResult, shopsResult, servicesResult, notificationsResult] =
      await Promise.allSettled([
        request("/admin/users/overview/"),
        request("/admin/bookings/overview/"),
        request("/admin/shops/overview/"),
        request("/admin/services/overview/"),
        request("/admin/notification/overview/"),
      ]);

    setOverview({
      users: usersResult.status === "fulfilled" ? usersResult.value : null,
      bookings: bookingsResult.status === "fulfilled" ? bookingsResult.value : null,
      shops: shopsResult.status === "fulfilled" ? shopsResult.value : null,
      services: servicesResult.status === "fulfilled" ? servicesResult.value : null,
      notifications: notificationsResult.status === "fulfilled" ? notificationsResult.value : null,
    });

    const hasFailures = [
      usersResult,
      bookingsResult,
      shopsResult,
      servicesResult,
      notificationsResult,
    ].some((result) => result.status === "rejected");

    if (hasFailures) {
      setLoadError("Some dashboard metrics could not be loaded. Please refresh or check admin API access.");
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadDashboardOverview();
  }, [loadDashboardOverview]);

  const pendingVerifications = useMemo(() => {
    const shopsTotal = getNumber(overview.shops?.shops_total);
    const verifiedShops = getNumber(overview.shops?.verified_shops);
    if (shopsTotal === null || verifiedShops === null) {
      return null;
    }
    return Math.max(shopsTotal - verifiedShops, 0);
  }, [overview.shops]);

  const completionRate = useMemo(() => {
    const bookingsTotal = getNumber(overview.bookings?.bookings_total);
    const completedBookings = getNumber(overview.bookings?.completed_bookings);
    if (bookingsTotal === null || completedBookings === null || bookingsTotal <= 0) {
      return null;
    }
    return (completedBookings / bookingsTotal) * 100;
  }, [overview.bookings]);

  const disputeRate = useMemo(() => {
    const bookingsTotal = getNumber(overview.bookings?.bookings_total);
    const pendingDisputes = getNumber(overview.bookings?.pending_disputes);
    if (bookingsTotal === null || pendingDisputes === null || bookingsTotal <= 0) {
      return null;
    }
    return (pendingDisputes / bookingsTotal) * 100;
  }, [overview.bookings]);

  const verificationRate = useMemo(() => {
    const shopsTotal = getNumber(overview.shops?.shops_total);
    const verifiedShops = getNumber(overview.shops?.verified_shops);
    if (shopsTotal === null || verifiedShops === null || shopsTotal <= 0) {
      return null;
    }
    return (verifiedShops / shopsTotal) * 100;
  }, [overview.shops]);

  const kpiCards = useMemo(
    () => [
      {
        title: "Total Users",
        value: getNumber(overview.users?.accounts_total),
        description: "Registered platform accounts",
        icon: Users,
        iconClassName: "text-sky-400",
        badge: `${formatCount(getNumber(overview.users?.active_accounts), isLoading)} active`,
      },
      {
        title: "Pending Verifications",
        value: pendingVerifications,
        description: "Shops waiting for verification",
        icon: ShieldCheck,
        iconClassName: "text-amber-400",
        badge: verificationRate === null ? "No rate" : `${formatPercent(verificationRate)} verified`,
      },
      {
        title: "Active Bookings",
        value: getNumber(overview.bookings?.active_bookings),
        description: "Ongoing operations right now",
        icon: CalendarCheck,
        iconClassName: "text-emerald-400",
        badge: completionRate === null ? "No rate" : `${formatPercent(completionRate)} completed`,
      },
      {
        title: "Open Disputes",
        value: getNumber(overview.bookings?.pending_disputes),
        description: "Cases requiring review",
        icon: Scale,
        iconClassName: "text-rose-400",
        badge: disputeRate === null ? "No rate" : `${formatPercent(disputeRate)} of bookings`,
      },
    ],
    [
      completionRate,
      disputeRate,
      isLoading,
      overview.bookings,
      overview.shops,
      overview.users,
      pendingVerifications,
      verificationRate,
    ],
  );

  const modules = useMemo(
    () => [
      {
        title: "Verification Queue",
        description: "Review mechanic, shop, and owner submissions that require approval.",
        icon: ShieldCheck,
        count: pendingVerifications,
        countLabel: "pending",
      },
      {
        title: "Requests & Bookings",
        description: "Monitor request flow, active operations, and service completion trends.",
        icon: CalendarCheck,
        count: getNumber(overview.bookings?.bookings_total),
        countLabel: "bookings",
      },
      {
        title: "Service Catalog",
        description: "Manage categories, services, add-ons, and minimum pricing references.",
        icon: Briefcase,
        count: getNumber(overview.services?.services_total),
        countLabel: "services",
      },
      {
        title: "Trust and Safety",
        description: "Handle reports, policy actions, and account safety enforcement.",
        icon: AlertTriangle,
        count: getNumber(overview.users?.reports_pending),
        countLabel: "reports pending",
      },
      {
        title: "Dispute Center",
        description: "Track unresolved disputes and assign case reviews.",
        icon: Scale,
        count: getNumber(overview.bookings?.pending_disputes),
        countLabel: "open disputes",
      },
      {
        title: "Wallet & Token Ledger",
        description: "Audit token balances and transaction movement across providers.",
        icon: Wallet,
        count: getNumber(overview.notifications?.notifications_total),
        countLabel: "system notifications",
      },
    ],
    [overview.bookings, overview.notifications, overview.services, overview.users, pendingVerifications],
  );

  const roleDistribution = useMemo(
    () => [
      {
        label: "Client",
        value: getNumber(overview.users?.roles?.client),
        color: "#ff8c00",
      },
      {
        label: "Mechanic",
        value: getNumber(overview.users?.roles?.mechanic),
        color: "#22c55e",
      },
      {
        label: "Shop Owner",
        value: getNumber(overview.users?.roles?.shop_owner),
        color: "#06b6d4",
      },
      {
        label: "Admin",
        value: getNumber(overview.users?.roles?.admin),
        color: "#f59e0b",
      },
    ],
    [overview.users],
  );

  const bookingLifecycle = useMemo(
    () => [
      {
        label: "Requests",
        value: getNumber(overview.bookings?.requests_total),
        color: "#06b6d4",
      },
      {
        label: "Bookings",
        value: getNumber(overview.bookings?.bookings_total),
        color: "#ff8c00",
      },
      {
        label: "Active",
        value: getNumber(overview.bookings?.active_bookings),
        color: "#22c55e",
      },
      {
        label: "Completed",
        value: getNumber(overview.bookings?.completed_bookings),
        color: "#84cc16",
      },
      {
        label: "Disputed",
        value: getNumber(overview.bookings?.disputed_bookings),
        color: "#ef4444",
      },
    ],
    [overview.bookings],
  );

  const serviceInventory = useMemo(
    () => [
      {
        label: "Categories",
        value: getNumber(overview.services?.categories_total),
        color: "#f59e0b",
      },
      {
        label: "Services",
        value: getNumber(overview.services?.services_total),
        color: "#ff8c00",
      },
      {
        label: "Add-ons",
        value: getNumber(overview.services?.add_ons_total),
        color: "#06b6d4",
      },
      {
        label: "Specialties",
        value: getNumber(overview.services?.specialties_total),
        color: "#22c55e",
      },
      {
        label: "Tags",
        value: getNumber(overview.services?.tags_total),
        color: "#eab308",
      },
    ],
    [overview.services],
  );

  const bookingFlowLine = useMemo(
    () => [
      { label: "Requests", value: getNumber(overview.bookings?.requests_total) },
      { label: "Booked", value: getNumber(overview.bookings?.bookings_total) },
      { label: "Active", value: getNumber(overview.bookings?.active_bookings) },
      { label: "Completed", value: getNumber(overview.bookings?.completed_bookings) },
      { label: "Disputed", value: getNumber(overview.bookings?.disputed_bookings) },
    ],
    [overview.bookings],
  );

  return (
    <AdminLayout title="Overview Dashboard">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Admin Operations Overview</CardTitle>
            <CardDescription>
              Track key platform indicators, monitor live distributions, and jump directly into action modules.
            </CardDescription>
            {loadError && <p className="text-sm text-red-600">{loadError}</p>}
          </CardHeader>
        </Card>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiCards.map((item) => (
            <KpiCard
              key={item.title}
              title={item.title}
              value={item.value}
              description={item.description}
              icon={item.icon}
              iconClassName={item.iconClassName}
              isLoading={isLoading}
              badge={item.badge}
            />
          ))}
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <PieVisualization
            title="User Role Split (Pie)"
            subtitle="Role composition of total platform accounts."
            items={roleDistribution}
            isLoading={isLoading}
          />

          <LineVisualization
            title="Booking Flow Line"
            subtitle="System flow from requests to completed and disputed states."
            items={bookingFlowLine}
            isLoading={isLoading}
            color="#ff8c00"
          />

          <CompareVisualization
            title="Shop Verification Health"
            subtitle="Verified shops versus those still pending verification."
            left={{
              label: "Verified Shops",
              value: getNumber(overview.shops?.verified_shops),
              color: "#22c55e",
            }}
            right={{
              label: "Pending Verification",
              value: pendingVerifications,
              color: "#ff8c00",
            }}
            isLoading={isLoading}
          />
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <BarVisualization
            title="Booking Lifecycle (Bar)"
            subtitle="Current counts for requests and booking statuses."
            items={bookingLifecycle}
            isLoading={isLoading}
          />

          <BarVisualization
            title="Service Inventory Composition"
            subtitle="Catalog volume across categories, services, and metadata sets."
            items={serviceInventory}
            isLoading={isLoading}
          />

          <BarVisualization
            title="Operations Signals"
            subtitle="Current pressure points across disputes, reports, broadcasts, and notifications."
            items={[
              {
                label: "Pending Disputes",
                value: getNumber(overview.bookings?.pending_disputes),
                color: "#ef4444",
              },
              {
                label: "Pending Reports",
                value: getNumber(overview.users?.reports_pending),
                color: "#f59e0b",
              },
              {
                label: "Broadcast Searching",
                value: getNumber(overview.bookings?.broadcast_searching),
                color: "#06b6d4",
              },
              {
                label: "Total Notifications",
                value: getNumber(overview.notifications?.notifications_total),
                color: "#84cc16",
              },
            ]}
            isLoading={isLoading}
          />
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {modules.map((module) => {
            const Icon = module.icon;
            return (
              <Card key={module.title}>
                <CardHeader>
                  <div className="mb-2 inline-flex size-9 items-center justify-center rounded-md bg-muted">
                    <Icon className="size-4 text-muted-foreground" />
                  </div>
                  <CardTitle className="text-base">{module.title}</CardTitle>
                  <CardDescription>{module.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm font-medium text-muted-foreground">
                    {formatCount(module.count, isLoading)} {module.countLabel}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </section>
      </div>
    </AdminLayout>
  );
}
