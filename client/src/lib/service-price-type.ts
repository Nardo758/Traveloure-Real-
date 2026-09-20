/**
 * SERVICE WIZARD PRICE-TYPE MAPPERS — the round trip between `ServiceForm`'s display labels and
 * `provider_services.price_type` (the DB/wire vocabulary: fixed, range, per_person, hourly,
 * package_tiers, per_event, custom_quote).
 *
 * EXTRACTED, NOT COPIED (§18 rule 1). These were private to `ServiceForm.tsx`; pulled out so a
 * plain `node:test` pin can prove the round trip without importing the whole (React, hooks,
 * router) component module — the same reasoning `service-form-required.ts`'s own header states
 * for that extraction.
 *
 * `custom_quote` (ledger `2026-09-20-quote-listing-goes-live`) is the wizard's half of the fix
 * that let a quote-approve listing (Locked Decision 49 — a custom quote is a `service_quotes` row,
 * an issued price per request, NEVER a number on the listing) reach `active` at all:
 * `server/services/listing-price-gate.ts` now exempts it server-side; this is the only place in
 * the wizard that can SELECT it.
 */

export type ServicePriceTypeDisplay =
  | "Fixed"
  | "Range"
  | "Per-person"
  | "Hourly"
  | "Package tiers"
  | "Per-event"
  | "Custom quote";

export function mapPriceTypeFromBackend(raw: string | null | undefined): ServicePriceTypeDisplay {
  switch (raw) {
    case "hourly":        return "Hourly";
    case "package_tiers": return "Package tiers";
    case "per_event":     return "Per-event";
    case "range":         return "Range";
    case "per_person":    return "Per-person";
    case "custom_quote":  return "Custom quote";
    default:              return "Fixed";
  }
}

export function mapPriceTypeToBackend(display: ServicePriceTypeDisplay): string {
  switch (display) {
    case "Hourly":         return "hourly";
    case "Package tiers":  return "package_tiers";
    case "Per-event":      return "per_event";
    case "Range":          return "range";
    case "Per-person":     return "per_person";
    case "Custom quote":   return "custom_quote";
    default:               return "fixed";
  }
}

export function mapDefaultPriceTypeHint(hint: string): ServicePriceTypeDisplay | null {
  switch (hint) {
    case "hourly":         return "Hourly";
    case "package_tiers":  return "Package tiers";
    case "per_event":      return "Per-event";
    case "range":          return "Range";
    case "per_person":     return "Per-person";
    case "fixed":          return "Fixed";
    case "custom_quote":   return "Custom quote";
    default:               return null;
  }
}
