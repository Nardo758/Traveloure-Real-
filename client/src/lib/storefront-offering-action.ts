/**
 * STOREFRONT OFFERING CARD — the primary action button's label, decided ONCE.
 *
 * Ledger `2026-09-25-storefront-booking-actions`. The decision-maker asked for "a Button so the
 * user can book a consulting session" on the expert storefront; the card already renders a CTA
 * string authored by `StorefrontOfferingCard` itself (the `ld23-buy-action-gap` note in
 * `storefront.tsx`). This module does NOT re-decide buyability — `resolveBuyAction`
 * (`@shared/buy-action`) is still the sole author of WHETHER and HOW a row can be bought (ruling
 * 9 / LD 42), and the server ships its answer on every storefront listing (`buyAction`). This
 * module only chooses which SENTENCE to put on the button for the six shapes the decision-maker's
 * request distinguishes, reading the resolver's own `primary.kind` / `refusal.reason` plus the
 * two fundamentals derivations the resolver already calls (`needsScheduling`, delivery method) —
 * never a second buyability test (§18 rule 1).
 *
 * §13: an absent fact never becomes a guessed label. A row the resolver could not classify keeps
 * the existing "View & book" wording rather than a label invented from a fact nobody stated.
 */
import type { BuyAction } from "@shared/buy-action";
import { needsScheduling, type FundamentalsShape } from "@shared/service-fundamentals";
import { QA_SESSION_OFFERING_KEY } from "@shared/live-availability";

/** The listing facts this mapper reads. Every field mirrors a storefront payload column. */
export interface StorefrontOfferingActionRow {
  deliveryMethod?: string | null;
  productShape?: string | null;
  priceType?: string | null;
  /** `provider_services.expert_offering_type_key` — `"ask_me_anything"` names a Q&A Session. */
  expertOfferingTypeKey?: string | null;
}

const SCHEDULED_CONSULT_METHODS = new Set(["call", "video"]);

/**
 * The button's label. `buyAction` is the row's server-resolved descriptor (`undefined` only for a
 * caller — e.g. the Ready-Made lane — the server never resolved one for; that caller keeps its
 * own existing CTA and never calls this mapper).
 */
export function storefrontOfferingActionLabel(
  row: StorefrontOfferingActionRow,
  buyAction: BuyAction | undefined,
): string {
  if (!buyAction) return "View & book";

  const isQaSession =
    row.expertOfferingTypeKey === QA_SESSION_OFFERING_KEY && row.deliveryMethod === "async_messaging";
  if (isQaSession) return "Start a Q&A Session";

  const noPublishedPrice =
    buyAction.refusal?.reason === "no_published_price" || row.priceType === "custom_quote";
  if (noPublishedPrice) return "Request a quote";

  const isScheduledConsult =
    !!row.deliveryMethod && SCHEDULED_CONSULT_METHODS.has(row.deliveryMethod);
  const shape: FundamentalsShape = { deliveryMethod: row.deliveryMethod, productShape: row.productShape };
  const scheduled = needsScheduling(shape);

  if (isScheduledConsult && scheduled) {
    if (buyAction.primary.kind === "book") return "Book a session";
    if (buyAction.primary.kind === "request_to_book") return "Request a session";
  }

  if (buyAction.primary.kind === "add_to_plan") return "Add to my plan";

  // Any other resolved shape (ready-made, advisor, partner, or a §13 fallback this card does
  // not render through this mapper) keeps the card's existing default.
  return "View & book";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Parse a `YYYY-MM-DD` (or ISO) date as a calendar day — no timezone shift. */
function calendarDay(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const m = Number(match[2]) - 1;
  if (m < 0 || m > 11) return null;
  return { y: Number(match[1]), m, d: Number(match[3]) };
}

/** "2:00 PM" from a "HH:MM" wall-clock string; `null` for anything unparsable. */
function formatWallClockTime(hhmm: string): string | null {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) return null;
  let h = Number(match[1]);
  const min = match[2];
  if (h > 23) return null;
  const suffix = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${min} ${suffix}`;
}

export interface NextAvailableLike {
  date: string;
  startTime: string | null;
}

/**
 * "Next available: Nov 8, 2:00 PM (Asia/Tokyo)" — the storefront card's own line. Mirrors the
 * service-detail zone convention (`formatStartWindow`, `service-good-to-know.ts`): a stated IANA
 * zone is appended, but — unlike that helper's "(provider's local time)" default — an UNKNOWN
 * zone appends NOTHING (§13: "next available" is a date/time fact stated plainly; claiming a
 * zone nobody declared is the one thing this line must not do).
 */
export function formatNextAvailable(
  slot: NextAvailableLike | null | undefined,
  timezone?: string | null,
): string | null {
  if (!slot) return null;
  const day = calendarDay(slot.date);
  if (!day) return null;
  let text = `${MONTHS[day.m]} ${day.d}`;
  const time = slot.startTime ? formatWallClockTime(slot.startTime) : null;
  if (time) text += `, ${time}`;
  if (timezone?.trim()) text += ` (${timezone.trim()})`;
  return `Next available: ${text}`;
}
