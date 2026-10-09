/**
 * FU-S1-2 — THE STAY CARD'S ONE LINK, server half (decision-maker rulings, Oct 9, 2026; ledger
 * `2026-10-09-fu-s1-2-stay-link`). The order and URL rules are pure in `@shared/stay-link`.
 *
 *   · THE LIST (`listStayLinks`) makes NO Google call: a platform stay's provider-typed site (`own`),
 *     else a Google Maps URL built from the name and city (`maps`), pinned to a place ID only when an
 *     earlier answer already stored one (`knownPlaceIdForQuery`, a read).
 *   · THE PICKED STAY, LAZILY (`pickedStayLink`, behind `GET /api/trips/:tripId/stay-pick/link`, called
 *     when the card is OPENED): S1's routed pick only. `own` needs no call; otherwise ONE Place Details
 *     call through the EXISTING `places_details` caller (its switch `PLACE_FACTS_PLACES_ENABLED`, its daily
 *     cap) asking `STAY_LINK_FIELDS` only; the place ID comes from a stored earlier answer or the no-charge
 *     IDs-only lookup (`places_id_lookup`). Answers are memoised for the request only and NEVER stored —
 *     no column, no cache row, no `place_facts` row (Google's terms; LD 57's question is with the founder,
 *     and stored Places facts are untouched). The dollars land on the gate's usage row (FU-S1-1's
 *     `costHere`, purpose `stay_link`).
 *   · WRONG-HOTEL SAFEGUARD (§13): Google's answer is used only when its name names THIS hotel
 *     (`matchNamesItem`). A refused, failed, slow or mismatched answer falls back to the list link —
 *     never a different place's site. Never throws into the read (§15b).
 */
import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { providerServices, serviceProviderForms, trips } from "@shared/schema";
import { chooseStayLink, googleMapsSearchUrl, type StayLink } from "@shared/stay-link";
import { distinctiveTokens, matchNamesItem } from "@shared/place-name-gate";
import { readStayPick } from "@shared/stay-pick";
import type { StayHotel } from "@shared/where-to-stay";
import { gatedMapsCall } from "./maps-billing/maps-billing.service";
import { placesDetailsCostCents } from "../config/content-facts.config";
import { PlacesAdapter } from "./content-facts/places-adapter";

/** How long the open waits for Google before answering with the list link. */
export const STAY_LINK_TIMEOUT_MS = 4000;

type GoogleAnswer = { name: string | null; websiteUri: string | null; googleMapsUri: string | null };
type Hotel = Pick<StayHotel, "kind" | "id" | "name">;

export interface StayLinkDeps {
  adapter?: Pick<PlacesAdapter, "resolvePlaceId" | "fetchStayLinkByPlaceId">;
  knownPlaceId?: (query: string) => Promise<string | null>;
  timeoutMs?: number;
  routed?: (tripId: string) => Promise<boolean>;
}

const placeQuery = (name: string, city: string | null) => [name, city].filter(Boolean).join(", ").slice(0, 300);

async function knownId(query: string, deps: StayLinkDeps): Promise<string | null> {
  const read = deps.knownPlaceId ?? (async (q: string) => (await import("./content-facts/place-facts.service")).knownPlaceIdForQuery(q));
  try {
    return await read(query);
  } catch {
    return null;
  }
}

/** The provider's own typed website for a platform listing (their latest intake form), else null. */
async function ownWebsite(hotel: Hotel): Promise<string | null> {
  if (hotel.kind !== "platform") return null;
  const [row] = await db
    .select({ website: serviceProviderForms.website })
    .from(providerServices)
    .innerJoin(serviceProviderForms, eq(serviceProviderForms.userId, providerServices.userId))
    .where(eq(providerServices.id, hotel.id))
    .orderBy(desc(serviceProviderForms.createdAt))
    .limit(1);
  return row?.website ?? null;
}

/** The list's link for one card: own, else the no-call Google Maps URL. Never a Google API call. */
async function listLink(hotel: Hotel, city: string | null, deps: StayLinkDeps): Promise<StayLink | null> {
  const own = chooseStayLink({ own: await ownWebsite(hotel) });
  if (own) return own;
  const url = googleMapsSearchUrl(hotel.name, city, await knownId(placeQuery(hotel.name, city), deps));
  return url ? { kind: "maps", url } : null;
}

/** Attach the list link to each card, in parallel; a card with no link carries none (§13). */
export async function listStayLinks<H extends Hotel>(hotels: readonly H[], city: string | null, deps: StayLinkDeps = {}): Promise<Array<H & { stayLink?: StayLink }>> {
  const links = await Promise.all(hotels.map((h) => listLink(h, city, deps).catch(() => null)));
  return hotels.map((h, i) => (links[i] ? { ...h, stayLink: links[i]! } : { ...h }));
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(null);
      },
    );
  });
}

/** Google's answer for this hotel, or null (refused, failed, no place, or a different place's name). */
async function googleAnswer(hotel: Hotel, city: string | null, deps: StayLinkDeps, memo: Map<string, Promise<GoogleAnswer | null>>): Promise<GoogleAnswer | null> {
  const adapter = deps.adapter ?? new PlacesAdapter();
  let placeId = await knownId(placeQuery(hotel.name, city), deps);
  if (!placeId) {
    const req = { need: "stop.hours" as const, market: null, query: { text: hotel.name, city }, budgetCents: 0 };
    const out = await gatedMapsCall("places_id_lookup", async () => ({ value: await adapter.resolvePlaceId(req) }));
    if ("refused" in out || !out.value) return null;
    placeId = out.value;
  }
  const id = placeId;
  // In-request memo: one Details call per place per open, however many times this request asks.
  if (!memo.has(id)) {
    memo.set(
      id,
      gatedMapsCall("places_details", async () => ({ value: await adapter.fetchStayLinkByPlaceId(id) }), {
        sku: "place_details_enterprise",
        costHere: { usdPer1000: placesDetailsCostCents() * 10, purpose: "stay_link", ref: id },
      }).then((out) => ("refused" in out ? null : out.value)),
    );
  }
  const answer = await memo.get(id)!;
  if (!answer || !matchNamesItem(answer.name, distinctiveTokens(hotel.name, city), city)) return null;
  return answer;
}

/** The OPENED card's link for one hotel: own (no call), else Google's website, else Google's Maps link. */
export async function openedStayLink(hotel: Hotel, city: string | null, deps: StayLinkDeps = {}, memo = new Map<string, Promise<GoogleAnswer | null>>()): Promise<StayLink | null> {
  try {
    const own = chooseStayLink({ own: await ownWebsite(hotel) });
    if (own) return own;
    const g = await withTimeout(googleAnswer(hotel, city, deps, memo), deps.timeoutMs ?? STAY_LINK_TIMEOUT_MS);
    if (g) {
      const fromGoogle = chooseStayLink({ googleWebsite: g.websiteUri, googleMapsUri: g.googleMapsUri });
      if (fromGoogle) return fromGoogle;
    }
    return await listLink(hotel, city, deps);
  } catch (err: any) {
    console.warn(`[stay-link] ${hotel.kind}:${hotel.id} no link: ${String(err?.message ?? err).slice(0, 200)}`);
    return null;
  }
}

/**
 * `GET /api/trips/:tripId/stay-pick/link`: the picked stay's link, fetched when its card is opened.
 * Null = no such plan for this reader (one 404, LD 40). `{ stayLink: null }` = the plan has no routed
 * pick, or the picked hotel left our inventory — nothing to link (§13).
 */
export async function pickedStayLink(tripId: string, userId: string | null | undefined, deps: StayLinkDeps = {}): Promise<{ stayLink: StayLink | null } | null> {
  const { planRole } = await import("./plan-option-sets.service");
  if (!(await planRole(tripId, userId, "read"))) return null;
  const routed = deps.routed ?? (async (id: string) => (await import("./routing/plan-routed-legs.service")).tripGetsRoutedLegs(id));
  const [trip] = await db.select({ destination: trips.destination, stayPick: trips.stayPick }).from(trips).where(eq(trips.id, tripId)).limit(1);
  const pick = readStayPick(trip?.stayPick);
  if (!trip || !pick || !(await routed(tripId))) return { stayLink: null };
  const city = (trip.destination ?? "").split(",")[0].trim() || null;
  const { cityHotels } = await import("./where-to-stay.service");
  const hotel = city ? (await cityHotels(city)).find((h) => h.kind === pick.hotelKind && h.id === pick.hotelId) : undefined;
  if (!hotel) return { stayLink: null };
  return { stayLink: await openedStayLink(hotel, city, deps) };
}
