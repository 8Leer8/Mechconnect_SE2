import { useEffect, useState, useMemo } from "react";
import { Plus, Edit2, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { AdminLayout } from "@/pages/AdminLayout";
import {
  fetchVehicleTypes,
  fetchVehicleType,
  createVehicleType,
  updateVehicleType,
  deleteVehicleType,
  createVehicleBrand,
  updateVehicleBrand,
  deleteVehicleBrand,
  createVehicleModel,
  updateVehicleModel,
  deleteVehicleModel,
} from "@/api/vehicleDataService";

export function VehicleManagementPage() {
  const [types, setTypes] = useState([]);
  const [activeTypeId, setActiveTypeId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal states
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [isBrandModalOpen, setIsBrandModalOpen] = useState(false);
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Form states
  const [editingItem, setEditingItem] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);
  const [deleteType, setDeleteType] = useState(null);
  const [formData, setFormData] = useState({ name: "", subcategory: "" });
  const [activeBrandId, setActiveBrandId] = useState(null);

  // Search
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadTypes();
  }, []);

  async function loadTypes() {
    try {
      setLoading(true);
      const data = await fetchVehicleTypes();
      setTypes(data);
      if (!activeTypeId && data.length > 0) {
        setActiveTypeId(String(data[0].id));
      }
      setError("");
    } catch (err) {
      setError("Failed to load vehicle data");
    } finally {
      setLoading(false);
    }
  }

  const activeType = useMemo(() =>
    types.find(t => String(t.id) === activeTypeId),
    [types, activeTypeId]
  );

  // Filter brands based on search
  const filteredBrands = useMemo(() => {
    if (!activeType?.brands) return [];
    if (!searchQuery.trim()) return activeType.brands;
    const query = searchQuery.toLowerCase();
    return activeType.brands.filter(b =>
      b.name.toLowerCase().includes(query) ||
      b.models?.some(m =>
        m.name.toLowerCase().includes(query) ||
        (m.subcategory && m.subcategory.toLowerCase().includes(query))
      )
    );
  }, [activeType, searchQuery]);

  // Type CRUD
  function openTypeModal(type = null) {
    setEditingItem(type);
    setFormData({ name: type?.name || "", subcategory: "" });
    setIsTypeModalOpen(true);
  }

  async function handleTypeSubmit(e) {
    e.preventDefault();
    try {
      if (editingItem) {
        await updateVehicleType(editingItem.id, { name: formData.name });
      } else {
        await createVehicleType({ name: formData.name });
      }
      setIsTypeModalOpen(false);
      loadTypes();
    } catch (err) {
      setError(err.message);
    }
  }

  // Brand CRUD
  function openBrandModal(brand = null) {
    setEditingItem(brand);
    setFormData({ name: brand?.name || "", subcategory: "" });
    setIsBrandModalOpen(true);
  }

  async function handleBrandSubmit(e) {
    e.preventDefault();
    try {
      if (editingItem) {
        await updateVehicleBrand(editingItem.id, { name: formData.name });
      } else {
        await createVehicleBrand({ name: formData.name, type: activeTypeId });
      }
      setIsBrandModalOpen(false);
      loadTypes();
    } catch (err) {
      setError(err.message);
    }
  }

  // Model CRUD
  function openModelModal(brandId, model = null) {
    setActiveBrandId(brandId);
    setEditingItem(model);
    setFormData({
      name: model?.name || "",
      subcategory: model?.subcategory || "",
    });
    setIsModelModalOpen(true);
  }

  async function handleModelSubmit(e) {
    e.preventDefault();
    try {
      const data = {
        name: formData.name,
        brand: activeBrandId,
        subcategory: formData.subcategory || null,
      };
      if (editingItem) {
        await updateVehicleModel(editingItem.id, data);
      } else {
        await createVehicleModel(data);
      }
      setIsModelModalOpen(false);
      loadTypes();
    } catch (err) {
      setError(err.message);
    }
  }

  // Delete handlers
  function openDeleteModal(item, type) {
    setDeleteItem(item);
    setDeleteType(type);
    setIsDeleteModalOpen(true);
  }

  async function handleDelete() {
    try {
      if (deleteType === "type") {
        await deleteVehicleType(deleteItem.id);
        if (activeTypeId === String(deleteItem.id)) {
          const remaining = types.filter(t => t.id !== deleteItem.id);
          setActiveTypeId(remaining.length > 0 ? String(remaining[0].id) : null);
        }
        loadTypes();
      } else if (deleteType === "brand") {
        await deleteVehicleBrand(deleteItem.id);
        loadTypes();
      } else if (deleteType === "model") {
        await deleteVehicleModel(deleteItem.id);
        loadTypes();
      }
      setIsDeleteModalOpen(false);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <AdminLayout title="Vehicle Management">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">Vehicle Management</CardTitle>
                <CardDescription>
                  Manage vehicle types, brands, and models. Select a tab to view brands and models for each vehicle type.
                </CardDescription>
              </div>
              <Button onClick={() => openTypeModal()} className="gap-2">
                <Plus className="size-4" />
                Add Type
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-muted-foreground">Loading...</div>
              </div>
            ) : types.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                No vehicle types found. Click "Add Type" to create one.
              </div>
            ) : (
              <Tabs value={activeTypeId} onValueChange={setActiveTypeId} className="w-full">
                {/* Vehicle Type Tabs */}
                <TabsList className="w-full justify-start flex-wrap h-auto gap-1">
                  {types.map((type) => (
                    <TabsTrigger key={type.id} value={String(type.id)} className="gap-2">
                      <span>{type.name}</span>
                      <span className="text-xs text-muted-foreground">({type.brands?.length || 0})</span>
                    </TabsTrigger>
                  ))}
                </TabsList>

                {/* Search and Add Brand - Below Tabs */}
                <div className="mt-4 flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                      placeholder="Search brands and models..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Button onClick={() => openBrandModal()} className="gap-2 shrink-0">
                    <Plus className="size-4" />
                    Add Brand
                  </Button>
                </div>

                {/* Tab Content with Brand Accordions */}
                {types.map((type) => (
                  <TabsContent key={type.id} value={String(type.id)} className="mt-4">
                    {filteredBrands.length === 0 ? (
                      <div className="py-8 text-center text-muted-foreground">
                        {searchQuery
                          ? "No brands or models match your search."
                          : "No brands found for this type. Click \"Add Brand\" to create one."}
                      </div>
                    ) : (
                      <Accordion type="multiple" className="w-full">
                        {filteredBrands.map((brand) => (
                          <AccordionItem key={brand.id} value={String(brand.id)}>
                            {/* Brand Header with Action Buttons */}
                            <div className="flex items-center">
                              <AccordionTrigger className="flex-1 hover:no-underline">
                                <span className="font-medium">{brand.name}</span>
                                <span className="ml-2 text-xs text-muted-foreground">
                                  ({brand.models?.length || 0} models)
                                </span>
                              </AccordionTrigger>
                              {/* Brand Actions - Stop propagation */}
                              <div className="flex items-center gap-1 pr-4">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openBrandModal(brand);
                                  }}
                                >
                                  <Edit2 className="size-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-red-400 hover:text-red-500"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openDeleteModal(brand, "brand");
                                  }}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </div>
                            </div>

                            {/* Models inside Accordion */}
                            <AccordionContent>
                              <div className="space-y-2">
                                {/* Add Model Button */}
                                <div className="flex justify-end mb-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openModelModal(brand.id)}
                                    className="gap-1"
                                  >
                                    <Plus className="size-3" />
                                    Add Model
                                  </Button>
                                </div>

                                {/* Models List */}
                                {!brand.models || brand.models.length === 0 ? (
                                  <div className="py-4 text-center text-sm text-muted-foreground">
                                    No models found. Click "Add Model" to create one.
                                  </div>
                                ) : (
                                  brand.models.map((model) => (
                                    <div
                                      key={model.id}
                                      className="flex items-center justify-between rounded-md border border-border/50 bg-background/50 px-3 py-2"
                                    >
                                      <div className="flex items-center gap-2 flex-wrap">
                                        {model.subcategory && (
                                          <Badge variant="secondary" className="text-xs">
                                            {model.subcategory}
                                          </Badge>
                                        )}
                                        <span className="text-sm">{model.name}</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 w-7 p-0"
                                          onClick={() => openModelModal(brand.id, model)}
                                        >
                                          <Edit2 className="size-3.5" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 w-7 p-0 text-red-400 hover:text-red-500"
                                          onClick={() => openDeleteModal(model, "model")}
                                        >
                                          <Trash2 className="size-3.5" />
                                        </Button>
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Type Modal */}
      <Dialog open={isTypeModalOpen} onOpenChange={setIsTypeModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Vehicle Type" : "Add Vehicle Type"}</DialogTitle>
            <DialogDescription>
              {editingItem ? "Update the vehicle type name." : "Create a new vehicle type (e.g., Car, Motorcycle)."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleTypeSubmit}>
            <div className="py-4">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Car, Motorcycle, Truck"
                className="mt-1"
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsTypeModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">{editingItem ? "Update" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Brand Modal */}
      <Dialog open={isBrandModalOpen} onOpenChange={setIsBrandModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Brand" : "Add Brand"}</DialogTitle>
            <DialogDescription>
              {editingItem
                ? "Update the brand name."
                : `Create a new brand under ${activeType?.name}.`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleBrandSubmit}>
            <div className="py-4">
              <label className="text-sm font-medium">Brand Name</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Toyota, Honda"
                className="mt-1"
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsBrandModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">{editingItem ? "Update" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Model Modal */}
      <Dialog open={isModelModalOpen} onOpenChange={setIsModelModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Model" : "Add Model"}</DialogTitle>
            <DialogDescription>
              {editingItem
                ? "Update the model details."
                : `Create a new model.`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleModelSubmit}>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium">Model Name</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Vios, Click 125"
                  className="mt-1"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium">Subcategory (Optional)</label>
                <Input
                  value={formData.subcategory}
                  onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                  placeholder="e.g., Scooter / AT, for motorcycles"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Used for motorcycles (e.g., "Scooter / AT", "Sport")
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsModelModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">{editingItem ? "Update" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteItem?.name}</strong>?
              {deleteType === "type" && " This will also delete all associated brands and models."}
              {deleteType === "brand" && " This will also delete all associated models."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
