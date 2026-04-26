const inFlightRequests = new Map<string, Promise<unknown>>();
const lastCompletedAt = new Map<string, number>();

export async function runDedupedRequest<T>(
  key: string,
  cooldownMs: number,
  requestFn: () => Promise<T>
): Promise<T | undefined> {
  const active = inFlightRequests.get(key) as Promise<T> | undefined;
  if (active) return active;

  const lastDone = lastCompletedAt.get(key) || 0;
  if (cooldownMs > 0 && Date.now() - lastDone < cooldownMs) {
    return undefined;
  }

  const promise = requestFn().finally(() => {
    lastCompletedAt.set(key, Date.now());
    inFlightRequests.delete(key);
  });
  inFlightRequests.set(key, promise);
  return promise;
}
