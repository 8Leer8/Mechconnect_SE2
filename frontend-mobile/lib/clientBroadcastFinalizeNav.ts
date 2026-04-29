/**
 * Dedupes client navigation when both (clientTabs) and client/ layouts see the same WS event.
 */
let lastHandledFinalizeKey: string | null = null;

export function consumeClientBroadcastFinalizeNavKey(key: string): boolean {
  if (lastHandledFinalizeKey === key) return false;
  lastHandledFinalizeKey = key;
  return true;
}
