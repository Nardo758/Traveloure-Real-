/**
 * THE EXPERT DOOR — the server half (ledger `2026-09-29-expert-door`; decision-maker dispatch Sep 29,
 * 2026). After "Get a local expert" the slip asks "How much help do you want?"; this module answers
 * the card (a band per help level) and the picker (the experts who offer that level in the plan's
 * market), and records the door's funnel events.
 *
 *   · WHO MAY ASK: the plan's owner or delegate (LD 42 D16 — choosing an expert is the traveler's
 *     decision); anyone else is ONE 404 (LD 40).
 *   · WHO APPEARS: an expert whose BYLINE GATE passes for the plan's market
 *     (`checkBylineEligibility` — approved, a handle, a live storefront, a VERIFIED neighbourhood in
 *     that market; never re-derived, §18 rule 1) and who lists an approved, active offering for the
 *     level (`shared/expert-door.ts`). A listing that states a city must be in the plan's market; a
 *     listing with no city is remote help and counts anywhere.
 *   · WHAT A CARD SAYS: name, handle, the neighbourhoods verified in THIS market, the matching
 *     offerings with their own published prices, and the MEASURED reply time
 *     (`loadLiveStatus`) — or nothing where nothing was measured (§13). No `users.id` (LD 40).
 *   · THE BAND is the min–max of published prices across the picker's own listings — the real
 *     range, never a fee-table rate (§8 untouched).
 *   · REQUEST is the existing storefront rail (`POST /api/expert-booking-requests` with this plan's
 *     `tripId`), which attaches the advisor through the ONE author (LD 32) — this module adds no
 *     second attach path.
 */
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "../db";
import { funnelEvents, itineraryItems, providerServices, trips, users } from "@shared/schema";
import { isEarnerRole } from "@shared/roles";
import {
  HELP_LEVELS,
  bandFor,
  bandLabel,
  levelTier,
  offeringKeyMatchesLevel,
  selectPickerExperts,
  type Band,
  type HelpLevel,
} from "@shared/expert-door";
import { REPLY_TIME_LABELS } from "@shared/live-availability";
import { checkBylineEligibility } from "./blog-byline-gate.service";
import { loadLiveStatus } from "./live-status.service";
import { getMarketByKey, resolveMarketSlug } from "./trend-engine/operating-markets";
import { verifyTripOwnership } from "../utils/trip-ownership";
import { isManagingEaForTrip } from "./ea-plan-delegate.service";
import { trackFunnelEvent } from "../utils/funnelTracker";

export class ExpertDoorError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
const notFound = () => new ExpertDoorError(404, "not_found", "No such plan");

async function assertChooser(tripId: string, userId: string | null | undefined): Promise<void> {
  if (!userId) throw notFound();
  if (await verifyTripOwnership(tripId, userId)) return;
  if (await isManagingEaForTrip(tripId, userId)) return;
  throw notFound();
}

interface DoorListing {
  id: string;
  title: string;
  price: string | null;
  priceType: string | null;
  showPrice: boolean | null;
  offeringTypeKey: string | null;
}

interface PlanMarket {
  key: string | null;
  cityName: string | null;
}

async function planMarket(tripId: string): Promise<PlanMarket> {
  const [t] = await db.select({ marketSlug: trips.marketSlug, destination: trips.destination }).from(trips).where(eq(trips.id, tripId)).limit(1);
  const key = t?.marketSlug ?? resolveMarketSlug(t?.destination ?? null);
  const market = key ? getMarketByKey(key) : undefined;
  return { key: market ? market.marketKey : null, cityName: market?.cityName ?? null };
}

/** Every earner's approved, active listing that names an expert offering, grouped by owner. */
export async function loadCandidates(marketKey: string) {
  const rows = await db
    .select({
      id: providerServices.id,
      ownerId: providerServices.userId,
      title: providerServices.serviceName,
      price: providerServices.price,
      priceType: providerServices.priceType,
      showPrice: providerServices.showPrice,
      offeringTypeKey: providerServices.expertOfferingTypeKey,
      city: providerServices.city,
      role: users.role,
    })
    .from(providerServices)
    .innerJoin(users, eq(users.id, providerServices.userId))
    .where(
      and(
        eq(providerServices.approvalStatus, "approved"),
        eq(providerServices.status, "active"),
        isNotNull(providerServices.expertOfferingTypeKey),
      ),
    );
  const byOwner = new Map<string, DoorListing[]>();
  // Smoke-13 addendum: the concierge pool account is never a door choice — it is the fallback path.
  const { getPlatformConciergeUserId } = await import("./platform-concierge.service");
  const pool = await getPlatformConciergeUserId();
  for (const r of rows) {
    if (!isEarnerRole(r.role)) continue;
    if (pool && r.ownerId === pool) continue;
    // A listing that names a city must be in this market; one with no city is remote help.
    if (r.city && resolveMarketSlug(r.city) !== marketKey) continue;
    const list = byOwner.get(r.ownerId) ?? [];
    list.push({ id: r.id, title: r.title, price: r.price ?? null, priceType: r.priceType ?? null, showPrice: r.showPrice ?? null, offeringTypeKey: r.offeringTypeKey ?? null });
    byOwner.set(r.ownerId, list);
  }
  // Smoke 13 #3: the door offers ROUTABLE experts only (approved application + Identity verified +
  // Connect onboarded, never seed-sourced, never the pool) — the predicate routing reads.
  const { routableUserIds } = await import("./expert-routability");
  const routable = await routableUserIds(Array.from(byOwner.keys()));
  return Array.from(byOwner.entries())
    .filter(([expertId]) => routable.has(expertId))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([expertId, listings]) => ({ expertId, listings }));
}

/** The gate, memoised per request so an expert is asked once however many levels are computed. */
function gateFor(marketKey: string) {
  const memo = new Map<string, Promise<boolean>>();
  return (expertId: string) => {
    if (!memo.has(expertId)) memo.set(expertId, checkBylineEligibility(expertId, marketKey).then((d) => d.eligible));
    return memo.get(expertId)!;
  };
}

export interface HelpLevelView {
  level: HelpLevel;
  expertCount: number;
  band: Band;
  bandLabel: string | null;
}

/** The "How much help do you want?" card: one row per level, each band from the picker's own listings. */
export async function expertHelpOverview(tripId: string, userId: string | null | undefined) {
  await assertChooser(tripId, userId);
  const market = await planMarket(tripId);
  if (!market.key) {
    return { market, levels: HELP_LEVELS.map((level) => ({ level, expertCount: 0, band: { kind: "none" } as Band, bandLabel: null })) };
  }
  const candidates = await loadCandidates(market.key);
  const gate = gateFor(market.key);
  const levels: HelpLevelView[] = [];
  for (const level of HELP_LEVELS) {
    const picked = await selectPickerExperts(candidates, level, gate);
    const band = bandFor(picked.flatMap((p) => p.listings));
    levels.push({ level, expertCount: picked.length, band, bandLabel: bandLabel(band) });
  }
  return { market, levels };
}

export interface PickerExpert {
  handle: string;
  displayName: string;
  profileImageUrl: string | null;
  neighborhoods: string[];
  replyTime: string | null;
  offerings: Array<{ serviceId: string; title: string; price: string | null; priceType: string | null; showPrice: boolean | null }>;
}

/** The experts who offer a level in the plan's market. An empty list is an honest answer, never padded. */
export async function expertPicker(tripId: string, userId: string | null | undefined, level: HelpLevel): Promise<{ market: PlanMarket; experts: PickerExpert[] }> {
  await assertChooser(tripId, userId);
  const market = await planMarket(tripId);
  if (!market.key) return { market, experts: [] };
  const picked = await selectPickerExperts(await loadCandidates(market.key), level, gateFor(market.key));
  if (!picked.length) return { market, experts: [] };
  const ids = picked.map((p) => p.expertId);
  const people = await db
    .select({ id: users.id, handle: users.handle, firstName: users.firstName, lastName: users.lastName, profileImageUrl: users.profileImageUrl })
    .from(users)
    .where(inArray(users.id, ids));
  const hoods = await db.execute(sql`
    SELECT en.expert_id AS id, cn.name AS name, cn.city AS city
      FROM expert_neighborhoods en
      JOIN city_neighborhoods cn ON cn.id = en.neighborhood_id
     WHERE en.expert_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
       AND en.verified_at IS NOT NULL
     ORDER BY cn.name
  `);
  const live = await loadLiveStatus(ids);
  const experts: PickerExpert[] = [];
  for (const p of picked) {
    const u = people.find((x) => x.id === p.expertId);
    if (!u?.handle) continue; // the gate requires a handle; a race that removed it drops the card
    const neighborhoods = (hoods.rows as any[])
      .filter((r) => r.id === p.expertId && resolveMarketSlug(String(r.city ?? "")) === market.key)
      .map((r) => String(r.name));
    const bucket = live.get(p.expertId)?.replyTime ?? null;
    experts.push({
      handle: u.handle,
      displayName: [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || `@${u.handle}`,
      profileImageUrl: u.profileImageUrl ?? null,
      neighborhoods: Array.from(new Set(neighborhoods)),
      replyTime: bucket ? REPLY_TIME_LABELS[bucket] : null,
      offerings: p.listings.map((l) => ({ serviceId: l.id, title: l.title, price: l.price, priceType: l.priceType, showPrice: l.showPrice })),
    });
  }
  return { market, experts };
}

export const EXPERT_DOOR_EVENTS = ["expert_help_level_chosen", "expert_picker_shown", "expert_interest"] as const;
export type ExpertDoorEvent = (typeof EXPERT_DOOR_EVENTS)[number];

/**
 * The door's funnel rows, reported through the ONE client event rail (slip-funnel-events §5). The
 * client names the event and the level only; the market is the plan's and the picker count is
 * RECOMPUTED here (the value is never taken from the client). A plan the caller may not choose for
 * is ONE 404.
 */
export async function recordExpertDoorEvent(input: {
  tripId: string;
  userId: string;
  type: ExpertDoorEvent;
  level: HelpLevel;
  /**
   * R-r (surface step 1, ledger `2026-10-03-surface-step1-item-row`): "Ask a local about this" on an
   * item, in a city with no live expert, records WHICH item and the traveler's question with the
   * interest row. Nothing is charged. The item must be on THIS plan — one 404 otherwise (LD 40).
   */
  itemId?: string;
  question?: string;
}): Promise<void> {
  await assertChooser(input.tripId, input.userId);
  if (input.itemId) {
    const [row] = await db
      .select({ id: itineraryItems.id })
      .from(itineraryItems)
      .where(and(eq(itineraryItems.id, input.itemId), eq(itineraryItems.tripId, input.tripId)))
      .limit(1);
    if (!row) throw notFound();
  }
  const market = await planMarket(input.tripId);
  const props: Record<string, unknown> = { level: input.level, tier: levelTier(input.level), market: market.key };
  if (input.type === "expert_interest" && input.itemId) {
    props.itemId = input.itemId;
    if (input.question) props.question = input.question;
  }
  if (input.type === "expert_picker_shown") {
    props.count = (await expertPicker(input.tripId, input.userId, input.level)).experts.length;
  }
  await trackFunnelEvent({ userId: input.userId, tripId: input.tripId, eventType: input.type, funnelStage: "SLIP", eventData: props });
}

/**
 * Smoke 7 item 4 (ledger `2026-10-03-no-ward-pins`): the questions THIS viewer saved through "Ask a
 * local about this", read back from their own `expert_interest` rows (the one record — nothing new is
 * stored). Scoped to the session user (§14 applied to reads); the latest row per item wins. The city
 * is the plan's market, `null` when the plan has none (§13 — the copy then names no city).
 */
export async function savedItemQuestions(
  tripId: string,
  userId: string,
): Promise<{ cityName: string | null; items: Record<string, { question: string | null; savedAt: string }> }> {
  const rows = await db
    .select({ properties: funnelEvents.properties, createdAt: funnelEvents.createdAt })
    .from(funnelEvents)
    .where(
      and(
        eq(funnelEvents.tripId, tripId),
        eq(funnelEvents.userId, userId),
        eq(funnelEvents.eventType, "expert_interest"),
        sql`${funnelEvents.properties}->>'itemId' IS NOT NULL`,
      ),
    )
    .orderBy(funnelEvents.createdAt);
  const items: Record<string, { question: string | null; savedAt: string }> = {};
  for (const r of rows) {
    const p = (r.properties ?? {}) as { itemId?: unknown; question?: unknown };
    if (typeof p.itemId !== "string") continue;
    items[p.itemId] = {
      question: typeof p.question === "string" ? p.question : null,
      savedAt: new Date(r.createdAt as any).toISOString(),
    };
  }
  if (Object.keys(items).length === 0) return { cityName: null, items };
  return { cityName: (await planMarket(tripId)).cityName, items };
}

/** The request rail's row (`expert_request_sent`), written only when the request names a plan. */
export function expertRequestSentProperties(offeringTypeKey: string | null | undefined, serviceId: string) {
  const level = HELP_LEVELS.find((l) => offeringKeyMatchesLevel(offeringTypeKey, l)) ?? null;
  return { serviceId, offeringTypeKey: offeringTypeKey ?? null, level, tier: level ? levelTier(level) : null };
}
