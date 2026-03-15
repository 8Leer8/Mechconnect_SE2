import { useEffect, useMemo, useState } from "react";
import { Eye, Plus, X } from "lucide-react";
import { AdminLayout } from "../AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PaginationControls } from "@/components/common/PaginationControls";
import { API_BASE_URL } from "@/config/env";
import { fetchAdminAccounts } from "@/services/adminDataService";

const ROLE_TABS = [
  { key: "all", label: "All" },
  { key: "client", label: "Client" },
  { key: "mechanic", label: "Mechanic" },
  { key: "shop", label: "Shop" },
];

const ITEMS_PER_PAGE = 10;

function formatDateTime(value) {
  if (!value) {
    return "Never";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return date.toLocaleString();
}

function formatDate(value) {
  if (!value) {
    return "Not provided";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return date.toLocaleDateString();
}

function formatRoleLabel(role) {
  if (!role) {
    return "No role";
  }

  if (role === "shop_owner") {
    return "Shop";
  }

  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toAvatarUrl(path) {
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

function getDisplayName(account) {
  const fullName = [account.firstname, account.middlename, account.lastname]
    .filter(Boolean)
    .join(" ")
    .trim();
  return fullName || account.username;
}

function getFirstLetter(account) {
  const displayName = getDisplayName(account);
  const firstChar = displayName?.trim()?.charAt(0) || account.username?.charAt(0) || "U";
  return firstChar.toUpperCase();
}

function accountMatchesRoleTab(account, tabKey) {
  if (tabKey === "all") {
    return true;
  }

  const roles = Array.isArray(account.roles) ? account.roles : [];
  if (tabKey === "shop") {
    return roles.includes("shop_owner");
  }

  return roles.includes(tabKey);
}

function renderBoolean(value) {
  if (value === true) {
    return "Yes";
  }
  if (value === false) {
    return "No";
  }
  return "Not provided";
}

function DetailItem({ label, value }) {
  return (
    <div className="rounded-md border border-border/70 bg-card/70 px-3 py-2.5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value || "Not provided"}</p>
    </div>
  );
}

function UserDetailsModal({ account, onClose }) {
  if (!account) {
    return null;
  }

  const avatarUrl = toAvatarUrl(account.profile_photo);
  const roles = Array.isArray(account.roles) ? account.roles : [];
  const roleProfiles = account.role_profiles || {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-4xl overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-border bg-gradient-to-r from-card via-muted/50 to-card px-6 py-5">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Close details modal"
          >
            <X className="size-4" />
          </button>

          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14 border border-border/80">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt={getDisplayName(account)} /> : null}
              <AvatarFallback className="bg-primary/15 text-base font-semibold text-primary">
                {getFirstLetter(account)}
              </AvatarFallback>
            </Avatar>

            <div>
              <p className="text-xl font-semibold text-foreground">{getDisplayName(account)}</p>
              <p className="text-sm text-muted-foreground">@{account.username}</p>
              <p className="text-sm text-muted-foreground">{account.email}</p>
            </div>
          </div>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-6 py-5">
          <div className="space-y-5">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Account Overview</h3>
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-3">
                <DetailItem label="Account ID" value={String(account.id)} />
                <DetailItem label="Status" value={account.is_active ? "Active" : "Inactive"} />
                <DetailItem label="Verification" value={account.is_verified ? "Verified" : "Unverified"} />
                <DetailItem label="Last Login" value={formatDateTime(account.last_login)} />
                <DetailItem label="Last Active Role" value={formatRoleLabel(account.last_active_role)} />
                <DetailItem label="Contact Number" value={account.contact_number || "Not provided"} />
                <DetailItem label="Date of Birth" value={formatDate(account.date_of_birth)} />
                <DetailItem label="Gender" value={account.gender || "Not provided"} />
                <DetailItem
                  label="Roles"
                  value={roles.length > 0 ? roles.map(formatRoleLabel).join(", ") : "No role assigned"}
                />
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Role Details</h3>
              <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                {roles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No role details available.</p>
                ) : (
                  roles.map((role) => {
                    const profile = roleProfiles[role] || {};
                    return (
                      <div key={role} className="rounded-lg border border-border/70 bg-card/70 p-3">
                        <p className="mb-2 text-sm font-semibold text-foreground">{formatRoleLabel(role)}</p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <DetailItem label="Contact" value={profile.contact_number || "Not provided"} />
                          <DetailItem label="Profile Photo" value={profile.profile_photo ? "Available" : "Not available"} />
                          {role === "mechanic" ? (
                            <>
                              <DetailItem label="Status" value={profile.status || "Not provided"} />
                              <DetailItem label="Average Rating" value={profile.average_rating ? String(profile.average_rating) : "0"} />
                              <DetailItem label="Working For Shop" value={renderBoolean(profile.is_working_for_shop)} />
                              <DetailItem label="Tokens Balance" value={String(profile.tokens_balance ?? 0)} />
                            </>
                          ) : null}
                          {role === "shop_owner" ? (
                            <DetailItem label="Owns Shop" value={renderBoolean(profile.owns_shop)} />
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Address</h3>
              {account.address ? (
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-3">
                  <DetailItem
                    label="House / Building"
                    value={account.address.house_building_number || "Not provided"}
                  />
                  <DetailItem label="Street" value={account.address.street_name || "Not provided"} />
                  <DetailItem
                    label="Subdivision / Village"
                    value={account.address.subdivision_village || "Not provided"}
                  />
                  <DetailItem label="Barangay" value={account.address.barangay || "Not provided"} />
                  <DetailItem label="City / Municipality" value={account.address.city_municipality || "Not provided"} />
                  <DetailItem label="Province" value={account.address.province || "Not provided"} />
                  <DetailItem label="Region" value={account.address.region || "Not provided"} />
                  <DetailItem label="Postal Code" value={account.address.postal_code || "Not provided"} />
                </div>
              ) : (
                <p className="rounded-md border border-border/70 bg-card/70 px-3 py-2 text-sm text-muted-foreground">
                  No address information available.
                </p>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="grid grid-cols-6 gap-4 border-b py-4 last:border-b-0">
      {Array.from({ length: 6 }).map((_, idx) => (
        <div key={idx} className="h-4 animate-pulse rounded bg-[#2A2C2E]" />
      ))}
    </div>
  );
}

export function UserManagementPage() {
  const [accounts, setAccounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeRoleTab, setActiveRoleTab] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedAccount, setSelectedAccount] = useState(null);

  useEffect(() => {
    async function loadAccounts() {
      setIsLoading(true);
      setLoadError("");

      try {
        const data = await fetchAdminAccounts({ limit: 200 });
        setAccounts(data?.results || []);
      } catch (error) {
        setLoadError(error.message || "Failed to load accounts.");
      } finally {
        setIsLoading(false);
      }
    }

    loadAccounts();
  }, []);

  useEffect(() => {
    if (!selectedAccount) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setSelectedAccount(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedAccount]);

  const filteredAccounts = useMemo(
    () => accounts.filter((account) => accountMatchesRoleTab(account, activeRoleTab)),
    [accounts, activeRoleTab],
  );

  const totalPages = useMemo(
    () => Math.max(Math.ceil(filteredAccounts.length / ITEMS_PER_PAGE), 1),
    [filteredAccounts.length],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [activeRoleTab]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedAccounts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredAccounts.slice(start, start + ITEMS_PER_PAGE);
  }, [currentPage, filteredAccounts]);

  const tabCounts = useMemo(
    () =>
      ROLE_TABS.reduce((acc, tab) => {
        acc[tab.key] = accounts.filter((account) => accountMatchesRoleTab(account, tab.key)).length;
        return acc;
      }, {}),
    [accounts],
  );

  return (
    <AdminLayout title="User Management">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">User Management</CardTitle>
            <CardDescription>
              Monitor, filter, and manage account access and user status across the platform.
            </CardDescription>
            {loadError && <p className="text-sm text-red-600">{loadError}</p>}
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Accounts Directory</CardTitle>
              <CardDescription>
                Review account roles and statuses before taking administrative actions.
              </CardDescription>
            </div>
            <Button disabled>
              <Plus className="size-4" />
              Add User (Soon)
            </Button>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap gap-2">
              {ROLE_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setActiveRoleTab(tab.key);
                    setCurrentPage(1);
                  }}
                  className={`rounded-md border px-3 py-1.5 text-sm transition ${
                    activeRoleTab === tab.key
                      ? "border-orange-400 bg-orange-500/15 text-orange-300"
                      : "border-border bg-card text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {tab.label} ({isLoading ? "..." : tabCounts[tab.key] ?? 0})
                </button>
              ))}
            </div>

            <div className="rounded-md border">
              <div className="overflow-x-auto">
                <div className="min-w-[860px]">
                  <div className="grid grid-cols-6 gap-4 border-b bg-muted/40 px-4 py-3 text-sm font-medium">
                    <span className="whitespace-nowrap">Name</span>
                    <span className="whitespace-nowrap">Email</span>
                    <span className="whitespace-nowrap">Role</span>
                    <span className="whitespace-nowrap">Status</span>
                    <span className="whitespace-nowrap">Last Login</span>
                    <span className="whitespace-nowrap">Actions</span>
                  </div>
                  <div className="px-4">
                    {isLoading && (
                      <>
                        <SkeletonRow />
                        <SkeletonRow />
                        <SkeletonRow />
                      </>
                    )}

                    {!isLoading && filteredAccounts.length === 0 && (
                      <div className="py-6 text-sm text-muted-foreground">No accounts found.</div>
                    )}

                    {!isLoading &&
                      paginatedAccounts.map((account) => {
                        const fullName = [account.firstname, account.lastname].filter(Boolean).join(" ");
                        const roleLabel = Array.isArray(account.roles) && account.roles.length > 0
                          ? account.roles.map(formatRoleLabel).join(", ")
                          : "No role";

                        return (
                          <div key={account.id} className="grid grid-cols-6 items-center gap-4 border-b py-4 text-sm last:border-b-0">
                            <span className="font-medium truncate" title={fullName || account.username}>
                              {fullName || account.username}
                            </span>
                            <span className="truncate" title={account.email}>{account.email}</span>
                            <span className="truncate" title={roleLabel}>{roleLabel}</span>
                            <span className="flex items-center gap-2">
                              <Badge variant={account.is_active ? "secondary" : "destructive"}>
                                {account.is_active ? "Active" : "Inactive"}
                              </Badge>
                              {account.is_verified && <Badge>Verified</Badge>}
                            </span>
                            <span className="whitespace-nowrap">{formatDateTime(account.last_login)}</span>
                            <span>
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-lg border-primary/35 bg-primary/10 text-primary hover:bg-primary/20"
                                onClick={() => setSelectedAccount(account)}
                              >
                                <Eye className="size-4" />
                                View Details
                              </Button>
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            </div>

            {!isLoading && filteredAccounts.length > 0 && (
              <PaginationControls
                currentPage={currentPage}
                totalItems={filteredAccounts.length}
                pageSize={ITEMS_PER_PAGE}
                onPageChange={setCurrentPage}
              />
            )}
          </CardContent>
        </Card>

        <UserDetailsModal account={selectedAccount} onClose={() => setSelectedAccount(null)} />
      </div>
    </AdminLayout>
  );
}
