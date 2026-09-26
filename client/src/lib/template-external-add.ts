/**
 * WHERE AN EXPERIENCE-TEMPLATE PARTNER PICK GOES (gap RC-9, ledger `2026-09-26-rc9-external-cart-lines`).
 *
 * The template page's partner picks — a hotel, a Viator activity, a Fever event, a transfer, a
 * venue from the venue search — used to live ONLY in `sessionStorage["externalCart_<slug>"]`: a
 * per-tab copy that vanished on a tab or device change and that no server surface could see. They
 * now land on a durable rail, and THIS module is the one place that decides which (§18 rule 1).
 * PURE — no fetch, no storage — so every branch is pinned by
 * `client/src/lib/__tests__/template-external-add.test.ts`.
 *
 * Each pick names its KIND explicitly at its call site (never guessed from an id prefix):
 *
 *   hotel | activity | event → `POST /api/cart` as a CONTENT LINE (`@shared/cart-content-line`).
 *     That rail is taken EVEN WHEN A PLAN IS IN HAND: `POST /api/trips/:tripId/itinerary-items`
 *     deliberately omits `contentType`/`contentId` from its body schema (§19 — they are stamped
 *     server-side from the cart row), so adding there would drop the partner identity. The cart
 *     line carries it, and the ONE projection (`materializeCartLinesAsItems`, LD 39) turns it into
 *     a plan item when the traveler resolves or converts the cart. No price is sent (§14): the
 *     server allowlists the display envelope to name/description/city/imageUrl.
 *
 *   transfer → the destination transfers list offers "Add" ONLY on a priced option, and the only
 *     priced options are PLATFORM `provider_services` rows (`platform-<serviceId>`, see
 *     `getDestinationTransportOptions`). So a transfer IS a service line and takes the page's
 *     ordinary service rail (plan item with a plan in hand, else the cart). Any other transfer id
 *     (the planner's segment ids, a partner search link) has no durable rail: refused, named.
 *
 *   place (venue search / wedding vendors — Google Places results) → no cart content type fits a
 *     venue, and inventing one is refused. With a plan in hand it lands on the plan as a plain
 *     traveler item (title + its address as the location — facts the pick holds, nothing invented,
 *     no cost). With no plan it is refused with a sentence saying why.
 *
 *   anything else → refused. A silent client-only copy is exactly what RC-9 removed.
 */
import { isAdmissibleContentId, type CartContentType } from "@shared/cart-content-line";

export type TemplateExternalKind = "hotel" | "activity" | "event" | "transfer" | "place";

export interface TemplateExternalPick {
  /** The page's own id for the pick, e.g. `hotel-<hotelId>`, `event-<id>`, `transport-platform-<id>`. */
  id: string;
  name: string;
  /** Display detail line (duration, address, …). */
  details?: string;
  externalKind?: TemplateExternalKind;
}

export type TemplateExternalAdd =
  | {
      rail: "content";
      body: {
        contentType: CartContentType;
        contentId: string;
        contentMeta: { name: string; description?: string; city?: string };
      };
    }
  | { rail: "service"; serviceId: string }
  | {
      rail: "plan_item";
      body: { title: string; locationName?: string };
    }
  | { rail: "refused"; reason: TemplateExternalRefusal; message: string };

export type TemplateExternalRefusal = "no_plan_for_place" | "unrepresentable_transfer" | "unknown_kind" | "id_too_long";

export const TEMPLATE_EXTERNAL_REFUSAL_COPY: Record<TemplateExternalRefusal, string> = {
  no_plan_for_place:
    "Places from this search can only be added to a plan. Start a plan first, then add it.",
  unrepresentable_transfer:
    "This transfer can't be added yet — only priced platform transfers can be added to your plan or cart.",
  unknown_kind: "This item can't be added to your plan or cart from here.",
  id_too_long: "This item can't be added to your cart from here.",
};

const CONTENT_KIND: Record<"hotel" | "activity" | "event", CartContentType> = {
  hotel: "hotel",
  activity: "activity",
  event: "event",
};

/** The transfer list's platform id shape, prefixed by the template page (`transport-`). */
const PLATFORM_TRANSFER_ID = /^transport-platform-(.+)$/;

function refused(reason: TemplateExternalRefusal): TemplateExternalAdd {
  return { rail: "refused", reason, message: TEMPLATE_EXTERNAL_REFUSAL_COPY[reason] };
}

function nonEmpty(v: string | undefined | null): string | undefined {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t : undefined;
}

export function resolveTemplateExternalAdd(
  pick: TemplateExternalPick,
  ctx: { city?: string | null; targetTripId?: string | null },
): TemplateExternalAdd {
  const kind = pick.externalKind;
  if (kind === "hotel" || kind === "activity" || kind === "event") {
    // The page's own id is already namespaced by kind (`hotel-…`, `activity-…`, `event-…`); it
    // becomes the content id so the page can recognise its own pick in the server cart. No source
    // is claimed beyond what the id already says.
    if (!isAdmissibleContentId(pick.id)) return refused("id_too_long");
    const description = nonEmpty(pick.details);
    const city = nonEmpty(ctx.city ?? undefined);
    return {
      rail: "content",
      body: {
        contentType: CONTENT_KIND[kind],
        contentId: pick.id,
        contentMeta: {
          name: pick.name,
          // §13: an absent fact is OMITTED, never an empty string.
          ...(description ? { description } : {}),
          ...(city ? { city } : {}),
        },
      },
    };
  }
  if (kind === "transfer") {
    const m = PLATFORM_TRANSFER_ID.exec(pick.id);
    return m && m[1] ? { rail: "service", serviceId: m[1] } : refused("unrepresentable_transfer");
  }
  if (kind === "place") {
    if (!ctx.targetTripId) return refused("no_plan_for_place");
    const locationName = nonEmpty(pick.details);
    return {
      rail: "plan_item",
      body: { title: pick.name, ...(locationName ? { locationName } : {}) },
    };
  }
  return refused("unknown_kind");
}

/**
 * The template page's id for a SERVER cart row — the same id its add controls use, so "is this in
 * my cart?" and remove/quantity resolve against the server rows. A content line keys on its
 * `contentId` (which is the page's own pick id, see above); a custom venue on `custom-<id>`; a
 * service on its service id. NULL when the row names nothing (§13 — never an invented id).
 */
export function templateCartLineId(row: {
  serviceId?: string | null;
  customVenueId?: string | null;
  contentId?: string | null;
}): string | null {
  if (row.serviceId) return row.serviceId;
  if (row.customVenueId) return `custom-${row.customVenueId}`;
  if (row.contentId) return row.contentId;
  return null;
}
