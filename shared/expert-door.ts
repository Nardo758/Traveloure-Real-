/**
 * THE EXPERT DOOR — the pure rules (ledger `2026-09-29-expert-door`; decision-maker dispatch Sep 29,
 * 2026, "expert door: choose an expert after 'Get a local expert'").
 *
 * After "Get a local expert" the slip asks ONE question — "How much help do you want?" — and each
 * answer is a set of `expert_offering_types` keys, read from the ONE key→tier map
 * (`EXPERT_OFFERING_TIERS`, §18 rule 1). The two offering catalogs are never merged (§4): these are
 * EXPERT keys only.
 *
 *   check     — "Check my plan"      — the advisory tier, less Ask-Me-Anything
 *   plan      — "Plan it with me"    — the planning tier
 *   handle    — "Handle it for me"   — the coordination tier (a quote where no price is published)
 *   question  — "I just have a question" — Ask-Me-Anything only
 *
 * No imports but the tier map, so the client bundle, the server and a `node:test` unit share it.
 * §13 on every figure: a band is the real range of published prices on live, gated listings in
 * the plan's own market — no listing, no number; never a fee-table rate presented as a price.
 */
import { EXPERT_OFFERING_TIERS, type ExpertTier } from "./expert-offerings";

export const HELP_LEVELS = ["check", "plan", "handle", "question"] as const;
export type HelpLevel = (typeof HELP_LEVELS)[number];

export const ASK_ME_ANYTHING_KEY = "ask_me_anything";

const LEVEL_TIER: Record<Exclude<HelpLevel, "question">, ExpertTier> = {
  check: "advisory",
  plan: "planning",
  handle: "coordination",
};

export function isHelpLevel(v: unknown): v is HelpLevel {
  return typeof v === "string" && (HELP_LEVELS as readonly string[]).includes(v);
}

/** The offering keys a help level admits. Unknown keys (NULL, a key the map does not carry) admit nothing. */
export function offeringKeyMatchesLevel(key: string | null | undefined, level: HelpLevel): boolean {
  if (!key) return false;
  if (level === "question") return key === ASK_ME_ANYTHING_KEY;
  if (key === ASK_ME_ANYTHING_KEY) return false;
  return EXPERT_OFFERING_TIERS[key] === LEVEL_TIER[level];
}

/** The funnel's tier word for a level (`expert_help_level_chosen.tier`). */
export function levelTier(level: HelpLevel): ExpertTier | "ask_me_anything" {
  return level === "question" ? "ask_me_anything" : LEVEL_TIER[level];
}

export interface PricedListing {
  price: string | number | null;
  showPrice?: boolean | null;
}

export type Band =
  | { kind: "range"; min: number; max: number }
  | { kind: "quote" }
  | { kind: "none" };

const publishedPrice = (l: PricedListing): number | null => {
  if (l.showPrice === false) return null;
  const n = Number(l.price);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * The band a level's card renders: the min–max of PUBLISHED prices on the eligible listings.
 * Listings with no published price (a quote-only or hidden price) make the band "quote" only when
 * NO listing publishes one; no listing at all is "none" — the card then shows no number (§13).
 */
export function bandFor(listings: readonly PricedListing[]): Band {
  if (!listings.length) return { kind: "none" };
  const prices = listings.map(publishedPrice).filter((p): p is number => p !== null);
  if (!prices.length) return { kind: "quote" };
  return { kind: "range", min: Math.min(...prices), max: Math.max(...prices) };
}

/** "$80", "$80–$240", "By quote", or null (nothing to say). USD — `provider_services.price` carries no currency. */
export function bandLabel(band: Band): string | null {
  const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
  if (band.kind === "none") return null;
  if (band.kind === "quote") return "By quote";
  return band.min === band.max ? usd(band.min) : `${usd(band.min)}–${usd(band.max)}`;
}

export interface PickerCandidate<L extends { offeringTypeKey: string | null }> {
  expertId: string;
  listings: readonly L[];
}

/**
 * The picker's selection, pure: an expert appears only when the BYLINE GATE passes for the plan's
 * market (injected — the one gate, `checkBylineEligibility`, never re-derived) AND they list at
 * least one offering for the level. Each surviving expert carries only the listings that match.
 */
export async function selectPickerExperts<L extends { offeringTypeKey: string | null }>(
  candidates: readonly PickerCandidate<L>[],
  level: HelpLevel,
  gate: (expertId: string) => Promise<boolean>,
): Promise<Array<{ expertId: string; listings: L[] }>> {
  const out: Array<{ expertId: string; listings: L[] }> = [];
  for (const c of candidates) {
    const listings = c.listings.filter((l) => offeringKeyMatchesLevel(l.offeringTypeKey, level));
    if (!listings.length) continue;
    if (!(await gate(c.expertId))) continue;
    out.push({ expertId: c.expertId, listings });
  }
  return out;
}

/** The empty state's sentence, naming the market (§13 — never "0 experts"). */
export function noExpertLine(cityName: string | null): string {
  return cityName ? `No local expert offers this in ${cityName} yet` : "No local expert offers this for this plan's city yet";
}
