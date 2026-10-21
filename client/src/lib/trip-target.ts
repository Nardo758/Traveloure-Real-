/**
 * TRIP TARGET — the ONE resolver for "which plan is this marketplace add for?".
 *
 * The slip's row-12 CTA ("Browse services for this trip",
 * client/src/components/plancard/SlipView.tsx) hands the marketplace a trip by URL:
 * `/services?tripId=<id>`. That handoff still wins.
 *
 * Otherwise the add does NOT use the plan last opened in this browser tab
 * (`client/src/lib/trip-context.ts`). Ledger `2026-10-20-add-plan-open-plans`:
 *   · exactly one open plan → add straight to it;
 *   · two or more open plans → always the picker;
 *   · in the picker, preselect the plan whose city matches the item's city and,
 *     for an event, whose dates contain the item's date;
 *   · if none fits, preselect New plan.
 *
 * An open plan is one the caller already kept with `isActivePlan` (not past).
 * This module does not fetch and does not write.
 *
 * §18 rule 1: Discover, the listing page and the city-feed dialog all call
 * `resolveAddPlanTarget` / `preselectAddPlan`. A second copy of the order is
 * how those surfaces drift.
 *
 * Nothing here touches money: the resolved id is a TRIP SCOPE for a plan item,
 * never an amount, a rate or a payer identity (§14/§18/§19). The server still
 * owns every ownership check on the trip it names. No price is decided here.
 */

import { sameCity } from "./plan-city";

/** The trip-identity slice this resolver used to read. Kept so older imports type-check; the add rule does not read it. */
export interface TripTargetContext {
  tripId?: string;
}

/** One open plan, as far as the add rule needs it. `city` is `trips.destination`. */
export interface OpenPlanRef {
  id: string;
  title?: string | null;
  city?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

/**
 * The item being added. Date containment is read only when `isEvent` is true —
 * a listing or a gem can carry a day and still be matched on city alone.
 */
export interface AddItemFit {
  city?: string | null;
  isEvent?: boolean;
  date?: string | null;
}

export type PlanPreselect = { kind: "plan"; tripId: string } | { kind: "new" };

export type AddPlanResolution =
  | { status: "direct"; tripId: string }
  | { status: "picker"; preselect: PlanPreselect }
  | { status: "pending" };

const NEW_PLAN: PlanPreselect = { kind: "new" };

function usablePlans(openPlans: readonly OpenPlanRef[] | null | undefined): OpenPlanRef[] | null {
  if (openPlans == null) return null;
  if (!Array.isArray(openPlans)) return null;
  const out: OpenPlanRef[] = [];
  for (const plan of openPlans) {
    const id = typeof plan?.id === "string" ? plan.id.trim() : "";
    if (!id) continue;
    out.push({ ...plan, id });
  }
  return out;
}

/** A stated city. Blank and the stored "Unknown" sentinel are no city (§13). */
export function statedCity(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed || trimmed.toLowerCase() === "unknown") return "";
  return trimmed;
}

/** Calendar day from a DATE or an ISO instant, or null when the value is not a day. */
export function calendarDay(value: string | null | undefined): string | null {
  if (value == null) return null;
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/**
 * The plan's own window contains the day, inclusive. A missing bound does not
 * contain the day — an open end would be a guess (§13).
 */
export function planDatesContain(
  plan: { startDate?: string | null; endDate?: string | null },
  day: string | null | undefined,
): boolean {
  const date = calendarDay(day);
  const start = calendarDay(plan.startDate);
  const end = calendarDay(plan.endDate);
  if (!date || !start || !end) return false;
  if (end < start) return false;
  return start <= date && date <= end;
}

function planFitsItem(plan: OpenPlanRef, item: AddItemFit | null | undefined): boolean {
  if (!item) return false;
  const planCity = statedCity(plan.city);
  const itemCity = statedCity(item.city);
  if (!planCity || !itemCity || !sameCity(planCity, itemCity)) return false;
  if (!item.isEvent) return true;
  return planDatesContain(plan, item.date);
}

/**
 * Which row the picker checks first. The first plan in `openPlans` that fits;
 * otherwise New plan. List order is the caller's (the open-plan list). A later
 * plan is chosen when an earlier one does not fit, so the first row is not a
 * stand-in for the tab's last-opened plan.
 */
export function preselectAddPlan(
  openPlans: readonly OpenPlanRef[] | null | undefined,
  item?: AddItemFit | null,
): PlanPreselect {
  const plans = usablePlans(openPlans) ?? [];
  const fit = plans.find((plan) => planFitsItem(plan, item));
  return fit ? { kind: "plan", tripId: fit.id } : NEW_PLAN;
}

/**
 * Where an add goes.
 *
 *   1. `?tripId=` on the URL — that plan, even when other open plans exist.
 *   2. The open-plan list is not known yet — pending. The caller waits. It does
 *      not fall through to the tab plan.
 *   3. Exactly one open plan — that plan, whether or not its city and dates fit.
 *   4. None, or two or more — the picker, with `preselectAddPlan`.
 */
export function resolveAddPlanTarget(
  search: string | null | undefined,
  openPlans: readonly OpenPlanRef[] | null | undefined,
  item?: AddItemFit | null,
): AddPlanResolution {
  const fromUrl = readTripIdParam(search);
  if (fromUrl) return { status: "direct", tripId: fromUrl };
  const plans = usablePlans(openPlans);
  if (plans == null) return { status: "pending" };
  if (plans.length === 1) return { status: "direct", tripId: plans[0].id };
  return { status: "picker", preselect: preselectAddPlan(plans, item) };
}

/**
 * The direct trip id, or "" when the add must wait or ask. Callers that need
 * to tell pending from the picker use `resolveAddPlanTarget`.
 */
export function resolveTargetTripId(
  search: string | null | undefined,
  openPlans?: readonly OpenPlanRef[] | null,
): string {
  const resolved = resolveAddPlanTarget(search, openPlans);
  return resolved.status === "direct" ? resolved.tripId : "";
}

/**
 * What the page may pass into `resolveAddPlanTarget` for the open-plan list.
 * A guest does not wait on the trip list. A signed-in member whose list has
 * not answered yet is pending — never an empty list, which would open the
 * picker, and never the tab plan.
 */
export function openPlansArgument(input: {
  authLoading: boolean;
  signedIn: boolean;
  known: boolean;
  openPlans: readonly OpenPlanRef[];
}): OpenPlanRef[] | null {
  if (input.authLoading) return null;
  if (!input.signedIn) return [];
  if (!input.known) return null;
  return input.openPlans.slice();
}

/** City-feed / wishlist items: only `type: "event"` asks the date question. */
export function addItemFit(item: {
  city?: string | null;
  type?: string | null;
  scheduledDate?: string | null;
} | null | undefined): AddItemFit {
  const isEvent = item?.type === "event";
  return {
    city: item?.city ?? null,
    isEvent,
    date: isEvent ? (item?.scheduledDate ?? null) : null,
  };
}

export function toOpenPlanRef(trip: {
  id: string;
  title?: string | null;
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}): OpenPlanRef {
  return {
    id: trip.id,
    title: trip.title ?? null,
    city: trip.destination ?? null,
    startDate: trip.startDate ?? null,
    endDate: trip.endDate ?? null,
  };
}

/**
 * The plan a quote request may name.
 *
 * Only the URL `?tripId=` counts. Ambient TripContext is the trip the traveler
 * was planning earlier, not a choice they made on this listing page — filing a
 * request under it attached quotes to an unrelated older plan (roles-dev QA M8).
 * Add-to-plan uses `resolveAddPlanTarget`.
 */
export function quoteRequestTripId(search: string | null | undefined): string {
  return readTripIdParam(search);
}

/** Read a `tripId` query parameter out of a search string. Empty/whitespace-only reads as absent. */
export function readTripIdParam(search: string | null | undefined): string {
  if (!search) return "";
  try {
    const raw = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("tripId");
    return typeof raw === "string" ? raw.trim() : "";
  } catch {
    return "";
  }
}

/**
 * The service-detail href a marketplace card links to, carrying the trip handoff forward
 * so the listing page can resolve the same target the grid did. With no target trip the
 * href is byte-identical to the pre-existing `/services/:id` link.
 *
 * Pass only a DIRECT target (the URL handoff, or the single open plan). Stamping the
 * tab's last-opened plan here would make `?tripId=` win on the listing and skip the picker.
 */
export function serviceDetailHref(serviceId: string, tripId?: string | null): string {
  const base = `/services/${encodeURIComponent(serviceId)}`;
  const trimmed = typeof tripId === "string" ? tripId.trim() : "";
  return trimmed ? `${base}?tripId=${encodeURIComponent(trimmed)}` : base;
}
