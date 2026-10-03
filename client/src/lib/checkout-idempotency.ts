/**
 * One checkout key per set of cart lines, kept for the browser tab.
 *
 * A fresh UUID on every visit minted a second payment-pending booking after a decline,
 * because the first attempt's key was gone and the cart had already been emptied. The key
 * stays until payment is recorded, so a retry re-drives the same claim (§15).
 */

export const CHECKOUT_KEY_STORAGE_PREFIX = "traveloure.checkoutKey.v1:";

export function checkoutKeyStorageKey(itemIds: readonly string[]): string | null {
  const ids = itemIds.filter((id) => typeof id === "string" && id.length > 0).slice().sort();
  if (ids.length === 0) return null;
  return CHECKOUT_KEY_STORAGE_PREFIX + ids.join(",");
}

type KeyStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readOrMintCheckoutKey(
  storage: KeyStore | null,
  itemIds: readonly string[],
  fallback?: string | null,
): string | null {
  const storageKey = checkoutKeyStorageKey(itemIds);
  if (!storageKey) return null;
  const keep = fallback && fallback.length > 0 && fallback.length <= 200 ? fallback : null;
  if (!storage) return keep ?? crypto.randomUUID();
  try {
    const existing = storage.getItem(storageKey);
    if (existing && existing.length > 0 && existing.length <= 200) return existing;
    const fresh = keep ?? crypto.randomUUID();
    storage.setItem(storageKey, fresh);
    return fresh;
  } catch {
    return keep ?? crypto.randomUUID();
  }
}

export function clearCheckoutKey(storage: KeyStore | null, itemIds: readonly string[]): void {
  const storageKey = checkoutKeyStorageKey(itemIds);
  if (!storageKey || !storage) return;
  try {
    storage.removeItem(storageKey);
  } catch {
    /* a stuck key only reuses the same claim — never a second charge */
  }
}
