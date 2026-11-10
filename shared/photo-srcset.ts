/**
 * R2-3 — Wikimedia thumbnails for the city feed's photos.
 *
 * The defect: `city-feed-card.tsx`'s `buildSrcSet` only knew Unsplash. Every Wikimedia Commons URL
 * fell through with NO srcSet, so the browser downloaded the original — the probe measured 29–31 MB
 * on /discover/location/Kyoto (Tenryū-ji 16 MB, Arashiyama 9 MB).
 *
 * WHY THE STANDARD STEPS AND NOT ARBITRARY WIDTHS: Wikimedia's thumbnail service is built around the
 * wiki's configured `$wgThumbLimits` (MediaWiki `Manual:$wgThumbLimits` — the default set is
 * 120/150/180/200/220/250/300/320/400/480/500/640/800/1024/1280/1920/2560). Off-grid widths are
 * rendered ad hoc and are the ones that get throttled or refused, so this only ever asks for a
 * standard step.
 *
 * WIDTH CAP: a thumbnail is never requested wider than the source, and the URL alone does not say how
 * wide the source is. `maxWidth` therefore defaults to 800 — comfortably below every seeded original
 * and above the largest card slot at 2x — and a caller that DOES know the original's width can pass
 * it to cap further. A file that is not a Commons raster gets no srcSet at all: the original stays
 * the single `src`, exactly as before.
 *
 * The original URL is always kept as the `src` fallback by the caller, so a browser without srcSet
 * support (or a thumb that fails) still shows the photograph.
 */

/**
 * MediaWiki's default `$wgThumbLimits` (std thumb steps), ascending. Only these are requested —
 * see https://www.mediawiki.org/wiki/Manual:$wgThumbLimits.
 */
export const WIKIMEDIA_STANDARD_WIDTHS: readonly number[] = [
  120, 150, 180, 200, 220, 250, 300, 320, 400, 480, 500, 640, 800, 1024, 1280, 1920, 2560,
];

/** Card slots this feed actually draws — the steps worth asking for, all standard. */
export const CARD_THUMB_WIDTHS: readonly number[] = [320, 480, 640, 800];

const COMMONS_HOST = "upload.wikimedia.org";
/** Commons handles the thumb transform for the raster formats we seed; anything else keeps the original. */
const THUMB_ELIGIBLE = /\.(?:jpe?g|webp)$/i;

export interface WikimediaThumb {
  /** `https://upload.wikimedia.org/wikipedia/commons/...` and nothing else. */
  isCommons: boolean;
  /** The `<a>/<ab>/<File>` tail after `/wikipedia/commons/`, or null. */
  filePath: string | null;
}

/** Reads a Commons original URL without trusting it: host must be exact, path must be a file. */
export function parseWikimediaCommons(url: string | null | undefined): WikimediaThumb {
  const raw = (url ?? "").trim();
  if (!raw) return { isCommons: false, filePath: null };
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { isCommons: false, filePath: null };
  }
  if (parsed.hostname !== COMMONS_HOST) return { isCommons: false, filePath: null };
  const marker = "/wikipedia/commons/";
  const at = parsed.pathname.indexOf(marker);
  if (at < 0) return { isCommons: false, filePath: null };
  const filePath = parsed.pathname.slice(at + marker.length);
  // Already a thumb (`.../thumb/a/ab/File.jpg/320px-File.jpg`) — never re-wrap one.
  if (filePath.startsWith("thumb/")) return { isCommons: false, filePath: null };
  // `<a>/<ab>/<File>` is the only shape the thumb service accepts.
  if (filePath.split("/").filter(Boolean).length !== 3) return { isCommons: false, filePath: null };
  return { isCommons: true, filePath };
}

/**
 * The thumb URL for one standard width, or null when the URL is not a Commons raster.
 * Shape: `/wikipedia/commons/thumb/<a>/<ab>/<File>/<width>px-<File>`.
 */
export function wikimediaThumbUrl(url: string | null | undefined, width: number): string | null {
  const { isCommons, filePath } = parseWikimediaCommons(url);
  if (!isCommons || !filePath) return null;
  if (!THUMB_ELIGIBLE.test(filePath)) return null;
  if (!WIKIMEDIA_STANDARD_WIDTHS.includes(width)) return null;
  const file = filePath.split("/").pop() as string;
  return `https://${COMMONS_HOST}/wikipedia/commons/thumb/${filePath}/${width}px-${file}`;
}

/**
 * `srcSet` for a Commons raster, using standard steps only, capped at `maxWidth` (default 800).
 * Returns null when the URL is not one, so the caller keeps the original as its single `src`.
 */
export function wikimediaSrcSet(
  url: string | null | undefined,
  opts: { widths?: readonly number[]; maxWidth?: number } = {},
): string | null {
  const maxWidth = opts.maxWidth ?? 800;
  const widths = (opts.widths ?? CARD_THUMB_WIDTHS).filter((w) => w <= maxWidth && WIKIMEDIA_STANDARD_WIDTHS.includes(w));
  const candidates = widths
    .map((w) => {
      const thumb = wikimediaThumbUrl(url, w);
      return thumb ? `${thumb} ${w}w` : null;
    })
    .filter((c): c is string => c !== null);
  return candidates.length > 0 ? candidates.join(", ") : null;
}
