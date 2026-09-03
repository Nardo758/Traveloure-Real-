/**
 * trip-pdf.render.ts — the printable trip document, rendered from the trip's CANONICAL rows.
 *
 * Lane C of the slip-convergence sequence (ledger `2026-09-03-slip-convergence`). A buyer of a
 * ready-made trip asked for "the digital clone AND a physical copy"; the physical copy is this
 * PDF. It renders from `itinerary_items` — the same rows the slip, the PlanCard and the cart
 * projection all read — so the paper and the screen can never disagree.
 *
 * NOT the pre-existing `/api/my-itinerary/:id/pdf`: that one renders from an itinerary
 * COMPARISON's variant rows (a pre-trip optimization artifact), which a purchased ready-made
 * trip never has. This module is deliberately a sibling, not a replacement — the comparison
 * export keeps its own surface.
 *
 * §13 honesty rules, load-bearing here because a printed page outlives the screen:
 *   - a field the trip never answered is OMITTED, never rendered as an empty label or a zero.
 *     No "Price: $0", no "Time: —", no invented durations or distances.
 *   - money is printed only where the row carries it (`estimatedCost`/`actualCost` + currency);
 *     nothing is summed into a total the platform did not charge.
 *   - `privateNotes` (organizer-only) and `trips.expertNotes` (the Workstation's PRIVATE build
 *     notes, §21) are NEVER read here. The traveler-facing pair — per-item `expertNote` and
 *     trip-level `expertTravelerNote` — is what the buyer paid for and does render.
 *
 * PDF engine: pdfkit (existing dep). Note the two API details the older
 * `my-itinerary.routes.ts` export got wrong and which kept it from ever producing bytes:
 * page breaks are `doc.addPage()` (there is no `pageBreak()`), and pdfkit's writable side emits
 * `end`, not `finish`.
 */

export interface TripPdfItem {
  title: string;
  description?: string | null;
  dayNumber: number;
  startTime?: string | null;
  endTime?: string | null;
  scheduledDate?: string | Date | null;
  locationName?: string | null;
  locationAddress?: string | null;
  estimatedCost?: string | number | null;
  actualCost?: string | number | null;
  currency?: string | null;
  notes?: string | null;
  expertNote?: string | null;
  itemType?: string | null;
  checkIn?: string | Date | null;
  checkOut?: string | Date | null;
  sortOrder?: number | null;
}

export interface TripPdfModel {
  title: string;
  destination?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  trackingNumber?: string | null;
  expertTravelerNote?: string | null;
  items: TripPdfItem[];
}

const INK = "#1A1A18";
const MUTED = "#7A7A72";

/** A date column may arrive as a `YYYY-MM-DD` string (drizzle `date`) or a Date. */
function fmtDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const s = typeof value === "string" ? value : value.toISOString().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  // Construct in UTC so a `YYYY-MM-DD` never shifts a day under the server's local zone.
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Money prints only when the row actually carries a positive amount (§13). */
function fmtMoney(amount: string | number | null | undefined, currency: string | null | undefined): string | null {
  if (amount === null || amount === undefined || amount === "") return null;
  const n = typeof amount === "number" ? amount : Number.parseFloat(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  const code = (currency || "USD").toUpperCase();
  const symbol = code === "USD" ? "$" : "";
  return `${symbol}${n.toFixed(2)}${symbol ? "" : ` ${code}`}`;
}

function timeRange(item: TripPdfItem): string | null {
  const parts = [item.startTime, item.endTime].filter(Boolean) as string[];
  if (parts.length === 0) return null;
  return parts.join("–");
}

/**
 * Order within a day: timed items first (by clock), then untimed ones in their authored
 * `sortOrder`. Deliberately NOT re-sequenced or optimized — this document prints the plan as the
 * trip holds it, so the paper matches the slip row-for-row.
 */
function orderDayItems(items: TripPdfItem[]): TripPdfItem[] {
  return [...items].sort((a, b) => {
    const at = a.startTime || "";
    const bt = b.startTime || "";
    if (at && bt && at !== bt) return at < bt ? -1 : 1;
    if (at && !bt) return -1;
    if (!at && bt) return 1;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });
}

export async function renderTripPdf(model: TripPdfModel): Promise<Buffer> {
  // ESM-safe lazy load (matches demand-onepager.render.ts / admin.routes.ts).
  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({ size: "LETTER", margin: 54 });
  const buffers: Buffer[] = [];
  doc.on("data", (c: Buffer) => buffers.push(c));

  const left = doc.page.margins.left;
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // ── Cover block ────────────────────────────────────────────────────────────
  if (model.destination) {
    doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(10)
      .text(model.destination.toUpperCase(), left, doc.y, { width: contentWidth, characterSpacing: 1 });
    doc.moveDown(0.4);
  }
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(24).text(model.title, { width: contentWidth });

  const start = fmtDate(model.startDate);
  const end = fmtDate(model.endDate);
  if (start || end) {
    doc.moveDown(0.3);
    doc.fillColor(MUTED).font("Helvetica").fontSize(11)
      .text([start, end].filter(Boolean).join(" – "), { width: contentWidth });
  }
  if (model.trackingNumber) {
    doc.moveDown(0.2);
    doc.fillColor(MUTED).font("Helvetica").fontSize(9).text(model.trackingNumber, { width: contentWidth });
  }

  doc.moveDown(0.8);
  doc.moveTo(left, doc.y).lineTo(left + contentWidth, doc.y).strokeColor(MUTED).lineWidth(0.5).stroke();
  doc.moveDown(0.8);

  // ── Note from your expert (§21 traveler-facing trip-level note) ────────────
  if (model.expertTravelerNote && model.expertTravelerNote.trim()) {
    doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(9)
      .text("NOTE FROM YOUR EXPERT", left, doc.y, { width: contentWidth, characterSpacing: 0.8 });
    doc.moveDown(0.3);
    doc.fillColor(INK).font("Helvetica").fontSize(10)
      .text(model.expertTravelerNote.trim(), { width: contentWidth });
    doc.moveDown(0.9);
  }

  // ── Days ──────────────────────────────────────────────────────────────────
  const byDay = new Map<number, TripPdfItem[]>();
  for (const item of model.items) {
    const day = item.dayNumber ?? 0;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(item);
  }
  const days = Array.from(byDay.keys()).sort((a, b) => a - b);

  if (days.length === 0) {
    // An empty plan says so plainly rather than printing an empty shell (§13).
    doc.fillColor(MUTED).font("Helvetica").fontSize(11)
      .text("This trip has no items yet.", left, doc.y, { width: contentWidth });
  }

  for (const day of days) {
    // Keep a day header from stranding at the foot of a page.
    if (doc.y > doc.page.height - doc.page.margins.bottom - 120) doc.addPage();

    doc.fillColor(INK).font("Helvetica-Bold").fontSize(14)
      .text(day === 0 ? "Before you go" : `Day ${day}`, left, doc.y, { width: contentWidth });
    doc.moveDown(0.5);

    for (const item of orderDayItems(byDay.get(day)!)) {
      if (doc.y > doc.page.height - doc.page.margins.bottom - 90) doc.addPage();

      const when = timeRange(item);
      if (when) {
        doc.fillColor(MUTED).font("Helvetica").fontSize(9)
          .text(when, left, doc.y, { width: contentWidth });
      }
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(11)
        .text(item.title, left, doc.y, { width: contentWidth });

      const place = item.locationName || item.locationAddress;
      if (place) {
        doc.fillColor(MUTED).font("Helvetica").fontSize(9.5)
          .text(place, left, doc.y, { width: contentWidth });
      }

      // A stay prints its own window — the dates the buyer booked against (migration 275).
      const checkIn = fmtDate(item.checkIn);
      const checkOut = fmtDate(item.checkOut);
      if (checkIn && checkOut) {
        doc.fillColor(MUTED).font("Helvetica").fontSize(9.5)
          .text(`Check in ${checkIn} · Check out ${checkOut}`, left, doc.y, { width: contentWidth });
      }

      if (item.description && item.description.trim()) {
        doc.fillColor(INK).font("Helvetica").fontSize(10)
          .text(item.description.trim(), left, doc.y, { width: contentWidth });
      }

      if (item.notes && item.notes.trim()) {
        doc.fillColor(MUTED).font("Helvetica-Oblique").fontSize(9.5)
          .text(item.notes.trim(), left, doc.y, { width: contentWidth });
      }

      // §21: the per-item traveler-facing expert note, labelled as the screen labels it.
      if (item.expertNote && item.expertNote.trim()) {
        doc.fillColor(INK).font("Helvetica-Oblique").fontSize(9.5)
          .text(`Expert Notes: ${item.expertNote.trim()}`, left, doc.y, { width: contentWidth });
      }

      const money = fmtMoney(item.actualCost ?? item.estimatedCost, item.currency);
      if (money) {
        doc.fillColor(MUTED).font("Helvetica").fontSize(9.5)
          .text(money, left, doc.y, { width: contentWidth });
      }

      doc.moveDown(0.7);
    }

    doc.moveDown(0.4);
  }

  doc.end();
  return await new Promise<Buffer>((resolve, reject) => {
    // pdfkit's writable side emits `end` (not `finish`).
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);
  });
}
