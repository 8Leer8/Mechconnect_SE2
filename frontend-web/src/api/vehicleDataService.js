import { API_BASE_URL } from "@/config/env";

const BASE_URL = `${API_BASE_URL}/vehicles`;

/**
 * Fetch all vehicle types (with nested brands)
 */
export async function fetchVehicleTypes() {
  const response = await fetch(`${BASE_URL}/types/`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error("Failed to fetch vehicle types");
  return response.json();
}

/**
 * Fetch single vehicle type with full details (brands and models)
 */
export async function fetchVehicleType(id) {
  const response = await fetch(`${BASE_URL}/types/${id}/`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error("Failed to fetch vehicle type");
  return response.json();
}

/**
 * Create new vehicle type
 */
export async function createVehicleType(data) {
  const response = await fetch(`${BASE_URL}/types/create/`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Failed to create vehicle type");
  }
  return response.json();
}

/**
 * Update vehicle type
 */
export async function updateVehicleType(id, data) {
  const response = await fetch(`${BASE_URL}/types/${id}/update/`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Failed to update vehicle type");
  }
  return response.json();
}

/**
 * Delete vehicle type
 */
export async function deleteVehicleType(id) {
  const response = await fetch(`${BASE_URL}/types/${id}/delete/`, {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error("Failed to delete vehicle type");
  return true;
}

/**
 * Fetch all vehicle brands
 */
export async function fetchVehicleBrands(typeId = null) {
  const url = typeId ? `${BASE_URL}/brands/?type=${typeId}` : `${BASE_URL}/brands/`;
  const response = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error("Failed to fetch vehicle brands");
  return response.json();
}

/**
 * Create new vehicle brand
 */
export async function createVehicleBrand(data) {
  const response = await fetch(`${BASE_URL}/brands/create/`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Failed to create vehicle brand");
  }
  return response.json();
}

/**
 * Update vehicle brand
 */
export async function updateVehicleBrand(id, data) {
  const response = await fetch(`${BASE_URL}/brands/${id}/update/`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Failed to update vehicle brand");
  }
  return response.json();
}

/**
 * Delete vehicle brand
 */
export async function deleteVehicleBrand(id) {
  const response = await fetch(`${BASE_URL}/brands/${id}/delete/`, {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error("Failed to delete vehicle brand");
  return true;
}

/**
 * Fetch models for a brand
 */
export async function fetchBrandModels(brandId) {
  const response = await fetch(`${BASE_URL}/brands/${brandId}/models/`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error("Failed to fetch brand models");
  return response.json();
}

/**
 * Fetch all vehicle models
 */
export async function fetchVehicleModels(brandId = null) {
  const url = brandId ? `${BASE_URL}/models/?brand=${brandId}` : `${BASE_URL}/models/`;
  const response = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error("Failed to fetch vehicle models");
  return response.json();
}

/**
 * Create new vehicle model
 */
export async function createVehicleModel(data) {
  const response = await fetch(`${BASE_URL}/models/create/`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Failed to create vehicle model");
  }
  return response.json();
}

/**
 * Update vehicle model
 */
export async function updateVehicleModel(id, data) {
  const response = await fetch(`${BASE_URL}/models/${id}/update/`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Failed to update vehicle model");
  }
  return response.json();
}

/**
 * Delete vehicle model
 */
export async function deleteVehicleModel(id) {
  const response = await fetch(`${BASE_URL}/models/${id}/delete/`, {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error("Failed to delete vehicle model");
  return true;
}
