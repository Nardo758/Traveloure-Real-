/**
 * "Restore my draft" on the Versions board (audit D3 screen slice; fix-queue row 249; ledger
 * `2026-10-26-d3-restore-my-draft-screen`).
 *
 *   CR1  readRestorable: anything that is not { days: [...] } gives no rows
 *   CR2  readRestorable drops bad rows, keeps the first per day, sorts by day
 *   CR3  restoreRowsToShow: restorable has a button, changed has none, expired is left out, finalized wins
 *   CR4  savedUntil = appliedAt + DAY_RESTORE_RETENTION_MS; null when the date does not parse
 *   CR5  restoreFailureKey: the four named answers
 *   CR6  restoreFailureKey: everything else is failed
 *   CR7  restoreSuccessKey: done only when the server said so
 *   CR8  the URL, the key and the body
 *   CR9  view: a restorable row
 *   CR10 view: the preview (fixed text, FIXED_CONFIRM and FIXED_CANCEL)
 *   CR11 view: a changed day has no button
 *   CR12 view: finalized is one line; nothing at all renders nothing
 *   CR13 source scan: test ids, no hex, one POST, no other write
 *   CR14 copy: frozen, eleven strings, nothing unfilled
 *   CR15 result lines: R6 is a status line; a line is never printed twice; a failure keeps the button
 *   CR16 the one mount on the board, the fences, and the files this PR may not touch
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/versions-restore.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { VersionsRestoreView, type VersionsRestoreViewProps } from "../VersionsRestoreStrip";
import {
  VERSIONS_RESTORE_UI_COPY as C,
  fillRestoreCopy,
  readRestorable,
  restorableKey,
  restoreFailureKey,
  restoreNoteLine,
  restoreRequestBody,
  restoreRowsToShow,
  restoreSuccessKey,
  restoreUrl,
  savedUntil,
} from "@/lib/versions-restore";
import { FIXED_CANCEL, FIXED_CONFIRM } from "@/lib/fixed-plan";
import { DAY_RESTORE_RETENTION_MS } from "@shared/version-board";

(globalThis as any).React = React;
const read = (rel: string) => readFileSync(rel, "utf8");
const text = (html: string) =>
  html.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const count = (hay: string, needle: string) => hay.split(needle).length - 1;

const APPLIED = "2026-10-20T10:00:00.000Z";
const row = (day: number, state = "restorable", over: Record<string, unknown> = {}) => ({ day, snapshotId: `s${day}`, appliedAt: APPLIED, state, ...over });
const view = (p: Partial<VersionsRestoreViewProps>) =>
  renderToString(React.createElement(VersionsRestoreView, { finalized: false, rows: [], previewDay: null, pending: false, notes: {}, ...p }));
const rv = (day: number, kind: "restorable" | "changed" = "restorable") => ({ day, snapshotId: `s${day}`, appliedAt: APPLIED, kind });
const err = (status: number, body: unknown) => new Error(`${status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);

const STRIP = "client/src/components/plancard/VersionsRestoreStrip.tsx";
const LIB = "client/src/lib/versions-restore.ts";
const BOARD = "client/src/components/plancard/VersionsBoard.tsx";

describe("Restore my draft on the Versions board", () => {
  it("CR1 readRestorable: anything that is not { days: [...] } gives no rows", () => {
    for (const bad of [null, "x", {}, { days: "x" }]) assert.equal(readRestorable(bad), null, JSON.stringify(bad));
    assert.deepEqual(readRestorable({ days: [] }), []);
    assert.deepEqual(readRestorable({ days: [row(2)] }), [row(2)]);
  });

  it("CR2 readRestorable drops bad rows, keeps the first per day, sorts by day", () => {
    const got = readRestorable({
      days: [
        row(0), row(61), row(1.5), row(4, "restorable", { snapshotId: undefined }), row(5, "gone"),
        row(6, "restorable", { appliedAt: 1 }), row(3), row(3, "changed_since", { snapshotId: "later" }), row(2, "changed_since"),
      ],
    });
    assert.deepEqual(got, [row(2, "changed_since"), row(3)]);
  });

  it("CR3 restoreRowsToShow: restorable has a button, changed has none, expired is left out, finalized wins", () => {
    const shown = restoreRowsToShow([row(1), row(2, "changed_since"), row(3, "expired")] as any);
    assert.equal(shown.finalized, false);
    assert.deepEqual(shown.rows.map((r) => [r.day, r.kind]), [[1, "restorable"], [2, "changed"]]);
    assert.deepEqual(restoreRowsToShow([row(1), row(2, "finalized")] as any), { finalized: true, rows: [] });
    assert.deepEqual(restoreRowsToShow(null), { finalized: false, rows: [] });
  });

  it("CR4 savedUntil = appliedAt + DAY_RESTORE_RETENTION_MS; null when the date does not parse", () => {
    const expected = new Date(Date.parse(APPLIED) + DAY_RESTORE_RETENTION_MS).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    assert.equal(savedUntil(APPLIED), expected);
    assert.equal(savedUntil("not a date"), null);
  });

  it("CR5 restoreFailureKey: the four named answers", () => {
    assert.equal(restoreFailureKey(err(409, { code: "day_changed_since_apply" })), "changed");
    assert.equal(restoreFailureKey(err(409, { code: "restore_expired" })), "expired");
    assert.equal(restoreFailureKey(err(409, { code: "plan_finalized" })), "finalized");
    assert.equal(restoreFailureKey(err(404, { code: "not_found" })), "notFound");
  });

  it("CR6 restoreFailureKey: everything else is failed", () => {
    for (const e of [
      err(404, { message: "No such plan" }), new Error("404: No such plan"), err(400, { message: "No such day" }), err(401, { message: "x" }),
      err(500, { message: "Couldn't restore that day" }), err(409, { code: "something_else" }), new Error("Failed to fetch"),
      "409: {\"code\":\"plan_finalized\"}", undefined, err(409, "not json"),
    ]) {
      assert.equal(restoreFailureKey(e), "failed", String(e));
    }
  });

  it("CR7 restoreSuccessKey: done only when the server said so", () => {
    assert.equal(restoreSuccessKey({ restored: true }), "done");
    assert.equal(restoreSuccessKey({ restored: false, alreadyRestored: true }), "done");
    for (const a of [{}, null, { restored: false }]) assert.equal(restoreSuccessKey(a), "failed");
  });

  it("CR8 the URL, the key and the body", () => {
    assert.deepEqual(restorableKey("t1"), ["/api/trips/t1/versions", "restorable"]);
    assert.equal(restorableKey("t1")[0], "/api/trips/t1/versions");
    assert.match(read(BOARD), /const versionsKey = \[`\/api\/trips\/\$\{tripId\}\/versions`\];/);
    assert.equal(restoreUrl("t1", 3), "/api/trips/t1/versions/days/3/restore");
    assert.deepEqual(restoreRequestBody("s1"), { snapshotId: "s1" });
    assert.equal(restoreRequestBody(""), null);
  });

  it("CR9 view: a restorable row", () => {
    const html = view({ rows: [rv(3)] });
    const t = text(html);
    assert.match(html, /data-testid="versions-restore-strip"/);
    assert.ok(t.includes(C.heading));
    assert.ok(t.includes(fillRestoreCopy(C.dayLine, { day: 3 })));
    assert.ok(t.includes(fillRestoreCopy(C.savedUntil, { date: savedUntil(APPLIED)! })));
    assert.match(html, new RegExp(`data-testid="versions-restore-go-3">${C.button}<`));
    assert.ok(!t.includes(FIXED_CONFIRM) && !t.includes(FIXED_CANCEL));
  });

  it("CR10 view: the preview (fixed text, FIXED_CONFIRM and FIXED_CANCEL)", () => {
    const html = view({ rows: [rv(3)], previewDay: 3 });
    assert.ok(text(html).includes(fillRestoreCopy(C.preview, { day: 3 })));
    assert.match(html, new RegExp(`data-testid="versions-restore-confirm-3">${FIXED_CONFIRM}<`));
    assert.match(html, new RegExp(`data-testid="versions-restore-cancel-3">${FIXED_CANCEL}<`));
    assert.equal(count(html, "<button"), 2);
    assert.doesNotMatch(html, /versions-restore-go-3/);
  });

  it("CR11 view: a changed day has no button", () => {
    const html = view({ rows: [rv(2, "changed")], previewDay: 2 });
    const t = text(html);
    assert.ok(t.includes(fillRestoreCopy(C.dayLine, { day: 2 })));
    assert.ok(t.includes(fillRestoreCopy(C.changed, { day: 2 })));
    assert.doesNotMatch(html, /<button/);
  });

  it("CR12 view: finalized is one line; nothing at all renders nothing", () => {
    const html = view({ finalized: true, rows: [rv(1)] });
    assert.equal(count(text(html), C.finalized), 1);
    assert.doesNotMatch(html, /versions-restore-row-|<button/);
    assert.equal(view({}), "");
  });

  it("CR13 source scan: test ids, no hex, one POST, no other write", () => {
    const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    const strip = code(read(STRIP));
    const lib = code(read(LIB));
    for (const id of strip.match(/data-testid=\{?[`"][^`"]+[`"]/g) ?? []) assert.match(id, /^data-testid=\{?[`"]versions-restore-/, id);
    for (const src of [strip, lib]) {
      assert.doesNotMatch(src, /data-testid=\{?[`"](?:slip-|button-slip-)/);
      assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b/);
      assert.doesNotMatch(src, /fetch\(/);
      assert.doesNotMatch(src, /"PATCH"|"PUT"|"DELETE"|\bforce\b/i);
    }
    assert.equal(count(strip, "apiRequest("), 1);
    assert.equal(count(strip, 'apiRequest("POST"'), 1);
  });

  it("CR14 copy: frozen, eleven strings, nothing unfilled", () => {
    assert.ok(Object.isFrozen(C));
    assert.equal(Object.keys(C).length, 11);
    for (const v of Object.values(C)) assert.doesNotMatch(v, /\bAI\b|estimat|~/, v);
    assert.equal(fillRestoreCopy("Day {day} until {date}", { day: 4, date: "Nov 3" }), "Day 4 until Nov 3");
    const all = [
      view({ rows: [rv(3), rv(4, "changed")], previewDay: 3, notes: { 5: "done", 6: "failed", 7: "notFound", 8: "expired" } }),
      view({ rows: [rv(3, "restorable")].map((r) => ({ ...r, appliedAt: "bad" })) }),
      view({ finalized: true }),
    ].join("");
    assert.doesNotMatch(all, /\{day\}|\{date\}|Invalid Date|undefined/);
  });

  it("CR15 result lines: R6 is a status line; a line is never printed twice; a failure keeps the button", () => {
    const done = view({ rows: [], notes: { 3: "done" } });
    assert.match(done, new RegExp(`role="status"[^>]*data-testid="versions-restore-result-3">${restoreNoteLine("done", 3)}<`));
    const changed = text(view({ rows: [rv(2, "changed")], notes: { 2: "changed" } }));
    assert.equal(count(changed, fillRestoreCopy(C.changed, { day: 2 })), 1);
    const fin = text(view({ finalized: true, notes: { 1: "finalized" } }));
    assert.equal(count(fin, C.finalized), 1);
    const finFromNote = view({ rows: [rv(1)], notes: { 1: "finalized" } });
    assert.equal(count(text(finFromNote), C.finalized), 1);
    assert.doesNotMatch(finFromNote, /<button/);
    const failed = view({ rows: [rv(3)], notes: { 3: "failed" } });
    assert.ok(text(failed).includes(restoreNoteLine("failed", 3)));
    assert.match(failed, /versions-restore-go-3/);
    assert.doesNotMatch(view({ rows: [rv(3)], notes: { 3: "done" } }), /<button/);
  });

  it("CR16 the one mount on the board, the fences, and the files this PR may not touch", () => {
    const board = read(BOARD);
    assert.equal(count(board, 'import { VersionsRestoreStrip } from "./VersionsRestoreStrip";'), 1);
    assert.equal(count(board, "<VersionsRestoreStrip tripId={tripId} />"), 1);
    const lines = board.split("\n");
    const at = lines.findIndex((l) => l.trim() === "{headerOffer}");
    const next = lines.slice(at + 1).find((l) => l.trim() !== "");
    assert.equal(next?.trim(), "<VersionsRestoreStrip tripId={tripId} />");
    assert.ok(!board.includes("Restore my draft") && !board.includes("versions-restore-day"));
    assert.doesNotMatch(board, /\/restorable|\/restore\b/);
  });
});
