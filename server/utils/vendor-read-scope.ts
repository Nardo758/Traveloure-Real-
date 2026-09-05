/**
 * The ONE read-scope decision for `GET /api/vendors`.
 *
 * Ledger `2026-09-05-vendors-read-scope`; CLAUDE.md §14 (the acting user comes from the SESSION,
 * never from the request) applied to READS, and §19's allowlist posture applied to a RESPONSE.
 * Found by the sweep that landed `2026-09-05-custom-venues-owner-scope` — the same class, one
 * table over, and the reason that ledger row names `createdById` as a known unfixed site.
 *
 * WHAT WAS WRONG
 * ──────────────
 * `GET /api/vendors` had no `isAuthenticated`, read `createdById` off `req.query` straight into
 * `storage.getVendors`, whose `conditions.length > 0 ? and(...conditions) : undefined` line turned
 * an omitted filter into a query with no WHERE clause — and whose SELECT joined `users` and put the
 * CREATOR'S EMAIL on every row. So any caller at all, with no session, got the whole vendor table
 * annotated with the email address of the platform account that created each row, and could
 * enumerate one named account's creations at will. The page that calls it renders identically
 * either way; nothing errors and nothing appears in a log.
 *
 * THE SHAPE OF THE FIX
 * ────────────────────
 *   • `GET /api/vendors` is gated by `isAuthenticated` (its only consumer is a `ProtectedRoute`
 *     page, so there is no anonymous caller to break) and is NOT owner-scoped: a vendor row is a
 *     shared business listing every signed-in caller may browse, so hiding rows would be a §13 lie
 *     by omission. The privileged part is the CREATOR, and that is what leaves the route.
 *   • The creator FILTER moved to `GET /api/admin/vendors`, under §2's blanket `adminApiGuard`. It
 *     is not "ignored" on the browse route — it is not read there, which is strictly stronger, and
 *     it puts an audit control on an audit surface beside the CSV export already living there.
 *   • `storage` split into `getVendorsForDirectory` (no `users` join at all) and
 *     `getVendorsWithCreator` (admin/audit). This projector is the SECOND layer over the first.
 *
 * Nothing here reads the request. §18 rule 1: ONE projector, called from wherever a browse surface
 * serves a vendor row — a re-typed field list is how a later surface ships without one.
 */

import {
  VENDOR_DIRECTORY_FIELDS,
  type VendorDirectoryRow,
} from "@shared/schema";
import { pickPublicFields } from "./data-sanitizer";

/**
 * Projects one vendor row down to the directory allowlist: the vendor's own business columns, and
 * NO `users` columns and no `createdById` at all.
 *
 * This is the SECOND layer. The first is structural — `storage.getVendorsForDirectory` does not
 * join `users`, so there is nothing to strip — and this one covers a future caller who hands the
 * projector a joined row anyway. That doubling is the placement CLAUDE.md §18 requires for a
 * privileged field ("so every caller is covered"), applied to a privileged COLUMN on the way out.
 *
 * `pickPublicFields` is the codebase's existing allowlist projector (`EXPERT_APPLICATION_PUBLIC_FIELDS`
 * uses it); this deliberately does not invent a second one.
 */
export function projectVendorForDirectory(
  row: Record<string, unknown>,
): VendorDirectoryRow {
  return pickPublicFields(row as any, VENDOR_DIRECTORY_FIELDS as any) as VendorDirectoryRow;
}
