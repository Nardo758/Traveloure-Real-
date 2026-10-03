/**
 * SURFACE STEP 1 — VISUAL PARITY (surface spec v1.2 §10 step 1; rulings R-z, R-aa, R-ab; ledger
 * `2026-10-03-surface-step1-item-row`).
 *
 * Renders a STORED plancard payload (R-ab: a snapshot in the repo, never a live production plan)
 * through the new `DayBlock` + `ItemRow`, the way the slip mounts them, and asserts the page says
 * what the payload says:
 *   V1 every item renders exactly once, and the count equals the payload's
 *   V2 each item sits under its own day, whose heading is "<Wkd> · <Mon d>"
 *   V3 each item's time and title are the payload's
 *   V4 each item's facts line is the payload's hours fact, verbatim "<Wkd> · <hours> · Google Maps ·
 *      checked <d Mon>", and an item with no usable hours fact renders no facts line
 *   V5 an expert-note slot renders exactly where the payload carries `expertNote`
 *   V6 no status pill, no per-item checkout control, no "Build my days" link under any row (R-l)
 *   V7 day 1 carries "Arrival in <city>" and the last day "Departure from <city>" (R-aa)
 *   V8 the place line renders the payload's stored location, or a Google ward/area — never a
 *      third-party name the payload does not carry (R-ab: it renders what is stored)
 *
 * Fixture: `server/__tests__/fixtures/smoke6-plancard.json` — the owner's
 * `GET /api/trips/0c97a0a1-b1d4-40bb-83fb-e193f0d4538c/plancard` response from smoke 6.
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/surface-step1-parity.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { DayBlock } from "../../plan/DayBlock";
import { ItemRow } from "../../plan/ItemRow";
import { TRAVEL_ANCHOR_WORDS, TravelAnchorPlaceholder } from "../../plan/AnchorRow";
import { dayBlockHeading } from "@/lib/plan-day";
import { itemFactsLine, itemPlaceLine } from "@/lib/place-facts";

(globalThis as any).React = React;

const FIXTURE = process.env.SURFACE_PARITY_FIXTURE ?? path.resolve(__dirname, "../../../../../server/__tests__/fixtures/smoke6-plancard.json");
/** Smoke 6's plan held 24 items; an override fixture (local harness check) states no count. */
const EXPECTED_ITEMS = process.env.SURFACE_PARITY_FIXTURE ? null : 24;
const payload = JSON.parse(readFileSync(FIXTURE, "utf8"));
const days: any[] = [...(payload.days ?? [])].sort((a, b) => a.dayNum - b.dayNum);
const facts: Record<string, any[]> = payload.placeFacts ?? {};
const city: string = payload.trip?.destination ?? "";
const allItems = days.flatMap((d) => d.activities ?? []);

const decode = (s: string) =>
  s.replace(/<!-- -->/g, "").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const text = (html: string) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
/** The inner text of the element carrying `data-testid="<id>"` (first match). */
function byTestId(html: string, id: string): string | null {
  const at = html.indexOf(`data-testid="${id}"`);
  if (at < 0) return null;
  const open = html.lastIndexOf("<", at);
  const tag = /^<([a-z0-9]+)/i.exec(html.slice(open))![1];
  let depth = 0;
  const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, "gi");
  re.lastIndex = open;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    depth += m[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return text(html.slice(html.indexOf(">", at) + 1, m.index));
  }
  return null;
}

const lastDayNum = days.length ? days[days.length - 1].dayNum : null;
const rendered = days.map((day) => {
  const html = renderToString(
    React.createElement(
      DayBlock as any,
      { dayKey: String(day.dayNum), heading: dayBlockHeading({ dayNum: day.dayNum, date: day.date, dateIso: day.dateIso }), stats: null, defaultOpen: true },
      day.dayNum === 1 ? React.createElement(TravelAnchorPlaceholder, { kind: "arrival", city }) : null,
      ...(day.activities ?? []).map((a: any) =>
        React.createElement(ItemRow, {
          key: a.id,
          item: a,
          facts: facts[a.id],
          dateIso: day.dateIso ?? null,
          mode: "edit",
          role: "traveler",
          menu: { onSwap: () => {}, onRemove: () => {} },
          expertNote: a.expertNote ? { note: a.expertNote, author: null } : null,
        }),
      ),
      day.dayNum === lastDayNum ? React.createElement(TravelAnchorPlaceholder, { kind: "departure", city }) : null,
    ),
  );
  return { day, html };
});
const whole = rendered.map((r) => r.html).join("\n");

describe("surface step 1 — parity against the stored smoke plan", () => {
  it("V1 every payload item renders exactly once", () => {
    assert.ok(allItems.length > 0, "the fixture carries items");
    if (EXPECTED_ITEMS != null) assert.equal(allItems.length, EXPECTED_ITEMS, "smoke 6's 24 items");
    for (const a of allItems) assert.equal(whole.split(`data-testid="slip-item-${a.id}"`).length - 1, 1, `${a.name} renders once`);
    assert.equal((whole.match(/data-testid="slip-item-[0-9a-f-]{36}"/g) ?? []).length, allItems.length);
  });

  it("V2 each item sits under its own day, headed '<Wkd> · <Mon d>'", () => {
    for (const { day, html } of rendered) {
      const heading = byTestId(html, `slip-day-heading-${day.dayNum}`);
      if (day.dateIso) assert.match(heading ?? "", /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) · [A-Z][a-z]{2} \d{1,2}$/);
      for (const a of day.activities ?? []) assert.ok(html.includes(`data-testid="slip-item-${a.id}"`), `${a.name} is on day ${day.dayNum}`);
    }
  });

  it("V3 time and title are the payload's", () => {
    for (const a of allItems) {
      assert.equal(byTestId(whole, `slip-item-name-${a.id}`), decode(a.name).replace(/\s+/g, " ").trim());
      if (a.time) assert.equal(byTestId(whole, `slip-item-time-${a.id}`), a.time);
      else assert.equal(byTestId(whole, `slip-item-time-${a.id}`), null);
    }
  });

  it("V4 the facts line is the stored hours fact, verbatim", () => {
    let withLine = 0;
    for (const { day } of rendered) {
      for (const a of day.activities ?? []) {
        const want = itemFactsLine(facts[a.id], day.dateIso ?? null);
        const got = byTestId(whole, `slip-item-facts-${a.id}`);
        if (!want) {
          assert.equal(got, null, `${a.name}: no hours fact ⇒ no facts line`);
          continue;
        }
        withLine++;
        assert.equal(got, want.text);
        assert.match(got!, /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) · .+ · Google Maps · checked \d{1,2} [A-Z][a-z]{2}( \(may have changed\))?$/);
      }
    }
    assert.ok(withLine > 0, "the fixture has at least one checked hours fact");
  });

  it("V5 an expert-note slot renders exactly where the payload has a note", () => {
    for (const { html, day } of rendered) {
      for (const a of day.activities ?? []) {
        const at = html.indexOf(`data-testid="slip-item-${a.id}"`);
        // The NEXT row starts at the next `slip-item-<uuid>"` — never a child testid of this row.
        const rest = html.slice(at + 10);
        const m = /data-testid="slip-item-[0-9a-f-]{36}"/.exec(rest);
        const rowHtml = html.slice(at, m ? at + 10 + m.index : undefined);
        assert.equal(rowHtml.includes('data-testid="slip-expert-note"'), !!a.expertNote, `${a.name} note slot`);
      }
    }
  });

  it("V6 no pills, no per-item checkout, no promote link (R-l)", () => {
    const t = text(whole);
    for (const banned of ["Add to checkout", "Send to expert", "Planning", "Build my days around this", "Ready for checkout"]) {
      assert.ok(!t.includes(banned), `no "${banned}" on the rows`);
    }
    assert.ok(!whole.includes("slip-routing-actions-"));
  });

  it("V7 arrival on day 1, departure on the last day (R-aa)", () => {
    const name = city.split(",")[0].trim();
    assert.ok(name, "the fixture names its destination");
    assert.ok(rendered[0].html.includes(TRAVEL_ANCHOR_WORDS.arrival(name)));
    assert.ok(rendered[rendered.length - 1].html.includes(TRAVEL_ANCHOR_WORDS.departure(name)));
    assert.equal(whole.split(TRAVEL_ANCHOR_WORDS.addFlight).length - 1, days.length === 1 ? 2 : 2);
  });

  it("V8 the place line is the stored location or a Google ward/area", () => {
    for (const a of allItems) {
      const want = itemPlaceLine(facts[a.id], a);
      const got = byTestId(whole, `slip-item-address-${a.id}`);
      assert.equal(got, want ? decode(want.text).replace(/\s+/g, " ").trim() : null, a.name);
    }
  });
});
