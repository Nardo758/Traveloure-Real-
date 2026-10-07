/**
 * THE GUEST MAP'S ONE ADD, RUN ONCE AFTER SIGN-IN (step 8d, brief items 25–26; ledger
 * `2026-10-07-step8d-guest-map`).
 *
 * A guest presses Add on the guest map; the sign-in record (`pending-plan-record.ts`, v2) carries that
 * one add — a kind, an id, the shown name, Day 1. After sign-in the record is taken (cleared) and the
 * plan is created through the ONE mint; then this module runs the add:
 *
 *   1. the add is first written to a RETRY entry keyed on the new plan's id, so a reload or a failure
 *      between the mint and the add retries the ADD — never the mint (there is no record left to mint
 *      from);
 *   2. the plan is read first; if a row already names this listing / partner place, nothing is posted
 *      (a retry after a POST whose answer was lost adds nothing a second time);
 *   3. the listing is RE-READ from its own public endpoint (`GET /api/services/:id`, or
 *      `GET /api/affiliate/products/:id` for a partner place). A listing withdrawn during the round trip
 *      answers 404 and is REPORTED, never added; nothing the guest's browser held (coordinates, price)
 *      is posted;
 *   4. the add goes through the EXISTING item route, `POST /api/trips/:tripId/itinerary-items`, with the
 *      ONE add body (`browseAddBody`) — the same rail and body a member's Browse add uses (LD 39).
 *
 * Nothing is stored for a guest on the server (G2), and nothing here writes `/api/cart`.
 */
import { browseAddBody, listingPlaces, partnerPlaces } from "@/lib/browse-supply";
import { normalizePendingMapAdd, type PendingMapAdd } from "@/lib/pending-plan-record";

export const PENDING_MAP_ADD_RETRY_KEY = "traveloure_pending_map_add_retry";
/** The retry entry lives as long as the sign-in record could have (one hour). */
export const PENDING_MAP_ADD_RETRY_TTL_MS = 60 * 60 * 1000;

export interface PendingMapAddRetry {
  tripId: string;
  add: PendingMapAdd;
  expiresAt: number;
}

export type PendingMapAddOutcome =
  | { status: "added"; title: string }
  | { status: "already"; title: string }
  | { status: "withdrawn"; title: string }
  | { status: "failed"; title: string; message: string };

export type MapAddFetch = (input: string, init?: RequestInit) => Promise<Response>;

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function writePendingMapAddRetry(tripId: string, add: PendingMapAdd, now: number = Date.now()): void {
  try {
    storage()?.setItem(
      PENDING_MAP_ADD_RETRY_KEY,
      JSON.stringify({ tripId, add, expiresAt: now + PENDING_MAP_ADD_RETRY_TTL_MS } satisfies PendingMapAddRetry),
    );
  } catch {
    /* no store ⇒ the add is attempted once, in memory */
  }
}

export function readPendingMapAddRetry(now: number = Date.now()): PendingMapAddRetry | null {
  try {
    const raw = storage()?.getItem(PENDING_MAP_ADD_RETRY_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as Partial<PendingMapAddRetry>;
    const add = normalizePendingMapAdd(r?.add);
    if (typeof r?.tripId === "string" && r.tripId && add && typeof r.expiresAt === "number" && r.expiresAt > now) {
      return { tripId: r.tripId, add, expiresAt: r.expiresAt };
    }
    storage()?.removeItem(PENDING_MAP_ADD_RETRY_KEY);
  } catch {
    /* unreadable ⇒ nothing to retry */
  }
  return null;
}

export function clearPendingMapAddRetry(): void {
  try {
    storage()?.removeItem(PENDING_MAP_ADD_RETRY_KEY);
  } catch {
    /* nothing else to do */
  }
}

/** Pure. Does the plan's item list already name this listing / partner place? */
export function planAlreadyHolds(itemsPayload: unknown, add: PendingMapAdd): boolean | null {
  const days = (itemsPayload as { days?: Array<{ items?: unknown }> } | null)?.days;
  if (!Array.isArray(days) || days.some((d) => !Array.isArray(d?.items))) return null;
  const key = add.kind === "listing" ? "providerServiceId" : "affiliateProductId";
  return days.some((d) => (d.items as Array<Record<string, unknown>>).some((row) => row?.[key] === add.id));
}

/**
 * Run the one add onto `tripId`. Never throws: every way it can end is an outcome the caller reports.
 * The retry entry is cleared on every FINAL outcome (added / already / withdrawn) and kept on `failed`.
 */
export async function attachPendingMapAdd(
  tripId: string,
  add: PendingMapAdd,
  fetcher: MapAddFetch = (input, init) => fetch(input, init),
): Promise<PendingMapAddOutcome> {
  const title = add.title;
  const done = (o: PendingMapAddOutcome): PendingMapAddOutcome => {
    if (o.status !== "failed") clearPendingMapAddRetry();
    return o;
  };
  try {
    const itemsRes = await fetcher(`/api/trips/${encodeURIComponent(tripId)}/itinerary-items`, { credentials: "include" });
    if (!itemsRes.ok) return { status: "failed", title, message: "Could not read the new plan, so the add was not attempted." };
    const held = planAlreadyHolds(await itemsRes.json(), add);
    if (held === null) return { status: "failed", title, message: "Could not read the new plan's items, so the add was not attempted." };
    if (held) return done({ status: "already", title });

    // The listing's OWN public read — never what the guest's browser held.
    const url =
      add.kind === "listing"
        ? `/api/services/${encodeURIComponent(add.id)}`
        : `/api/affiliate/products/${encodeURIComponent(add.id)}`;
    const placeRes = await fetcher(url, { credentials: "include" });
    if (placeRes.status === 404) return done({ status: "withdrawn", title });
    if (!placeRes.ok) return { status: "failed", title, message: "Could not read that place right now." };
    const body = await placeRes.json();
    const [place] =
      add.kind === "listing" ? listingPlaces([body]) : partnerPlaces([(body as { product?: unknown })?.product ?? body]);
    if (!place || place.id !== add.id) return done({ status: "withdrawn", title });

    const postRes = await fetcher(`/api/trips/${encodeURIComponent(tripId)}/itinerary-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(browseAddBody(place, add.dayNumber)),
    });
    if (!postRes.ok) {
      let message = "";
      try {
        message = ((await postRes.json()) as { message?: string })?.message ?? "";
      } catch {
        /* the status alone is the failure */
      }
      return { status: "failed", title, message: message || "The add did not go through." };
    }
    return done({ status: "added", title: place.name });
  } catch (e) {
    return { status: "failed", title, message: e instanceof Error ? e.message : "The add did not go through." };
  }
}

/** The one sentence each outcome says out loud (the plan itself was created in every case). */
export function pendingMapAddMessage(o: PendingMapAddOutcome): { title: string; description?: string; destructive?: boolean } {
  switch (o.status) {
    case "added":
      return { title: `Added ${o.title} to day 1` };
    case "already":
      return { title: `${o.title} is on day 1` };
    case "withdrawn":
      return { title: `${o.title} is no longer available`, description: "Your plan was created without it." };
    default:
      return {
        title: `Your plan was created, but ${o.title} was not added yet`,
        description: `${o.message} It will be tried again when you reload this page.`,
        destructive: true,
      };
  }
}
