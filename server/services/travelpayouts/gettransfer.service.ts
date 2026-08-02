import type { CatalogItem } from "../experience-catalog.service";

/**
 * RETIRED SOURCE — do not re-enable against the old URLs.
 *
 * The GetTransfer affiliate API host is gone. Verified 2026-08-02:
 *   - api.gettransfer.com → DNS does not resolve (NXDOMAIN)
 *   - www.gettransfer.com / gettransfer.com still resolve, so the company is
 *     alive but the partner API this integration used has been shut down.
 * Every search since the shutdown silently returned 0 results; this stub makes
 * that explicit and skips the dead network call entirely.
 *
 * Airport transfer inventory now comes from Kiwitaxi + Welcome Pickups via
 * /api/catalog/airport-transfers. If GetTransfer ships a replacement partner
 * API, wire it up here and un-retire the provider in provider-health.service.ts.
 */

export interface GetTransferSearchParams {
  from: string;
  to: string;
  date?: string;
  passengers?: number;
  currency?: string;
}

/** Always returns [] — the upstream API host no longer exists (see header comment). */
export async function searchGetTransferOptions(_params: GetTransferSearchParams): Promise<CatalogItem[]> {
  return [];
}
