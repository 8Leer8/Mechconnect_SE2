/**
 * Heuristic for "same line, renamed" when diffing quotation rows without stable ids.
 * Avoids false positives like "test pur" vs "test" (substring / single shared token).
 */
export function isLikelyQuotationLineRename(prevDesc: unknown, currDesc: unknown): boolean {
  const a = String(prevDesc ?? '')
    .trim()
    .toLowerCase();
  const b = String(currDesc ?? '')
    .trim()
    .toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;

  const shorterLen = Math.min(a.length, b.length);
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length < b.length ? a : b;
  if (shorterLen >= 5 && (longer.includes(shorter) || shorter.includes(longer))) return true;

  const aTokens = new Set(a.split(/\s+/).filter(Boolean));
  const bTokens = new Set(b.split(/\s+/).filter(Boolean));
  if (!aTokens.size || !bTokens.size) return false;
  let overlap = 0;
  aTokens.forEach((t) => {
    if (bTokens.has(t)) overlap += 1;
  });
  const ratioA = overlap / aTokens.size;
  const ratioB = overlap / bTokens.size;
  return ratioA >= 0.6 && ratioB >= 0.6;
}
