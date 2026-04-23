import { useMemo, useState } from "react";
import { Plus, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/modals/ModalShell";

export function AddServiceModal({
  isOpen,
  onClose,
  onSubmit,
  isSaving,
  saveError,
  categories,
  onAddCategory,
  onManageCategories,
}) {
  const [formValues, setFormValues] = useState({
    name: "",
    description: "",
    minimum_price: "0",
    category: "",
  });
  const [newCategory, setNewCategory] = useState("");
  const [showAddCategory, setShowAddCategory] = useState(false);

  const handleChange = (field, value) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit({
      name: formValues.name,
      description: formValues.description,
      minimum_price: formValues.minimum_price,
      category: formValues.category || null,
    });
  };

  const handleAddNewCategory = () => {
    if (newCategory.trim()) {
      onAddCategory(newCategory.trim());
      setFormValues((prev) => ({ ...prev, category: newCategory.trim() }));
      setNewCategory("");
      setShowAddCategory(false);
    }
  };

  const categoryOptions = useMemo(() => {
    const uniqueCategories = Array.from(new Set(categories.filter(Boolean)));
    return uniqueCategories;
  }, [categories]);

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="2xl"
      title="Add Service"
      description="Create a new service offering in the catalog."
    >
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div className="space-y-1.5">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="service-name"
            >
              Name
            </label>
            <input
              id="service-name"
              value={formValues.name}
              onChange={(event) => handleChange("name", event.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
              placeholder="Service name"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="service-description"
            >
              Description
            </label>
            <textarea
              id="service-description"
              value={formValues.description}
              onChange={(event) =>
                handleChange("description", event.target.value)
              }
              className="min-h-28 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
              placeholder="Write a clear and concise description"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="service-minimum-price"
            >
              Minimum Price (PHP)
            </label>
            <input
              id="service-minimum-price"
              type="number"
              min="0"
              step="0.01"
              value={formValues.minimum_price}
              onChange={(event) =>
                handleChange("minimum_price", event.target.value)
              }
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="service-category"
            >
              Service Category
            </label>
            <div className="flex gap-2">
              <select
                id="service-category"
                value={formValues.category}
                onChange={(event) =>
                  handleChange("category", event.target.value)
                }
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
              >
                <option value="">-- Select Category --</option>
                {categoryOptions.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddCategory(true)}
                className="rounded-lg border-primary/35 bg-primary/10 text-primary hover:bg-primary/20"
              >
                <Plus className="size-4 mr-1" />
                Add
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onManageCategories}
                className="rounded-lg border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Settings className="size-4 mr-1" />
                Manage
              </Button>
            </div>
          </div>

          {showAddCategory && (
            <div className="space-y-1.5 rounded-lg border border-border/70 bg-card/60 p-3">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="new-category"
              >
                New Category Name
              </label>
              <div className="flex gap-2">
                <input
                  id="new-category"
                  value={newCategory}
                  onChange={(event) => setNewCategory(event.target.value)}
                  placeholder="Enter new category name"
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
                />
                <Button
                  type="button"
                  onClick={handleAddNewCategory}
                  className="rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Add
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setShowAddCategory(false);
                    setNewCategory("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {saveError ? (
            <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {saveError}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="rounded-lg"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={isSaving}
            >
              {isSaving ? "Creating..." : "Create Service"}
            </Button>
          </div>
        </form>
    </ModalShell>
  );
}
