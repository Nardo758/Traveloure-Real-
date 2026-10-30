/**
 * Row 242 (ledger `2026-10-30-row242-cost-source`). Where a slip activity's `cost` came from.
 *
 * Pure: no database and no network. The live plancard assembler is the one caller. The label is
 * derived per read and never stored. `cost` (`estimated_cost`) stays the amount. This module
 * names a source and two flags, and it reads no listing price.
 *
 * Order, first match wins (Architect, Oct 28, 2026, 01:05 ET): booking, traveler, service_link,
 * expert, ai. No match returns undefined, and the assembler omits the key. `ai` only when
 * `origin` is exactly "ai". `expert` only when `origin` is exactly "expert" — notes are not a signal.
 */
import type { CostSource } from "@shared/trip-plan";

export function deriveCostSource(
  item: { origin?: string | null; providerServiceId?: string | null },
  hasLiveBooking: boolean,
): CostSource | undefined {
  if (hasLiveBooking) return "booking";
  if (item.origin === "traveler") return "traveler";
  if (item.providerServiceId) return "service_link";
  if (item.origin === "expert") return "expert";
  if (item.origin === "ai") return "ai";
  return undefined;
}

/** Flag-only. No conversion. USD and an empty currency omit `costCurrency`. */
export function deriveCostFlags(
  item: { currency?: string | null; costPerPerson?: boolean | null },
): { costCurrency?: string; costPerPerson?: true } {
  const out: { costCurrency?: string; costPerPerson?: true } = {};
  if (typeof item.currency === "string") {
    const code = item.currency.trim().toUpperCase();
    if (code !== "" && code !== "USD") out.costCurrency = code;
  }
  if (item.costPerPerson === true) out.costPerPerson = true;
  return out;
}
