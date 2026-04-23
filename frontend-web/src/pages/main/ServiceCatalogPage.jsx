import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
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
  createAdminService,
  createAdminSpecialty,
  deleteAdminService,
  deleteAdminSpecialty,
  createAdminCategory,
  updateAdminCategory,
  deleteAdminCategory,
  fetchAdminCategories,
} from "@/services/adminDataService";
import { AddServiceModal } from "@/components/modals/AddServiceModal";
import { AddSpecialtyModal } from "@/components/modals/AddSpecialtyModal";
import { DeleteConfirmationModal } from "@/components/modals/DeleteConfirmationModal";
import { ManageCategoriesModal } from "@/components/modals/ManageCategoriesModal";
import { ModalShell } from "@/components/modals/ModalShell";

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
    <ModalShell
      isOpen
      onClose={onClose}
      maxWidth="2xl"
      title={`Edit ${isService ? "Service" : "Specialty"}`}
      description="Update details and save changes without leaving the catalog."
    >
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
    </ModalShell>
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

  // Search and filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");

  // Categories state - fetched from API
  const [categories, setCategories] = useState([]);

  // Add modal states
  const [isAddServiceModalOpen, setIsAddServiceModalOpen] = useState(false);
  const [isAddSpecialtyModalOpen, setIsAddSpecialtyModalOpen] = useState(false);
  const [addSaveError, setAddSaveError] = useState("");

  // Delete confirmation states
  const [deleteModalState, setDeleteModalState] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Manage categories modal state
  const [isManageCategoriesModalOpen, setIsManageCategoriesModalOpen] = useState(false);
  const [categoryProcessError, setCategoryProcessError] = useState("");
  const [isProcessingCategory, setIsProcessingCategory] = useState(false);

  useEffect(() => {
    async function loadCatalog() {
      setIsLoading(true);
      setLoadError("");

      const [servicesResult, specialtiesResult, categoriesResult] = await Promise.allSettled([
        fetchAdminServices({ limit: 200 }),
        fetchAdminSpecialties({ limit: 200 }),
        fetchAdminCategories(),
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

      if (categoriesResult.status === "fulfilled") {
        setCategories(categoriesResult.value?.results?.map((c) => c.name) || []);
      } else {
        setCategories([]);
      }

      if (servicesResult.status === "rejected" || specialtiesResult.status === "rejected" || categoriesResult.status === "rejected") {
        setLoadError("Some catalog data could not be loaded.");
      }

      setIsLoading(false);
    }

    loadCatalog();
  }, []);

  // Filter services based on search and category
  const filteredServices = useMemo(() => {
    return services.filter((service) => {
      const matchesSearch =
        searchQuery === "" ||
        service.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        service.description?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory =
        selectedCategory === "" || service.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [services, searchQuery, selectedCategory]);

  // Filter specialties based on search
  const filteredSpecialties = useMemo(() => {
    return specialties.filter(
      (specialty) =>
        searchQuery === "" ||
        specialty.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        specialty.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [specialties, searchQuery]);

  const paginatedServices = useMemo(() => {
    const start = (servicesPage - 1) * ITEMS_PER_PAGE;
    return filteredServices.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredServices, servicesPage]);

  const paginatedSpecialties = useMemo(() => {
    const start = (specialtiesPage - 1) * ITEMS_PER_PAGE;
    return filteredSpecialties.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredSpecialties, specialtiesPage]);

  const tabCounts = useMemo(
    () => ({
      services: filteredServices.length,
      specialties: filteredSpecialties.length,
    }),
    [filteredServices.length, filteredSpecialties.length]
  );

  // Reset pagination when search/filter changes
  useEffect(() => {
    setServicesPage(1);
    setSpecialtiesPage(1);
  }, [searchQuery, selectedCategory]);

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

  // Add handlers
  async function handleAddService(data) {
    setIsSaving(true);
    setAddSaveError("");

    try {
      const newService = await createAdminService(data);
      setServices((prev) => [newService, ...prev]);
      setIsAddServiceModalOpen(false);
    } catch (error) {
      setAddSaveError(error.message || "Failed to create service.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddSpecialty(data) {
    setIsSaving(true);
    setAddSaveError("");

    try {
      const newSpecialty = await createAdminSpecialty(data);
      setSpecialties((prev) => [newSpecialty, ...prev]);
      setIsAddSpecialtyModalOpen(false);
    } catch (error) {
      setAddSaveError(error.message || "Failed to create specialty.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddCategory(newCategory) {
    try {
      await createAdminCategory({ name: newCategory });
      // Refresh categories list to include the new category
      setCategories((prev) => [...prev, newCategory]);
    } catch (error) {
      console.error("Failed to create category:", error);
      throw error;
    }
  }

  // Category management handlers
  async function handleUpdateCategory(oldCategoryName, newCategoryName) {
    if (oldCategoryName === newCategoryName) return;

    setIsProcessingCategory(true);
    setCategoryProcessError("");

    try {
      // Find the category ID from the full categories list
      const categoriesResponse = await fetchAdminCategories();
      const categoryList = categoriesResponse?.results || [];
      const category = categoryList.find((c) => c.name === oldCategoryName);

      if (!category) {
        setCategoryProcessError("Category not found.");
        return;
      }

      await updateAdminCategory(category.id, { name: newCategoryName });

      // Update categories list
      setCategories((prev) =>
        prev.map((cat) => (cat === oldCategoryName ? newCategoryName : cat))
      );

      // Update services that use this category
      setServices((prev) =>
        prev.map((service) =>
          service.category === oldCategoryName
            ? { ...service, category: newCategoryName }
            : service
        )
      );
    } catch (error) {
      const message = error.message || "Failed to update category.";
      setCategoryProcessError(message);
    } finally {
      setIsProcessingCategory(false);
    }
  }

  async function handleDeleteCategory(categoryName) {
    setIsProcessingCategory(true);
    setCategoryProcessError("");

    try {
      // Find the category ID from the full categories list
      const categoriesResponse = await fetchAdminCategories();
      const categoryList = categoriesResponse?.results || [];
      const category = categoryList.find((c) => c.name === categoryName);

      if (!category) {
        setCategoryProcessError("Category not found.");
        return;
      }

      await deleteAdminCategory(category.id);

      // Remove from categories list
      setCategories((prev) => prev.filter((cat) => cat !== categoryName));

      // Update services that use this category (set to null/uncategorized)
      setServices((prev) =>
        prev.map((service) =>
          service.category === categoryName
            ? { ...service, category: null, category_id: null }
            : service
        )
      );
    } catch (error) {
      const message = error.message || "Failed to delete category.";
      setCategoryProcessError(message);
    } finally {
      setIsProcessingCategory(false);
    }
  }

  function handleOpenManageCategories() {
    setCategoryProcessError("");
    setIsManageCategoriesModalOpen(true);
  }

  function handleCloseManageCategories() {
    if (isProcessingCategory) return;
    setIsManageCategoriesModalOpen(false);
    setCategoryProcessError("");
  }

  // Delete handlers
  function handleOpenDeleteService(service) {
    setDeleteModalState({
      type: "service",
      id: service.id,
      name: service.name,
    });
  }

  function handleOpenDeleteSpecialty(specialty) {
    setDeleteModalState({
      type: "specialty",
      id: specialty.id,
      name: specialty.name,
    });
  }

  function handleCloseDeleteModal() {
    if (isDeleting) {
      return;
    }
    setDeleteModalState(null);
  }

  async function handleConfirmDelete() {
    if (!deleteModalState) {
      return;
    }

    setIsDeleting(true);

    try {
      if (deleteModalState.type === "service") {
        await deleteAdminService(deleteModalState.id);
        setServices((prev) =>
          prev.filter((item) => item.id !== deleteModalState.id)
        );
      } else {
        await deleteAdminSpecialty(deleteModalState.id);
        setSpecialties((prev) =>
          prev.filter((item) => item.id !== deleteModalState.id)
        );
      }
      setDeleteModalState(null);
    } catch (error) {
      // Error will be shown via the modal or can be handled here
      console.error("Delete failed:", error);
    } finally {
      setIsDeleting(false);
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
            <Button
              onClick={() =>
                activeTab === "services"
                  ? setIsAddServiceModalOpen(true)
                  : setIsAddSpecialtyModalOpen(true)
              }
            >
              <Plus className="size-4" />
              {activeTab === "services" ? "Add Service" : "Add Specialty"}
            </Button>
          </CardHeader>
          {loadError && <CardContent><p className="text-sm text-red-600">{loadError}</p></CardContent>}
        </Card>

        <div className="flex flex-wrap gap-2">
          {TAB_ITEMS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setActiveTab(tab.key);
                setSelectedCategory("");
              }}
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

        {/* Search and Filter Controls */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={`Search ${activeTab}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-border bg-background py-2 pl-10 pr-4 text-sm text-foreground outline-none transition focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
            />
          </div>
          {activeTab === "services" && (
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/70 focus:ring-2 focus:ring-primary/20 sm:w-48"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          )}
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

          {!isLoading && activeTab === "services" && filteredServices.length === 0 && (
            <Card className="md:col-span-2 xl:col-span-3">
              <CardContent className="p-4 text-sm text-muted-foreground">
                {searchQuery || selectedCategory
                  ? "No services match your search criteria."
                  : "No services found."}
              </CardContent>
            </Card>
          )}

          {!isLoading && activeTab === "specialties" && filteredSpecialties.length === 0 && (
            <Card className="md:col-span-2 xl:col-span-3">
              <CardContent className="p-4 text-sm text-muted-foreground">
                {searchQuery
                  ? "No specialties match your search criteria."
                  : "No specialties found."}
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
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-lg border-primary/35 bg-primary/10 text-primary hover:bg-primary/20"
                        onClick={() => handleOpenEditService(service)}
                      >
                        <Pencil className="size-4" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-lg text-red-400 hover:bg-red-500/10 hover:text-red-500"
                        onClick={() => handleOpenDeleteService(service)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
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

                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg border-primary/35 bg-primary/10 text-primary hover:bg-primary/20"
                      onClick={() => handleOpenEditSpecialty(specialty)}
                    >
                      <Pencil className="size-4" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-lg text-red-400 hover:bg-red-500/10 hover:text-red-500"
                      onClick={() => handleOpenDeleteSpecialty(specialty)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
        </section>

        {!isLoading && activeTab === "services" && filteredServices.length > 0 && (
          <PaginationControls
            currentPage={servicesPage}
            totalItems={filteredServices.length}
            pageSize={ITEMS_PER_PAGE}
            onPageChange={setServicesPage}
          />
        )}

        {!isLoading && activeTab === "specialties" && filteredSpecialties.length > 0 && (
          <PaginationControls
            currentPage={specialtiesPage}
            totalItems={filteredSpecialties.length}
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

      <AddServiceModal
        isOpen={isAddServiceModalOpen}
        onClose={() => {
          setIsAddServiceModalOpen(false);
          setAddSaveError("");
        }}
        onSubmit={handleAddService}
        isSaving={isSaving}
        saveError={addSaveError}
        categories={categories}
        onAddCategory={handleAddCategory}
        onManageCategories={handleOpenManageCategories}
      />

      <ManageCategoriesModal
        isOpen={isManageCategoriesModalOpen}
        onClose={handleCloseManageCategories}
        categories={categories}
        onUpdateCategory={handleUpdateCategory}
        onDeleteCategory={handleDeleteCategory}
        isProcessing={isProcessingCategory}
        processError={categoryProcessError}
        onClearError={() => setCategoryProcessError("")}
      />

      <AddSpecialtyModal
        isOpen={isAddSpecialtyModalOpen}
        onClose={() => {
          setIsAddSpecialtyModalOpen(false);
          setAddSaveError("");
        }}
        onSubmit={handleAddSpecialty}
        isSaving={isSaving}
        saveError={addSaveError}
      />

      <DeleteConfirmationModal
        isOpen={deleteModalState !== null}
        onClose={handleCloseDeleteModal}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
        itemName={deleteModalState?.name || ""}
        itemType={deleteModalState?.type === "service" ? "Service" : "Specialty"}
      />
    </AdminLayout>
  );
}
