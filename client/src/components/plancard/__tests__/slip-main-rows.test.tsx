/**
 * Slip conformance — the Main board's rows (boards rev 15; ledger `2026-10-08-slip-main-rows`).
 *
 *   MR1  under the board look every stored item renders once, with its own time in the time column,
 *        its title, and its facts line's words verbatim (split for colour, never re-made)
 *   MR2  the dot says what the row is: fixed (anchor), travel, hours checked, no hours checked
 *   MR3  WITHOUT the provider (the Trip Card, the Workstation) the rows are the plain look, unchanged
 *   MR4  the board day: one card, Fraunces heading, the thumbnail only while closed, the photo band
 *        only while open; same testids
 *   MR5  the facts-line split and the expert note's board treatment keep the words
 *   MR6  the evening card's heading and its time span; "on foot" is never claimed
 *
 * Fixture: `server/__tests__/fixtures/smoke6-plancard.json` (the same stored payload as
 * surface-step1-parity).
 * Run: npx tsx --test client/src/components/plancard/__tests__/slip-main-rows.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToString } from "react-dom/server";
import { DayBlock } from "../../plan/DayBlock";
import { ItemRow } from "../../plan/ItemRow";
import { ExpertNote } from "../../plan/ExpertNote";
import { boardDotFor } from "../../plan/BoardRowFrame";
import { PlanRowLookProvider } from "../../plan/row-look";
import { factsLineParts, itemFactsLine } from "@/lib/place-facts";
import { momentEveningHeading, momentTimeSpan } from "@/lib/slip-moment";

(globalThis as any).React = React;

const FIXTURE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../server/__tests__/fixtures/smoke6-plancard.json");
const payload = JSON.parse(readFileSync(FIXTURE, "utf8"));
const days: any[] = [...(payload.days ?? [])].sort((a, b) => a.dayNum - b.dayNum);
const facts: Record<string, any[]> = payload.placeFacts ?? {};
const tz: string | null = payload.trip?.timezone ?? null;

const decode = (s: string) =>
  s.replace(/<!-- -->/g, "").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const text = (html: string) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const board = (el: React.ReactElement) => renderToString(React.createElement(PlanRowLookProvider, { look: "board", children: el }));
const row = (a: any, dateIso: string | null) =>
  React.createElement(ItemRow, { item: a, facts: facts[a.id], dateIso, timeZone: tz, mode: "edit", role: "traveler" });

describe("Main board rows", () => {
  it("MR1 every stored item, once, with its time, title and facts words", () => {
    let n = 0;
    for (const d of days) {
      for (const a of d.activities ?? []) {
        n++;
        const html = board(row(a, d.dateIso ?? null));
        assert.equal((html.match(new RegExp(`data-testid="slip-item-${a.id}"`, "g")) ?? []).length, 1);
        assert.match(html, /grid-cols-\[52px_18px_minmax\(0,1fr\)_44px\]/);
        if (a.time) assert.ok(text(html).startsWith(a.time), `${a.id}: the time column leads the row`);
        assert.ok(text(html).includes(decode(a.name)), `${a.id}: the title`);
        const line = itemFactsLine(facts[a.id], d.dateIso ?? null, tz);
        // Google's hours carry narrow no-break spaces; compare with the same whitespace collapse.
        if (line) assert.ok(text(html).includes(line.text.replace(/\s+/g, " ")), `${a.id}: the facts line verbatim`);
        else assert.doesNotMatch(html, new RegExp(`data-testid="slip-item-facts-${a.id}"`));
      }
    }
    assert.ok(n > 0);
  });

  it("MR2 the dot", () => {
    assert.equal(boardDotFor({ isAnchor: true, anchorFromTool: "Where to stay", hasFacts: false }), "anchor");
    assert.equal(boardDotFor({ isAnchor: true, anchorFromTool: null, hasFacts: true }), "travel");
    assert.equal(boardDotFor({ isAnchor: false, hasFacts: true }), "checked");
    assert.equal(boardDotFor({ isAnchor: false, hasFacts: false }), "open");
  });

  it("MR3 no provider ⇒ the plain look, unchanged", () => {
    const d = days[0];
    const a = d.activities[0];
    const html = renderToString(row(a, d.dateIso ?? null));
    assert.doesNotMatch(html, /data-board-dot/);
    assert.doesNotMatch(html, /--slip-/);
    const day = renderToString(React.createElement(DayBlock, { dayKey: "1", heading: "Wed · Nov 11", stats: null, defaultOpen: true, children: "x" }));
    assert.doesNotMatch(day, /slip-display|--slip-/);
    const note = renderToString(React.createElement(ExpertNote, { note: "n", author: "Aiko" }));
    assert.doesNotMatch(note, /--slip-/);
  });

  it("MR4 the board day card", () => {
    const thumb = React.createElement("i", { "data-testid": "thumb" });
    const photo = React.createElement("i", { "data-testid": "band" });
    const closed = board(React.createElement(DayBlock, { dayKey: "2", heading: "Thu · Nov 12", stats: "5 stops", thumb, photo, open: false, children: "body" }));
    assert.match(closed, /data-testid="slip-day-2"/);
    assert.match(closed, /slip-display/);
    assert.match(closed, /data-testid="thumb"/);
    assert.doesNotMatch(closed, /data-testid="band"/);
    assert.doesNotMatch(closed, /slip-day-body-2/);
    const open = board(React.createElement(DayBlock, { dayKey: "2", heading: "Thu · Nov 12", stats: "5 stops", thumb, photo, open: true, children: "body" }));
    assert.match(open, /data-testid="band"/);
    assert.doesNotMatch(open, /data-testid="thumb"/);
    assert.match(open, /data-testid="slip-day-body-2"/);
    assert.match(open, /aria-expanded="true" data-testid="slip-day-toggle-2"/);
  });

  it("MR5 the facts split and the note keep the words", () => {
    assert.deepEqual(factsLineParts("Wed · 9:00 AM – 4:00 PM · Google Maps · checked 3 Oct"), {
      lead: "Wed · 9:00 AM – 4:00 PM",
      source: "Google Maps · checked 3 Oct",
    });
    assert.deepEqual(factsLineParts("Wed · Open 24 hours"), { lead: "Wed · Open 24 hours", source: null });
    const html = board(React.createElement(ExpertNote, { note: "Go before 8am.", author: "Aiko", neighbourhood: "Fushimi" }));
    assert.equal(text(html), "Note from Aiko · Fushimi Go before 8am.");
    assert.match(html, /data-testid="slip-expert-note"/);
  });

  it("MR6 the evening card", () => {
    assert.equal(momentEveningHeading("2026-11-13"), "Fri evening · Nov 13");
    assert.equal(momentEveningHeading(null), null);
    assert.equal(momentTimeSpan([{ time: "17:00" }, { time: "19:30" }, { time: "22:00", endTime: "23:00" }]), "17:00 → 23:00");
    assert.equal(momentTimeSpan([{ time: "19:30" }]), null);
    assert.equal(momentTimeSpan([]), null);
  });
});
