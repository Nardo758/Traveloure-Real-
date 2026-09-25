/**
 * THE ONE price-unit derivation (CLAUDE.md §18 rule 1).
 *
 * Four surfaces each answered "what unit is this listing priced in?" for themselves — the Catalog
 * preview (`catalog-preview-presentation.ts`), the storefront row, the Distribute roster and the
 * listing page — and the listing page's copy was the one that had drifted: it had no `per_person`
 * branch at all, so a `priceType: "per_person"` listing rendered the generic "per service"
 * fall-through (production QA, 2026-09-13, the Napa Valley Wine Experience at $195). The comment
 * that fall-through carries records that the SAME hole was already found once for `per_night` and
 * patched one branch at a time — which is the shape of defect a single derivation exists to end.
 *
 * WHAT THIS MODULE OWNS: the DERIVATION — `(priceType, pricingUnit) → PriceUnit | null`.
 * WHAT IT DOES NOT OWN: the amount, its formatting, or any money decision. Nothing here reads a
 * price, and no server code reads this file.
 *
 * TWO PRESENTATIONS, ONE DERIVATION. A suffix form ("/person") and a phrase form ("per person")
 * are two legitimate spellings of one derived unit; they are tables over `PriceUnit`, never second
 * readings of `priceType`/`pricingUnit`. A surface with a third register (the listing page's
 * "billed by the hour") switches on the derived `PriceUnit`, not on the raw columns.
 *
 * §13 — WHAT UNKNOWN MAPS TO. `null` means NOT DERIVABLE, and it is the answer for: a null/absent
 * `priceType` and `pricingUnit`; the pricing MODELS that name no unit (`fixed`, `variable`,
 * `custom_quote`, `package_tiers`, `range`); and any string this table does not name. `null` is
 * never rendered as a unit. Each caller keeps its own honest fallback for that case ("Custom
 * quote", "contact the provider for pricing", or simply no suffix) — this module does not invent
 * one, because "what to say when we do not know" is a surface's copy decision, not a derivation.
 * A unit is also not a claim about a PRICE: a caller that has no positive amount must not print a
 * unit for it (the listing page gates on `priceNum > 0`).
 *
 * PRECEDENCE: `pricingUnit` before `priceType`. `pricingUnit` is the §17 property rung's own
 * answer ('per_night' = the price IS a nightly rate — `shared/schema.ts`), which is more specific
 * than the generic pricing model on `priceType`; all three pre-existing derivations already read
 * it first, and this preserves that.
 *
 * The value sets are the columns' own (`shared/schema.ts`): `priceType` carries
 * fixed | variable | custom_quote | hourly | package_tiers | per_event | range | per_person, and
 * `pricingUnit` is NULL | 'per_night' today. The extra `pricingUnit` spellings below
 * (`per_person`, `per_group`, `per_hour`) are carried verbatim from the Distribute roster's own
 * table so that surface's rendering is unchanged; they are not a claim that the column holds them.
 */

export type PriceUnit = "night" | "day" | "person" | "hour" | "event" | "group";

export interface PriceUnitInput {
  priceType?: string | null;
  pricingUnit?: string | null;
  /** Locked Decision 56: `provider_services.price_basis` — `per_person` reads as "per person". */
  priceBasis?: string | null;
}

/** The ONE derivation. `null` = not derivable; see §13 above for exactly what that covers. */
export function resolvePriceUnit(input: PriceUnitInput): PriceUnit | null {
  switch (input.pricingUnit) {
    case "per_night":
      return "night";
    // Locked Decision 54: "Text a Local" is sold by the day of cover.
    case "per_day":
      return "day";
    case "per_person":
      return "person";
    case "per_hour":
      return "hour";
    case "per_group":
      return "group";
  }
  // Locked Decision 56: a listing that SAYS its price is per person (`price_basis`) reads so; a
  // per-booking (or never-stated) basis adds no unit — the ordinary reading of a price.
  if (input.priceBasis === "per_person") return "person";
  switch (input.priceType) {
    case "per_person":
      return "person";
    case "hourly":
      return "hour";
    case "per_event":
      return "event";
  }
  return null;
}

/** Short spelling, as the card/roster suffix registers use it ("/hr", not "/hour"). */
const SHORT_WORD: Record<PriceUnit, string> = {
  night: "night",
  day: "day",
  person: "person",
  hour: "hr",
  event: "event",
  group: "group",
};

/** Long spelling, as the phrase register uses it ("per hour", not "per hr"). */
const LONG_WORD: Record<PriceUnit, string> = {
  night: "night",
  day: "day",
  person: "person",
  hour: "hour",
  event: "event",
  group: "group",
};

/** "night" | "person" | "hr" | "event" | "group" — the bare short word, for a caller composing
 *  its own separator (the listing page's "$195 / person"). */
export function priceUnitWord(unit: PriceUnit): string {
  return SHORT_WORD[unit];
}

/** Card/roster suffix: "/night", "/person", "/hr", "/event", "/group". `null` when not derivable. */
export function priceUnitSuffix(input: PriceUnitInput): string | null {
  const unit = resolvePriceUnit(input);
  return unit ? `/${SHORT_WORD[unit]}` : null;
}

/** Phrase form: "per night", "per person", "per hour", "per event", "per group". `null` when not
 *  derivable — the caller renders its own honest absence, never "per service". */
export function priceUnitPhrase(input: PriceUnitInput): string | null {
  const unit = resolvePriceUnit(input);
  return unit ? `per ${LONG_WORD[unit]}` : null;
}
