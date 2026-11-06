/**
 * CAP-2 (ledger `2026-11-05-cap2-plan-item-ref`; dispatch rulings 1–11, Nov 4–5, 2026): ONE typed envelope for every
 * saveable thing on the site. A card describes ITSELF — its kind, its own row's id, the city it was shown in, and an
 * optional placement hint — and knows nothing about plans. The server re-reads the row for the item's name, point and
 * link (ruling 4); a client never sends a title, a coordinate or a link the server keeps.
 *
 * Kind → source_id → table (Phase 0, posted on #1901):
 *   gem               travel_pulse_hidden_gems.id
 *   event             Fever CatalogItemId (fever_event_cache.event_id; live lookup on a miss)
 *   city_event        city_events.source_id
 *   listing           provider_services.id
 *   affiliate_product affiliate_products.id
 *   hotel             hotel_cache.id
 *   activity          activity_cache.id
 * Viator results are NOT a kind (ruling, Nov 5): they have no row of ours to re-read.
 */
import { z } from "zod";

export const PLAN_ITEM_KINDS = ["gem", "event", "city_event", "listing", "affiliate_product", "hotel", "activity"] as const;
export type PlanItemKind = (typeof PLAN_ITEM_KINDS)[number];

/**
 * Why a save was refused. Not user-facing: the client shows "Couldn't save that. Try again." for every one except
 * `event_outside_dates` (R4b-1), which names the event's day (`eventOutsideDatesMessage`, shared/plan-dates.ts).
 */
export const PLAN_ITEM_REJECT_REASONS = ["unknown_kind", "unknown_source", "source_withdrawn", "city_mismatch", "unplaceable", "event_outside_dates"] as const;
export type PlanItemRejectReason = (typeof PLAN_ITEM_REJECT_REASONS)[number];

const isoInstant = z.string().trim().min(1).max(40).refine((v) => !Number.isNaN(Date.parse(v)), { message: "ISO instant" });

export const planItemPlacementSchema = z
  .object({
    starts_at: isoInstant.optional(),
    ends_at: isoInstant.optional(),
    duration_min: z.number().int().min(1).max(24 * 60).optional(),
    /** Only when the traveler chose a day (a day-filtered feed counts as a choice). */
    day_number: z.number().int().min(1).max(60).optional(),
  })
  .strip();

/**
 * The envelope's shape. `kind` is any string here so an unknown kind is answered `unknown_kind` rather than a generic
 * body error; `parsePlanItemRef` checks it against PLAN_ITEM_KINDS.
 */
export const planItemRefSchema = z
  .object({
    kind: z.string().trim().min(1).max(40),
    source_id: z.string().trim().min(1).max(200),
    city: z.string().trim().min(1).max(120),
    placement: planItemPlacementSchema.optional(),
  })
  // Unknown keys are STRIPPED, never stored (ruling 4): a client's `latitude`/`longitude`/`title` ride along and are
  // dropped here, so a forged point can only ever be ignored.
  .strip();

export type PlanItemRef = {
  kind: PlanItemKind;
  source_id: string;
  city: string;
  placement?: z.infer<typeof planItemPlacementSchema>;
};

/** Pure: a body → a PlanItemRef, or the reason it is not one. A malformed envelope is `unplaceable`. */
export function parsePlanItemRef(body: unknown): { ok: true; ref: PlanItemRef } | { ok: false; reason: PlanItemRejectReason } {
  const parsed = planItemRefSchema.safeParse(body);
  if (!parsed.success) return { ok: false, reason: "unplaceable" };
  if (!(PLAN_ITEM_KINDS as readonly string[]).includes(parsed.data.kind)) return { ok: false, reason: "unknown_kind" };
  return { ok: true, ref: parsed.data as PlanItemRef };
}

/**
 * Pure, client side: a browse card's add payload → its PlanItemRef. The card names its own row (`sourceContentId`, or
 * `providerServiceId` for a listing) and its kind; a card that names no row (a recommendation category, a Viator
 * result) is null — nothing is sent, and the caller shows the refusal toast.
 *   type gem → gem · event → event · city_event → city_event · service / providerServiceId → listing
 *   hotel → hotel · activity → activity · affiliate_product → affiliate_product
 * `dayNumber` is passed only when the traveler chose a day (a day-filtered feed); otherwise the item lands on Day 1.
 */
export function planItemRefFromFeedItem(
  item: any,
  city: string | null | undefined,
  dayNumber?: number | null,
): PlanItemRef | null {
  const c = typeof city === "string" ? city.trim() : "";
  if (!c) return null;
  const sourceId = typeof item?.sourceContentId === "string" ? item.sourceContentId.trim() : "";
  const providerServiceId = typeof item?.providerServiceId === "string" ? item.providerServiceId.trim() : "";
  const type = item?.type;
  let kind: PlanItemKind | null = null;
  let id = sourceId;
  if (type === "gem" || type === "event" || type === "city_event" || type === "hotel" || type === "activity" || type === "affiliate_product") kind = type;
  else if (type === "service") kind = "listing";
  // A card naming a platform listing is that listing, whatever its display type (a catalogue result reads "activity").
  if (providerServiceId) {
    kind = "listing";
    id = providerServiceId;
  }
  if (!kind || !id) return null;
  const placement: NonNullable<PlanItemRef["placement"]> = {};
  if (typeof dayNumber === "number" && Number.isInteger(dayNumber) && dayNumber >= 1) placement.day_number = Math.min(dayNumber, 60);
  // A-29 / CAP-2 Phase 2: an event card's own start and end ride as hints (the server's row still wins).
  if (kind === "event" || kind === "city_event") {
    const startsAt = isoOrNull(item?.startsAt);
    const endsAt = isoOrNull(item?.endsAt);
    if (startsAt) placement.starts_at = startsAt;
    if (endsAt) placement.ends_at = endsAt;
  }
  return {
    kind,
    source_id: id.slice(0, 200),
    city: c.slice(0, 120),
    ...(Object.keys(placement).length ? { placement } : {}),
  };
}

function isoOrNull(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim() || v.length > 40 || Number.isNaN(Date.parse(v))) return null;
  return v.trim();
}

/**
 * CAP-2 Phase 2: an event card's start and end as the add payload carries them (`startsAt` / `endsAt`). A Fever event
 * states them under `dates`; a city event at its top level. Absent ⇒ nothing (§13 — never a guessed time).
 */
export function eventPlacementHints(event: any): { startsAt?: string; endsAt?: string } {
  const startsAt = isoOrNull(event?.dates?.startDate ?? event?.startsAt ?? event?.startDate);
  const endsAt = isoOrNull(event?.dates?.endDate ?? event?.endsAt ?? event?.endDate);
  return { ...(startsAt ? { startsAt } : {}), ...(endsAt ? { endsAt } : {}) };
}

/** Pure: the 1-based day a chosen calendar day falls on in a plan starting `planStart` (both YYYY-MM-DD). */
export function dayNumberForDate(chosen: string | null | undefined, planStart: string | null | undefined): number | null {
  if (!chosen || !planStart) return null;
  const a = Date.parse(`${chosen.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${planStart.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const n = Math.round((a - b) / 86_400_000) + 1;
  return n >= 1 ? n : null;
}

/**
 * R4b-3 (round 4b, Nov 6, 2026): the `kind:source_id` key a stored plan item answers for — the same key a card's save
 * names (`savedRefKey`, client/src/lib/saved-refs.ts). "Saved to plan" reads it from the plan's own items, never from a
 * session store. A content item is its `content_type:content_id` (the resolver stamps the kind and the source id there);
 * a listing or partner product is its own column. An item with no link ⇒ null.
 */
export function savedRefKeyOfItem(item: {
  contentType?: string | null;
  contentId?: string | null;
  providerServiceId?: string | null;
  affiliateProductId?: string | null;
}): string | null {
  const t = typeof item.contentType === "string" ? item.contentType.trim() : "";
  const c = typeof item.contentId === "string" ? item.contentId.trim() : "";
  if (t && c && (PLAN_ITEM_KINDS as readonly string[]).includes(t)) return `${t}:${c}`;
  if (typeof item.providerServiceId === "string" && item.providerServiceId.trim()) return `listing:${item.providerServiceId.trim()}`;
  if (typeof item.affiliateProductId === "string" && item.affiliateProductId.trim()) return `affiliate_product:${item.affiliateProductId.trim()}`;
  return null;
}
