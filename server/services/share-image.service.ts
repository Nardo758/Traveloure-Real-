/**
 * share-image.service.ts — SH1 share-image render pipeline.
 *
 * Pure data-in -> PNG-buffer-out. No DB reads happen here; callers (share-images.routes.ts)
 * load + gate the data and pass plain objects in. This keeps the render path testable without a
 * DB connection and keeps the F2/REV-MOD read-gates in the route layer where the rest of the
 * codebase's gates live.
 *
 * Pipeline (the DESIGN FENCE from the SH1 brief, followed exactly):
 *   satori element-tree (plain {type, props:{style, children}} objects — NOT JSX, no React
 *   runtime involved) -> SVG string -> new Resvg(svg).render().asPng() -> Buffer.
 *
 * Fonts (server/assets/fonts/Inter-{Regular,Bold}.woff, committed in 49090eb0) are loaded ONCE at
 * module init, mirroring the dev/prod template-resolution pattern in
 * server/routes/storefront.routes.ts (path.resolve(process.cwd(), ...) in dev, falling back to a
 * path.resolve(__dirname, ...) prod-relative path).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

// Console palette (CLAUDE.md Phase 4 theme) reused for share cards.
const DARK_BG = "#1A1A18";
const DARK_TEXT = "#FAFAF8";
const DARK_SECONDARY = "#7A7A72";
const LIGHT_BG = "#FAFAF8";
const LIGHT_TEXT = "#1A1A18";
const LIGHT_SECONDARY = "#7A7A72";

// --- Font loading (once, at module init) ---------------------------------------------------

// Package.json declares "type": "module", but the two runtimes this code actually executes under
// disagree on what that means for __dirname/import.meta.url, so neither alone is safe:
//   - dev (`tsx server/index.ts`): tsx interprets .ts source as real ESM -> bare `__dirname` is an
//     unresolvable reference (throws `ReferenceError: __dirname is not defined in ES module
//     scope` if evaluated) -- verified directly. This is what storefront.routes.ts / static.ts's
//     `path.resolve(__dirname, ...)` prod-fallback lines actually hit in dev; it's a latent bug
//     there, silently masked because both call sites live inside a try/catch that falls through
//     to the SPA on any error.
//   - prod (script/build.ts esbuild bundle, format: "cjs", dist/index.cjs): the OUTPUT is real
//     CommonJS (Node gives every CJS file its own __dirname), but `import.meta.url` is squashed to
//     an empty object by esbuild for cjs targets (esbuild prints an explicit build warning for
//     this) -- so `import.meta` is NOT safe here despite the ESM-looking source.
// `typeof __dirname` never throws (as an unresolvable-reference check it degrades to
// "undefined" instead of a ReferenceError) so it's a safe runtime probe for which case we're in,
// used to pick the identifier that's actually live in the current runtime rather than assuming
// one. A throw in this module's font loading takes the whole process down at boot (no try/catch
// safety net the way the route handlers have), so both branches must be genuinely load-bearing.
const moduleDir =
  typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR_DEV = path.resolve(process.cwd(), "server", "assets", "fonts");
// script/build.ts bundles the entire server into one flat dist/index.cjs (no per-module
// directory structure survives, and no step copies server/assets/** into dist/) — so moduleDir in
// prod is just ".../dist". This fallback assumes an assets/fonts dir placed alongside index.cjs
// (dist/assets/fonts), matching where a future copy-assets build step would put it. In practice,
// on this project's actual deploy target (Replit Autoscale, which deploys the full repo alongside
// the build, not a stripped dist/-only artifact) FONTS_DIR_DEV above already resolves and this
// branch is not reached — same as clientTemplateDev in storefront.routes.ts.
const FONTS_DIR_PROD = path.resolve(moduleDir, "assets", "fonts");
const FONTS_DIR = fs.existsSync(FONTS_DIR_DEV) ? FONTS_DIR_DEV : FONTS_DIR_PROD;

const interRegular = fs.readFileSync(path.join(FONTS_DIR, "Inter-Regular.woff"));
const interBold = fs.readFileSync(path.join(FONTS_DIR, "Inter-Bold.woff"));

const FONT_CONFIG = [
  { name: "Inter", data: interRegular, weight: 400 as const, style: "normal" as const },
  { name: "Inter", data: interBold, weight: 700 as const, style: "normal" as const },
];

// --- Public types ----------------------------------------------------------------------------

export type ShareImageKind = "service-feed" | "service-story" | "review";

export interface ServiceShareImageData {
  serviceName: string;
  /** Real price (decimal string or number), or null when the service has no fixed price (e.g. custom_quote). */
  price: string | number | null;
  /** Real aggregate rating (decimal string or number), or null when there are no reviews yet. */
  averageRating: string | number | null;
  /** Real review count. Rating line only renders when this is > 0 (§13 — never a fabricated number). */
  reviewCount: number;
  earnerName?: string | null;
  earnerHandle?: string | null;
  /** Footer path text, e.g. "/p/somehandle" or "/services/abc123". */
  path: string;
}

export interface ReviewShareImageData {
  reviewText: string;
  /** Real integer rating 1-5. */
  rating: number;
  /** First name only (privacy) — never the full name. */
  reviewerFirstName: string;
  serviceName: string;
}

// --- Formatting helpers ------------------------------------------------------------------------

function formatPrice(price: string | number | null | undefined): string | null {
  if (price == null) return null;
  const n = typeof price === "string" ? parseFloat(price) : price;
  if (!Number.isFinite(n)) return null;
  const isWhole = Math.abs(n - Math.round(n)) < 0.001;
  return `$${isWhole ? Math.round(n).toLocaleString("en-US") : n.toFixed(2)}`;
}

function formatRatingLine(
  averageRating: string | number | null | undefined,
  reviewCount: number | undefined,
): { text: string; showStar: boolean } {
  const rc = Number(reviewCount ?? 0);
  if (rc > 0 && averageRating != null) {
    const ar = typeof averageRating === "string" ? parseFloat(averageRating) : averageRating;
    if (Number.isFinite(ar)) {
      return { text: `${ar.toFixed(1)} · ${rc} review${rc === 1 ? "" : "s"}`, showStar: true };
    }
  }
  // §13 — no reviews yet is an honest "New", never a fabricated number.
  return { text: "New", showStar: false };
}

// A 5-pointed star drawn as inline SVG, embedded via an <img data:> element. The bundled Inter
// woffs do not include a glyph for U+2605 (BLACK STAR) — satori/resvg render it as a visible
// "no glyph" tofu box — so the star is drawn as a shape instead of relying on font coverage.
function starDataUri(color: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
    `<path fill="${color}" d="M12 1.5l3.09 6.26 6.91 1-5 4.87 1.18 6.88L12 17.77l-6.18 3.24L7 14.13l-5-4.87 6.91-1z"/>` +
    `</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function starIcon(color: string, size: number, marginRight = 0): El {
  return {
    type: "img",
    props: {
      src: starDataUri(color),
      width: size,
      height: size,
      style: { display: "flex", marginRight },
    },
  };
}

function formatEarnerLine(name?: string | null, handle?: string | null): string | null {
  const n = name?.trim() || null;
  const h = handle?.trim() || null;
  if (!n && !h) return null;
  if (n && h) return `${n} · @${h}`;
  if (n) return n;
  return `@${h}`;
}

function clampReviewText(text: string, max = 280): string {
  const trimmed = (text ?? "").trim();
  if (trimmed.length <= max) return trimmed;
  let cut = trimmed.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > max * 0.6) cut = cut.slice(0, lastSpace);
  return `${cut.trimEnd()}…`;
}

function clampStarRating(rating: number): number {
  const r = Math.round(Number(rating) || 0);
  return Math.max(1, Math.min(5, r));
}

// --- satori element tree (plain objects, NOT JSX — the design fence) --------------------------

// Loosely typed: satori's `element: ReactNode` param is structurally satisfied by this shape at
// runtime (a satori "VNode" is exactly {type, props:{style, children}}), but we don't pull in a
// React dependency just for the type, so the tree is built + passed as `any`.
type El = { type: string; props: Record<string, any> };

function h(type: string, style: Record<string, any>, children?: any): El {
  return { type, props: { style, children } };
}

function buildServiceElement(
  data: ServiceShareImageData,
  opts: { width: number; height: number; story: boolean },
): El {
  const { width, height, story } = opts;
  const pad = story ? 96 : 72;
  const titleSize = story ? 88 : 68;
  const metaSize = story ? 42 : 34;
  const smallSize = story ? 32 : 26;
  const footerSize = story ? 36 : 30;

  const priceText = formatPrice(data.price);
  const rating = formatRatingLine(data.averageRating, data.reviewCount);
  const earnerText = formatEarnerLine(data.earnerName, data.earnerHandle);

  const middleChildren: El[] = [
    h(
      "div",
      {
        display: "flex",
        fontFamily: "Inter",
        fontWeight: 700,
        fontSize: titleSize,
        lineHeight: 1.15,
        color: DARK_TEXT,
        marginBottom: story ? 44 : 30,
      },
      data.serviceName,
    ),
  ];

  if (priceText) {
    middleChildren.push(
      h(
        "div",
        {
          display: "flex",
          fontFamily: "Inter",
          fontWeight: 700,
          fontSize: metaSize,
          color: DARK_TEXT,
          marginBottom: story ? 22 : 16,
        },
        `From ${priceText}`,
      ),
    );
  }

  middleChildren.push(
    h(
      "div",
      {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        marginBottom: story ? 22 : 16,
      },
      [
        ...(rating.showStar ? [starIcon(DARK_SECONDARY, metaSize * 0.8, story ? 14 : 10)] : []),
        h(
          "div",
          { display: "flex", fontFamily: "Inter", fontWeight: 400, fontSize: metaSize, color: DARK_SECONDARY },
          rating.text,
        ),
      ],
    ),
  );

  if (earnerText) {
    middleChildren.push(
      h(
        "div",
        {
          display: "flex",
          fontFamily: "Inter",
          fontWeight: 400,
          fontSize: smallSize,
          color: DARK_SECONDARY,
        },
        earnerText,
      ),
    );
  }

  return h(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      width,
      height,
      padding: pad,
      backgroundColor: DARK_BG,
      fontFamily: "Inter",
    },
    [
      h(
        "div",
        {
          display: "flex",
          fontFamily: "Inter",
          fontWeight: 700,
          fontSize: story ? 32 : 26,
          letterSpacing: 4,
          color: DARK_SECONDARY,
        },
        "TRAVELOURE",
      ),
      h(
        "div",
        { display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" },
        middleChildren,
      ),
      h(
        "div",
        {
          display: "flex",
          flexDirection: "column",
          borderTop: `2px solid ${DARK_SECONDARY}`,
          paddingTop: story ? 36 : 26,
        },
        [
          h(
            "div",
            { display: "flex", fontFamily: "Inter", fontWeight: 700, fontSize: footerSize, color: DARK_TEXT },
            "Book on Traveloure",
          ),
          h(
            "div",
            {
              display: "flex",
              fontFamily: "Inter",
              fontWeight: 400,
              fontSize: smallSize,
              color: DARK_SECONDARY,
              marginTop: 8,
            },
            data.path,
          ),
        ],
      ),
    ],
  );
}

function buildReviewElement(data: ReviewShareImageData): El {
  const width = 1080;
  const height = 1350;
  const pad = 88;
  const filled = clampStarRating(data.rating);

  const starsRow = h(
    "div",
    { display: "flex", flexDirection: "row", marginBottom: 36 },
    Array.from({ length: 5 }, (_, i) => starIcon(i < filled ? LIGHT_TEXT : LIGHT_SECONDARY, 56, i < 4 ? 14 : 0)),
  );

  const quote = h(
    "div",
    {
      display: "flex",
      fontFamily: "Inter",
      fontWeight: 700,
      fontSize: 52,
      lineHeight: 1.35,
      color: LIGHT_TEXT,
    },
    `“${clampReviewText(data.reviewText)}”`,
  );

  return h(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      width,
      height,
      padding: pad,
      backgroundColor: LIGHT_BG,
      fontFamily: "Inter",
    },
    [
      h(
        "div",
        {
          display: "flex",
          fontFamily: "Inter",
          fontWeight: 700,
          fontSize: 26,
          letterSpacing: 4,
          color: LIGHT_SECONDARY,
        },
        "TRAVELOURE",
      ),
      h("div", { display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }, [
        starsRow,
        quote,
      ]),
      h(
        "div",
        {
          display: "flex",
          flexDirection: "column",
          borderTop: `2px solid ${LIGHT_SECONDARY}`,
          paddingTop: 28,
        },
        [
          h(
            "div",
            { display: "flex", fontFamily: "Inter", fontWeight: 700, fontSize: 32, color: LIGHT_TEXT },
            `— ${data.reviewerFirstName}`,
          ),
          h(
            "div",
            {
              display: "flex",
              fontFamily: "Inter",
              fontWeight: 400,
              fontSize: 26,
              color: LIGHT_SECONDARY,
              marginTop: 8,
            },
            `${data.serviceName} on Traveloure`,
          ),
        ],
      ),
    ],
  );
}

// --- Public render entrypoint -------------------------------------------------------------------

export function renderShareImage(kind: "service-feed" | "service-story", data: ServiceShareImageData): Promise<Buffer>;
export function renderShareImage(kind: "review", data: ReviewShareImageData): Promise<Buffer>;
export async function renderShareImage(
  kind: ShareImageKind,
  data: ServiceShareImageData | ReviewShareImageData,
): Promise<Buffer> {
  let element: El;
  let width: number;
  let height: number;

  if (kind === "service-feed") {
    width = 1080;
    height = 1350;
    element = buildServiceElement(data as ServiceShareImageData, { width, height, story: false });
  } else if (kind === "service-story") {
    width = 1080;
    height = 1920;
    element = buildServiceElement(data as ServiceShareImageData, { width, height, story: true });
  } else if (kind === "review") {
    width = 1080;
    height = 1350;
    element = buildReviewElement(data as ReviewShareImageData);
  } else {
    throw new Error(`Unknown share-image kind: ${kind}`);
  }

  const svg = await satori(element as any, { width, height, fonts: FONT_CONFIG });
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: width } });
  return resvg.render().asPng();
}
