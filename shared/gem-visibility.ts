/**
 * Discover-gem visibility (ledger `2026-10-20-kyoto-feed-cleanup`).
 *
 * `hidden_at` NULL means the card is on the traveler feed. A timestamp hides it.
 * `discovery_status` (hidden | emerging | discovered) is a popularity label, not this flag.
 */

/** True when the row is withdrawn from traveler-facing gem lists. */
export function gemRowHidden(row: { hiddenAt?: Date | string | null } | null | undefined): boolean {
  if (!row) return false;
  const value = row.hiddenAt;
  if (value == null) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  return true;
}
