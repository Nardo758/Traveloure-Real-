/**
 * AP-1 (ledger `2026-10-13-ap1-save-then-warn`) — the confirmation the three slip add surfaces draw.
 *
 *   AN1 the lines: the findings' own hours lines, "Hours not checked for this stop", Getting around's gap line,
 *       no line and no footer for a straight-line or estimated reach (audit B8), "no route found" only as the server said it
 *   AN2 polling: asks again every interval while pending, at most 5 times, then settles ONCE with the honest form
 *   AN3 polling stops as soon as nothing is pending; a failed read keeps the last answer
 *   AN4 the notice renders the POST's first answer (server render)
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/ap1-add-checks.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { AddChecksNotice } from "../AddChecksNotice";
import { addChecksLines, pollAddChecks, settleAddChecks, HOURS_CHECKING_LINE } from "@/lib/add-checks";
import { ADD_CHECKS_POLL_MAX, HOURS_NOT_CHECKED_LINE, type StopChecks } from "@shared/add-checks";

(globalThis as any).React = React;

const base: StopChecks = { itemId: "i", hours: { status: "not_checked" }, reach: null, routedPlan: true, pending: false };
const pendingChecks: StopChecks = { ...base, hours: { status: "pending" }, reach: { kind: "pending", from: "Kinkaku-ji" }, pending: true };

describe("AP-1 confirmation", () => {
  it("AN1 the lines", () => {
    const hit = addChecksLines({ ...base, hours: { status: "checked", lines: ["Ginkaku-ji Temple · Day 2 · 17:10 starts after closing (5:00 PM)"] }, reach: { kind: "unlocated", stop: "Soba" } });
    assert.deepEqual(hit, { lines: ["Ginkaku-ji Temple · Day 2 · 17:10 starts after closing (5:00 PM)", "not worked out yet — Soba isn't on the map"], footer: null });
    assert.deepEqual(addChecksLines(base).lines, [HOURS_NOT_CHECKED_LINE]);
    const free = addChecksLines({ ...base, routedPlan: false, reach: { kind: "straight", from: "Kinkaku-ji", minutes: 40, mode: "transit" } });
    assert.deepEqual(free, { lines: [HOURS_NOT_CHECKED_LINE], footer: null });
    const est = addChecksLines({ ...base, reach: { kind: "est", from: "Kinkaku-ji", minutes: 18, mode: "drive" } });
    assert.deepEqual(est, { lines: [HOURS_NOT_CHECKED_LINE], footer: null });
    assert.deepEqual(addChecksLines({ ...base, reach: { kind: "no_route", from: "Kinkaku-ji" } }).lines[1], "From Kinkaku-ji: no route found");
    assert.deepEqual(addChecksLines({ ...base, reach: { kind: "routed", from: "Kinkaku-ji", line: "22 min · Drive" } }).lines[1], "From Kinkaku-ji: 22 min · Drive");
    assert.deepEqual(addChecksLines(pendingChecks).lines, [HOURS_CHECKING_LINE, "From Kinkaku-ji: working out travel time…"]);
    assert.deepEqual(addChecksLines(settleAddChecks(pendingChecks)).lines, [HOURS_NOT_CHECKED_LINE, "From Kinkaku-ji: not worked out yet"]);
  });

  it("AN2 asks again at most 5 times, then settles once", async () => {
    const queue: Array<() => void> = [];
    const delays: number[] = [];
    let reads = 0;
    const updates: StopChecks[] = [];
    const settled: StopChecks[] = [];
    pollAddChecks({
      initial: pendingChecks,
      read: async () => {
        reads += 1;
        return pendingChecks;
      },
      onUpdate: (c) => updates.push(c),
      onSettled: (c) => settled.push(c),
      intervalMs: 2000,
      schedule: (fn, ms) => {
        delays.push(ms);
        queue.push(fn);
        return queue.length;
      },
    });
    while (queue.length) {
      await (queue.shift()!() as any);
      await new Promise((r) => setImmediate(r));
    }
    assert.equal(reads, ADD_CHECKS_POLL_MAX);
    assert.ok(delays.every((d) => d === 2000));
    assert.equal(settled.length, 1);
    assert.equal(settled[0].pending, false);
    assert.equal(settled[0].hours.status, "not_checked");
  });

  it("AN3 stops as soon as nothing is pending; a failed read keeps the last answer", async () => {
    const queue: Array<() => void> = [];
    const answers: Array<StopChecks | Error> = [new Error("network"), { ...base, hours: { status: "checked", lines: [] } }];
    const settled: StopChecks[] = [];
    let reads = 0;
    pollAddChecks({
      initial: pendingChecks,
      read: async () => {
        const a = answers[reads++];
        if (a instanceof Error) throw a;
        return a;
      },
      onUpdate: () => {},
      onSettled: (c) => settled.push(c),
      intervalMs: 2000,
      schedule: (fn) => queue.push(fn),
    });
    while (queue.length) {
      await (queue.shift()!() as any);
      await new Promise((r) => setImmediate(r));
    }
    assert.equal(reads, 2);
    assert.equal(settled.length, 1);
    assert.deepEqual(settled[0].hours, { status: "checked", lines: [] });

    // Not pending from the start: no read at all, settled once.
    const q2: Array<() => void> = [];
    let r2 = 0;
    const s2: StopChecks[] = [];
    pollAddChecks({ initial: base, read: async () => (r2++, base), onUpdate: () => {}, onSettled: (c) => s2.push(c), intervalMs: 2000, schedule: (fn) => q2.push(fn) });
    while (q2.length) await (q2.shift()!() as any);
    assert.equal(r2, 0);
    assert.equal(s2.length, 1);
  });

  it("AN4 the notice renders the first answer", () => {
    const html = renderToString(
      <AddChecksNotice tripId="t" added={{ itemId: "i", checks: { ...base, hours: { status: "checked", lines: ["Ginkaku-ji Temple · Day 2 · 17:10 starts after closing (5:00 PM)"] } } }} onDismiss={() => {}} />,
    );
    assert.match(html, /Added to your plan/);
    assert.match(html, /Ginkaku-ji Temple · Day 2 · 17:10 starts after closing \(5:00 PM\)/);
    assert.equal(renderToString(<AddChecksNotice tripId="t" added={null} onDismiss={() => {}} />), "");
  });
});
