import { useEffect, useState } from 'react';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export interface PricingConfig {
  base_distance_fee: number;
  price_per_km: number;
  free_distance_km: number;
  traffic_low_multiplier: number;
  traffic_medium_multiplier: number;
  traffic_high_multiplier: number;
  convenience_fee_percentage: number;
  convenience_fee_fixed: number;
}

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizePricingConfig = (raw: Partial<PricingConfig>): PricingConfig => ({
  base_distance_fee: toNumber(raw.base_distance_fee),
  price_per_km: toNumber(raw.price_per_km),
  free_distance_km: toNumber(raw.free_distance_km),
  traffic_low_multiplier: toNumber(raw.traffic_low_multiplier),
  traffic_medium_multiplier: toNumber(raw.traffic_medium_multiplier),
  traffic_high_multiplier: toNumber(raw.traffic_high_multiplier),
  convenience_fee_percentage: toNumber(raw.convenience_fee_percentage),
  convenience_fee_fixed: toNumber(raw.convenience_fee_fixed),
});

export const fetchPricingConfig = async (): Promise<PricingConfig> => {
  const response = await fetch(`${API_URL}/pricing/config/`, {
    method: 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch pricing configuration');
  }

  const data = (await response.json()) as Partial<PricingConfig>;
  return normalizePricingConfig(data);
};

export const usePricing = () => {
  const [pricing, setPricing] = useState<PricingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadPricing = async () => {
      try {
        const config = await fetchPricingConfig();
        if (!isMounted) return;
        setPricing(config);
      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Failed to fetch pricing configuration');
      } finally {
        if (!isMounted) return;
        setLoading(false);
      }
    };

    loadPricing();
    return () => {
      isMounted = false;
    };
  }, []);

  return { pricing, loading, error };
};
