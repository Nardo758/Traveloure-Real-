/**
 * Lane C — printable trip document, render proofs (no DB).
 *
 * Imports ONLY `trip-pdf.render.ts`, which is DB-free, so these run anywhere. What they hold:
 *
 *   P1  the renderer produces a real PDF Buffer from canonical-shaped rows
 *   P2  §13 — a field the trip never answered prints NOTHING (no empty label, no "$0")
 *   P3  §21 — the traveler-facing notes render; nothing else is even accepted by the model type
 *   P4  an empty plan says so rather than printing an empty shell
 *   P5  the pdfkit finalize path resolves (the `end`-vs-`finish` trap that kept the older
 *       comparison export from ever producing bytes)
 *
 * Run: tsx --test server/__tests__/trip-pdf-render.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as zlib from "zlib";
import { renderTripPdf, type TripPdfModel } from "../services/trip-pdf.render";

/**
 * pdfkit Flate-compresses its content streams and writes show-text operands as hex strings inside
 * kerned TJ arrays, so a raw grep of the Buffer finds nothing. Inflate every stream, decode the
 * `<hex>` operands and drop the kerning numbers between them — what comes back is the page's
 * reading order. The renderer uses pdfkit's STANDARD Helvetica (no embedded font ⇒ no subsetting),
 * so the literals survive intact and the NEGATIVE assertions below actually mean something.
 */
function pdfText(buf: Buffer): string {
  const raw = buf.toString("latin1");
  let streams = "";
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const start = m.index + m[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) continue;
    const chunk = Buffer.from(raw.slice(start, end), "latin1");
    try {
      streams += zlib.inflateSync(chunk).toString("latin1");
    } catch {
      streams += chunk.toString("latin1"); // uncompressed stream
    }
  }
  // `[<48656c6c6f> -15 <20776f726c64> 0] TJ` → "Hello world". The kerning numbers sit BETWEEN
  // hex operands and would otherwise land mid-word, so decode a whole TJ array at a time and drop
  // them — without this, "…no items yet." reads back as "…no items y 20 et.".
  return streams.replace(/\[([^\]]*)\]\s*TJ/g, (_all, body: string) =>
    (body.match(/<[0-9a-fA-F]+>/g) || [])
      .map((tok) => Buffer.from(tok.slice(1, -1), "hex").toString("latin1"))
      .join(""),
  );
}

const FULL: TripPdfModel = {
  title: "Four Days in Kyoto",
  destination: "Kyoto, Japan",
  startDate: "2026-10-02",
  endDate: "2026-10-05",
  trackingNumber: "TRV-000123",
  expertTravelerNote: "Trains fill up on the 3rd — reserve the morning run.",
  items: [
    {
      title: "Nishiki Market walk",
      description: "Start at the west entrance and work east.",
      dayNumber: 1,
      startTime: "09:00",
      endTime: "11:00",
      locationName: "Nishiki Market",
      estimatedCost: "42.00",
      currency: "USD",
      expertNote: "Skip the first two stalls; the good pickles are halfway down.",
      sortOrder: 0,
    },
    {
      title: "Machiya stay",
      dayNumber: 1,
      itemType: "accommodation",
      checkIn: "2026-10-02",
      checkOut: "2026-10-05",
      sortOrder: 1,
    },
    {
      title: "Fushimi Inari at dawn",
      dayNumber: 2,
      startTime: "05:30",
      locationAddress: "68 Fukakusa Yabunouchicho",
      notes: "Bring a light layer.",
      sortOrder: 0,
    },
  ],
};

/** A PDF Buffer starts with the %PDF- header and ends with the EOF marker. */
function assertIsPdf(buf: Buffer) {
  assert.ok(Buffer.isBuffer(buf), "expected a Buffer");
  assert.equal(buf.subarray(0, 5).toString("latin1"), "%PDF-", "missing PDF header");
  assert.ok(buf.length > 800, `PDF suspiciously small (${buf.length} bytes)`);
  assert.ok(buf.subarray(-1024).toString("latin1").includes("%%EOF"), "missing EOF marker");
}

// P1 + P5 — a full model renders, and the finalize promise actually resolves. If pdfkit's
// `end` event were mis-wired (the `finish` trap) this test would time out rather than fail.
test("P1/P5: renders a valid PDF from canonical rows", async () => {
  const buf = await renderTripPdf(FULL);
  assertIsPdf(buf);
});

// P2 — §13. A trip whose rows answered almost nothing must still render, and must NOT invent
// labels for the unanswered fields. Text-layer greps are defeated by font subsetting on embedded
// fonts, but this renderer uses pdfkit's STANDARD Helvetica (no subsetting), so the literals are
// greppable — which is exactly what makes the negative assertions meaningful.
test("P2: unanswered fields print nothing (no empty labels, no $0)", async () => {
  const sparse: TripPdfModel = {
    title: "Bare Plan",
    items: [{ title: "A thing that happens", dayNumber: 1, estimatedCost: "0.00", currency: "USD" }],
  };
  const text = pdfText(await renderTripPdf(sparse));
  assert.ok(text.includes("Bare Plan"), "title should render");
  assert.ok(!text.includes("$0.00"), "a zero cost must not print as money (§13)");
  assert.ok(!text.includes("Check in"), "absent stay dates must print no stay line");
  assert.ok(!text.includes("Expert Notes"), "absent expert note must print no label");
  assert.ok(!text.includes("NOTE FROM YOUR EXPERT"), "absent trip note must print no header");
});

// P3 — §21. The two traveler-facing note fields render under the labels the screen uses. The
// PRIVATE fields (itinerary_items.private_notes, trips.expert_notes) have no field on
// TripPdfModel at all, so this surface cannot leak them even by accident.
test("P3: traveler-facing expert notes render; private fields have no channel", async () => {
  const text = pdfText(await renderTripPdf(FULL));
  assert.ok(text.includes("NOTE FROM YOUR EXPERT"), "trip-level traveler note header missing");
  assert.ok(text.includes("Expert Notes"), "per-item expert note label missing");
  assert.ok(!("privateNotes" in (FULL.items[0] as Record<string, unknown>)), "model must not carry privateNotes");
  assert.ok(!("expertNotes" in (FULL as unknown as Record<string, unknown>)), "model must not carry the private trip notes");
});

// P4 — an empty plan is stated, not implied by a blank page.
test("P4: an empty plan says so", async () => {
  const buf = await renderTripPdf({ title: "Nothing Yet", items: [] });
  assertIsPdf(buf);
  assert.ok(pdfText(buf).includes("no items yet"), "empty plan should state itself");
});
