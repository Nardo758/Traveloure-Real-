/**
 * R297 (ledger `2026-10-04-photo-references`): the ONE live Google photo request, DB-free so it can be
 * proven without a database. It takes a CACHED photo reference (stored by the regular Places Details
 * lookup with the facts cache entry) and makes exactly ONE request — the Place Photo media call with
 * `skipHttpRedirect=true`, whose `photoUri` carries no key. It never calls Place Details or Text
 * Search. Its result is never persisted (R-aq). Every call reports to `logUsage` (the cost row the
 * daily cap counts — Place Photo requests only).
 */
import { googlePhotoAttribution, type PhotoPlace, type PhotoView } from "@shared/place-photos";

export const PLACE_PHOTO_ENDPOINT = "place_photo";

type Fetch = (url: string, init?: any) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

export async function googlePhotoLive(
  p: PhotoPlace & { photoRef: NonNullable<PhotoPlace["photoRef"]> },
  fetchImpl: Fetch,
  logUsage: (r: { success: boolean; ms: number }) => Promise<void>,
  apiKey: string | undefined = process.env.GOOGLE_MAPS_API_KEY,
): Promise<PhotoView | null> {
  if (!apiKey || !p.photoRef?.name) return null;
  const started = Date.now();
  let ok = false;
  try {
    const media = await fetchImpl(`https://places.googleapis.com/v1/${p.photoRef.name}/media?maxWidthPx=800&skipHttpRedirect=true`, {
      headers: { "X-Goog-Api-Key": apiKey },
      signal: AbortSignal.timeout(6000),
    });
    if (!media.ok) return null;
    const uri = ((await media.json()) as any)?.photoUri;
    if (typeof uri !== "string" || !uri) return null;
    ok = true;
    return {
      source: "google_live",
      url: uri,
      licence: null,
      attribution: googlePhotoAttribution(p.photoRef.authors.map((a) => a.displayName)),
      sourceUrl: p.photoRef.authors[0]?.uri ?? null,
    };
  } finally {
    await logUsage({ success: ok, ms: Date.now() - started });
  }
}
