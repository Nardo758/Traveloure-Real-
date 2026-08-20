/**
 * demand-onepager.render.ts — the PURE PDF renderer for the recruitment one-pager.
 *
 * DB-FREE by design: it imports only the OnepagerModel TYPE (type-only, no runtime dep on the rollup
 * read or `db.ts`) plus pdfkit and the brand-font assets. So the render — and its visual/determinism
 * check — runs with no database, mirroring the compute module's no-DB testability. `service.ts` owns
 * the DB read and calls in here; nothing here reads or computes demand (every string is a model field).
 *
 * PDF engine: pdfkit (existing dep; donor pattern `vendor-management.service.ts:413-444`, resolving on
 * the writable `end` event — not the `finish` the donor uses). Brand fonts: the Inter woffs the
 * share-image rail loads (`share-image.service.ts:51-65`); palette mirrors `share-image.service.ts:24-30`.
 *
 * Determinism: same model ⇒ same visible layout; CreationDate is PINNED to a fixed epoch so PDF bytes
 * do not drift on the timestamp. The authoritative determinism assertion is on the MODEL
 * (demand-onepager.compute.ts) — this render is content-stable, stated in the service header.
 *
 * R32: renders a DRAFT watermark unless the caller passes `watermark: null` (only the post-approval
 * admin flow does that).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { OnepagerModel } from "./demand-onepager.compute";

// ── brand tokens (mirror share-image.service.ts:24-30) ───────────────────────────────────────────
const INK = "#1A1A18";
const MUTED = "#7A7A72";
const NAVY = "#1E3A5F"; // hero headline — matches the Market Research hero navy
// (a gold accent is reserved for lane item 4.2's brand pass; 4.1 keeps ink/navy/muted only)

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

// Pinned so the PDF's CreationDate never varies run-to-run (content-stability; see header).
const FIXED_PDF_EPOCH = new Date(0);

const USD0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function useFonts(doc: any): { regular: string; bold: string } {
  // Register the Inter woffs if available; otherwise fall back to pdfkit's built-in Helvetica so a
  // missing asset degrades to a plain page rather than throwing (§13 — honest degrade, never a crash).
  let regular = "Helvetica";
  let bold = "Helvetica-Bold";
  try {
    if (INTER_REGULAR) {
      doc.registerFont("Inter", INTER_REGULAR);
      regular = "Inter";
    }
    if (INTER_BOLD) {
      doc.registerFont("Inter-Bold", INTER_BOLD);
      bold = "Inter-Bold";
    }
  } catch {
    regular = "Helvetica";
    bold = "Helvetica-Bold";
  }
  return { regular, bold };
}

function drawWatermark(doc: any) {
  // Diagonal DRAFT stamp across the page (R32). Light, non-obscuring.
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

/**
 * Render a one-pager view-model to a PDF Buffer. A basic, faithful layout — the brief §3 template
 * refinement (variant hero, ≤3 supporting visuals, brand polish) is lane item 4.2. Every string is a
 * model field; nothing is computed here.
 */
export async function renderOnepagerPdf(
  model: OnepagerModel,
  opts: { watermark?: "DRAFT" | null } = {},
): Promise<Buffer> {
  const watermark = opts.watermark === undefined ? "DRAFT" : opts.watermark;
  // ESM-safe lazy load (matches admin.routes.ts:4359) — keeps pdfkit out of any cold path that
  // never renders, and works under ESM where `require` is undefined.
  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({ size: "A4", margin: 48, info: { CreationDate: FIXED_PDF_EPOCH } });
  const { regular, bold } = useFonts(doc);
  const buffers: Buffer[] = [];
  doc.on("data", (c: Buffer) => buffers.push(c));

  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // Header: market title + ODbL attribution (required wherever any OSM-anchored figure renders).
  doc.fillColor(INK).font(bold).fontSize(18).text(`${model.marketName} — unmet traveler demand`);
  doc.font(regular).fontSize(8).fillColor(MUTED).text("© OpenStreetMap contributors");
  doc.moveDown(1);

  // Hero — the single figure, headline + subline, methodology line directly beneath (brief §3).
  doc.font(bold).fontSize(34).fillColor(NAVY).text(model.hero.headline);
  doc.moveDown(0.2);
  doc.font(regular).fontSize(12).fillColor(INK).text(model.hero.subline, { width: contentWidth });
  doc.moveDown(0.2);
  doc
    .font(regular)
    .fontSize(10)
    .fillColor(MUTED)
    .text(`Based on ${model.hero.strictCount} planned trips (strict count) · ${model.monthRange} · updated monthly`);
  doc.moveDown(1);

  // Supporting: the leading-metric forward windows (top rows). 4.2 replaces this with the brief's ≤3
  // visuals; for 4.1 it is an honest textual rendering of the floored cells.
  if (model.windows.length > 0) {
    doc
      .font(bold)
      .fontSize(11)
      .fillColor(INK)
      .text(model.variant === "property-led" ? "Requested stays (forward)" : "Requested windows (forward)");
    doc.moveDown(0.3);
    for (const w of model.windows.slice(0, 3)) {
      const right =
        model.variant === "property-led"
          ? `${w.trips ?? 0} trips · ${w.nights ?? 0} nights`
          : w.amount == null
            ? `count-only · ${w.count ?? 0} trips`
            : `${USD0.format(w.amount)} · ${w.count ?? 0} trips`;
      doc.font(regular).fontSize(10).fillColor(INK).text(`${w.date}    ${right}    · n=${w.n}`);
    }
    doc.moveDown(1);
  }

  // Methodology block — the credibility spine (brief §3, four honesty gates).
  doc.font(regular).fontSize(9).fillColor(MUTED).text(model.methodology, { width: contentWidth });

  if (watermark === "DRAFT") drawWatermark(doc);

  doc.end();
  return await new Promise<Buffer>((resolve, reject) => {
    // pdfkit's writable side emits `end` (not `finish`, which the donor uses); resolve there.
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);
  });
}
