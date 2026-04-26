const API_URL = process.env.EXPO_PUBLIC_API_URL;

export type WalletSource = 'mechanic' | 'shop-owner';

const CACHE_TTL_MS = 30 * 1000;
const balanceCache: Record<WalletSource, { value: number; cachedAt: number } | undefined> = {
  mechanic: undefined,
  'shop-owner': undefined,
};
const inFlightRequests: Record<WalletSource, Promise<number | null> | undefined> = {
  mechanic: undefined,
  'shop-owner': undefined,
};

async function readWallet(endpoint: string): Promise<number | null> {
  try {
    const res = await fetch(endpoint, { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    const parsed = Number(data?.tokens_balance);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return null;
  }
}

/**
 * Unified wallet balance for the logged-in account.
 *
 * Token purchases (`TokenPurchase`) are stored per account; on completion the backend credits
 * **Mechanic.tokens_balance first** when a mechanic profile exists, otherwise **ShopOwner.tokens_balance**
 * (`_finalize_token_purchase`). So the spendable balance users care about is always read **mechanic first,
 * then shop owner** as fallback — the `source` argument is kept for call-site clarity only.
 */
export async function fetchUnifiedWalletBalance(source: WalletSource, forceRefresh = false): Promise<number | null> {
  if (!API_URL) return null;

  const cached = balanceCache[source];
  if (!forceRefresh && cached && Date.now() - cached.cachedAt <= CACHE_TTL_MS) {
    return cached.value;
  }

  if (!forceRefresh && inFlightRequests[source]) {
    return inFlightRequests[source] || null;
  }

  const mechanicEndpoint = `${API_URL}/users/mechanic/wallet/`;
  const shopOwnerEndpoint = `${API_URL}/users/shop-owner/wallet/`;

  inFlightRequests[source] = (async () => {
    for (const endpoint of [mechanicEndpoint, shopOwnerEndpoint]) {
      const balance = await readWallet(endpoint);
      if (balance !== null) {
        balanceCache[source] = { value: balance, cachedAt: Date.now() };
        return balance;
      }
    }
    return null;
  })();

  const request = inFlightRequests[source];
  try {
    return (await request) ?? null;
  } finally {
    inFlightRequests[source] = undefined;
  }
}
