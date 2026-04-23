import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { Eye, Plus, X, UserPlus } from "lucide-react";
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
import { AddAdminModal } from "@/components/admin/AddAdminModal";
import { ModalShell } from "@/components/modals/ModalShell";
import { request } from "@/services/httpClient";

const ROLE_TABS = [
  { key: "all", label: "All" },
  { key: "client", label: "Client" },
  { key: "mechanic", label: "Mechanic" },
  { key: "shop", label: "Shop" },
  { key: "admin", label: "Admins", superadminOnly: true },
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

function formatStatusLabel(value) {
  if (!value) {
    return "Not provided";
  }

  return String(value)
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === "") {
    return "Not provided";
  }

  const numberValue = Number(value);
  if (Number.isNaN(numberValue)) {
    return "Not provided";
  }

  return `PHP ${numberValue.toLocaleString()}`;
}

function getStatusBadgeClass(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (["approved", "active", "open", "verified", "yes", "completed"].includes(normalized)) {
    return "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";
  }

  if (["pending", "searching", "processing"].includes(normalized)) {
    return "border-amber-500/40 bg-amber-500/15 text-amber-300";
  }

  if (["rejected", "inactive", "closed", "cancelled", "disputed", "no"].includes(normalized)) {
    return "border-red-500/40 bg-red-500/15 text-red-300";
  }

  return "border-border bg-muted/60 text-foreground";
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
      <p className="text-xs font-semibold uppercase tracking-wide text-orange-300/80">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value || "Not provided"}</p>
    </div>
  );
}

function UserDetailsModal({ account, onClose, activeRoleTab }) {
  if (!account) {
    return null;
  }

  const avatarUrl = toAvatarUrl(account.profile_photo);
  const roles = Array.isArray(account.roles) ? account.roles : [];
  const roleProfiles = account.role_profiles || {};
  const mechanicProfile = roleProfiles.mechanic || {};
  const mechanicServices = Array.isArray(mechanicProfile.services) ? mechanicProfile.services : [];
  const mechanicSpecialties = Array.isArray(mechanicProfile.specialties) ? mechanicProfile.specialties : [];

  const shopOwnerProfile = roleProfiles.shop_owner || {};
  const shopDetails = shopOwnerProfile.shop || null;
  const shopServices = Array.isArray(shopDetails?.services) ? shopDetails.services : [];
  const shopSpecialties = Array.isArray(shopDetails?.specialties) ? shopDetails.specialties : [];
  const shopMechanics = Array.isArray(shopDetails?.mechanics) ? shopDetails.mechanics : [];
  const currentRoleTab = activeRoleTab || "all";
  const showMechanicSection = roles.includes("mechanic") && currentRoleTab !== "shop" && currentRoleTab !== "client";
  const showShopSection = roles.includes("shop_owner") && currentRoleTab !== "mechanic" && currentRoleTab !== "client";

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      maxWidth="4xl"
      headerClassName="py-5"
      customHeader={
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
      }
    >
        <div className="max-h-[75vh] overflow-y-auto px-6 py-5">
          <div className="space-y-5">
            <section className="space-y-3">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
                <div className="rounded-lg border border-border/70 bg-card/70 p-3">
                  <div className="flex h-56 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-muted/40 px-3">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt={getDisplayName(account)} className="h-full w-full object-cover" />
                    ) : (
                      <p className="text-sm text-muted-foreground">No profile found</p>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-orange-400">Account Overview</h4>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className={`capitalize ${getStatusBadgeClass(account.is_active ? "active" : "inactive")}`}>
                      {account.is_active ? "Active" : "Inactive"}
                    </Badge>
                    <Badge variant="outline" className={`capitalize ${getStatusBadgeClass(account.is_verified ? "verified" : "pending")}`}>
                      {account.is_verified ? "Verified" : "Unverified"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-3">
                    <DetailItem label="Account ID" value={String(account.id)} />
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
                </div>
              </div>
            </section>

            {showMechanicSection && (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-orange-400">Mechanic Details</h3>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={`capitalize ${getStatusBadgeClass(mechanicProfile.status)}`}>
                    {formatStatusLabel(mechanicProfile.status)}
                  </Badge>
                  <Badge variant="outline" className={`capitalize ${getStatusBadgeClass(mechanicProfile.is_working_for_shop ? "yes" : "pending")}`}>
                    {mechanicProfile.is_working_for_shop ? "Working For Shop" : "Independent"}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-4">
                  <DetailItem label="Average Rating" value={String(mechanicProfile.average_rating ?? 0)} />
                  <DetailItem label="Tokens Balance" value={String(mechanicProfile.tokens_balance ?? 0)} />
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-orange-400">Mechanic Services</h4>
                  {mechanicServices.length === 0 ? (
                    <p className="rounded-md border border-border/70 bg-card/70 px-3 py-2 text-sm text-muted-foreground">
                      No mechanic services available.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {mechanicServices.map((serviceItem) => (
                        <div key={`mechanic-service-${serviceItem.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 bg-card/70 px-3 py-2">
                          <p className="text-sm font-medium text-foreground">{serviceItem.name || "Unnamed service"}</p>
                          <p className="text-sm text-muted-foreground">{formatCurrency(serviceItem.price)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-orange-400">Mechanic Specialties</h4>
                  {mechanicSpecialties.length === 0 ? (
                    <p className="rounded-md border border-border/70 bg-card/70 px-3 py-2 text-sm text-muted-foreground">
                      No mechanic specialties available.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {mechanicSpecialties.map((specialtyItem) => (
                        <div key={`mechanic-specialty-${specialtyItem.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 bg-card/70 px-3 py-2">
                          <p className="text-sm font-medium text-foreground">{specialtyItem.name || "Unnamed specialty"}</p>
                              <Badge variant="outline" className={`capitalize ${getStatusBadgeClass(specialtyItem.status)}`}>
                            {formatStatusLabel(specialtyItem.status)}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}

            {showShopSection && (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-orange-400">Shop Details</h3>
                {shopDetails ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className={`capitalize ${getStatusBadgeClass(shopDetails.status)}`}>
                        {formatStatusLabel(shopDetails.status)}
                      </Badge>
                      <Badge variant="outline" className={`${getStatusBadgeClass(shopDetails.is_verified ? "verified" : "pending")}`}>
                        {shopDetails.is_verified ? "Verified" : "Unverified"}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-3">
                      <DetailItem label="Shop Name" value={shopDetails.shop_name || "Not provided"} />
                      <DetailItem label="Shop Contact" value={shopDetails.contact_number || "Not provided"} />
                      <DetailItem label="Shop Email" value={shopDetails.email || "Not provided"} />
                      <DetailItem label="Website" value={shopDetails.website || "Not provided"} />
                      <DetailItem label="Created At" value={formatDateTime(shopDetails.created_at)} />
                      <DetailItem label="Owns Shop" value={renderBoolean(shopOwnerProfile.owns_shop)} />
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-orange-400">Description</p>
                      <p className="rounded-md border border-border/70 bg-card/70 px-3 py-2 text-sm text-foreground">
                        {shopDetails.description || "No description provided."}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-orange-400">Shop Services</h4>
                      {shopServices.length === 0 ? (
                        <p className="rounded-md border border-border/70 bg-card/70 px-3 py-2 text-sm text-muted-foreground">
                          No shop services available.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {shopServices.map((serviceItem) => (
                            <div key={`shop-service-${serviceItem.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 bg-card/70 px-3 py-2">
                              <p className="text-sm font-medium text-foreground">{serviceItem.name || "Unnamed service"}</p>
                              <p className="text-sm text-muted-foreground">{formatCurrency(serviceItem.price)}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-orange-400">Shop Specialties</h4>
                      {shopSpecialties.length === 0 ? (
                        <p className="rounded-md border border-border/70 bg-card/70 px-3 py-2 text-sm text-muted-foreground">
                          No shop specialties available.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {shopSpecialties.map((specialtyItem) => (
                            <div key={`shop-specialty-${specialtyItem.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 bg-card/70 px-3 py-2">
                              <p className="text-sm font-medium text-foreground">{specialtyItem.name || "Unnamed specialty"}</p>
                              <Badge variant="outline" className={`capitalize ${getStatusBadgeClass(specialtyItem.status)}`}>
                                {formatStatusLabel(specialtyItem.status)}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-orange-400">Shop Mechanics</h4>
                      {shopMechanics.length === 0 ? (
                        <p className="rounded-md border border-border/70 bg-card/70 px-3 py-2 text-sm text-muted-foreground">
                          No mechanics assigned to this shop.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {shopMechanics.map((mechanicItem) => (
                            <div key={`shop-mechanic-${mechanicItem.account_id}`} className="rounded-md border border-border/70 bg-card/70 px-3 py-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-medium text-foreground">{mechanicItem.name || mechanicItem.username || "Unnamed mechanic"}</p>
                                <Badge variant="outline" className={`capitalize ${getStatusBadgeClass(mechanicItem.status)}`}>
                                  {formatStatusLabel(mechanicItem.status)}
                                </Badge>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">@{mechanicItem.username || "unknown"}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Rating: {mechanicItem.average_rating ?? 0} • Working for shop: {renderBoolean(mechanicItem.working_for_shop)}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="rounded-md border border-border/70 bg-card/70 px-3 py-2 text-sm text-muted-foreground">
                    No shop profile details available.
                  </p>
                )}
              </section>
            )}

            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-orange-400">Address</h3>
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
    </ModalShell>
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
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [currentAdmin, setCurrentAdmin] = useState(null);
  const [addAdminModalOpen, setAddAdminModalOpen] = useState(false);

  // Fetch current admin info to check if superadmin
  useEffect(() => {
    async function loadCurrentAdmin() {
      try {
        const response = await request("/users/admin/check-session/");
        if (response.ok) {
          const data = await response.json();
          console.log("Admin check-session response:", data);
          setCurrentAdmin(data.admin || null);
        }
      } catch (error) {
        console.error("Failed to load admin info:", error);
      }
    }
    loadCurrentAdmin();
  }, []);

  // Filter tabs based on superadmin status
  const visibleTabs = useMemo(() => {
    const tabs = ROLE_TABS.filter((tab) => {
      if (tab.superadminOnly) {
        return currentAdmin?.is_superadmin === true;
      }
      return true;
    });
    console.log("visibleTabs:", tabs, "currentAdmin:", currentAdmin);
    return tabs;
  }, [currentAdmin]);

  const loadAccounts = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

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
    () => accounts.filter((account) => accountMatchesRoleTab(account, roleFilter)),
    [accounts, roleFilter],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [roleFilter]);

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
            {roleFilter === "admin" && currentAdmin?.is_superadmin ? (
              <Button
                onClick={() => setAddAdminModalOpen(true)}
                className="bg-orange-600 hover:bg-orange-700 text-white"
              >
                <UserPlus className="size-4 mr-2" />
                Add Admin
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap gap-2">
              {visibleTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setRoleFilter(tab.key);
                    setCurrentPage(1);
                  }}
                  className={`rounded-md border px-3 py-1.5 text-sm transition ${
                    roleFilter === tab.key
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

        <UserDetailsModal
          account={selectedAccount}
          activeRoleTab={roleFilter}
          onClose={() => setSelectedAccount(null)}
        />

        <AddAdminModal
          open={addAdminModalOpen}
          onOpenChange={setAddAdminModalOpen}
          onSuccess={() => {
            loadAccounts();
          }}
        />
      </div>
    </AdminLayout>
  );
}
