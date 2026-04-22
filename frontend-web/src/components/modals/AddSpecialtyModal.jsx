import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AddSpecialtyModal({
  isOpen,
  onClose,
  onSubmit,
  isSaving,
  saveError,
}) {
  const [formValues, setFormValues] = useState({
    name: "",
    description: "",
  });

  const handleChange = (field, value) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit({
      name: formValues.name,
      description: formValues.description,
    });
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
      onClick={onClose}
    >
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
            Add Specialty
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a new mechanic specialty in the catalog.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div className="space-y-1.5">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="specialty-name"
            >
              Name
            </label>
            <input
              id="specialty-name"
              value={formValues.name}
              onChange={(event) => handleChange("name", event.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
              placeholder="Specialty name"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="specialty-description"
            >
              Description
            </label>
            <textarea
              id="specialty-description"
              value={formValues.description}
              onChange={(event) =>
                handleChange("description", event.target.value)
              }
              className="min-h-28 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
              placeholder="Write a clear and concise description"
              required
            />
          </div>

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
              {isSaving ? "Creating..." : "Create Specialty"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
