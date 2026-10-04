/**
 * Place photos (R-aq; step 6 — ledger `2026-10-04-step6-trip-card`). The I/O behind the pure order in
 * `@shared/place-photos`: our listing image → Wikimedia Commons (cached in `place_photos`, migration
 * 346) → a live Google Place Photo under a daily cap (never stored) → none. This file is the ONE
 * reader/writer of `place_photos`.
 *
 * Google: Place Details (New) with the `photos` field mask gives a photo resource name and its
 * author attributions; the media endpoint with `skipHttpRedirect=true` answers a short-lived
 * `photoUri` that carries NO key — so the key never reaches a client (unlike the legacy
 * `google-places-photos.service`, which puts it in the URL).
 */
import crypto from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import { apiUsageLogs, placePhotos } from "@shared/schema";
import {
  photoCacheKey,
  resolvePlacePhoto,
  type CommonsCandidate,
  type PhotoPlace,
  type PhotoResolveDeps,
  type PhotoView,
} from "@shared/place-photos";
import { PLACE_PHOTO_ENDPOINT, googlePhotoLive } from "./place-photos-google";
import {
  WIKIMEDIA_USER_AGENT,
  placePhotosCostCents,
  placePhotosDailyCap,
  placePhotosGoogleEnabled,
  placePhotosRecheckDays,
  placePhotosWikimediaEnabled,
} from "../config/place-photos.config";

type Fetch = typeof fetch;

const startOfUtcDay = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

/** Commons files near the point (geosearch, file namespace) with their licence metadata. */
export async function commonsNear(p: PhotoPlace, fetchImpl: Fetch = fetch): Promise<CommonsCandidate[] | null> {
  if (p.lat == null || p.lng == null) return null;
  const url =
    "https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2" +
    `&generator=geosearch&ggscoord=${p.lat}%7C${p.lng}&ggsradius=250&ggslimit=20&ggsnamespace=6` +
    "&prop=imageinfo|coordinates&iiprop=url|extmetadata&iiurlwidth=800";
  const res = await fetchImpl(url, { headers: { "User-Agent": WIKIMEDIA_USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) return null;
  const body: any = await res.json();
  const pages: any[] = Array.isArray(body?.query?.pages) ? body.query.pages : [];
  return pages
    .map((pg): CommonsCandidate | null => {
      const ii = Array.isArray(pg?.imageinfo) ? pg.imageinfo[0] : null;
      if (!ii) return null;
      const meta = ii.extmetadata ?? {};
      return {
        title: String(pg.title ?? ""),
        url: String(ii.thumburl ?? ii.url ?? ""),
        descriptionUrl: ii.descriptionurl ?? null,
        licence: meta?.LicenseShortName?.value ?? null,
        artist: meta?.Artist?.value ?? null,
        distanceM: Array.isArray(pg.coordinates) && pg.coordinates[0]?.dist != null ? Number(pg.coordinates[0].dist) : null,
      };
    })
    .filter((c): c is CommonsCandidate => !!c && !!c.url);
}

/** The cost row for one Place Photo request — the flight/Places pattern (one source for spend and cap). */
export async function logPlacePhotoUsage(r: { success: boolean; ms: number }): Promise<void> {
  try {
    await db.insert(apiUsageLogs).values({
      provider: "google_places",
      endpoint: PLACE_PHOTO_ENDPOINT,
      operation: "get",
      requestCount: 1,
      estimatedCostCents: Math.round(placePhotosCostCents()),
      costPerCallCents: Math.round(placePhotosCostCents()),
      responseTimeMs: r.ms,
      success: r.success,
      resultCount: r.success ? 1 : 0,
      metadata: {},
    } as any);
  } catch (err: any) {
    console.error("[place-photos] cost row not written:", err?.message ?? err);
  }
}

export const defaultPhotoDeps: PhotoResolveDeps = {
  async cacheGet(key) {
    const [row] = await db.select().from(placePhotos).where(eq(placePhotos.placeId, key)).orderBy(sql`${placePhotos.createdAt} DESC NULLS LAST`).limit(1);
    if (!row) return undefined;
    const fresh = row.checkedAt && Date.now() - row.checkedAt.getTime() < placePhotosRecheckDays() * 86400_000;
    if (!fresh) return undefined;
    if (!row.urlOrAsset) return null;
    return {
      source: row.source === "ours" ? "ours" : "wikimedia",
      url: row.urlOrAsset,
      licence: row.licence,
      attribution: row.attribution ?? "Wikimedia Commons",
      sourceUrl: null,
    };
  },
  async cacheSet(key, photo) {
    // A Google photo is never stored (R-aq): only a Commons answer — or a remembered miss — is.
    if (photo && photo.source === "google_live") return;
    const now = new Date();
    await db.insert(placePhotos).values({
      id: crypto.randomUUID(),
      placeId: key,
      source: "wikimedia",
      urlOrAsset: photo?.url ?? null,
      licence: photo?.licence ?? null,
      attribution: photo?.attribution ?? null,
      checkedAt: now,
      createdAt: now,
    });
  },
  commons: (p) => commonsNear(p),
  googleLive: (p) => googlePhotoLive(p, fetch, logPlacePhotoUsage),
  async googleAllowed() {
    if (!placePhotosGoogleEnabled()) return false;
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(apiUsageLogs)
      .where(and(eq(apiUsageLogs.provider, "google_places"), eq(apiUsageLogs.endpoint, PLACE_PHOTO_ENDPOINT), gte(apiUsageLogs.createdAt, startOfUtcDay())));
    return Number(row?.n ?? 0) < placePhotosDailyCap();
  },
  wikimediaEnabled: placePhotosWikimediaEnabled,
};

export { photoCacheKey };

/** Resolve photos for several places at once (sequential — Commons asks for politeness). */
export async function photosFor(places: Array<{ id: string } & PhotoPlace>, deps: PhotoResolveDeps = defaultPhotoDeps): Promise<Record<string, PhotoView | null>> {
  const out: Record<string, PhotoView | null> = {};
  for (const p of places) out[p.id] = await resolvePlacePhoto(p, deps);
  return out;
}
