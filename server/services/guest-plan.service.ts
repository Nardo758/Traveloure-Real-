/**
 * GATE-1B — THE SERVER-SIDE GUEST PLAN (ledger `2026-11-04-gate1b-guest-plan`; Leon chose GATE-1 option B, Nov 4,
 * 2026; architect rulings 1–7, Nov 4, 2026; migration 433).
 *
 * In waitlist mode a signed-out visitor has a plan: an ordinary `trips` row with `user_id` NULL and
 * `guest_session_hash` = SHA-256 hex of the browser's `X-Guest-Session` id. The raw id is never stored, logged or
 * returned. This module is the ONE writer of `guest_session_hash` / `guest_claimed_at`.
 *
 *   · create  — one per call (rate-limited at the route), market gate as at the trip mint (no account ⇒ no bypass);
 *   · read    — the session's latest unclaimed plan and its items; another session's plan is "none" (one 404);
 *   · save    — an allowlisted item body (title, type, day, place name, point) — never a listing or partner id,
 *               never an origin, never a money field (§19); the plan's `updated_at` moves (retention, ruling 3);
 *   · update  — dates and party only, through `storage.updateTrip` (stamps `dates_confirmed_at`, LD 30);
 *   · claim   — on sign-in: `user_id` set, `guest_claimed_at` stamped, hash cleared, owner collaborator row written;
 *               as-is, no merge (ruling 5), one atomic conditional (§15);
 *   · retention — unclaimed guest plans whose last change is older than GUEST_PLAN_RETENTION_DAYS are deleted
 *               (items cascade); unset ⇒ disabled, deletes nothing (ruling 6).
 */
import { eventOutsideConfirmedDates } from "@shared/plan-dates";
import { occasionLabelForPlan } from "./occasion-label.service";
import { savedRefKeyOfItem } from "@shared/plan-item-ref";
import crypto, { createHash } from "node:crypto";
import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { experienceTypes, itineraryItems, providerServices, tripCollaborators, trips, type Trip } from "@shared/schema";
import { syncItemProjection } from "./cart-projection.service";
import { checkoutProjectionRefusals } from "./buy-action-payload";
import { logItemTransition } from "./item-transition-log.service";
import { planMarkets, resolvePlanItemRef } from "./guest-item-source.service";
import { parsePlanItemRef, planItemRefSchema, type PlanItemRef, type PlanItemRejectReason } from "@shared/plan-item-ref";
import { stampItemSourceClass } from "@shared/content-tiers";
import { enqueuePlanLegRecompute } from "./routing/plan-legs-queue";
import { eventTypeForSlug } from "@shared/occasions";
import { writePlanPenOccasion } from "./plan-pen-occasion.service";
import { partyTotal } from "@shared/plan-vocabulary";
import { storage } from "../storage";
import { logger } from "../infrastructure/logger";
import { decideMarketOpen, type MarketOpenDecision } from "./market-open-gate";
import { getLaunchMarketSlug, getLiveMarketSlugs } from "./platform-flags";
import { resolveMarketSlug } from "./trend-engine/operating-markets";
import { placeholderMintDay } from "./trip-placeholder-dates";
import { GUEST_PLAN_RETENTION_BATCH, GUEST_SESSION_ID_MAX_LENGTH, guestPlanRetentionDays } from "../config/guest-plan.config";

export const GUEST_SESSION_HEADER = "x-guest-session";

/** SHA-256 hex of a well-formed guest-session id, else null (missing, too long, or odd characters). */
/**
 * A-10 (ledger `2026-11-05-lane6-guest-cookie`; ruling, Nov 5, 2026): an httpOnly cookie the server mints is the guest's
 * PRIMARY identity. The `X-Guest-Session` id (the browser's localStorage) is the FALLBACK, used only when the client says
 * its cookies are off (`X-Guest-Cookies: off`). A cleared cookie therefore means a NEW guest — the localStorage id does
 * not bring the old plan back — and there is no recovery screen. Only the SHA-256 of whichever id answers is stored.
 */
export const GUEST_SESSION_COOKIE = "traveloure_guest";
export const GUEST_COOKIES_OFF_HEADER = "x-guest-cookies";

/** A named cookie's value from a raw `Cookie` header, or null. */
export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export type GuestSessionResolution =
  | { id: string; source: "cookie" | "header" }
  | { id: string; source: "new" };

/**
 * Which id names this guest: the cookie when it holds a well-formed id; else the header id when the client's cookies
 * are off; else a NEW id (the caller sets the cookie). `mintNew: false` (the claim) answers null instead of minting.
 */
export function resolveGuestSessionId(
  input: { cookie: string | null; header: string | null | undefined; cookiesOff: boolean },
  opts: { mintNew: boolean; mint?: () => string } = { mintNew: true },
): GuestSessionResolution | null {
  if (hashGuestSession(input.cookie)) return { id: input.cookie!.trim(), source: "cookie" };
  if (input.cookiesOff && hashGuestSession(input.header)) return { id: String(input.header).trim(), source: "header" };
  if (!opts.mintNew) return null;
  return { id: (opts.mint ?? (() => crypto.randomUUID()))(), source: "new" };
}

export function hashGuestSession(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  if (id.length < 8 || id.length > GUEST_SESSION_ID_MAX_LENGTH || !/^[A-Za-z0-9-]+$/.test(id)) return null;
  return createHash("sha256").update(id, "utf8").digest("hex");
}

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const partyCount = z.number().int().min(0).max(99);

/** §19: the create body — a pick of planning answers, `.strict()`. Dates both or neither. */
export const guestPlanCreateBody = z
  .object({
    destination: z.string().trim().min(1).max(255),
    /** E-1 (round 2): the client's `planTitle` — the traveler's choice and the city. Absent ⇒ the column default. */
    title: z.string().trim().min(1).max(255).optional(),
    startDate: isoDay.optional(),
    endDate: isoDay.optional(),
    adults: partyCount.optional(),
    kids: partyCount.optional(),
    occasionSlug: z.string().trim().min(1).max(64).optional(),
  })
  .strict()
  .refine((b) => (b.startDate === undefined) === (b.endDate === undefined), { message: "startDate and endDate go together" })
  .refine((b) => !b.startDate || !b.endDate || b.endDate >= b.startDate, { message: "End date must be on or after start date" });

/** §19: the update body — dates and party only. */
export const guestPlanUpdateBody = z
  .object({
    startDate: isoDay.optional(),
    endDate: isoDay.optional(),
    adults: partyCount.nullable().optional(),
    kids: partyCount.nullable().optional(),
  })
  .strict()
  .refine((b) => (b.startDate === undefined) === (b.endDate === undefined), { message: "startDate and endDate go together" })
  .refine((b) => !b.startDate || !b.endDate || b.endDate >= b.startDate, { message: "End date must be on or after start date" })
  .refine((b) => Object.keys(b).length > 0, { message: "Nothing to update" });

/**
 * §19 / CAP-2 (ledger `2026-11-05-cap2-plan-item-ref`): the save body IS a PlanItemRef (`@shared/plan-item-ref`) — a
 * kind, the source row's id, the city it was shown in and an optional placement. The server reads the row for the
 * item's name, point and link; the body carries no title the server keeps, no point, no link, origin, status or
 * amount. The GATE-1B `gemId` and Lane 1 `{ kind, sourceId }` spellings are retired with it.
 */
export const guestPlanItemBody = planItemRefSchema;

export type GuestPlanView = {
  plan: {
    id: string;
    title: string | null;
    destination: string;
    startDate: string;
    endDate: string;
    datesConfirmed: boolean;
    adults: number | null;
    kids: number | null;
    numberOfTravelers: number | null;
    eventType: string | null;
    /** PLAN-1 (shared DTO): the plan's occasion in words — the same label the plancard sends (`occasionLabelForPlan`). */
    occasionLabel: string | null;
    /** R5-3 (option b): the stored occasion slug, so the eyebrow can name a group default's group. */
    occasionSlug: string | null;
    updatedAt: string | null;
  };
  items: Array<{
    id: string;
    title: string;
    description: string | null;
    itemType: string | null;
    dayNumber: number;
    locationName: string | null;
    latitude: string | null;
    longitude: string | null;
    located: boolean;
    /** R4b-5: the item's own day and time when it has them (an event's), as stored. */
    scheduledDate: string | null;
    startTime: string | null;
    /** PLAN-1 (shared DTO): the stored wall-clock end, as the plancard sends it. */
    endTime: string | null;
    /** R4b-3: the content row the item was saved from, so a card reads "Saved to plan" from the plan itself. */
    contentType: string | null;
    contentId: string | null;
    /** PLAN-1 (shared DTO): a listing or partner product the item names, as the plancard sends them. */
    providerServiceId: string | null;
    affiliateProductId: string | null;
  }>;
  retentionDays: number | null;
};

/** The market gate for a guest: the mint's own pure decision, with no account (so no admin/QA bypass). */
export async function guestMarketDecision(destination: string): Promise<MarketOpenDecision> {
  const market = resolveMarketSlug(destination);
  const [launch, live] = await Promise.all([getLaunchMarketSlug(), getLiveMarketSlugs()]);
  return decideMarketOpen({ market, launch, live, user: null, qaDomain: undefined });
}

async function currentGuestTrip(hash: string): Promise<Trip | null> {
  const [row] = await db
    .select()
    .from(trips)
    .where(and(eq(trips.guestSessionHash, hash), isNull(trips.userId), isNull(trips.guestClaimedAt)))
    .orderBy(desc(trips.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Cut-list #1 slice C: the guest's Undo and Change day. Both act on ONE item of the session's OWN current plan — the item
 * id is matched together with that plan's id in the same statement, so another session's item (or a claimed plan's) is
 * not found, never touched (one 404 for "no such item" and "not yours", LD 40 posture). No schema change.
 */
export const guestPlanItemMoveBody = z.object({ dayNumber: z.number().int().min(1).max(366) }).strict();

/** Days the guest plan holds: end − start + 1 (a one-day placeholder window is one day). */
function guestPlanDayCount(trip: Trip): number {
  const a = Date.parse(String(trip.startDate).slice(0, 10));
  const b = Date.parse(String(trip.endDate).slice(0, 10));
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 1;
  return Math.round((b - a) / 86_400_000) + 1;
}

export async function deleteGuestPlanItem(hash: string, itemId: string): Promise<{ ok: true; view: GuestPlanView } | { ok: false; code: "not_found" }> {
  const trip = await currentGuestTrip(hash);
  if (!trip) return { ok: false, code: "not_found" };
  // The item must be on THIS session's plan; then it leaves through the ONE logged delete (`item_removed` diary row,
  // trip-scoped leg cascade, superseded legs restored — the same path the signed-in item DELETE takes).
  const [own] = await db
    .select({ id: itineraryItems.id })
    .from(itineraryItems)
    .where(and(eq(itineraryItems.id, itemId), eq(itineraryItems.tripId, trip.id)))
    .limit(1);
  if (!own) return { ok: false, code: "not_found" };
  await storage.deleteItineraryItem(own.id, { actorType: "traveler", actorId: null });
  enqueuePlanLegRecompute(trip.id);
  const view = await readGuestPlan(hash);
  return view ? { ok: true, view } : { ok: false, code: "not_found" };
}

export async function moveGuestPlanItem(
  hash: string,
  itemId: string,
  dayNumber: number,
): Promise<{ ok: true; view: GuestPlanView } | { ok: false; code: "not_found" | "day_out_of_range" }> {
  const trip = await currentGuestTrip(hash);
  if (!trip) return { ok: false, code: "not_found" };
  if (dayNumber > guestPlanDayCount(trip)) return { ok: false, code: "day_out_of_range" };
  const moved = await db
    .update(itineraryItems)
    .set({ dayNumber, updatedAt: new Date() } as any)
    .where(and(eq(itineraryItems.id, itemId), eq(itineraryItems.tripId, trip.id)))
    .returning({ id: itineraryItems.id });
  if (moved.length === 0) return { ok: false, code: "not_found" };
  enqueuePlanLegRecompute(trip.id);
  const view = await readGuestPlan(hash);
  return view ? { ok: true, view } : { ok: false, code: "not_found" };
}

/** R4b-5: a stored `scheduled_date` (a timestamp, written from a `YYYY-MM-DD` day) as that day. */
function storedDay(v: unknown): string | null {
  if (v == null) return null;
  // A timestamp without a zone is read back as the server's local midnight, so its local fields are the stored day.
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v));
  return m ? m[1] : null;
}

function viewOf(trip: Trip, items: Array<typeof itineraryItems.$inferSelect>, occasionLabel: string | null = null): GuestPlanView {
  return {
    plan: {
      id: trip.id,
      title: trip.title ?? null,
      destination: trip.destination,
      startDate: String(trip.startDate),
      endDate: String(trip.endDate),
      datesConfirmed: trip.datesConfirmedAt != null,
      adults: trip.adults ?? null,
      kids: trip.kids ?? null,
      numberOfTravelers: trip.numberOfTravelers ?? null,
      eventType: trip.eventType ?? null,
      occasionLabel,
      occasionSlug: (trip as any).occasionSlug ?? null,
      updatedAt: trip.updatedAt ? new Date(trip.updatedAt).toISOString() : null,
    },
    items: items.map((i) => ({
      id: i.id,
      title: i.title,
      description: i.description ?? null,
      itemType: i.itemType ?? null,
      dayNumber: i.dayNumber,
      locationName: i.locationName ?? null,
      latitude: i.latitude ?? null,
      longitude: i.longitude ?? null,
      located: i.latitude != null && i.longitude != null,
      scheduledDate: storedDay((i as any).scheduledDate),
      startTime: (i as any).startTime ?? null,
      endTime: (i as any).endTime ?? null,
      contentType: (i as any).contentType ?? null,
      contentId: (i as any).contentId ?? null,
      providerServiceId: (i as any).providerServiceId ?? null,
      affiliateProductId: (i as any).affiliateProductId ?? null,
    })),
    retentionDays: guestPlanRetentionDays(),
  };
}

export async function readGuestPlan(hash: string): Promise<GuestPlanView | null> {
  const trip = await currentGuestTrip(hash);
  if (!trip) return null;
  const items = await db
    .select()
    .from(itineraryItems)
    .where(eq(itineraryItems.tripId, trip.id))
    .orderBy(asc(itineraryItems.dayNumber), asc(itineraryItems.createdAt), asc(itineraryItems.id));
  return fullView(trip, items);
}

/** PLAN-1: the whole plan, with its occasion label read the plancard's way (a failed read ⇒ null, never a guess). */
async function fullView(trip: Trip, items: Array<typeof itineraryItems.$inferSelect>): Promise<GuestPlanView> {
  const label = await occasionLabelForPlan((trip as any).occasionSlug ?? null).catch(() => null);
  return viewOf(trip, items, label);
}

export type GuestCreateOutcome =
  | { ok: true; view: GuestPlanView; created: boolean }
  | { ok: false; code: "market_not_open"; market: string | null }
  | { ok: false; code: "unknown_occasion" };

export async function createGuestPlan(hash: string, body: z.infer<typeof guestPlanCreateBody>): Promise<GuestCreateOutcome> {
  const gate = await guestMarketDecision(body.destination);
  if (!gate.allowed) return { ok: false, code: "market_not_open", market: gate.market };
  // A-8 / A-35: a picked occasion is resolved and stored (coarse type + fine slug); none picked ⇒ both NULL, never the
  // column's `vacation` default.
  let eventType: string | null = null;
  let occasionSlug: string | null = null;
  if (body.occasionSlug) {
    const row = await storage.getExperienceTypeBySlug(body.occasionSlug);
    if (!row) return { ok: false, code: "unknown_occasion" };
    eventType = eventTypeForSlug(row.slug);
    occasionSlug = row.slug;
  }
  // A-5: get-or-create. A session has at most one live guest plan (migration 435's unique partial index); a second
  // create — including one racing the first — answers that plan.
  // R3-3 (round 3 ruling, Nov 5, 2026): an OCCASION door on an existing guest plan updates that plan in place — its
  // occasion (slug + coarse type), the door's dates and its title — and keeps its items. Still one plan per browser:
  // no new plan, no prompt. A create that names no occasion (a city-page save) answers the plan as it stands.
  const existing = await readGuestPlan(hash);
  if (existing) {
    if (!occasionSlug) return { ok: true, view: existing, created: false };
    const patch: Record<string, unknown> = { occasionSlug, eventType };
    if (body.title) patch.title = body.title;
    if (body.startDate && body.endDate) {
      patch.startDate = body.startDate;
      patch.endDate = body.endDate;
    }
    await storage.updateTrip(existing.plan.id, patch as any);
    return { ok: true, view: (await readGuestPlan(hash)) ?? existing, created: false };
  }
  const datesChosenByTraveler = !!(body.startDate && body.endDate);
  const day = datesChosenByTraveler ? null : placeholderMintDay(body.destination);
  // R3-4 is a SHOWN default (the party panel opens at `DEFAULT_ADULTS`), never a stored one: LD 33 — an
  // untouched party is NULL, never 2. The plan states a party only once the traveler saves one.
  const total = body.adults !== undefined ? partyTotal(body.adults, body.kids ?? null) : undefined;
  let trip: Trip;
  try {
    trip = await storage.createTrip(
    {
      destination: body.destination,
      ...(body.title ? { title: body.title } : {}),
      startDate: (body.startDate ?? day) as any,
      endDate: (body.endDate ?? day) as any,
      ...(body.adults !== undefined ? { adults: body.adults } : {}),
      ...(body.kids !== undefined ? { kids: body.kids } : {}),
      ...(total !== undefined ? { numberOfTravelers: total } : {}),
      eventType,
      occasionSlug,
      // The ONE write of the guest owner column (migration 433). `userId` stays NULL: no account owns this row.
      guestSessionHash: hash,
      userId: null,
    } as any,
    // Slip-first (round 5 hotfix): a guest plan opens on Days like every other plan.
    { datesChosenByTraveler },
    );
  } catch (err) {
    // The concurrent create won the unique index: answer its plan.
    if (isUniqueViolation(err)) {
      const won = await readGuestPlan(hash);
      if (won) return { ok: true, view: won, created: false };
    }
    throw err;
  }
  return { ok: true, view: await fullView(trip, []), created: true };
}

/** Postgres `unique_violation`, read through the driver's wrapper when there is one. */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

export async function updateGuestPlan(hash: string, body: z.infer<typeof guestPlanUpdateBody>): Promise<GuestPlanView | null> {
  const trip = await currentGuestTrip(hash);
  if (!trip) return null;
  const patch: Record<string, unknown> = {};
  if (body.startDate && body.endDate) {
    patch.startDate = body.startDate;
    patch.endDate = body.endDate;
  }
  if (body.adults !== undefined) patch.adults = body.adults;
  if (body.kids !== undefined) patch.kids = body.kids;
  if (body.adults !== undefined || body.kids !== undefined) {
    const adults = body.adults !== undefined ? body.adults : trip.adults ?? null;
    const kids = body.kids !== undefined ? body.kids : trip.kids ?? null;
    const total = adults != null ? partyTotal(adults, kids) : undefined;
    patch.numberOfTravelers = total ?? null;
  }
  // The re-date stamp, market and zone derivations ride the ONE writer (LD 30, R-4).
  await storage.updateTrip(trip.id, patch as any);
  return readGuestPlan(hash);
}

export type GuestSaveOutcome =
  | { ok: true; itemId: string; located: boolean; existing: boolean; item: GuestPlanView["items"][number] | null }
  | { ok: false; code: "no_plan" | PlanItemRejectReason; eventDate?: string };

/**
 * R3-17, pure: where an event lands on a plan — its own date, and that date's day number inside the plan's window
 * (null day number when the window does not hold it). No event date ⇒ null (the item keeps the ordinary day 1).
 */
export function guestEventPlacement(
  eventDate: string | null,
  planStart: string,
  planEnd: string,
): { scheduledDate: string; dayNumber: number | null } | null {
  if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return null;
  const start = planStart.slice(0, 10);
  const end = planEnd.slice(0, 10);
  if (eventDate < start || eventDate > end) return { scheduledDate: eventDate, dayNumber: null };
  const day = Math.round((Date.parse(`${eventDate}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
  return { scheduledDate: eventDate, dayNumber: day };
}

/** R3-1: where a save spends its time, in ms — sent as `Server-Timing` so a slow save names its step. */
export type GuestSaveTimings = { plan: number; resolve: number; write: number; read: number };

/**
 * A-1 / A-11: save what the traveler pressed. The source row answers the item's name, point and link (A-1); a source
 * the plan already holds answers the item it already has (A-11 — a double press is one item). The check-and-insert is
 * serialized per plan (an advisory transaction lock), and migration 436's unique index on the content link is the
 * database's own guarantee for content kinds.
 */
export async function saveGuestPlanItem(
  hash: string,
  body: z.infer<typeof guestPlanItemBody>,
  /** R3-1: filled in place with where the save spent its time (the route sends it as `Server-Timing`). */
  timings: GuestSaveTimings = { plan: 0, resolve: 0, write: 0, read: 0 },
): Promise<GuestSaveOutcome> {
  let t = Date.now();
  const lap = (k: keyof GuestSaveTimings) => {
    const now = Date.now();
    timings[k] = now - t;
    t = now;
  };
  const trip = await currentGuestTrip(hash);
  lap("plan");
  if (!trip) return { ok: false, code: "no_plan" };
  const parsedRef = parsePlanItemRef(body);
  if (!parsedRef.ok) return { ok: false, code: parsedRef.reason };
  const ref: PlanItemRef = parsedRef.ref;
  const planDays = Math.round((Date.parse(`${String(trip.endDate).slice(0, 10)}T00:00:00Z`) - Date.parse(`${String(trip.startDate).slice(0, 10)}T00:00:00Z`)) / 86_400_000) + 1;
  const resolved = await resolvePlanItemRef(ref, { markets: await planMarkets(trip.id), planDays: Number.isFinite(planDays) ? planDays : null });
  lap("resolve");
  if (!resolved.ok) return { ok: false, code: resolved.reason };
  const source = resolved.source;
  // R4b-1: an event outside the plan's CONFIRMED dates is refused; an unconfirmed plan lets the event set its own day.
  if (eventOutsideConfirmedDates(source.eventDate, { startDate: trip.startDate, endDate: trip.endDate, datesConfirmed: trip.datesConfirmedAt != null })) {
    return { ok: false, code: "event_outside_dates", eventDate: String(source.eventDate).slice(0, 10) };
  }
  const located = source.latitude != null && source.longitude != null;
  // R3-17: an event lands on its own day — `scheduled_date` is the event's date, and its day number is that day's place
  // in the plan's window. A day the window does not hold keeps the date and lands on day 1 (never a guessed day).
  const eventPlacement = guestEventPlacement(source.eventDate ?? null, String(trip.startDate), String(trip.endDate));
  const out = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"guest-plan-item:" + trip.id}))`);
    const sameSource = source.contentType && source.contentId
      ? and(eq(itineraryItems.contentType, source.contentType), eq(itineraryItems.contentId, source.contentId))
      : source.providerServiceId
        ? eq(itineraryItems.providerServiceId, source.providerServiceId)
        : eq(itineraryItems.affiliateProductId, source.affiliateProductId!);
    const [held] = await tx
      .select({ id: itineraryItems.id })
      .from(itineraryItems)
      .where(and(eq(itineraryItems.tripId, trip.id), sameSource))
      .limit(1);
    if (held) return { itemId: held.id, existing: true };
    const [created] = await tx
      .insert(itineraryItems)
      .values(
        stampItemSourceClass({
          tripId: trip.id,
          title: source.title,
          description: null,
          itemType: source.itemType ?? "activity",
          // An event in the window lands on its own day, whatever day the card sent.
          // A chosen day (`placement.day_number`, e.g. a day-filtered feed) otherwise; none ⇒ Day 1, no time.
          dayNumber: eventPlacement?.dayNumber ?? ref.placement?.day_number ?? 1,
          ...(eventPlacement ? { scheduledDate: eventPlacement.scheduledDate } : {}),
          ...(source.startTime ? { startTime: source.startTime } : {}),
          status: "planned",
          origin: "traveler",
          ...(source.locationName ? { locationName: source.locationName } : {}),
          ...(located ? { latitude: source.latitude, longitude: source.longitude } : {}),
          ...(source.contentType && source.contentId ? { contentType: source.contentType, contentId: source.contentId } : {}),
          ...(source.providerServiceId ? { providerServiceId: source.providerServiceId } : {}),
          ...(source.affiliateProductId ? { affiliateProductId: source.affiliateProductId } : {}),
        }) as any,
      )
      .returning({ id: itineraryItems.id });
    // Ruling 3: retention counts from the plan's last change.
    await tx.update(trips).set({ updatedAt: new Date() }).where(eq(trips.id, trip.id));
    return { itemId: created.id, existing: false };
  });
  lap("write");
  // R3-1: the write has committed. Nothing after this line may turn it into an error: the leg recompute is queued
  // best-effort, and the stored item is read back for the answer (a failed read answers the id alone).
  if (!out.existing) {
    try {
      enqueuePlanLegRecompute(trip.id);
    } catch (err: any) {
      logger.warn({ tripId: trip.id, err: err?.message }, "guest save: leg recompute not queued (the save stands)");
    }
  }
  let item: GuestPlanView["items"][number] | null = null;
  try {
    const [row] = await db.select().from(itineraryItems).where(eq(itineraryItems.id, out.itemId)).limit(1);
    item = row ? viewOf(trip, [row]).items[0] ?? null : null;
  } catch (err: any) {
    logger.warn({ tripId: trip.id, err: err?.message }, "guest save: item read-back failed (the save stands)");
  }
  lap("read");
  return { ok: true, itemId: out.itemId, located, existing: out.existing, item };
}


/**
 * Ruling 5: on sign-in every unclaimed guest plan of this session becomes the account's, as-is. One atomic
 * conditional — a second claim, or a concurrent one, matches nothing (§15). The owner collaborator row the READ
 * resolver needs is written in the same transaction (the mint writes it the same way, storage.createTrip).
 */
export async function claimGuestPlans(hash: string, userId: string): Promise<string[]> {
  return db.transaction(async (tx) => {
    const claimed = await tx
      .update(trips)
      .set({ userId, guestClaimedAt: new Date(), guestSessionHash: null, updatedAt: new Date() })
      .where(and(eq(trips.guestSessionHash, hash), isNull(trips.userId), isNull(trips.guestClaimedAt)))
      .returning({ id: trips.id, createdAt: trips.createdAt, occasionSlug: trips.occasionSlug, eventType: trips.eventType });
    for (const row of claimed) {
      await tx.insert(tripCollaborators).values({ tripId: row.id, userId, role: "owner" }).onConflictDoNothing();
    }
    // A-4 / A-35: the claimed plan keeps its fine occasion on the row, and its new owner's pen reads it — through the ONE
    // pen-occasion writer, after the row is the owner's. A plan with no occasion writes nothing.
    for (const row of claimed) {
      if (!row.occasionSlug) continue;
      const occasion = await tx.select({ name: experienceTypes.name }).from(experienceTypes).where(eq(experienceTypes.slug, row.occasionSlug)).limit(1);
      await writePlanPenOccasion(
        userId,
        row.id,
        {
          experienceSlug: row.occasionSlug,
          ...(occasion[0]?.name ? { experienceType: occasion[0].name } : {}),
          ...(row.eventType ? { eventType: row.eventType } : {}),
        },
        tx,
      );
    }
    return claimed
      .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
      .map((r) => r.id);
  });
}

/**
 * Cut-list #1 slice C — on sign-in, a claimed plan keeps every item, and its BOOKABLE items become cart lines.
 *
 * Bookable = an item that names a platform listing (`provider_service_id`), still `in_planning`, whose listing the
 * checkout would hold (`checkoutProjectionRefusals` — published price, not request-only/hidden; the ONE predicate the
 * projection itself applies, §18 rule 1). Each flip is the routing machine's own `in_planning → ready_for_checkout`
 * edge as an atomic conditional (§15) with its diary row in the same transaction, then `syncItemProjection` writes the
 * cart line (LD 39: the cart IS that projection; no second store). Runs AFTER the claim commits, so the projection
 * reads the new owner; a failure here never fails the claim (§15b) — the items stay on the plan, routable by hand.
 * Partner (affiliate) items, events and free places are never carted: nothing on the platform sells them.
 */
export async function projectClaimedBookableItems(tripIds: string[], userId: string): Promise<{ carted: string[] }> {
  const carted: string[] = [];
  if (tripIds.length === 0) return { carted };
  for (const tripId of tripIds) {
    try {
      const rows = await db
        .select({
          id: itineraryItems.id,
          serviceId: itineraryItems.providerServiceId,
          ownerId: providerServices.userId,
          price: providerServices.price,
          priceType: providerServices.priceType,
          bookingMode: providerServices.bookingMode,
        })
        .from(itineraryItems)
        .innerJoin(providerServices, eq(providerServices.id, itineraryItems.providerServiceId))
        .where(and(eq(itineraryItems.tripId, tripId), eq(itineraryItems.routingStatus, "in_planning"), isNotNull(itineraryItems.providerServiceId)));
      if (rows.length === 0) continue;
      const refusals = await checkoutProjectionRefusals(
        rows.map((r) => ({ id: r.serviceId!, userId: r.ownerId, price: r.price, priceType: r.priceType, bookingMode: r.bookingMode })),
      );
      for (const r of rows) {
        if (refusals.has(r.serviceId!)) continue;
        const flipped = await db.transaction(async (tx) => {
          const out = await tx
            .update(itineraryItems)
            .set({ routingStatus: "ready_for_checkout", updatedAt: new Date() })
            .where(and(eq(itineraryItems.id, r.id), eq(itineraryItems.tripId, tripId), eq(itineraryItems.routingStatus, "in_planning")))
            .returning({ id: itineraryItems.id });
          if (out.length > 0) {
            await logItemTransition(tx, {
              tripId,
              itemId: r.id,
              eventType: "status_transition",
              fromStatus: "in_planning",
              toStatus: "ready_for_checkout",
              actorType: "traveler",
              actorId: userId,
            });
          }
          return out.length > 0;
        });
        if (!flipped) continue;
        const sync = await syncItemProjection(r.id);
        if (sync.action === "upserted") carted.push(r.id);
      }
    } catch (err: any) {
      logger.warn({ tripId, code: err?.code, err: err?.message }, "guest claim: cart projection failed; items stay on the plan");
    }
  }
  return { carted };
}

export const GUEST_PLAN_RETENTION_DISABLED_LOG = "guest plan retention is disabled (GUEST_PLAN_RETENTION_DAYS unset); deleted nothing";

export type GuestPlanRetentionResult =
  | { status: "disabled"; deleted: 0; log: string }
  | { status: "ok"; deleted: number; retentionDays: number; more: boolean }
  | { status: "error"; deleted: 0; error: string };

/** Ruling 6: logged once at boot by the routes module. */
export function logGuestPlanRetentionBootState(): void {
  const days = guestPlanRetentionDays();
  if (days == null) logger.info({ job: "guest-plan-retention" }, GUEST_PLAN_RETENTION_DISABLED_LOG);
  else logger.info({ job: "guest-plan-retention", retentionDays: days }, "guest plan retention enabled");
}

/** The retention pass (internal-jobs rail). Unclaimed guest plans idle past N days are deleted; items cascade. */
export async function runGuestPlanRetention(now: Date = new Date()): Promise<GuestPlanRetentionResult> {
  const days = guestPlanRetentionDays();
  if (days == null) {
    logger.info({ job: "guest-plan-retention" }, GUEST_PLAN_RETENTION_DISABLED_LOG);
    return { status: "disabled", deleted: 0, log: GUEST_PLAN_RETENTION_DISABLED_LOG };
  }
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  try {
    const deleted = await db.execute(sql`
      DELETE FROM trips
      WHERE id IN (
        SELECT id FROM trips
        WHERE guest_session_hash IS NOT NULL
          AND guest_claimed_at IS NULL
          AND user_id IS NULL
          AND COALESCE(updated_at, created_at) < ${cutoff}
        ORDER BY updated_at ASC NULLS FIRST
        LIMIT ${GUEST_PLAN_RETENTION_BATCH}
      )
      RETURNING id
    `);
    const count = (deleted as any).rows?.length ?? (deleted as any).rowCount ?? 0;
    logger.info({ job: "guest-plan-retention", deleted: count, retentionDays: days }, "guest plan retention pass");
    return { status: "ok", deleted: count, retentionDays: days, more: count >= GUEST_PLAN_RETENTION_BATCH };
  } catch (err: any) {
    logger.error({ job: "guest-plan-retention", code: err?.code }, "guest plan retention pass failed");
    return { status: "error", deleted: 0, error: String(err?.code ?? "error") };
  }
}

/**
 * A-26 (ledger `2026-11-05-lane7-guest-slip`): an admin removes ONE guest test row by id. Only an UNCLAIMED guest plan
 * matches — a guest session hash, no owner, never claimed — so a member's plan, or a guest plan someone has since
 * claimed, is never deleted by this. One statement: the conditions are the guard (§15). Items cascade.
 * Returns false when no such row exists (the route answers one 404 for absent and not-a-guest-plan alike, LD 40).
 */
export async function deleteUnclaimedGuestPlan(tripId: string): Promise<boolean> {
  const deleted = await db
    .delete(trips)
    .where(and(eq(trips.id, tripId), isNotNull(trips.guestSessionHash), isNull(trips.userId), isNull(trips.guestClaimedAt)))
    .returning({ id: trips.id });
  return deleted.length > 0;
}

/**
 * R4b-3 (round 4b, Nov 6, 2026): the `kind:source_id` keys a signed-in traveler's plans hold — their own plans that
 * have not ended — read from the stored items, so "Saved to plan" survives a reload. No price, no amount, no item body.
 */
export async function savedRefKeysForUser(userId: string): Promise<string[]> {
  const rows = await db
    .select({
      contentType: itineraryItems.contentType,
      contentId: itineraryItems.contentId,
      providerServiceId: itineraryItems.providerServiceId,
      affiliateProductId: itineraryItems.affiliateProductId,
    })
    .from(itineraryItems)
    .innerJoin(trips, eq(trips.id, itineraryItems.tripId))
    .where(and(eq(trips.userId, userId), sql`(${trips.endDate} IS NULL OR ${trips.endDate} >= CURRENT_DATE)`));
  const keys = new Set<string>();
  for (const r of rows) {
    const k = savedRefKeyOfItem(r);
    if (k) keys.add(k);
  }
  return Array.from(keys).sort();
}
