/**
 * CAP-2 Phase 3 (dispatch ruling 5; ledger `2026-11-06-cap2-phase3-plan-actions`): the ONE place a browse tile's
 * save / book / hire / more-info words and visibility are decided. `PlanActions` renders from this; a card passes its
 * intent (the item, the book variant its listing's booking mode gives, its handlers) and never types a label or reads
 * the mode for these four outputs itself.
 *
 * Outputs, and nothing else: Save to plan (when placeable) · More info (per-site config; OFF on bento tiles — row 302b)
 * · Book (open mode only — Lane 2's `bookingActionsShown`) · Hire (open mode only, and only once the area has an
 * approved expert — the public guest-capabilities read). Ask, Apply, Get this trip, View profile and partner links are
 * NOT PlanActions outputs (ruling Nov 6) and stay on their cards.
 *
 * Book words follow the listing's booking mode (ruling Nov 6, "mode-honest"): a request-mode listing is never an
 * instant purchase (LD 49), so it never says "Book".
 *
 * WORDING: every label below is HELD for "Wording approved — Leon" on the Phase 3 PR. The ones marked "approved" were
 * approved before this lane and are only moved here.
 */
import { ADD_COPY, addLabel } from "./add-to-plan";
import { STAY_HERE_LABEL, STAY_RATES_SEE } from "./stay-card";
import { CN1_COPY } from "@shared/cn1-copy";
import type { SignupMode } from "./signup-mode";
import { planItemRefFromFeedItem } from "@shared/plan-item-ref";
import { savedRefKey } from "./saved-refs";

export const PLAN_ACTIONS_COPY = {
  /**
   * Cut-list #1 slice C (Wording approved — Leon, Nov 10): the add action's ONE label on every tile, every mode —
   * "Add to plan" (or "Add to Day {n}", `addLabel`). Supersedes the Nov 6 "Save to plan" for the add action.
   */
  saveToPlan: ADD_COPY.addToPlan,
  /** Slice C (Wording approved — Leon, Nov 10, 11:44 AM ET): the add once the server confirmed the row. */
  savedToPlan: ADD_COPY.added,
  /** HELD */
  moreInfo: "More info",
  /** HELD — instant booking */
  book: "Book",
  /** HELD — existing words, request-mode listing or the booking-agent rail */
  requestToBook: "Request to book",
  /** HELD — existing words, custom-quote listing */
  requestQuote: "Request a quote",
  /** HELD — existing words, a partner's own booking */
  bookOnPartner: "Book on partner",
  /** HELD — existing words, a platform listing whose booking mode the tile does not carry (the detail page decides) */
  checkAvailability: "Check availability",
  /** HELD — existing approved stay words (S1), now a Book variant */
  stayHere: STAY_HERE_LABEL,
  /** HELD — existing approved stay words (S1-d-2), now a Book variant */
  seeRates: STAY_RATES_SEE,
  /** HELD — existing words, the booking-agent request after it is sent */
  requested: "Requested",
  /** HELD — existing approved CN-1 words, now the Hire output */
  hire: CN1_COPY.hireCta,
  /** HELD — the waitlist-mode recommendation card's one action (ruling Nov 6) */
  browseCategory: (category: string) => `Browse ${category}`,
} as const;

/** The add action's label: "Add to plan" (or "Add to Day {n}"), then "Added ✓" once the server confirmed the row. */
export function saveLabel(saved: boolean, dayNumber?: number | null): string {
  return addLabel({ added: saved, dayNumber });
}

export type BookVariant = "instant" | "request" | "quote" | "partner" | "availability" | "stay_here" | "see_rates";

/** Pure: a Book variant's words. */
export function bookLabel(variant: BookVariant, opts: { done?: boolean } = {}): string {
  if (opts.done) return PLAN_ACTIONS_COPY.requested;
  switch (variant) {
    case "instant":
      return PLAN_ACTIONS_COPY.book;
    case "request":
      return PLAN_ACTIONS_COPY.requestToBook;
    case "quote":
      return PLAN_ACTIONS_COPY.requestQuote;
    case "partner":
      return PLAN_ACTIONS_COPY.bookOnPartner;
    case "availability":
      return PLAN_ACTIONS_COPY.checkAvailability;
    case "stay_here":
      return PLAN_ACTIONS_COPY.stayHere;
    case "see_rates":
      return PLAN_ACTIONS_COPY.seeRates;
  }
}

/** The parts of a server buy action (shared/buy-action.ts) the mapping reads. */
export interface BuyActionLike {
  primary: { kind: string };
  refusal?: { reason?: string } | null;
}

/**
 * Pure: which PlanActions output a listing's server buy action becomes, and its Book variant.
 *   book → Book "instant" · request_to_book / agent_rail → "request" · request_quote (or no published price) → "quote"
 *   hire → the Hire output · add_to_plan → Save only · message / none / not available → nothing here.
 */
export function planActionFromBuyAction(
  buy: BuyActionLike | null | undefined,
): { output: "book"; variant: BookVariant } | { output: "hire" } | { output: "save" } | null {
  if (!buy) return null;
  const kind = buy.primary?.kind;
  if (buy.refusal?.reason === "not_available") return null;
  if (kind === "request_quote" || buy.refusal?.reason === "no_published_price") return { output: "book", variant: "quote" };
  if (kind === "book") return { output: "book", variant: "instant" };
  if (kind === "request_to_book" || kind === "agent_rail") return { output: "book", variant: "request" };
  if (kind === "hire") return { output: "hire" };
  if (kind === "add_to_plan") return { output: "save" };
  return null;
}

/** What the public guest-capabilities read answers (GET /api/public/guest-capabilities). */
export interface GuestCapabilities {
  mode?: SignupMode | string | null;
  actions?: { save?: boolean; book?: boolean; hire?: boolean } | null;
}

/** A site's fixed config. More info is per site, and OFF on bento tiles (row 302b stands). */
export interface PlanActionsSiteConfig {
  moreInfo: boolean;
}

export const PLAN_ACTIONS_SITES = {
  bento: { moreInfo: false },
  recommendation: { moreInfo: false },
  catalogue: { moreInfo: true },
  anchor: { moreInfo: false },
  storefrontPanel: { moreInfo: false },
  landingHero: { moreInfo: false },
  curated: { moreInfo: false },
  deals: { moreInfo: false },
  discoverService: { moreInfo: false },
  storefrontOffering: { moreInfo: false },
} as const satisfies Record<string, PlanActionsSiteConfig>;

export type PlanActionsSite = keyof typeof PLAN_ACTIONS_SITES;

/** What a card asks for. Each part is present only when the card has that action at all. */
export interface PlanActionsIntent {
  save?: { placeable: boolean } | null;
  book?: { variant: BookVariant } | null;
  hire?: Record<string, never> | { available?: true } | null;
  moreInfo?: Record<string, never> | { available?: true } | null;
  /** The waitlist-mode recommendation browse (ruling Nov 6): a More info that names its category. */
  browse?: { category: string } | null;
}

export interface PlanActionsVisible {
  save: boolean;
  book: boolean;
  hire: boolean;
  moreInfo: boolean;
  browse: boolean;
}

/**
 * Pure, fail-closed: which outputs draw.
 *   Book — open mode on the shared mode read (`bookingActionsShown`, dispatch ruling 6), so an unread mode hides it.
 *   Hire — open mode AND the guest-capabilities answer's `hire` (an approved expert in the area); unread ⇒ hidden.
 *   Save — placeable. More info — the site's config. Browse — the waitlist-mode recommendation only.
 */
export function planActionsVisible(input: {
  mode: SignupMode;
  capabilities: GuestCapabilities | null | undefined;
  site: PlanActionsSite;
  intent: PlanActionsIntent;
}): PlanActionsVisible {
  const open = input.mode === "open";
  const caps = input.capabilities?.actions ?? {};
  const cfg: PlanActionsSiteConfig = PLAN_ACTIONS_SITES[input.site];
  return {
    save: !!input.intent.save?.placeable,
    book: !!input.intent.book && open,
    hire: !!input.intent.hire && open && input.capabilities?.mode === "open" && caps.hire === true,
    moreInfo: !!input.intent.moreInfo && cfg.moreInfo,
    browse: !!input.intent.browse && !open,
  };
}

/** The one primary on a compact tile: Book when it draws, else Save, else Hire, else the browse (row 302b: one primary). */
export function planActionsPrimary(v: PlanActionsVisible): keyof PlanActionsVisible | null {
  if (v.book) return "book";
  if (v.save) return "save";
  if (v.hire) return "hire";
  if (v.browse) return "browse";
  if (v.moreInfo) return "moreInfo";
  return null;
}

export const GUEST_CAPABILITIES_ROUTE = "/api/public/guest-capabilities";

/** The URL for a tile's area; a tile with no city still asks (Hire then answers false). */
export function guestCapabilitiesUrl(city: string | null | undefined): string {
  const c = typeof city === "string" ? city.trim() : "";
  return c ? `${GUEST_CAPABILITIES_ROUTE}?city=${encodeURIComponent(c)}` : GUEST_CAPABILITIES_ROUTE;
}

/**
 * The save part of a card's intent, from the add payload it already builds: placeable when the payload names its own
 * row (a PlanItemRef can be built — the same mapping the save rails send), and the key "Saved to plan" is read by.
 */
export function feedSaveIntent(payload: unknown, city: string | null | undefined): { placeable: boolean; savedKey: string | null } {
  const ref = planItemRefFromFeedItem(payload as any, city ?? null);
  return { placeable: !!ref, savedKey: savedRefKey(ref) };
}
