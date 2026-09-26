/**
 * SELLER BOOKING-MODE STATUS — ledger `2026-09-25-seller-booking-mode-prompt`.
 *
 * The decision-maker (Sep 25, 2026, "option 3") holds PR #1101 — checkout refusing request-mode
 * lines — and FIRST ships a prompt asking sellers to choose Instant or Request for each live
 * listing. This module is the server half of that prompt:
 *
 *   • `loadOwnerBookingModeStatus` — the SESSION owner's approved+active listings (§14 applied to
 *     reads: the owner is never a query/body value), each with its effective mode and whether a
 *     seller CHOSE it. ONE classification (`classifyBookingModeRow`) over the ONE resolver pair in
 *     `shared/schema.ts` (`resolveBookingMode` / `isBookingModeChosen`) — never restated (§18 rule 1).
 *   • `decideUndecidedBookingModes` — the bulk "make them all instant / keep request" action. It
 *     writes through `storage.updateProviderService`, the SAME writer the listing PATCH rail uses —
 *     never a second writer — and touches ONLY undecided, non-quote listings. `bookingMode` is a
 *     SAFE edit under Locked Decision 23 (it is not in `IDENTITY_EDIT_FIELDS`), so an approved
 *     listing takes it live immediately, exactly as the Catalog "Card shows" control does.
 *   • `loadBookingModeSummary` — the admin count (instant chosen / request chosen / undecided),
 *     reported over the whole catalog AND over the catalog minus its largest single-owner cluster
 *     (ledger `2026-09-11-oc-a1-ratified`: every coverage number discounts it explicitly). The
 *     owner is never named — only counted (LD 40).
 *
 * CUSTOM-QUOTE LISTINGS ARE EXCLUDED FROM THE QUESTION. Their price authority is the quote (LD 49),
 * so they are request by construction — a quote must exist before any commitment, and the offering
 * contract refuses `custom_quote` + `instant` (§11). They are reported as `quote`, never counted as
 * undecided and never touched by the bulk action.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import {
  providerServices,
  serviceProviderForms,
  resolveBookingMode,
  isBookingModeChosen,
  type BookingMode,
} from "@shared/schema";

export type BookingModeChoiceState = "chosen" | "undecided" | "quote";

export interface BookingModeStatusRow {
  id: string;
  name: string;
  mode: BookingMode;
  state: BookingModeChoiceState;
}

/** Pure: one listing's effective mode and whether a seller chose it. */
export function classifyBookingModeRow(
  row: { bookingMode: string | null | undefined; priceType: string | null | undefined },
  ownerInstantBooking: boolean | null | undefined,
): { mode: BookingMode; state: BookingModeChoiceState } {
  const mode = resolveBookingMode(row.bookingMode, ownerInstantBooking);
  if (row.priceType === "custom_quote") return { mode, state: "quote" };
  return { mode, state: isBookingModeChosen(row.bookingMode, ownerInstantBooking) ? "chosen" : "undecided" };
}

/** The live population the prompt is about: approved AND active. */
const liveWhere = and(
  eq(providerServices.approvalStatus, "approved"),
  eq(providerServices.status, "active"),
);

async function ownerInstantFlags(ownerIds: string[]): Promise<Map<string, boolean | null>> {
  const byOwner = new Map<string, boolean | null>();
  if (ownerIds.length === 0) return byOwner;
  const forms = await db
    .select({ userId: serviceProviderForms.userId, instantBooking: serviceProviderForms.instantBooking })
    .from(serviceProviderForms)
    .where(inArray(serviceProviderForms.userId, ownerIds));
  // UNCOERCED (OC-A0b): absent/NULL = no flag known; `isBookingModeChosen` decides what counts.
  for (const f of forms) byOwner.set(f.userId, f.instantBooking ?? null);
  return byOwner;
}

export async function loadOwnerBookingModeStatus(ownerUserId: string): Promise<{
  listings: BookingModeStatusRow[];
  undecidedCount: number;
}> {
  if (!ownerUserId) throw new Error("loadOwnerBookingModeStatus: owner required");
  const rows = await db
    .select({
      id: providerServices.id,
      name: providerServices.serviceName,
      bookingMode: providerServices.bookingMode,
      priceType: providerServices.priceType,
    })
    .from(providerServices)
    .where(and(eq(providerServices.userId, ownerUserId), liveWhere))
    .orderBy(providerServices.serviceName);
  const flag = (await ownerInstantFlags([ownerUserId])).get(ownerUserId);
  const listings = rows.map((r) => ({ id: r.id, name: r.name, ...classifyBookingModeRow(r, flag) }));
  return { listings, undecidedCount: listings.filter((l) => l.state === "undecided").length };
}

/**
 * Bulk decision for the SESSION owner's undecided listings only. Returns the ids it wrote.
 * Re-reads the status first, so a listing decided a moment ago (or a quote listing) is never touched.
 */
export async function decideUndecidedBookingModes(
  ownerUserId: string,
  mode: "instant" | "request",
): Promise<{ updatedIds: string[] }> {
  const { listings } = await loadOwnerBookingModeStatus(ownerUserId);
  const updatedIds: string[] = [];
  for (const l of listings) {
    if (l.state !== "undecided") continue;
    const updated = await storage.updateProviderService(l.id, { bookingMode: mode } as any);
    if (updated) updatedIds.push(l.id);
  }
  return { updatedIds };
}

export interface BookingModeCounts {
  total: number;
  instantChosen: number;
  requestChosen: number;
  hiddenChosen: number;
  undecided: number;
  /** Undecided listings whose effective mode is request — what #1101 would refuse at checkout. */
  undecidedResolvingRequest: number;
  quote: number;
}

/** Pure: counts over classified rows. */
export function summariseBookingModes(rows: Array<{ mode: BookingMode; state: BookingModeChoiceState }>): BookingModeCounts {
  const c: BookingModeCounts = {
    total: rows.length, instantChosen: 0, requestChosen: 0, hiddenChosen: 0,
    undecided: 0, undecidedResolvingRequest: 0, quote: 0,
  };
  for (const r of rows) {
    if (r.state === "quote") c.quote++;
    else if (r.state === "undecided") {
      c.undecided++;
      if (r.mode === "request") c.undecidedResolvingRequest++;
    } else if (r.mode === "instant") c.instantChosen++;
    else if (r.mode === "request") c.requestChosen++;
    else c.hiddenChosen++;
  }
  return c;
}

export async function loadBookingModeSummary(): Promise<{
  all: BookingModeCounts;
  excludingLargestOwner: BookingModeCounts;
  largestOwnerListingCount: number;
}> {
  const rows = await db
    .select({
      userId: providerServices.userId,
      bookingMode: providerServices.bookingMode,
      priceType: providerServices.priceType,
    })
    .from(providerServices)
    .where(liveWhere);
  const flags = await ownerInstantFlags(Array.from(new Set(rows.map((r) => r.userId))));
  const classified = rows.map((r) => ({ userId: r.userId, ...classifyBookingModeRow(r, flags.get(r.userId)) }));

  // Largest single-owner cluster, measured (never named). Ties broken by id for determinism.
  const perOwner = new Map<string, number>();
  for (const r of classified) perOwner.set(r.userId, (perOwner.get(r.userId) ?? 0) + 1);
  let largest: [string, number] | null = null;
  for (const e of Array.from(perOwner.entries())) {
    if (!largest || e[1] > largest[1] || (e[1] === largest[1] && e[0] < largest[0])) largest = e;
  }
  return {
    all: summariseBookingModes(classified),
    excludingLargestOwner: summariseBookingModes(largest ? classified.filter((r) => r.userId !== largest![0]) : classified),
    largestOwnerListingCount: largest ? largest[1] : 0,
  };
}
