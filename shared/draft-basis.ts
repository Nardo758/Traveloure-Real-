/**
 * THE FREE DRAFT'S BASIS — the pure rules (Track A step A5; ledger `2026-09-29-a5-draft-open-set`).
 *
 * Product map §M5 (Part 2 M), R126 (`2026-09-26-open-sets-not-non-empty`) and the A5 dispatch
 * (Sep 29, 2026: "draft starts from the best-fit hotel with the stay slot held open (R126); with no
 * hotel and no set it asks"):
 *
 *   · HELD SLOTS (R126). Every OPEN option set holds its slot — its category, on its day when it has
 *     one, else on every day. The draft places no item of that category there, never picks one of
 *     the set's options, and never closes or chooses the set. An empty-slot set does not make the
 *     slip non-empty (the eligibility count is unchanged).
 *   · BUILT AROUND (§M5). A Trip whose anchor is lodging (M7) is built outward from its open lodging
 *     set: the option with the best plan-fit when plan-fit ranks one, and the draft SAYS which. On an
 *     empty slip there are no stops to score against, so nothing ranks — and then the draft is built
 *     around EVERY located option equally, naming them all, rather than singling one out by a rank
 *     that does not exist (§13). The hotels are a geography hint only: no anchor label, no metric, no
 *     choice between them (golden path Appendix B Q2's default).
 *   · ASKS (§M5 / M1). A lodging-anchored Trip with no place to stay and no open set is not drafted:
 *     the server answers `anchor_needed` with the anchor question. The traveler's own answer "draft
 *     without a hotel" (`withoutAnchor`) is how a skipped question is recorded — never answered on
 *     their behalf, and the draft then says it has no anchor (`none_asked`).
 *   · Everything else (other groups, a fixed-item Trip) drafts as before; its basis is not recorded
 *     because this lane does not decide one (§13 — omitted, never guessed).
 */

export type DraftBasisKind = "chosen_anchor" | "open_anchor_set" | "none_asked";

export interface DraftOption {
  title: string;
  neighborhood: string | null;
  latitude: number | null;
  longitude: number | null;
  /** The server's plan-fit rank (1 = best) when plan-fit scored it; null when it did not. */
  fitRank: number | null;
}

export interface DraftOpenSet {
  id: string;
  categoryKey: string | null;
  dayNumber: number | null;
  anchorRole: string | null;
  options: DraftOption[];
}

export interface HeldSlot {
  categoryKey: string;
  /** NULL = every day of the plan. */
  dayNumber: number | null;
}

/** Open sets hold their slots. A set with no category holds nothing it could name (§13). */
export function heldSlotsFor(openSets: readonly DraftOpenSet[]): HeldSlot[] {
  const out: HeldSlot[] = [];
  const seen = new Set<string>();
  for (const s of openSets) {
    if (!s.categoryKey) continue;
    const key = `${s.categoryKey}|${s.dayNumber ?? "all"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ categoryKey: s.categoryKey, dayNumber: s.dayNumber });
  }
  return out;
}

/**
 * The item types a held category covers. A category this table does not name is still passed to the
 * model as a held slot; it simply cannot be filtered after the fact, and the code says so.
 */
export const HELD_CATEGORY_ITEM_TYPES: Readonly<Record<string, readonly string[]>> = {
  accommodation: ["accommodation", "hotel", "hostel", "lodging", "resort", "ryokan", "guesthouse", "inn", "boutique", "luxury"],
  dining: ["meal", "breakfast", "lunch", "dinner", "restaurant", "dining", "food"],
  transport: ["transport", "transfer", "taxi", "train"],
};

/** Drop drafted items a held slot forbids. Returns both halves so the caller can count them. */
export function withoutHeldItems<T extends { type: string; dayNumber: number }>(
  items: readonly T[],
  held: readonly HeldSlot[],
): { kept: T[]; dropped: T[] } {
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const it of items) {
    const t = (it.type || "").toLowerCase();
    const blocked = held.some((h) => {
      const types = HELD_CATEGORY_ITEM_TYPES[h.categoryKey];
      return !!types && types.includes(t) && (h.dayNumber === null || h.dayNumber === it.dayNumber);
    });
    (blocked ? dropped : kept).push(it);
  }
  return { kept, dropped };
}

export type DraftBasis =
  | { kind: "open_anchor_set"; setId: string; builtAround: DraftOption[]; ranked: boolean }
  | { kind: "none_asked" }
  | { kind: "not_anchored" };

export type DraftBasisDecision = { ask: true } | { ask: false; basis: DraftBasis };

/**
 * THE DECISION. `lodgingAnchored` = the plan is a Trip whose anchor is lodging (M7, including the
 * plain-trip fallback). `hasStay` = the plan already holds an accommodation item (never true on an
 * empty slip, stated for completeness). `withoutAnchor` = the traveler answered the question with
 * "draft without a hotel".
 */
export function decideDraftBasis(input: {
  lodgingAnchored: boolean;
  hasStay: boolean;
  openSets: readonly DraftOpenSet[];
  withoutAnchor: boolean;
}): DraftBasisDecision {
  if (!input.lodgingAnchored || input.hasStay) return { ask: false, basis: { kind: "not_anchored" } };
  const lodging =
    input.openSets.find((s) => s.categoryKey === "accommodation" && s.anchorRole === "primary") ??
    input.openSets.find((s) => s.categoryKey === "accommodation");
  if (lodging) {
    const located = lodging.options.filter((o) => o.latitude !== null && o.longitude !== null);
    const best = located.find((o) => o.fitRank === 1);
    return {
      ask: false,
      basis: { kind: "open_anchor_set", setId: lodging.id, builtAround: best ? [best] : located, ranked: !!best },
    };
  }
  if (input.withoutAnchor) return { ask: false, basis: { kind: "none_asked" } };
  return { ask: true };
}

/** The recorded basis (E6 `draftBasis`), or null when this lane does not decide one. */
export function draftBasisKey(basis: DraftBasis): DraftBasisKind | null {
  return basis.kind === "not_anchored" ? null : basis.kind;
}

export const ANCHOR_NEEDED_ERROR = "anchor_needed";
export const ANCHOR_NEEDED_STATUS = 409;
export const ANCHOR_NEEDED_MESSAGE =
  "Where are you staying? The draft is built around it. Add up to three places you're considering, or draft without a hotel.";

/**
 * The prompt lines the generator reads. Hotels are named as a GEOGRAPHY HINT only; the held slots
 * are stated as constraints. Empty string when there is nothing to say (the prompt is unchanged).
 */
export function draftBasisPromptBlock(basis: DraftBasis, held: readonly HeldSlot[]): string {
  const lines: string[] = [];
  if (basis.kind === "open_anchor_set" && basis.builtAround.length) {
    const names = basis.builtAround
      .map((o) => `${o.title}${o.neighborhood ? ` (${o.neighborhood})` : ""}${o.latitude !== null ? ` at ${o.latitude.toFixed(4)},${o.longitude!.toFixed(4)}` : ""}`)
      .join("; ");
    lines.push(
      basis.builtAround.length === 1
        ? `The traveler is considering staying at: ${names}. Build each day outward from there so the days are easy to reach from it.`
        : `The traveler has not chosen where to stay; they are considering: ${names}. Build days that are easy to reach from all of them. Do not recommend or choose between these places.`,
    );
  }
  if (basis.kind === "none_asked") lines.push(NO_HOTEL_PROMPT_LINE);
  for (const h of held) {
    const when = h.dayNumber === null ? "on any day" : `on day ${h.dayNumber}`;
    lines.push(`Do not add any ${h.categoryKey} item ${when}: the traveler is still deciding it themselves.`);
  }
  return lines.length ? `\nPLANNING CONSTRAINTS:\n${lines.map((l) => `- ${l}`).join("\n")}\n` : "";
}

/**
 * What the traveler is told the draft was built around (M5: "says which"). §13: nothing when the
 * basis names nothing.
 */
export function draftBasisLine(basis: DraftBasis): string | null {
  if (basis.kind === "none_asked") return "Drafted without a place to stay — add one and Optimize builds around it.";
  if (basis.kind !== "open_anchor_set") return null;
  const n = basis.builtAround.length;
  if (n === 0) return "Your places to stay aren't on the map yet, so the draft couldn't build around them. Where you'll stay is left open.";
  if (n === 1) return `Built around ${basis.builtAround[0].title}${basis.ranked ? ", the place that makes your days easiest" : ""}. Where you'll stay is still yours to choose.`;
  return `Built around the ${n} places you're considering. Where you'll stay is still yours to choose.`;
}

/**
 * A DRAFT WITH NO PLACE TO STAY HAS NO HOTEL IN IT (smoke test 4, item 4 — ledger
 * `2026-10-02-smoke4-draft-fixes`). A "Draft without a hotel" draft still opened with "Check-in &
 * Hotel Orientation" and closed with "Return to Hotel & Checkout": `none_asked` told the model
 * nothing, and nothing filtered it. Two layers, as for held slots: the prompt says so, and whatever
 * the model writes anyway is rewritten here — day 1's hotel item becomes the ARRIVAL, the last day's
 * the DEPARTURE, neither with hotel wording, and a hotel item on any other day is dropped (there is
 * no hotel to return to). Pure.
 */
export const NO_HOTEL_PROMPT_LINE =
  "The traveler has not chosen a place to stay. Do not add hotel check-in, check-out, return-to-hotel or hotel orientation items. Day 1 may begin with arriving in the city and the last day may end with departing; neither mentions a hotel.";

const HOTEL_ITEM_WORDING =
  /\bcheck[\s-]?(?:in|out)\b|\bcheckout\b|\bcheckin\b|\b(?:return|back|rest)\s+(?:to|at)\s+(?:the\s+|your\s+)?hotel\b|\bhotel\s+(?:orientation|check)/i;

export function isHotelItemTitle(title: string | null | undefined): boolean {
  return HOTEL_ITEM_WORDING.test(title ?? "");
}

export interface DehotelItem {
  dayNumber: number;
  title: string;
  description?: string | null;
  location?: string | null;
}

/**
 * Rewrites hotel-worded items for a plan with no place to stay. `lastDay` is the plan's last day
 * number. A one-day plan's check-OUT wording is the departure and anything else the arrival.
 */
export function withoutHotelWording<T extends DehotelItem>(
  items: readonly T[],
  lastDay: number,
  city: string | null | undefined,
): T[] {
  const place = (city ?? "").trim();
  const arrival = place ? `Arrival in ${place}` : "Arrival";
  const departure = place ? `Departure from ${place}` : "Departure";
  const out: T[] = [];
  let arrived = false;
  let departed = false;
  for (const it of items) {
    if (!isHotelItemTitle(it.title)) {
      out.push(it);
      continue;
    }
    const leaving = /check[\s-]?out|checkout/i.test(it.title);
    if (it.dayNumber === lastDay && (leaving || it.dayNumber !== 1)) {
      if (departed) continue;
      departed = true;
      out.push({ ...it, title: departure, description: "Leave for home or your next stop.", location: place || it.location || null });
    } else if (it.dayNumber === 1) {
      if (arrived) continue;
      arrived = true;
      out.push({ ...it, title: arrival, description: "Arrive and get your bearings.", location: place || it.location || null });
    }
    // Any other day, and a second arrival or departure: there is no hotel to go back to, so the
    // item is dropped rather than repeated.
  }
  return out;
}

/**
 * Smoke 5 item 10 (ledger `2026-10-03-smoke5-fixes`). Pure. Whether a no-hotel draft's arrival or
 * departure line is acceptable copy: our own rewrite ("Arrival in Kyoto" / "Departure from Kyoto"),
 * or a line the model wrote that names where the traveler actually arrives or leaves from — a
 * station, airport, port or terminal ("Arrive at Kyoto Station"). Neither may mention a hotel.
 */
export function isAcceptableArrivalLine(title: string, city: string | null | undefined, kind: "arrival" | "departure"): boolean {
  const t = (title ?? "").trim();
  if (!t || isHotelItemTitle(t) || /\b(hotel|ryokan|hostel|lodging|accommodation)\b/i.test(t)) return false;
  const place = (city ?? "").trim();
  const ours = kind === "arrival" ? (place ? `Arrival in ${place}` : "Arrival") : place ? `Departure from ${place}` : "Departure";
  if (t === ours) return true;
  const verb = kind === "arrival" ? /\barriv/i : /\b(depart|leav)/i;
  return verb.test(t) && /\b(station|airport|port|terminal)\b/i.test(t);
}
