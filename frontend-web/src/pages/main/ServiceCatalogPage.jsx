import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { AdminLayout } from "../AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PaginationControls } from "@/components/common/PaginationControls";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  fetchAdminServices,
  fetchAdminSpecialties,
  updateAdminService,
  updateAdminSpecialty,
} from "@/services/adminDataService";

const ITEMS_PER_PAGE = 10;
const TAB_ITEMS = [
  { key: "services", label: "Services" },
  { key: "specialties", label: "Specialties" },
];

function formatCurrency(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "PHP —";
  }
  return `PHP ${numeric.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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

function EditCatalogModal({
  modalState,
  formValues,
  onChange,
  onClose,
  onSubmit,
  isSaving,
  saveError,
}) {
  if (!modalState) {
    return null;
  }

  const isService = modalState.type === "service";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-border bg-gradient-to-r from-card via-muted/40 to-card px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-6 top-6 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close modal"
          >
            <X className="size-4" />
          </button>

          <h3 className="text-lg font-semibold text-foreground">
            Edit {isService ? "Service" : "Specialty"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Update details and save changes without leaving the catalog.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 px-6 py-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="catalog-name">Name</label>
            <input
              id="catalog-name"
              value={formValues.name}
              onChange={(event) => onChange("name", event.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
              placeholder={isService ? "Service name" : "Specialty name"}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="catalog-description">Description</label>
            <textarea
              id="catalog-description"
              value={formValues.description}
              onChange={(event) => onChange("description", event.target.value)}
              className="min-h-28 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
              placeholder="Write a clear and concise description"
              required
            />
          </div>

          {isService ? (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="catalog-minimum-price">
                Minimum Price (PHP)
              </label>
              <input
                id="catalog-minimum-price"
                type="number"
                min="0"
                step="0.01"
                value={formValues.minimum_price}
                onChange={(event) => onChange("minimum_price", event.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>
          ) : null}

          {saveError ? (
            <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">{saveError}</p>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="outline" className="rounded-lg" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-lg bg-primary text-primary-foreground hover:bg-primary/90" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ServiceCatalogPage() {
  const [services, setServices] = useState([]);
  const [specialties, setSpecialties] = useState([]);
  const [activeTab, setActiveTab] = useState("services");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [servicesPage, setServicesPage] = useState(1);
  const [specialtiesPage, setSpecialtiesPage] = useState(1);
  const [modalState, setModalState] = useState(null);
  const [formValues, setFormValues] = useState({ name: "", description: "", minimum_price: "0" });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    async function loadCatalog() {
      setIsLoading(true);
      setLoadError("");

      const [servicesResult, specialtiesResult] = await Promise.allSettled([
        fetchAdminServices({ limit: 200 }),
        fetchAdminSpecialties({ limit: 200 }),
      ]);

      if (servicesResult.status === "fulfilled") {
        setServices(servicesResult.value?.results || []);
      } else {
        setServices([]);
      }

      if (specialtiesResult.status === "fulfilled") {
        setSpecialties(specialtiesResult.value?.results || []);
      } else {
        setSpecialties([]);
      }

      if (servicesResult.status === "rejected" || specialtiesResult.status === "rejected") {
        setLoadError("Some catalog data could not be loaded.");
      }

      setIsLoading(false);
    }

    loadCatalog();
  }, []);

  const paginatedServices = useMemo(() => {
    const start = (servicesPage - 1) * ITEMS_PER_PAGE;
    return services.slice(start, start + ITEMS_PER_PAGE);
  }, [services, servicesPage]);

  const paginatedSpecialties = useMemo(() => {
    const start = (specialtiesPage - 1) * ITEMS_PER_PAGE;
    return specialties.slice(start, start + ITEMS_PER_PAGE);
  }, [specialties, specialtiesPage]);

  const tabCounts = useMemo(
    () => ({ services: services.length, specialties: specialties.length }),
    [services.length, specialties.length],
  );

  function handleOpenEditService(service) {
    setModalState({ type: "service", id: service.id });
    setFormValues({
      name: service.name || "",
      description: service.description || "",
      minimum_price: String(service.minimum_price ?? "0"),
    });
    setSaveError("");
  }

  function handleOpenEditSpecialty(specialty) {
    setModalState({ type: "specialty", id: specialty.id });
    setFormValues({
      name: specialty.name || "",
      description: specialty.description || "",
      minimum_price: "0",
    });
    setSaveError("");
  }

  function handleCloseModal() {
    if (isSaving) {
      return;
    }
    setModalState(null);
    setSaveError("");
  }

  function handleFormChange(field, value) {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmitEdit(event) {
    event.preventDefault();

    if (!modalState) {
      return;
    }

    setIsSaving(true);
    setSaveError("");

    try {
      if (modalState.type === "service") {
        const updatedService = await updateAdminService(modalState.id, {
          name: formValues.name,
          description: formValues.description,
          minimum_price: formValues.minimum_price,
        });

        setServices((prev) =>
          prev.map((item) =>
            item.id === modalState.id
              ? {
                  ...item,
                  ...updatedService,
                }
              : item,
          ),
        );
      } else {
        const updatedSpecialty = await updateAdminSpecialty(modalState.id, {
          name: formValues.name,
          description: formValues.description,
        });

        setSpecialties((prev) =>
          prev.map((item) =>
            item.id === modalState.id
              ? {
                  ...item,
                  ...updatedSpecialty,
                }
              : item,
          ),
        );
      }

      setModalState(null);
    } catch (error) {
      setSaveError(error.message || "Failed to save changes.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AdminLayout title="Service & Specialty Catalog">
      <div className="space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-xl">Service & Specialty Catalog</CardTitle>
              <CardDescription>
                Maintain service offerings and specialty definitions with smooth in-page editing.
              </CardDescription>
            </div>
            <Button disabled>
              <Plus className="size-4" />
              Add Item (Soon)
            </Button>
          </CardHeader>
          {loadError && <CardContent><p className="text-sm text-red-600">{loadError}</p></CardContent>}
        </Card>

        <div className="flex flex-wrap gap-2">
          {TAB_ITEMS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                activeTab === tab.key
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {tab.label} ({isLoading ? "..." : tabCounts[tab.key]})
            </button>
          ))}
        </div>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {isLoading &&
            Array.from({ length: 3 }).map((_, index) => (
              <Card key={`skeleton-${index}`}>
                <CardHeader>
                  <div className="h-5 w-40 animate-pulse rounded bg-[#2A2C2E]" />
                  <div className="h-4 w-56 animate-pulse rounded bg-[#2A2C2E]" />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="h-5 w-28 animate-pulse rounded bg-[#2A2C2E]" />
                  <div className="h-8 w-40 animate-pulse rounded bg-[#2A2C2E]" />
                </CardContent>
              </Card>
            ))}

          {!isLoading && activeTab === "services" && services.length === 0 && (
            <Card className="md:col-span-2 xl:col-span-3">
              <CardContent className="p-4 text-sm text-muted-foreground">
                No services found.
              </CardContent>
            </Card>
          )}

          {!isLoading && activeTab === "specialties" && specialties.length === 0 && (
            <Card className="md:col-span-2 xl:col-span-3">
              <CardContent className="p-4 text-sm text-muted-foreground">
                No specialties found.
              </CardContent>
            </Card>
          )}

          {!isLoading && activeTab === "services" &&
            paginatedServices.map((service) => (
              <Card key={`service-${service.id}`}>
                <CardHeader>
                  <CardTitle className="text-base">{service.name}</CardTitle>
                  <CardDescription>{service.description || "No description provided."}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary">{service.category || "Uncategorized"}</Badge>
                    <span className="text-sm font-medium text-muted-foreground">
                      {formatCurrency(service.minimum_price)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Updated: {formatDateTime(service.updated_at || service.created_at)}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg border-primary/35 bg-primary/10 text-primary hover:bg-primary/20"
                      onClick={() => handleOpenEditService(service)}
                    >
                      <Pencil className="size-4" />
                      Edit
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

          {!isLoading && activeTab === "specialties" &&
            paginatedSpecialties.map((specialty) => (
              <Card key={`specialty-${specialty.id}`}>
                <CardHeader>
                  <CardTitle className="text-base">{specialty.name}</CardTitle>
                  <CardDescription>{specialty.description || "No description provided."}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary">Specialty</Badge>
                    <span className="text-xs text-muted-foreground">
                      Updated: {formatDateTime(specialty.updated_at || specialty.created_at)}
                    </span>
                  </div>

                  <div className="flex items-center justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg border-primary/35 bg-primary/10 text-primary hover:bg-primary/20"
                      onClick={() => handleOpenEditSpecialty(specialty)}
                    >
                      <Pencil className="size-4" />
                      Edit
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
        </section>

        {!isLoading && activeTab === "services" && services.length > 0 && (
          <PaginationControls
            currentPage={servicesPage}
            totalItems={services.length}
            pageSize={ITEMS_PER_PAGE}
            onPageChange={setServicesPage}
          />
        )}

        {!isLoading && activeTab === "specialties" && specialties.length > 0 && (
          <PaginationControls
            currentPage={specialtiesPage}
            totalItems={specialties.length}
            pageSize={ITEMS_PER_PAGE}
            onPageChange={setSpecialtiesPage}
          />
        )}
      </div>

      <EditCatalogModal
        modalState={modalState}
        formValues={formValues}
        onChange={handleFormChange}
        onClose={handleCloseModal}
        onSubmit={handleSubmitEdit}
        isSaving={isSaving}
        saveError={saveError}
      />
    </AdminLayout>
  );
}
