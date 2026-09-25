/**
 * OFFERING CARD ACTION — the primary action button's label, decided ONCE, for every card that
 * draws a platform listing (the storefront card and the Discover services card).
 *
 * Ledgers `2026-09-25-storefront-booking-actions` (the expert's "book a consulting session"
 * button) and `2026-09-25-provider-action-buttons` (the same button for every PROVIDER shape —
 * stays, rides, bundles, deposits, requests, quotes, hidden listings).
 *
 * THIS MODULE READS ONLY THE RESOLVED ACTION. `resolveBuyAction` (`@shared/buy-action`) is the
 * sole author of WHETHER and HOW a row can be bought (ruling 9 / LD 42), and it now also names
 * WHAT is being bought (`subject`) and whether its checkout takes a deposit (`deposit`). This
 * module maps `primary.kind` + `subject` + `deposit` + `refusal.reason` onto a SENTENCE and never
 * reads a listing column itself — a second reading of `productShape`, `priceType` or a category
 * key here would be the derivation-drift class §18 rule 1 names.
 *
 * §13: an absent fact never becomes a guessed label. A row the resolver could not classify keeps
 * a plain verb ("Book", "Request to book") or the card's "View & book"; a listing the resolver
 * says is not open for booking gets NO buy label at all (`null`) — the card offers Message only.
 */
import type { BuyAction } from "@shared/buy-action";

/** The label for a listing that cannot be classified and carries no resolved action. */
export const OFFERING_ACTION_DEFAULT_LABEL = "View & book";

/**
 * The button's label, or `null` when the resolver offers NO booking verb (`not_available` — not
 * live, or the provider chose `hidden`): the card then offers Message only, never a buy button
 * that leads to a page with nothing to press. `undefined` buyAction (a payload that resolved
 * none) keeps the card's existing default.
 */
export function offeringActionLabel(buyAction: BuyAction | undefined): string | null {
  if (!buyAction) return OFFERING_ACTION_DEFAULT_LABEL;
  const kind = buyAction.primary.kind;
  if (buyAction.refusal?.reason === "not_available" || kind === "none" || kind === "message") {
    return null;
  }

  if (kind === "request_quote" || buyAction.refusal?.reason === "no_published_price") {
    return "Request a quote";
  }

  const subject = buyAction.subject;
  const book = kind === "book";
  const request = kind === "request_to_book";

  if (book || request) {
    // A stay is chosen by its dates first; the detail page's range picker is where that happens.
    if (subject === "stay") return "Check dates";
    if (subject === "qa_session") return "Start a Q&A Session";
    if (book && buyAction.deposit) return "Reserve with deposit";
    switch (subject) {
      case "ride":
        return book ? "Book ride" : "Request a ride";
      case "bundle":
        return book ? "Book bundle" : "Request to book";
      case "session":
        return book ? "Book a session" : "Request a session";
      case "in_person":
        return book ? "Book now" : "Request to book";
      default:
        // artifact / async / unclassified — the plain verb, never a guessed noun.
        return book ? "Book" : "Request to book";
    }
  }

  if (kind === "add_to_plan") return "Add to my plan";

  // Any other resolved shape (ready-made, advisor, partner) is not authored through this mapper.
  return OFFERING_ACTION_DEFAULT_LABEL;
}

/**
 * Storefront name for the same mapping (kept so the storefront's call sites and the earlier
 * ledger row still read true). ONE implementation — it delegates.
 */
export function storefrontOfferingActionLabel(buyAction: BuyAction | undefined): string | null {
  return offeringActionLabel(buyAction);
}

/** True when the resolver offers no booking verb and the card should offer Message only. */
export function offeringActionIsMessageOnly(buyAction: BuyAction | undefined): boolean {
  return !!buyAction && offeringActionLabel(buyAction) === null;
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
 * Whether pressing the action button charges the traveler NOW (v2 fix, mockup review). "Book a
 * session" / "Start a Q&A Session" land on `checkout`; "Request a session" / "Request a quote"
 * never do — a request/quote mints no charge, so the card's "Secure checkout" badge must not sit
 * beside it (§13). `undefined` buyAction (no resolved action at all) charges nothing either.
 */
export function storefrontActionCharges(buyAction: BuyAction | undefined): boolean {
  return buyAction?.landing.store === "checkout";
}

/** Labels whose press lands on the detail page's booking panel (`#book`). */
const BOOK_INTENT_LABELS: ReadonlySet<string> = new Set([
  "Book a session",
  "Request a session",
  "Book now",
  "Request to book",
  "Book ride",
  "Request a ride",
  "Book bundle",
  "Reserve with deposit",
  "Book",
]);

export type OfferingIntentHash = "#book" | "#quote" | "#dates" | "";

/**
 * The booking-intent hash `service-detail.tsx` reads to scroll/focus the right control:
 * `#book` for a book/request verb, `#quote` for a request-a-quote row, `#dates` for a stay (the
 * date-range picker), none otherwise (a Q&A Session, an add-to-plan row, the default).
 */
export function storefrontOfferingIntentHash(label: string): OfferingIntentHash {
  if (BOOK_INTENT_LABELS.has(label)) return "#book";
  if (label === "Request a quote") return "#quote";
  if (label === "Check dates") return "#dates";
  return "";
}

/**
 * The full action-button href: the listing's own service-page href, plus a `?month=YYYY-MM`
 * hint carrying the EARLIEST slot's month (v2 fix — the mockup walkthrough found the calendar
 * opening on the current month while the button promised a later one), plus the intent hash.
 * The month hint is added ONLY for the `#book` intent and ONLY when a slot is actually known —
 * never invented for "Request a session", which by definition has none (§13).
 */
export function buildStorefrontActionHref(
  serviceHref: string,
  label: string,
  nextAvailable?: NextAvailableLike | null,
): string {
  const intentHash = storefrontOfferingIntentHash(label);
  const month = intentHash === "#book" && nextAvailable ? nextAvailable.date.slice(0, 7) : null;
  const monthQuery = month ? `${serviceHref.includes("?") ? "&" : "?"}month=${month}` : "";
  return `${serviceHref}${monthQuery}${intentHash}`;
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
