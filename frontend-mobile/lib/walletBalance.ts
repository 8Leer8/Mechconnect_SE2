const API_URL = process.env.EXPO_PUBLIC_API_URL;

export type WalletSource = 'mechanic' | 'shop-owner';

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
export async function fetchUnifiedWalletBalance(_source: WalletSource): Promise<number | null> {
  if (!API_URL) return null;

  const mechanicEndpoint = `${API_URL}/users/mechanic/wallet/`;
  const shopOwnerEndpoint = `${API_URL}/users/shop-owner/wallet/`;

  for (const endpoint of [mechanicEndpoint, shopOwnerEndpoint]) {
    const balance = await readWallet(endpoint);
    if (balance !== null) return balance;
  }
  return null;
}
