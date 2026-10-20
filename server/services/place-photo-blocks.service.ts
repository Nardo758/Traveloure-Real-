/**
 * CS-1 item 1 — PER-PLACE no_photos (decision-maker, Oct 18, 2026; ledger `2026-10-18-cs1-source-signoff`; migration
 * 395, held). The ONE reader/writer of `place_photo_blocks`.
 *
 * A photo is BLOCKED when either key matches:
 *   · its place id equals a block's `place_id`, or
 *   · the item / listing / nugget / gem it belongs to NAMES a place whose normalised name AND city match a block —
 *     the same normalisation as LG-2 Ask 1 (`normalisedNameTokens` / `matchNormalisedName`: case, macrons, Temple/-ji,
 *     Shrine/-jinja), never a second copy of it.
 * Enforced at upload (refused, with the reason) and at every read (hidden). Nothing is ever deleted — not the photo,
 * not the block. NEGATIVE SPACE, stated: an upload that names no place and carries no place id is not caught.
 *
 * Rows are entered by the approver (the content-source activator allowlist) in admin; no migration or deploy inserts one.
 */
import crypto from "node:crypto";
import { asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { placePhotoBlocks, type PlacePhotoBlock } from "@shared/schema";
import { isBannedPhotoUrl } from "@shared/banned-photos";
import { blockFor, normalisePlaceName, type PhotoBlockRow, type PhotoSubject } from "./place-photo-block-rules";
import { mayActivateContentSource } from "../config/content-sources.config";

export class PhotoBlockError extends Error {
  constructor(public readonly code: string, public readonly status: number, public readonly details?: Record<string, unknown>) {
    super(code);
  }
}

/** The words shown when an upload is refused, naming the block's own reason. */
export const PHOTO_BLOCK_REFUSAL = "Photos of this place can't be shown on Traveloure";

export { foldCity, normalisePlaceName, blockFor } from "./place-photo-block-rules";
export type { PhotoBlockRow, PhotoSubject } from "./place-photo-block-rules";

// ── the block list, cached briefly so synchronous readers can ask ────────────────────────────────

const CACHE_MS = 60_000;
let cache: { rows: PhotoBlockRow[]; at: number } | null = null;
let loading: Promise<PhotoBlockRow[]> | null = null;

async function loadBlocks(): Promise<PhotoBlockRow[]> {
  const rows = await db
    .select({ id: placePhotoBlocks.id, placeId: placePhotoBlocks.placeId, placeNameNormalised: placePhotoBlocks.placeNameNormalised, city: placePhotoBlocks.city, reason: placePhotoBlocks.reason })
    .from(placePhotoBlocks);
  cache = { rows, at: Date.now() };
  return rows;
}

/** The block list, read through a 60-second cache; a failed read throws (an unknown list is never "no blocks"). */
export async function photoBlocks(): Promise<PhotoBlockRow[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  if (!loading) loading = loadBlocks().finally(() => { loading = null; });
  return loading;
}

/**
 * The last loaded list, for a synchronous reader (`normalizeServiceImage`). It refreshes in the background when stale.
 * NEGATIVE SPACE: before the first load completes it is empty — boot loads it (`warmPhotoBlocks`).
 */
export function photoBlocksSnapshot(): PhotoBlockRow[] {
  if (!cache || Date.now() - cache.at >= CACHE_MS) void photoBlocks().catch(() => undefined);
  return cache?.rows ?? [];
}

export async function warmPhotoBlocks(): Promise<void> {
  await photoBlocks().catch((err) => console.warn(`[photo-blocks] warm failed: ${String(err?.message ?? err).slice(0, 200)}`));
}

/** Async: is this photo blocked? */
export async function photoBlockedFor(subject: PhotoSubject): Promise<PhotoBlockRow | null> {
  return blockFor(await photoBlocks(), subject);
}

/** Upload guard: throws a 422 naming the reason when the subject is blocked. */
export async function assertPhotoAllowed(subject: PhotoSubject): Promise<void> {
  const b = await photoBlockedFor(subject);
  if (b) throw new PhotoBlockError("photo_blocked", 422, { message: PHOTO_BLOCK_REFUSAL, reason: b.reason });
}

// ── admin ──────────────────────────────────────────────────────────────────────────────────────

export const addBlockBody = z.object({
  placeId: z.string().trim().min(1).max(255).nullable().optional(),
  placeName: z.string().trim().min(1).max(300).nullable().optional(),
  city: z.string().trim().min(1).max(150).nullable().optional(),
  reason: z.string().trim().min(1).max(1000),
}).strict();

export async function listPlacePhotoBlocks(): Promise<PlacePhotoBlock[]> {
  return db.select().from(placePhotoBlocks).orderBy(asc(placePhotoBlocks.setAt));
}

/** The approver adds a block: a place id, or a place name with its city (or both). Never deletes. */
export async function addPlacePhotoBlock(body: unknown, actorId: string | null): Promise<PlacePhotoBlock> {
  if (!mayActivateContentSource(actorId)) throw new PhotoBlockError("not_approver", 403);
  const parsed = addBlockBody.safeParse(body);
  if (!parsed.success) throw new PhotoBlockError("invalid_body", 400, { issues: parsed.error.issues.map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`) });
  const b = parsed.data;
  const named = !!b.placeName;
  if (named && !b.city) throw new PhotoBlockError("city_required", 400, { reason: "a place name needs its city" });
  if (!b.placeId && !named) throw new PhotoBlockError("no_key", 400, { reason: "give a place id, or a place name and city" });
  const normalised = named ? normalisePlaceName(b.placeName!, b.city) : null;
  if (named && !normalised) throw new PhotoBlockError("name_has_no_words", 400, { reason: "the name has no distinctive words" });
  const [row] = await db
    .insert(placePhotoBlocks)
    .values({ id: crypto.randomUUID(), placeId: b.placeId ?? null, placeNameNormalised: normalised, city: b.city ?? null, reason: b.reason, setBy: actorId!, setAt: new Date() })
    .returning();
  cache = null; // the next read sees the new block
  return row;
}

// ── listings ───────────────────────────────────────────────────────────────────────────────────

type ListingLike = {
  serviceName?: string | null;
  name?: string | null;
  title?: string | null;
  location?: string | null;
  city?: string | null;
  googlePlaceId?: string | null;
};

/** Pure. The subject a listing's photos belong to: its names, its city and any place id it carries. */
export function listingPhotoSubject(row: ListingLike): PhotoSubject {
  return {
    placeIds: [row.googlePlaceId],
    names: [row.serviceName, row.name, row.title, row.location],
    city: row.city ?? null,
  };
}

/**
 * Sync: a listing row with its photos hidden when its place is blocked (cover, gallery and any `imageUrl` copy).
 * Reads the cached block list (`photoBlocksSnapshot`). Nothing is deleted from the row in the database.
 */
export function hideBlockedListingImages<T extends ListingLike & Record<string, any>>(row: T, blocks: readonly PhotoBlockRow[] = photoBlocksSnapshot()): T {
  if (!blocks.length || !blockFor(blocks, listingPhotoSubject(row))) return hideBannedListingPhotos(row);
  const out: Record<string, any> = { ...row };
  if ("serviceImage" in out) out.serviceImage = null;
  if ("galleryImages" in out) out.galleryImages = [];
  if ("imageUrl" in out) out.imageUrl = null;
  if ("image" in out) out.image = null;
  return out as T;
}

/**
 * SH-1 item 6: a listing whose place is not blocked still never shows a BANNED photo (`shared/banned-photos.ts`) —
 * the cover, an `imageUrl`/`image` copy, or one gallery entry. Only the banned photos go; nothing is deleted.
 */
function hideBannedListingPhotos<T extends Record<string, any>>(row: T): T {
  const banned = (v: unknown) => typeof v === "string" && isBannedPhotoUrl(v);
  const gallery = Array.isArray(row.galleryImages) ? row.galleryImages : null;
  const galleryHit = gallery ? gallery.some((g: unknown) => banned(g) || banned((g as any)?.url)) : false;
  if (!banned(row.serviceImage) && !banned(row.imageUrl) && !banned(row.image) && !galleryHit) return row;
  const out: Record<string, any> = { ...row };
  if (banned(out.serviceImage)) out.serviceImage = null;
  if (banned(out.imageUrl)) out.imageUrl = null;
  if (banned(out.image)) out.image = null;
  if (galleryHit) out.galleryImages = gallery!.filter((g: unknown) => !banned(g) && !banned((g as any)?.url));
  return out as T;
}

/** Sync: a listing's cover image, or null when its place is blocked or the photo is banned (SH-1 item 6). */
export function visibleListingImage(row: ListingLike & { serviceImage?: string | null }, blocks: readonly PhotoBlockRow[] = photoBlocksSnapshot()): string | null {
  const img = row.serviceImage ?? null;
  if (img && isBannedPhotoUrl(img)) return null;
  if (!img || !blocks.length) return img;
  return blockFor(blocks, listingPhotoSubject(row)) ? null : img;
}

// ── gems ───────────────────────────────────────────────────────────────────────────────────────

type GemLike = {
  placeName?: string | null;
  name?: string | null;
  city?: string | null;
  destination?: string | null;
  imageUrl?: string | null;
};

/**
 * Sync: a gem row (`travel_pulse_hidden_gems` — placeName + city; `ai_discovered_gems` — name + destination) with
 * its `imageUrl` hidden when its place is blocked. Gems carry no place id, so only the name + city key applies.
 * Nothing is deleted from the row in the database.
 */
export function hideBlockedGemImage<T extends GemLike & Record<string, any>>(row: T, blocks: readonly PhotoBlockRow[] = photoBlocksSnapshot()): T {
  if (row.imageUrl && isBannedPhotoUrl(row.imageUrl)) return { ...row, imageUrl: null } as T; // SH-1 item 6
  if (!row.imageUrl || !blocks.length) return row;
  const blocked = blockFor(blocks, { names: [row.placeName, row.name], city: row.city ?? row.destination ?? null });
  return blocked ? ({ ...row, imageUrl: null } as T) : row;
}
