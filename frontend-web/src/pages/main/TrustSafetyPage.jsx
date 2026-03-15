import { useEffect, useMemo, useState } from "react";
import { AdminLayout } from "../AdminLayout";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PaginationControls } from "@/components/common/PaginationControls";
import { fetchAdminNotifications, fetchAdminReports } from "@/services/adminDataService";

const ITEMS_PER_PAGE = 10;

function getInitials(name) {
  if (!name) {
    return "NA";
  }
  const parts = name.split(" ").filter(Boolean);
  if (parts.length === 0) {
    return "NA";
  }
  return parts
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function statusToSeverity(status) {
  if (status === "pending") {
    return { label: "High", className: "bg-red-600 text-white hover:bg-red-600" };
  }
  if (status === "reviewed") {
    return { label: "Medium", className: "bg-yellow-500 text-black hover:bg-yellow-500" };
  }
  return { label: "Low", className: "bg-green-600 text-white hover:bg-green-600" };
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

export function TrustSafetyPage() {
  const [reports, setReports] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reportsPage, setReportsPage] = useState(1);
  const [notificationsPage, setNotificationsPage] = useState(1);

  useEffect(() => {
    async function loadTrustData() {
      setIsLoading(true);
      setLoadError("");

      const [reportsResult, notificationsResult] = await Promise.allSettled([
        fetchAdminReports({ limit: 200 }),
        fetchAdminNotifications({ limit: 200 }),
      ]);

      if (reportsResult.status === "fulfilled") {
        setReports(reportsResult.value?.results || []);
      } else {
        setReports([]);
      }

      if (notificationsResult.status === "fulfilled") {
        setNotifications(notificationsResult.value?.results || []);
      } else {
        setNotifications([]);
      }

      if (reportsResult.status === "rejected" || notificationsResult.status === "rejected") {
        setLoadError("Some trust and safety data could not be loaded.");
      }

      setIsLoading(false);
    }

    loadTrustData();
  }, []);

  const reportTotalPages = useMemo(
    () => Math.max(Math.ceil(reports.length / ITEMS_PER_PAGE), 1),
    [reports.length],
  );
  const notificationTotalPages = useMemo(
    () => Math.max(Math.ceil(notifications.length / ITEMS_PER_PAGE), 1),
    [notifications.length],
  );

  useEffect(() => {
    if (reportsPage > reportTotalPages) {
      setReportsPage(reportTotalPages);
    }
  }, [reportTotalPages, reportsPage]);

  useEffect(() => {
    if (notificationsPage > notificationTotalPages) {
      setNotificationsPage(notificationTotalPages);
    }
  }, [notificationTotalPages, notificationsPage]);

  const flaggedReports = useMemo(() => {
    const start = (reportsPage - 1) * ITEMS_PER_PAGE;
    return reports.slice(start, start + ITEMS_PER_PAGE);
  }, [reports, reportsPage]);

  const flaggedContent = useMemo(() => {
    const start = (notificationsPage - 1) * ITEMS_PER_PAGE;
    return notifications.slice(start, start + ITEMS_PER_PAGE);
  }, [notifications, notificationsPage]);

  return (
    <AdminLayout title="Trust and Safety">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Trust and Safety</CardTitle>
            <CardDescription>
              Review user reports and identify potentially harmful platform activity.
            </CardDescription>
            {loadError && <p className="text-sm text-red-600">{loadError}</p>}
          </CardHeader>
        </Card>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Reported Users</CardTitle>
              <CardDescription>Priority queue for account and behavior reports.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading &&
                Array.from({ length: 3 }).map((_, index) => (
                  <div key={`report-skeleton-${index}`} className="h-16 animate-pulse rounded-md border bg-[#1A1C1E]" />
                ))}

              {!isLoading && flaggedReports.length === 0 && (
                <div className="rounded-md border p-3 text-sm text-muted-foreground">No reports available.</div>
              )}

              {!isLoading &&
                flaggedReports.map((report) => {
                  const severity = statusToSeverity(report.status);
                  return (
                    <div key={report.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback>{getInitials(report.reported_username)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{report.reported_username}</p>
                      <p className="text-xs text-muted-foreground">Reporter: {report.reporter_username}</p>
                      <p className="text-xs text-muted-foreground">{report.reason}</p>
                    </div>
                  </div>
                  <Badge className={severity.className}>{severity.label}</Badge>
                    </div>
                  );
                })}

              {!isLoading && reports.length > 0 && (
                <PaginationControls
                  currentPage={reportsPage}
                  totalItems={reports.length}
                  pageSize={ITEMS_PER_PAGE}
                  onPageChange={setReportsPage}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Flagged Content</CardTitle>
              <CardDescription>Items requiring manual moderation review.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading &&
                Array.from({ length: 3 }).map((_, index) => (
                  <div key={`notif-skeleton-${index}`} className="h-14 animate-pulse rounded-md border bg-[#1A1C1E]" />
                ))}

              {!isLoading && flaggedContent.length === 0 && (
                <div className="rounded-md border p-3 text-sm text-muted-foreground">No flagged content available.</div>
              )}

              {!isLoading &&
                flaggedContent.map((notification) => (
                  <div key={notification.id} className="rounded-md border p-3">
                  <p className="text-sm font-medium">{notification.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {notification.message}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Receiver: {notification.receiver_username} • {formatDate(notification.created_at)}
                  </p>
                </div>
                ))}

              {!isLoading && notifications.length > 0 && (
                <PaginationControls
                  currentPage={notificationsPage}
                  totalItems={notifications.length}
                  pageSize={ITEMS_PER_PAGE}
                  onPageChange={setNotificationsPage}
                />
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </AdminLayout>
  );
}
