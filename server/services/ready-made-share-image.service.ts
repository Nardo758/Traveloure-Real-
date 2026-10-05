/**
 * READY MADE TRIP SHARE IMAGES (Slice B2 — work plan L3-14; ledger `2026-10-05-rmt-share-images`).
 *
 * Four generated cards from ONE data object, rendered through the existing satori → resvg rail
 * (`share-image.service.ts`, fonts and element helper shared — never a second renderer):
 *   cover  1080×1350  logo top-left, the REAL cover photo, title, expert badge, day chips, the price
 *                     line, "Get this trip", the /t/ link and the photo's credit
 *   map    1080×1350  "Your route at a glance": a SCHEMATIC of each day's stops (dashed lines, numbered
 *                     pins) over a soft wash of the cover photo, captioned with the CONFIRMED travel
 *                     minutes per day — never a Google map, never exact points (the teaser's own
 *                     jitter rule redacts every stop), never an invented minute
 *   story  1080×1920  full-bleed cover photo, three proof lines, "Get this trip", the link-sticker target
 *   og     1200×630   the link card: photo ≥ 60% of the frame, title and price clear of the bottom 15%
 *
 * Honesty rules (§13), each pinned by a test:
 *   · every figure is the server's: the price line is `readyMadePriceLine` (the purchase's own total);
 *     the minutes are confirmed `transport_legs` rows; the verified stamp is LD 27's fact;
 *   · an absent fact draws nothing — no photo ⇒ a plain ground and no credit line (never a stock
 *     substitute); no price ⇒ no price pill; no confirmed minutes for a day ⇒ that day says nothing;
 *   · a photo is used only with its credit line, and NEVER a Google Places photo (`isAllowedHeroUrl`).
 */
import fs from "fs";
import path from "path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { FONT_CONFIG, h, type El } from "./share-image.service";
import { photoSourceName } from "@shared/ready-made-preview";

export const READY_MADE_SHARE_FORMATS = ["cover", "map", "story", "og"] as const;
export type ReadyMadeShareFormat = (typeof READY_MADE_SHARE_FORMATS)[number];

export const READY_MADE_SHARE_SIZES: Readonly<Record<ReadyMadeShareFormat, { width: number; height: number }>> = Object.freeze({
  cover: { width: 1080, height: 1350 },
  map: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
  og: { width: 1200, height: 630 },
});

export interface ReadyMadeShareMapDay {
  dayNumber: number;
  /** Jittered stop positions, normalised to 0..1 inside the shared frame (never raw coordinates). */
  points: { x: number; y: number }[];
  /** Sum of the day's CONFIRMED legs' minutes; null when the day has none (the caption says nothing). */
  confirmedMinutes: number | null;
}

export interface ReadyMadeShareData {
  title: string;
  market: string;
  durationDays: number;
  stopCount: number;
  confirmedLegCount: number;
  /** `readyMadePriceLine` — null when no price is set. */
  priceLine: string | null;
  expertName: string;
  localVerified: boolean;
  /** "traveloure.com/t/<slug>" — the link sticker / bio target. */
  shareUrl: string;
  /** The cover photo as a data URI with its credit; null ⇒ no photo is drawn. */
  hero: { dataUri: string; credit: string } | null;
  /** One chip per day: the day's first stop (never more than the first three days drawn). */
  dayChips: { dayNumber: number; label: string }[];
  map: ReadyMadeShareMapDay[];
}

// Brand (spec: coral paper-plane mark; coral accents on chips, price, CTA).
const CORAL = "#E85D55";
const NAVY = "#193752";
const INK = "#1A1A18";
const MUTED = "#5B6670";
const CREAM = "#FAF7F2";
const WHITE = "#FFFFFF";
const DAY_PALETTE = ["#E85D55", "#3B6EA5", "#2E7D5B", "#B45309", "#7C3AED"];

// The coral paper-plane logo (client/public/traveloure-logo.svg, 1000×295), read once.
const LOGO_PATH = path.resolve(process.cwd(), "client", "public", "traveloure-logo.svg");
const LOGO_DATA_URI = fs.existsSync(LOGO_PATH)
  ? `data:image/svg+xml;base64,${fs.readFileSync(LOGO_PATH).toString("base64")}`
  : null;
const LOGO_RATIO = 295 / 1000;

/** Hosts whose photos never appear in a social image (Google Places photos are plan-only, LD 57). */
const BLOCKED_PHOTO_HOSTS = [/(^|\.)googleusercontent\.com$/i, /(^|\.)googleapis\.com$/i, /(^|\.)google\.com$/i, /(^|\.)gstatic\.com$/i];

export function isAllowedHeroUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  let host = "";
  try {
    host = new URL(url, "https://traveloure.com").hostname;
  } catch {
    return false;
  }
  return !BLOCKED_PHOTO_HOSTS.some((re) => re.test(host));
}

/** "Photo: Ann Lee / Unsplash"; null when the photographer is unknown (then no photo is used). */
/**
 * The photo credit: the photographer, plus the library the metadata itself names (ONE
 * `photoSourceName`, shared with the preview page). No photographer ⇒ no credit ⇒ no photo.
 */
export function heroCreditLine(
  meta: { photographer?: string | null; profileUrl?: string | null; unsplashId?: string | null } | null | undefined,
): string | null {
  const name = meta?.photographer?.trim();
  if (!name) return null;
  const source = photoSourceName(meta);
  return source ? `Photo: ${name} / ${source}` : `Photo: ${name}`;
}

function text(content: string, style: Record<string, any>): El {
  return h("div", { display: "flex", fontFamily: "Inter", ...style }, content);
}

function clamp(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

function logo(width: number, onPhoto: boolean): El {
  const img: El = LOGO_DATA_URI
    ? { type: "img", props: { src: LOGO_DATA_URI, width, height: Math.round(width * LOGO_RATIO), style: { display: "flex" } } }
    : text("TRAVELOURE", { fontWeight: 700, fontSize: Math.round(width / 6), letterSpacing: 3, color: CORAL });
  if (!onPhoto) return img;
  return h("div", { display: "flex", alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 999, padding: "14px 26px" }, img);
}

function photo(data: ReadyMadeShareData, width: number, height: number, extra: Record<string, any> = {}): El | null {
  if (!data.hero) return null;
  return { type: "img", props: { src: data.hero.dataUri, width, height, style: { display: "flex", objectFit: "cover", ...extra } } };
}

function expertLine(data: ReadyMadeShareData): string {
  return data.localVerified ? `by ${data.expertName} · Local · verified in ${data.market}` : `by ${data.expertName} · Expert curated`;
}

function pill(content: string, bg: string, color: string, size: number, pad = "12px 26px"): El {
  return h("div", { display: "flex", backgroundColor: bg, color, borderRadius: 999, padding: pad, fontFamily: "Inter", fontWeight: 700, fontSize: size }, content);
}

/** Proof lines — each one a fact the listing carries (§13). */
export function storyProofLines(data: ReadyMadeShareData): string[] {
  const out = [`${data.durationDays} ${data.durationDays === 1 ? "day" : "days"} · ${data.stopCount} ${data.stopCount === 1 ? "stop" : "stops"} in ${data.market}`];
  if (data.confirmedLegCount > 0) out.push(`${data.confirmedLegCount} travel ${data.confirmedLegCount === 1 ? "time" : "times"} confirmed by ${data.expertName}`);
  out.push(data.localVerified ? `Built by ${data.expertName}, a verified local` : `Built by ${data.expertName}, a Traveloure expert`);
  return out;
}

/** The map slide's per-day caption: "Day 1 · 4 stops · 67 min of confirmed travel". */
export function mapDayCaption(day: ReadyMadeShareMapDay): string {
  const stops = `${day.points.length} ${day.points.length === 1 ? "stop" : "stops"}`;
  return day.confirmedMinutes != null && day.confirmedMinutes > 0
    ? `Day ${day.dayNumber} · ${stops} · ${day.confirmedMinutes} min of confirmed travel`
    : `Day ${day.dayNumber} · ${stops}`;
}

function chips(data: ReadyMadeShareData, size: number): El {
  const shown = data.dayChips.slice(0, 3);
  const more = data.durationDays - shown.length;
  const children: El[] = shown.map((c) =>
    h("div", { display: "flex", alignItems: "center", marginRight: 14, marginBottom: 12, borderRadius: 999, backgroundColor: "#FDECEA", padding: "10px 20px" }, [
      text(`DAY ${c.dayNumber}`, { fontWeight: 700, fontSize: size, color: CORAL, marginRight: 12, letterSpacing: 1 }),
      text(clamp(c.label, 22), { fontWeight: 400, fontSize: size, color: INK }),
    ]),
  );
  if (more > 0) children.push(h("div", { display: "flex", alignItems: "center", marginBottom: 12, padding: "10px 6px" }, text(`+${more} more`, { fontSize: size, color: MUTED })));
  return h("div", { display: "flex", flexWrap: "wrap" }, children);
}

export function buildCover(data: ReadyMadeShareData): El {
  const { width, height } = READY_MADE_SHARE_SIZES.cover;
  const photoH = 760;
  const img = photo(data, width, photoH);
  return h("div", { display: "flex", flexDirection: "column", width, height, backgroundColor: CREAM, fontFamily: "Inter" }, [
    h("div", { display: "flex", position: "relative", width, height: photoH, backgroundColor: NAVY }, [
      ...(img ? [img] : []),
      h("div", { display: "flex", position: "absolute", top: 48, left: 48 }, logo(220, true)),
    ]),
    h("div", { display: "flex", flexDirection: "column", flex: 1, padding: "40px 56px 30px" }, [
      text(clamp(data.title, 64), { fontWeight: 700, fontSize: 60, lineHeight: 1.08, color: NAVY, marginBottom: 14 }),
      text(expertLine(data), { fontSize: 28, color: MUTED, marginBottom: 22 }),
      chips(data, 24),
      h("div", { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }, [
        data.priceLine ? text(data.priceLine, { fontWeight: 700, fontSize: 32, color: INK }) : h("div", { display: "flex" }),
        pill("Get this trip", CORAL, WHITE, 32, "16px 34px"),
      ]),
      h("div", { display: "flex", justifyContent: "space-between", marginTop: 18 }, [
        text(data.shareUrl, { fontSize: 22, color: MUTED }),
        data.hero ? text(data.hero.credit, { fontSize: 18, color: MUTED }) : h("div", { display: "flex" }),
      ]),
    ]),
  ]);
}

/**
 * The schematic: dashed day lines and pins in a box, as an SVG data URI (never tiles). The pin
 * NUMBERS are drawn by satori over it (`schematicPinLabels`) — an embedded SVG carries no fonts.
 */
export function routeSchematicSvg(days: readonly ReadyMadeShareMapDay[], width: number, height: number, pad = 60): string {
  const parts: string[] = [];
  const X = (x: number) => (pad + x * (width - 2 * pad)).toFixed(1);
  const Y = (y: number) => (pad + y * (height - 2 * pad)).toFixed(1);
  days.forEach((d, i) => {
    const color = DAY_PALETTE[i % DAY_PALETTE.length];
    if (d.points.length >= 2) {
      parts.push(`<polyline points="${d.points.map((p) => `${X(p.x)},${Y(p.y)}`).join(" ")}" fill="none" stroke="${color}" stroke-width="6" stroke-dasharray="16 12" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
    d.points.forEach((p) => {
      parts.push(`<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="22" fill="${color}" stroke="#fff" stroke-width="5"/>`);
    });
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join("")}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** Where each pin's number sits — the SAME projection `routeSchematicSvg` uses. */
export function schematicPinLabels(days: readonly ReadyMadeShareMapDay[], width: number, height: number, pad = 60): { x: number; y: number; n: number }[] {
  const out: { x: number; y: number; n: number }[] = [];
  for (const d of days) d.points.forEach((p, i) => out.push({ x: pad + p.x * (width - 2 * pad), y: pad + p.y * (height - 2 * pad), n: i + 1 }));
  return out;
}

export function buildMapSlide(data: ReadyMadeShareData): El {
  const { width, height } = READY_MADE_SHARE_SIZES.map;
  const boxW = width - 112;
  const boxH = 760;
  const img = photo(data, width, height, { position: "absolute", top: 0, left: 0 });
  const legend = data.map.slice(0, 5).map((d, i) =>
    h("div", { display: "flex", alignItems: "center", marginBottom: 12 }, [
      h("div", { display: "flex", width: 22, height: 22, borderRadius: 999, backgroundColor: DAY_PALETTE[i % DAY_PALETTE.length], marginRight: 16 }),
      text(mapDayCaption(d), { fontSize: 26, color: INK }),
    ]),
  );
  return h("div", { display: "flex", position: "relative", width, height, backgroundColor: CREAM, fontFamily: "Inter" }, [
    ...(img ? [img, h("div", { display: "flex", position: "absolute", top: 0, left: 0, width, height, backgroundColor: "rgba(250,247,242,0.88)" })] : []),
    h("div", { display: "flex", flexDirection: "column", position: "absolute", top: 0, left: 0, width, height, padding: "48px 56px 34px" }, [
      logo(200, false),
      text("Your route at a glance", { fontWeight: 700, fontSize: 52, color: NAVY, marginTop: 30 }),
      text(clamp(data.title, 60), { fontSize: 28, color: MUTED, marginTop: 6, marginBottom: 22 }),
      h("div", { display: "flex", position: "relative", width: boxW, height: boxH, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.75)", border: "2px solid #E8E2D8" }, [
        { type: "img", props: { src: routeSchematicSvg(data.map, boxW, boxH), width: boxW, height: boxH, style: { display: "flex" } } },
        ...schematicPinLabels(data.map, boxW, boxH).map((l) =>
          h("div", { display: "flex", position: "absolute", left: l.x - 22, top: l.y - 22, width: 44, height: 44, alignItems: "center", justifyContent: "center", fontFamily: "Inter", fontWeight: 700, fontSize: 22, color: WHITE }, String(l.n)),
        ),
      ]),
      h("div", { display: "flex", flexDirection: "column", marginTop: 22 }, legend),
      h("div", { display: "flex", justifyContent: "space-between", marginTop: "auto" }, [
        text("Schematic, not to scale · stops shown approximately", { fontSize: 20, color: MUTED }),
        data.hero ? text(`Background ${data.hero.credit.charAt(0).toLowerCase()}${data.hero.credit.slice(1)}`, { fontSize: 18, color: MUTED }) : h("div", { display: "flex" }),
      ]),
    ]),
  ]);
}

export function buildStory(data: ReadyMadeShareData): El {
  const { width, height } = READY_MADE_SHARE_SIZES.story;
  const img = photo(data, width, height, { position: "absolute", top: 0, left: 0 });
  const proofs = storyProofLines(data).map((p) =>
    h("div", { display: "flex", alignItems: "center", marginBottom: 18 }, [
      h("div", { display: "flex", width: 14, height: 14, borderRadius: 999, backgroundColor: CORAL, marginRight: 20 }),
      text(p, { fontSize: 36, color: WHITE }),
    ]),
  );
  return h("div", { display: "flex", position: "relative", width, height, backgroundColor: NAVY, fontFamily: "Inter" }, [
    ...(img ? [img] : []),
    h("div", { display: "flex", position: "absolute", top: 0, left: 0, width, height, backgroundImage: "linear-gradient(180deg, rgba(10,20,30,0.35) 0%, rgba(10,20,30,0.05) 30%, rgba(10,20,30,0.55) 58%, rgba(10,20,30,0.92) 100%)" }),
    h("div", { display: "flex", flexDirection: "column", position: "absolute", top: 0, left: 0, width, height, padding: "110px 72px 120px" }, [
      logo(230, true),
      h("div", { display: "flex", flexDirection: "column", marginTop: "auto" }, [
        text(`${data.durationDays}-DAY TRIP · ${data.market.toUpperCase()}`, { fontWeight: 700, fontSize: 30, letterSpacing: 3, color: "#FFD3CF", marginBottom: 18 }),
        text(clamp(data.title, 64), { fontWeight: 700, fontSize: 84, lineHeight: 1.05, color: WHITE, marginBottom: 40 }),
        ...proofs,
        h("div", { display: "flex", alignItems: "center", marginTop: 30 }, [
          pill("Get this trip", CORAL, WHITE, 40, "20px 44px"),
          data.priceLine ? text(data.priceLine, { fontWeight: 700, fontSize: 32, color: WHITE, marginLeft: 28 }) : h("div", { display: "flex" }),
        ]),
        text(`Tap the link · ${data.shareUrl}`, { fontSize: 28, color: "#E6E9EC", marginTop: 26 }),
        data.hero ? text(data.hero.credit, { fontSize: 20, color: "#C9CED3", marginTop: 18 }) : h("div", { display: "flex" }),
      ]),
    ]),
  ]);
}

export function buildOg(data: ReadyMadeShareData): El {
  const { width, height } = READY_MADE_SHARE_SIZES.og;
  const photoW = 740; // ≥ 60% of the card
  const img = photo(data, photoW, height);
  return h("div", { display: "flex", width, height, backgroundColor: CREAM, fontFamily: "Inter" }, [
    h("div", { display: "flex", position: "relative", width: photoW, height, backgroundColor: NAVY }, [
      ...(img ? [img] : []),
      data.hero ? h("div", { display: "flex", position: "absolute", left: 18, bottom: 14 }, text(data.hero.credit, { fontSize: 15, color: WHITE, backgroundColor: "rgba(0,0,0,0.45)", padding: "4px 10px", borderRadius: 6 })) : h("div", { display: "flex" }),
    ]),
    h("div", { display: "flex", flexDirection: "column", flex: 1, padding: "40px 36px 40px" }, [
      logo(170, false),
      text(clamp(data.title, 56), { fontWeight: 700, fontSize: 38, lineHeight: 1.1, color: NAVY, marginTop: 30, marginBottom: 12 }),
      text(`${data.durationDays} ${data.durationDays === 1 ? "day" : "days"} · ${data.market}`, { fontSize: 22, color: MUTED, marginBottom: 8 }),
      text(data.localVerified ? `by ${data.expertName} · verified local` : `by ${data.expertName}`, { fontSize: 22, color: MUTED, marginBottom: 22 }),
      data.priceLine ? text(data.priceLine, { fontWeight: 700, fontSize: 24, color: INK, marginBottom: 20 }) : h("div", { display: "flex" }),
      h("div", { display: "flex" }, pill("Get this trip", CORAL, WHITE, 24, "12px 26px")),
    ]),
  ]);
}

export function buildReadyMadeShareElement(format: ReadyMadeShareFormat, data: ReadyMadeShareData): El {
  switch (format) {
    case "cover":
      return buildCover(data);
    case "map":
      return buildMapSlide(data);
    case "story":
      return buildStory(data);
    case "og":
      return buildOg(data);
  }
}

export async function renderReadyMadeShareImage(format: ReadyMadeShareFormat, data: ReadyMadeShareData): Promise<Buffer> {
  const { width, height } = READY_MADE_SHARE_SIZES[format];
  const svg = await satori(buildReadyMadeShareElement(format, data) as any, { width, height, fonts: FONT_CONFIG });
  return new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng();
}
