/**
 * Slice B2 (ledger `2026-10-05-rmt-share-images`): the DATA behind a Ready Made Trip's share images,
 * their cache, and the warm-up that runs when a listing is published.
 *
 * Gate: the public detail's own (approved + active) — a draft has no share image (no oracle).
 *
 * VERSION = WHAT THE IMAGE SAYS. `ready_made_trips` has no version column, and its `updated_at` does
 * not move when the build's stops do; so the version is a hash of the very data the templates draw
 * (title, price line, days, chips, the schematic, the minutes, the photo URL + credit). Any change a
 * reader could see re-keys the cache; nothing else does. The image URL carries `?v=<version>`, so a
 * shared link always fetches the image for the listing as it now reads.
 *
 * THE CACHE IS IN-PROCESS (stated limit): an LRU of rendered PNGs and of fetched cover photos.
 * "Regenerate on publish" is a warm-up of the four formats when an admin approves a listing — best
 * effort, never failing the approval (§15b); another instance renders on first request.
 */
import crypto from "crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { itineraryItems, readyMadeTrips, transportLegs, users } from "@shared/schema";
import { readyMadePriceLine, readyMadeSlug, readyMadePreviewPath } from "@shared/ready-made-preview";
import { loadVerifiedMarkets } from "./blog-byline-gate.service";
import { resolveMarketSlug } from "./trend-engine/operating-markets";
import { jitterPoint } from "./ready-made-teaser-map.service";
import {
  READY_MADE_SHARE_FORMATS,
  heroCreditLine,
  isAllowedHeroUrl,
  renderReadyMadeShareImage,
  type ReadyMadeShareData,
  type ReadyMadeShareFormat,
  type ReadyMadeShareMapDay,
} from "./ready-made-share-image.service";

export const SHARE_SITE_HOST = "traveloure.com";
/** The schematic box's aspect (width / height) in the map slide — the normaliser fits to it. */
export const SCHEMATIC_ASPECT = 968 / 760;

type Located = { dayNumber: number; lon: number; lat: number };

/**
 * Pure. Each day's (already jittered) stops normalised into 0..1 inside a box of `aspect`, one shared
 * projection for every day (equirectangular, cos-latitude corrected, centred, aspect preserved).
 */
export function normaliseSchematic(stops: readonly Located[], aspect: number): Map<number, { x: number; y: number }[]> {
  const out = new Map<number, { x: number; y: number }[]>();
  if (!stops.length) return out;
  const midLat = (Math.min(...stops.map((s) => s.lat)) + Math.max(...stops.map((s) => s.lat))) / 2;
  const k = Math.cos((midLat * Math.PI) / 180);
  const xy = stops.map((s) => ({ d: s.dayNumber, x: s.lon * k, y: -s.lat }));
  const minX = Math.min(...xy.map((p) => p.x)), maxX = Math.max(...xy.map((p) => p.x));
  const minY = Math.min(...xy.map((p) => p.y)), maxY = Math.max(...xy.map((p) => p.y));
  const spanX = Math.max(maxX - minX, 1e-6), spanY = Math.max(maxY - minY, 1e-6);
  // Fit inside [0,1]×[0,1] of a box whose width is `aspect` × its height.
  const scale = Math.min(aspect / spanX, 1 / spanY);
  const offX = (aspect - spanX * scale) / 2, offY = (1 - spanY * scale) / 2;
  for (const p of xy) {
    const list = out.get(p.d) ?? [];
    list.push({ x: (offX + (p.x - minX) * scale) / aspect, y: offY + (p.y - minY) * scale });
    out.set(p.d, list);
  }
  return out;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return v != null && Number.isFinite(n) ? n : null;
}

/** The listing's share data WITHOUT the photo bytes, plus its photo source; null when not public. */
export async function loadReadyMadeShareInputs(listingId: string): Promise<{ data: Omit<ReadyMadeShareData, "hero">; heroUrl: string | null; heroCredit: string | null; id: string; slug: string } | null> {
  const [listing] = await db.select().from(readyMadeTrips).where(eq(readyMadeTrips.id, listingId)).limit(1);
  if (!listing || listing.status !== "approved" || listing.active !== true) return null;
  const [author] = await db.select({ firstName: users.firstName }).from(users).where(eq(users.id, listing.authorId)).limit(1);
  const [items, legs, verifiedMarkets] = await Promise.all([
    db
      .select({ id: itineraryItems.id, title: itineraryItems.title, dayNumber: itineraryItems.dayNumber, latitude: itineraryItems.latitude, longitude: itineraryItems.longitude })
      .from(itineraryItems)
      .where(eq(itineraryItems.tripId, listing.sourceTripId))
      .orderBy(asc(itineraryItems.dayNumber), asc(itineraryItems.sortOrder)),
    db
      .select({ dayNumber: transportLegs.dayNumber, minutes: transportLegs.estimatedDurationMinutes })
      .from(transportLegs)
      // R-ax: the trip being sold is its CONFIRMED legs; a proposal the author never accepted is not.
      .where(and(eq(transportLegs.tripId, listing.sourceTripId), isNull(transportLegs.variantId), eq(transportLegs.proposalStatus, "confirmed"))),
    loadVerifiedMarkets(listing.authorId),
  ]);
  const days = items.filter((i) => i.dayNumber != null && i.dayNumber >= 1);
  const located: Located[] = [];
  for (const i of days) {
    const la = num(i.latitude), lo = num(i.longitude);
    if (la == null || lo == null || (la === 0 && lo === 0)) continue;
    // The teaser's own redaction rule: every point is displaced ~250 m, deterministically.
    const [jlon, jlat] = jitterPoint(la, lo, listing.id, i.id);
    located.push({ dayNumber: i.dayNumber!, lon: jlon, lat: jlat });
  }
  const norm = normaliseSchematic(located, SCHEMATIC_ASPECT);
  const minutesByDay = new Map<number, number>();
  for (const l of legs) {
    const m = num(l.minutes);
    if (m == null || m <= 0) continue;
    minutesByDay.set(l.dayNumber, (minutesByDay.get(l.dayNumber) ?? 0) + m);
  }
  const map: ReadyMadeShareMapDay[] = Array.from(norm.keys())
    .sort((a, b) => a - b)
    .map((d) => ({ dayNumber: d, points: norm.get(d)!, confirmedMinutes: minutesByDay.get(d) ?? null }));
  const chips: ReadyMadeShareData["dayChips"] = [];
  for (const i of days) if (!chips.some((c) => c.dayNumber === i.dayNumber)) chips.push({ dayNumber: i.dayNumber!, label: i.title });
  const marketSlug = resolveMarketSlug(listing.market ?? "");
  const slug = readyMadeSlug(listing);
  const meta = (listing.heroImageMeta ?? null) as { photographer?: string; profileUrl?: string; unsplashId?: string } | null;
  const heroCredit = heroCreditLine(meta);
  const heroUrl = heroCredit && isAllowedHeroUrl(listing.heroImageUrl) ? listing.heroImageUrl! : null;
  return {
    id: listing.id,
    slug,
    heroUrl,
    heroCredit: heroUrl ? heroCredit : null,
    data: {
      title: listing.title,
      market: listing.market,
      durationDays: listing.durationDays,
      stopCount: days.length,
      confirmedLegCount: legs.filter((l) => (num(l.minutes) ?? 0) > 0).length,
      priceLine: readyMadePriceLine(listing),
      expertName: author?.firstName?.trim() || "Expert",
      localVerified: !!marketSlug && verifiedMarkets.includes(marketSlug),
      shareUrl: `${SHARE_SITE_HOST}${readyMadePreviewPath(listing)}`,
      dayChips: chips.sort((a, b) => a.dayNumber - b.dayNumber),
      map,
    },
  };
}

/** The version of what the images say (see the header). */
export function shareVersion(inputs: { data: Omit<ReadyMadeShareData, "hero">; heroUrl: string | null; heroCredit: string | null }): string {
  return crypto.createHash("sha256").update(JSON.stringify([inputs.data, inputs.heroUrl, inputs.heroCredit])).digest("hex").slice(0, 12);
}

// ── Cover photo fetch (bounded, typed, cached) ──────────────────────────────────────────────────
const PHOTO_TIMEOUT_MS = 6000;
const PHOTO_MAX_BYTES = 8 * 1024 * 1024;

/** An Unsplash URL asks for a JPEG at share size; any other allowed URL is fetched as given. */
export function heroFetchUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "images.unsplash.com") {
      u.searchParams.set("fm", "jpg");
      u.searchParams.set("w", "1600");
      u.searchParams.set("q", "80");
    }
    return u.toString();
  } catch {
    return url;
  }
}

const photoCache = new Map<string, string | null>();
export async function fetchHeroDataUri(url: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  if (!isAllowedHeroUrl(url) || !/^https?:\/\//i.test(url)) return null;
  if (photoCache.has(url)) return photoCache.get(url)!;
  let out: string | null = null;
  try {
    const res = await fetcher(heroFetchUrl(url), { signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS) });
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (res.ok && (type === "image/jpeg" || type === "image/png")) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 0 && buf.length <= PHOTO_MAX_BYTES) out = `data:${type};base64,${buf.toString("base64")}`;
    }
  } catch (err) {
    console.error("[rmt-share] cover photo fetch failed:", (err as Error)?.message ?? err);
  }
  photoCache.set(url, out);
  if (photoCache.size > 32) photoCache.delete(photoCache.keys().next().value!);
  return out;
}

// ── Rendered image cache ─────────────────────────────────────────────────────────────────────────
const IMAGE_CACHE_MAX = 64;
const imageCache = new Map<string, Buffer>();

export interface ReadyMadeShareImage {
  png: Buffer;
  version: string;
  slug: string;
}

export async function getReadyMadeShareImage(listingId: string, format: ReadyMadeShareFormat): Promise<ReadyMadeShareImage | null> {
  const inputs = await loadReadyMadeShareInputs(listingId);
  if (!inputs) return null;
  const version = shareVersion(inputs);
  const key = `${inputs.id}:${format}:${version}`;
  const hit = imageCache.get(key);
  if (hit) {
    imageCache.delete(key);
    imageCache.set(key, hit);
    return { png: hit, version, slug: inputs.slug };
  }
  const dataUri = inputs.heroUrl ? await fetchHeroDataUri(inputs.heroUrl) : null;
  const png = await renderReadyMadeShareImage(format, {
    ...inputs.data,
    hero: dataUri && inputs.heroCredit ? { dataUri, credit: inputs.heroCredit } : null,
  });
  imageCache.set(key, png);
  if (imageCache.size > IMAGE_CACHE_MAX) imageCache.delete(imageCache.keys().next().value!);
  return { png, version, slug: inputs.slug };
}

/** The current version of a public listing's images (for `?v=`), or null when it is not public. */
export async function readyMadeShareVersion(listingId: string): Promise<string | null> {
  const inputs = await loadReadyMadeShareInputs(listingId);
  return inputs ? shareVersion(inputs) : null;
}

/** "Regenerate on publish": render all four formats into the cache. Never throws (§15b). */
export async function warmReadyMadeShareImages(listingId: string): Promise<number> {
  let n = 0;
  for (const format of READY_MADE_SHARE_FORMATS) {
    try {
      if (await getReadyMadeShareImage(listingId, format)) n += 1;
    } catch (err) {
      console.error(`[rmt-share] warm ${format} failed for ${listingId}:`, (err as Error)?.message ?? err);
    }
  }
  return n;
}

export function _clearReadyMadeShareCaches(): void {
  imageCache.clear();
  photoCache.clear();
}
