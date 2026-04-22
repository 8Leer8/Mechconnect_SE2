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
 * Unified wallet balance resolver.
 * For accounts with both mechanic and shop-owner roles, mechanic wallet is canonical.
 */
export async function fetchUnifiedWalletBalance(source: WalletSource): Promise<number | null> {
  if (!API_URL) return null;

  const mechanicEndpoint = `${API_URL}/users/mechanic/wallet/`;
  const shopOwnerEndpoint = `${API_URL}/users/shop-owner/wallet/`;

  const order =
    source === 'mechanic'
      ? [mechanicEndpoint, shopOwnerEndpoint]
      : [mechanicEndpoint, shopOwnerEndpoint];

  for (const endpoint of order) {
    const balance = await readWallet(endpoint);
    if (balance !== null) return balance;
  }
  return null;
}
