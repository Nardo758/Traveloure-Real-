/**
 * Saved places — share ONE city as a read-only link (board #329, ledger
 * `2026-09-24-saved-places-plan-and-share`, migration 324).
 *
 * The ONE writer of `saved_place_shares`. A share stores no place: the public read takes the
 * owner's CURRENT saved places whose city has the share's key (`savedCityKey`, the same key the
 * Saved places shelf groups by — §18 rule 1), so removing a place removes it from the link and
 * revoking the share ends it.
 *
 * §14: the owner is always the session user passed in by the route, never a body or query value.
 * LD 40 posture: the public read returns the city and the places — no owner, no user id, no row id.
 * One 404 for "no such share", "revoked" and "not yours".
 */
import crypto from "node:crypto";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { savedItems, savedPlaceShares } from "@shared/schema";
import { savedCityKey, type SharedSavedPlaces } from "@shared/saved-items";

export interface OwnedShare {
  id: string;
  city: string;
  cityKey: string;
  token: string;
  createdAt: string;
}

export type ShareCityResult =
  | { ok: true; share: OwnedShare; created: boolean }
  | { ok: false; reason: "no_saved_places" };

function toOwned(row: typeof savedPlaceShares.$inferSelect): OwnedShare {
  return {
    id: row.id,
    city: row.cityLabel,
    cityKey: row.cityKey,
    token: row.token,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

async function savedPlacesInCity(userId: string, key: string) {
  const rows = await db
    .select()
    .from(savedItems)
    .where(eq(savedItems.userId, userId))
    .orderBy(asc(savedItems.createdAt));
  return rows.filter((r) => savedCityKey(r.city) === key);
}

/**
 * Share a city. Idempotent at the statement: the partial UNIQUE on (user_id, city_key) WHERE
 * revoked_at IS NULL means a second press (or a concurrent one) returns the SAME active link.
 * A city with nothing saved in it is refused — a link to an empty list shares nothing.
 */
export async function shareSavedCity(userId: string, city: string): Promise<ShareCityResult> {
  const key = savedCityKey(city);
  if (!key) return { ok: false, reason: "no_saved_places" };
  const places = await savedPlacesInCity(userId, key);
  if (places.length === 0) return { ok: false, reason: "no_saved_places" };

  // The label is the spelling the traveler saved with (the shelf's own label), not the request's.
  const label = (places[0].city ?? city).trim().slice(0, 100);
  const inserted = await db
    .insert(savedPlaceShares)
    .values({
      id: crypto.randomUUID(),
      userId,
      cityKey: key,
      cityLabel: label,
      token: crypto.randomBytes(32).toString("hex"),
    })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return { ok: true, share: toOwned(inserted[0]), created: true };

  const [existing] = await db
    .select()
    .from(savedPlaceShares)
    .where(and(eq(savedPlaceShares.userId, userId), eq(savedPlaceShares.cityKey, key), isNull(savedPlaceShares.revokedAt)))
    .limit(1);
  if (!existing) throw new Error("saved place share conflict without an active row");
  return { ok: true, share: toOwned(existing), created: false };
}

/** The session user's active shares. */
export async function listSavedCityShares(userId: string): Promise<OwnedShare[]> {
  const rows = await db
    .select()
    .from(savedPlaceShares)
    .where(and(eq(savedPlaceShares.userId, userId), isNull(savedPlaceShares.revokedAt)))
    .orderBy(asc(savedPlaceShares.createdAt));
  return rows.map(toOwned);
}

/** Stop sharing. The transition is the guard (§15): only the owner's still-active row moves. */
export async function revokeSavedCityShare(userId: string, shareId: string): Promise<boolean> {
  const rows = await db
    .update(savedPlaceShares)
    .set({ revokedAt: sql`NOW()` })
    .where(and(eq(savedPlaceShares.id, shareId), eq(savedPlaceShares.userId, userId), isNull(savedPlaceShares.revokedAt)))
    .returning({ id: savedPlaceShares.id });
  return rows.length > 0;
}

/** The public read. `null` = no active share with that token (the route answers one 404). */
export async function readSharedSavedPlaces(token: string): Promise<SharedSavedPlaces | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const [share] = await db
    .select()
    .from(savedPlaceShares)
    .where(and(eq(savedPlaceShares.token, token), isNull(savedPlaceShares.revokedAt)))
    .limit(1);
  if (!share) return null;
  const places = await savedPlacesInCity(share.userId, share.cityKey);
  return {
    city: share.cityLabel,
    places: places.map((p) => ({
      contentType: p.contentType,
      contentName: p.contentName,
      contentImage: p.contentImage ?? null,
    })),
  };
}
