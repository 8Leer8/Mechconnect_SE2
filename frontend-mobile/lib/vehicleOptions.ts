type VehicleBrand = {
  name: string;
  models?: string[];
  subcategories?: Record<string, string[]>;
};

type VehicleTypeEntry = {
  type: string;
  brands: VehicleBrand[];
};

type VehicleDataset = {
  vehicle_types: VehicleTypeEntry[];
};

const RAW_IMPORT = require('@/assets/json/ph_vehicles_complete.json') as VehicleDataset & {
  default?: VehicleDataset;
};
const RAW_DATA: VehicleDataset =
  RAW_IMPORT && Array.isArray(RAW_IMPORT.vehicle_types)
    ? RAW_IMPORT
    : (RAW_IMPORT?.default as VehicleDataset);

export const VEHICLE_TYPES: string[] = Array.isArray(RAW_DATA?.vehicle_types)
  ? RAW_DATA.vehicle_types.map((item) => item.type)
  : [];

const normalizeBrandModels = (brand: VehicleBrand): string[] => {
  const directModels = Array.isArray(brand.models) ? brand.models : [];
  const subcategoryModels = brand.subcategories
    ? Object.values(brand.subcategories).flatMap((items) => (Array.isArray(items) ? items : []))
    : [];

  return [...directModels, ...subcategoryModels];
};

const getTypeEntry = (vehicleType: string): VehicleTypeEntry | null => {
  const entry = RAW_DATA.vehicle_types.find((item) => item.type === vehicleType);
  return entry || null;
};

export const getVehicleBrands = (vehicleType: string): string[] => {
  const typeEntry = getTypeEntry(vehicleType);
  if (!typeEntry) return [];
  return typeEntry.brands.map((brand) => brand.name);
};

export const getVehicleModels = (vehicleType: string, brandName: string): string[] => {
  const typeEntry = getTypeEntry(vehicleType);
  if (!typeEntry) return [];

  const brand = typeEntry.brands.find((item) => item.name === brandName);
  if (!brand) return [];

  return normalizeBrandModels(brand);
};
