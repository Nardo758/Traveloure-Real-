/**
 * demand-onepager.render.ts — the PURE PDF renderer for the recruitment one-pager.
 *
 * DB-FREE by design: it imports only the OnepagerModel TYPE (type-only, no runtime dep on the rollup
 * read or `db.ts`) plus pdfkit and the brand-font assets. So the render — and its visual/determinism
 * check — runs with no database, mirroring the compute module's no-DB testability. `service.ts` owns
 * the DB read and calls in here; nothing here reads or computes demand (every string is a model field,
 * every bar length is a ratio of model values — no re-derivation).
 *
 * PDF engine: pdfkit (existing dep; donor pattern `vendor-management.service.ts:413-444`, resolving on
 * the writable `end` event — not the `finish` the donor uses; ESM-safe dynamic import like
 * `admin.routes.ts:4359`).
 *
 * Brand fonts (recruitment PDF is the most brand-forward artifact — it uses the real brand faces):
 *   • HERO headline → **Fraunces** SemiBold (server/assets/fonts/Fraunces-SemiBold.ttf, OFL) — the
 *     brand display serif the web surfaces and the frozen CI baselines render. A static instance
 *     (opsz 144, wght 600) instanced from the OFL variable font so pdfkit renders a real weight.
 *   • body/labels → **Inter** (the woffs the share-image rail loads, `share-image.service.ts:51-65`).
 * Palette mirrors `share-image.service.ts:24-30`. A missing asset degrades to Helvetica (never throws).
 *
 * NO OSM ATTRIBUTION: this page renders NO map and NO OSM-derived data — the rollup figures are
 * first-party. ODbL attribution here would falsely imply OSM provenance (note-1). It returns only if a
 * map panel is ever added to the layout.
 *
 * Determinism: same model ⇒ same visible layout; CreationDate is PINNED to a fixed epoch so PDF bytes
 * do not drift on the timestamp. The authoritative determinism assertion is on the MODEL.
 *
 * R32: renders a DRAFT watermark unless the caller passes `watermark: null` (post-approval flow only).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { OnepagerModel } from "./demand-onepager.compute";

// ── brand tokens (mirror share-image.service.ts:24-30) ───────────────────────────────────────────
const INK = "#1A1A18";
const MUTED = "#7A7A72";
const NAVY = "#1E3A5F"; // hero headline
const BAR = "#C9B77A"; // muted gold bar fill for the supporting visual
const BAR_TRACK = "#ECE8DC"; // faint track behind each bar

// ── fonts (mirror share-image.service.ts:51-65 resolution) ───────────────────────────────────────
const moduleDir =
  typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR_DEV = path.resolve(process.cwd(), "server", "assets", "fonts");
const FONTS_DIR_PROD = path.resolve(moduleDir, "assets", "fonts");
const FONTS_DIR = fs.existsSync(FONTS_DIR_DEV) ? FONTS_DIR_DEV : FONTS_DIR_PROD;

function readFontSafe(file: string): Buffer | null {
  try {
    return fs.readFileSync(path.join(FONTS_DIR, file));
  } catch {
    return null;
  }
}
const INTER_REGULAR = readFontSafe("Inter-Regular.woff");
const INTER_BOLD = readFontSafe("Inter-Bold.woff");
const FRAUNCES = readFontSafe("Fraunces-SemiBold.ttf");

// Pinned so the PDF's CreationDate never varies run-to-run (content-stability; see header).
const FIXED_PDF_EPOCH = new Date(0);

const USD0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** ISO "2026-10-01" → human "Oct 1" (a sales artifact never shows a machine date). Presentation only
 *  — the model keeps ISO dates as data. A stay row is a CHECK-IN date, not a range: the per-cell
 *  nights are summed across trips, so a span would misrepresent (note-3). */
function humanDate(iso: string): string {
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return `${MONTHS[m - 1] ?? iso.slice(5, 7)} ${d}`;
}

function useFonts(doc: any): { regular: string; bold: string; display: string } {
  let regular = "Helvetica";
  let bold = "Helvetica-Bold";
  let display = bold; // hero falls back to bold body if Fraunces is unavailable
  try {
    if (INTER_REGULAR) {
      doc.registerFont("Inter", INTER_REGULAR);
      regular = "Inter";
    }
    if (INTER_BOLD) {
      doc.registerFont("Inter-Bold", INTER_BOLD);
      bold = "Inter-Bold";
      display = bold;
    }
    if (FRAUNCES) {
      doc.registerFont("Fraunces", FRAUNCES);
      display = "Fraunces";
    }
  } catch {
    return { regular: "Helvetica", bold: "Helvetica-Bold", display: "Helvetica-Bold" };
  }
  return { regular, bold, display };
}

function drawWatermark(doc: any) {
  doc.save();
  doc.rotate(-30, { origin: [doc.page.width / 2, doc.page.height / 2] });
  doc
    .fontSize(120)
    .fillColor(MUTED)
    .fillOpacity(0.12)
    .text("DRAFT", 0, doc.page.height / 2 - 60, { width: doc.page.width, align: "center" });
  doc.fillOpacity(1);
  doc.restore();
}

/** The supporting visual: a small horizontal bar per shown window, bar length = the window's weight
 *  as a RATIO of the largest shown window (property-led: nights; service-led: $, count-only after
 *  priced). No invented scale — purely a proportion of model values. */
function drawWindowBars(
  doc: any,
  fonts: { regular: string; bold: string },
  model: OnepagerModel,
  shown: OnepagerModel["windows"],
  x: number,
  width: number,
) {
  const isProperty = model.variant === "property-led";
  const weight = (w: OnepagerModel["windows"][number]) =>
    isProperty ? w.nights ?? 0 : w.amount == null ? 0 : w.amount;
  const max = Math.max(1, ...shown.map(weight));
  const labelW = 78; // "Oct 1" column
  const valueW = 150; // right-hand value column
  const barX = x + labelW;
  const barMax = width - labelW - valueW - 12;
  const rowH = 20;

  shown.forEach((w) => {
    const y = doc.y;
    doc.font(fonts.bold).fontSize(10).fillColor(INK).text(humanDate(w.date), x, y + 4, { width: labelW });
    // track + bar
    const barW = Math.max(2, Math.round((weight(w) / max) * barMax));
    doc.roundedRect(barX, y + 6, barMax, 8, 4).fill(BAR_TRACK);
    doc.roundedRect(barX, y + 6, barW, 8, 4).fill(BAR);
    // value + N
    const value = isProperty
      ? `${w.trips ?? 0} trips · ${w.nights ?? 0} nights · n=${w.n}`
      : w.amount == null
        ? `count-only · ${w.count ?? 0} trips · n=${w.n}`
        : `${USD0.format(w.amount)} · ${w.count ?? 0} trips · n=${w.n}`;
    doc.font(fonts.regular).fontSize(9).fillColor(MUTED).text(value, barX + barMax + 12, y + 4, {
      width: valueW,
      align: "right",
    });
    doc.y = y + rowH;
  });
}

/**
 * Render a one-pager view-model to a PDF Buffer. Brief §3 layout: Fraunces hero (variant headline +
 * subline + methodology line), one supporting visual (the top requested check-in windows as bars,
 * honestly labeled "Top K of N" with the hero as the market total — note-2), then the methodology
 * block. Every string/number is a model field.
 */
export async function renderOnepagerPdf(
  model: OnepagerModel,
  opts: { watermark?: "DRAFT" | null } = {},
): Promise<Buffer> {
  const watermark = opts.watermark === undefined ? "DRAFT" : opts.watermark;
  // ESM-safe lazy load (matches admin.routes.ts:4359).
  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({ size: "A4", margin: 48, info: { CreationDate: FIXED_PDF_EPOCH } });
  const fonts = useFonts(doc);
  const buffers: Buffer[] = [];
  doc.on("data", (c: Buffer) => buffers.push(c));

  const left = doc.page.margins.left;
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // Header (no ODbL — note-1: no map, no OSM data on this page).
  doc.fillColor(MUTED).font(fonts.bold).fontSize(11).text(`${model.marketName.toUpperCase()} · UNMET TRAVELER DEMAND`, {
    characterSpacing: 1,
  });
  doc.moveDown(1.2);

  // Hero — Fraunces headline, subline, methodology line directly beneath (brief §3).
  doc.font(fonts.display).fontSize(38).fillColor(NAVY).text(model.hero.headline, { width: contentWidth });
  doc.moveDown(0.25);
  doc.font(fonts.regular).fontSize(12.5).fillColor(INK).text(model.hero.subline, { width: contentWidth });
  doc.moveDown(0.2);
  doc
    .font(fonts.regular)
    .fontSize(10)
    .fillColor(MUTED)
    .text(`Based on ${model.hero.strictCount} planned trips (strict count) · ${model.monthRange} · updated monthly`);
  doc.moveDown(1.2);

  // R33 event spotlight (block 2, before windows) — a gold-accented callout with the event name in
  // Fraunces; the demand copy is the model's verbatim line. Omitted entirely when null (no filler).
  if (model.eventSpotlight) {
    const s = model.eventSpotlight;
    const y0 = doc.y;
    doc.roundedRect(left, y0, contentWidth, 44, 6).fill(BAR_TRACK); // faint gold-wash panel
    doc.fillColor("#8A6D1B").font(fonts.bold).fontSize(8).text("EVENT SPOTLIGHT", left + 12, y0 + 8, {
      characterSpacing: 1,
    });
    // event name in Fraunces (gold ink), then the remainder of the verbatim copy in body
    doc.font(fonts.display).fontSize(13).fillColor("#8A6D1B").text(s.eventName, left + 12, y0 + 20, { continued: true });
    doc.font(fonts.regular).fontSize(11).fillColor(INK).text(s.copy.slice(s.eventName.length));
    doc.y = y0 + 44;
    doc.moveDown(1);
  }

  // Supporting visual — top requested check-in windows (bars). Honest completeness label (note-2):
  // the hero is the MARKET TOTAL; these bars are the top K of the market's N floor-cleared windows.
  if (model.windows.length > 0) {
    const K = 5;
    const shown = model.windows.slice(0, K);
    const noun = model.variant === "property-led" ? "check-in dates" : "windows";
    const header =
      model.windowsTotal > shown.length
        ? `Top ${shown.length} of ${model.windowsTotal} requested ${noun} — the hero is the market total`
        : `Requested ${noun}`;
    doc.font(fonts.bold).fontSize(11).fillColor(INK).text(header);
    doc.moveDown(0.4);
    drawWindowBars(doc, fonts, model, shown, left, contentWidth);
    doc.moveDown(1.2);
  }

  // R34 trend — only when unlocked (>= TREND_MIN_WEEKS of history); a compact weekly sparkline. Never
  // renders below threshold (no placeholder, no slope language).
  if (model.trendBlock && model.trendBlock.points.length > 0) {
    const t = model.trendBlock;
    doc.font(fonts.bold).fontSize(11).fillColor(INK).text(`Demand trend — last ${t.weeks} weeks`, left, doc.y);
    doc.moveDown(0.3);
    const max = Math.max(1, ...t.points.map((p) => p.value));
    const n = t.points.length;
    const gap = 3;
    const barW = Math.max(2, Math.floor((contentWidth - (n - 1) * gap) / n));
    const baseY = doc.y;
    const h = 28;
    t.points.forEach((p, i) => {
      const bh = Math.max(1, Math.round((p.value / max) * h));
      doc.roundedRect(left + i * (barW + gap), baseY + (h - bh), barW, bh, 1).fill(BAR);
    });
    doc.y = baseY + h + 6;
    doc.moveDown(1);
  }

  // R35 gap pairing — a single honest line (grains kept distinct); the model built the verbatim copy.
  if (model.gapPairing) {
    doc.font(fonts.regular).fontSize(10).fillColor(INK).text(model.gapPairing.copy, left, doc.y, { width: contentWidth });
    doc.moveDown(1);
  }

  // Methodology block — the credibility spine (brief §3, four honesty gates). Explicit x=left: the
  // bar visual draws with absolute coordinates and leaves doc.x at the value column, so without this
  // the paragraph would inherit that x and clip off the right edge.
  doc.font(fonts.regular).fontSize(9).fillColor(MUTED).text(model.methodology, left, doc.y, { width: contentWidth });

  if (watermark === "DRAFT") drawWatermark(doc);

  doc.end();
  return await new Promise<Buffer>((resolve, reject) => {
    // pdfkit's writable side emits `end` (not `finish`, which the donor uses); resolve there.
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);
  });
}
