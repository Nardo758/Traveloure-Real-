/**
 * W3-A — pure helpers for the "Partner: <Network>" marker written by
 * partner-catalog-picker.tsx onto itinerary_items.description / trip_suggestions.description.
 * No schema field exists for "this item came from the partner catalog" (no migration in this
 * lane) — this plain-text marker is the honest, non-affiliate fact carried through, mirroring
 * LogBookingForm's pre-existing "Booked via <Network>" convention on the same free-text column.
 *
 * Kept dependency-free (no React/UI imports) so it can be imported from both the picker
 * component and plain server-side/test code.
 */

/**
 * `live`: the source is read at request time and its content may not be stored (VD-1, ledger
 * `2026-10-18-viator-direct-live` — the Viator Partner API, Basic Access). An add from a live source
 * carries the title and the "Partner: <Network>" marker only: no partner price, no partner description.
 */
export const PARTNER_NETWORKS: { key: string; label: string; path: string; live?: boolean }[] = [
  { key: "tiqets", label: "Tiqets", path: "/api/catalog/tiqets" },
  { key: "wegotrip", label: "WeGoTrip", path: "/api/catalog/wegotrip" },
  { key: "viator", label: "Viator", path: "/api/viator/live/products", live: true },
  { key: "activities-gyg", label: "GetYourGuide", path: "/api/catalog/activities-gyg" },
  { key: "klook", label: "Klook", path: "/api/catalog/klook" },
];

const PARTNER_PREFIX_RE = /^Partner:\s*([^—\n]+?)(?:\s*—|\s*$)/;

/** Reads the "Partner: <Network>" marker written by the add paths below. Returns null for
 *  anything else — never guesses a network from unrelated text (§13). */
export function parsePartnerSource(description?: string | null): { network: string } | null {
  if (!description) return null;
  const m = PARTNER_PREFIX_RE.exec(description);
  if (!m) return null;
  const network = m[1].trim();
  return network ? { network } : null;
}

/** The write an add carries from a picked partner row. A live source stores nothing of the partner's. */
export function partnerAddFields(
  network: { label: string; live?: boolean },
  item: { description?: string | null; price?: number | null },
): { description: string; estimatedCost?: string } {
  if (network.live) return { description: buildPartnerDescription(network.label, null) };
  return {
    description: buildPartnerDescription(network.label, item.description),
    estimatedCost: item.price != null ? String(item.price) : undefined,
  };
}

export function buildPartnerDescription(networkLabel: string, raw?: string | null): string {
  const trimmed = raw?.trim();
  return trimmed ? `Partner: ${networkLabel} — ${trimmed}` : `Partner: ${networkLabel}`;
}
