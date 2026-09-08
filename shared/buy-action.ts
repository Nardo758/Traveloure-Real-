/**
 * THE BUY ACTION — the ONE resolver of what a listing's buy affordance IS, from its `bookingMode`.
 * Ledger `2026-09-08-recorded-cleanups` (§18 rule 1).
 *
 * WHY THIS EXISTS. `provider_services.booking_mode` (`instant` | `request` | `hidden`, app-enforced
 * with no DB CHECK) decides whether a card offers a booking, a request, or no booking at all. That
 * decision was being made in THREE places with three shapes: `OfferingCard`, the live
 * `StorefrontOfferingCard` inside `client/src/pages/storefront.tsx`, and `deriveBookingCta` in
 * `client/src/lib/catalog-preview-presentation.ts`. Three authors of one rule is the
 * derivation-drift class §18 rule 1 names, and it is how a listing starts saying "Request to book"
 * on the storefront and "Book" in the owner's own preview of that same card.
 *
 * WHAT IT DECIDES, AND WHAT IT DELIBERATELY DOES NOT.
 * It answers ONE question: *which kind of action does this listing offer, and what is it called?*
 * It does NOT decide styling (solid/outline, arrows, placement) — those are each surface's own, and
 * folding them in here would make one module the author of three surfaces' visual grammar. Callers
 * therefore switch on `kind`, never on `bookingMode`.
 *
 * §13 — `hidden` IS AN ANSWER, NOT AN ABSENCE. A listing whose owner hid the booking affordance
 * still has a way to be reached: `kind: "enquire"`. It is not a buy action, which is exactly why it
 * carries its own kind rather than being a third label on the book branch — a caller that renders
 * only buy actions can drop it, and a caller that renders a contact affordance can keep it.
 *
 * NULL / undefined is treated as `instant`, matching the server, which RESOLVES `booking_mode` to a
 * concrete value on an owner's own read; the fallback covers a row handed to a client before that
 * resolution and is stated here once rather than defaulted three times.
 */

export type BookingMode = "instant" | "request" | "hidden";

export type BuyActionKind =
  /** An immediate booking. The caller's own verb (e.g. "View & book →") wins if it supplies one. */
  | "book"
  /** A request the owner must accept. */
  | "request"
  /** No booking affordance at all — a contact/enquiry route instead. Not a buy action. */
  | "enquire";

export interface BuyAction {
  kind: BuyActionKind;
  /** The action's own name. A caller may add its own affix (an arrow), never its own noun. */
  label: string;
}

export const BUY_ACTION_LABELS: Record<BuyActionKind, string> = {
  book: "Book",
  request: "Request to book",
  enquire: "Enquire",
};

/**
 * Resolve a listing's buy action.
 *
 * @param bookingMode the listing's own `booking_mode`; NULL/undefined ⇒ `instant` (see the header).
 * @param options.instantLabel a surface's existing verb for the `instant` case — passed by callers
 *        that already carry a per-row CTA string (the storefront's "Check dates →" / "View & book →"
 *        / vacation-mode "View listing →"). It is NOT a general label override: it applies to
 *        `instant` only, so it can never rename a request or an enquiry into a booking.
 */
export function resolveBuyAction(
  bookingMode?: BookingMode | null,
  options?: { instantLabel?: string },
): BuyAction {
  const mode = bookingMode ?? "instant";
  if (mode === "hidden") return { kind: "enquire", label: BUY_ACTION_LABELS.enquire };
  if (mode === "request") return { kind: "request", label: BUY_ACTION_LABELS.request };
  const instant = options?.instantLabel?.trim();
  return { kind: "book", label: instant && instant.length > 0 ? instant : BUY_ACTION_LABELS.book };
}
