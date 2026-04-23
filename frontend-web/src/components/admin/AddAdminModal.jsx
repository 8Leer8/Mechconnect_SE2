import { useState } from "react";
import { X, UserPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { request } from "@/services/httpClient";
import { toast } from "sonner";

export function AddAdminModal({ open, onOpenChange, onSuccess }) {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    contact_number: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error when user types
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    }
    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email";
    }
    if (!formData.contact_number.trim()) {
      newErrors.contact_number = "Contact number is required";
    }
    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 8) {
      newErrors.password = "Password must be at least 8 characters";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validate()) return;
    
    setLoading(true);
    try {
      const response = await request("/users/admins/create/", {
        method: "POST",
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const data = await response.json();
        toast.success("Admin created successfully", {
          description: `${data.email} has been added as an admin.`,
        });
        onSuccess?.();
        onOpenChange(false);
        // Reset form
        setFormData({
          name: "",
          email: "",
          contact_number: "",
          password: "",
        });
      } else {
        const errorData = await response.json();
        if (errorData.email) {
          setErrors((prev) => ({ ...prev, email: errorData.email[0] }));
          toast.error("Email already exists", {
            description: errorData.email[0],
          });
        } else if (errorData.error) {
          toast.error("Failed to create admin", {
            description: errorData.error,
          });
        } else {
          toast.error("Failed to create admin");
        }
      }
    } catch (error) {
      console.error("Error creating admin:", error);
      toast.error("Network error", {
        description: "Please check your connection and try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-slate-900 border-slate-800 text-slate-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-100">
            <UserPlus className="h-5 w-5 text-orange-500" />
            Add New Admin
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Create a new admin account. Only superadmins can perform this action.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-slate-200">
              Full Name
            </Label>
            <Input
              id="name"
              name="name"
              placeholder="John Doe"
              value={formData.name}
              onChange={handleChange}
              disabled={loading}
              className={`bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500 focus-visible:ring-orange-500 ${
                errors.name ? "border-red-500" : ""
              }`}
            />
            {errors.name && (
              <p className="text-sm text-red-500">{errors.name}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-slate-200">
              Email Address
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="admin@mechconnect.com"
              value={formData.email}
              onChange={handleChange}
              disabled={loading}
              className={`bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500 focus-visible:ring-orange-500 ${
                errors.email ? "border-red-500" : ""
              }`}
            />
            {errors.email && (
              <p className="text-sm text-red-500">{errors.email}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact_number" className="text-slate-200">
              Contact Number
            </Label>
            <Input
              id="contact_number"
              name="contact_number"
              placeholder="+63 912 345 6789"
              value={formData.contact_number}
              onChange={handleChange}
              disabled={loading}
              className={`bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500 focus-visible:ring-orange-500 ${
                errors.contact_number ? "border-red-500" : ""
              }`}
            />
            {errors.contact_number && (
              <p className="text-sm text-red-500">{errors.contact_number}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-slate-200">
              Password
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              disabled={loading}
              className={`bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500 focus-visible:ring-orange-500 ${
                errors.password ? "border-red-500" : ""
              }`}
            />
            {errors.password && (
              <p className="text-sm text-red-500">{errors.password}</p>
            )}
            <p className="text-xs text-slate-500">
              Minimum 8 characters
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="flex-1 border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-slate-100"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 bg-orange-600 hover:bg-orange-700 text-white"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Admin"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
