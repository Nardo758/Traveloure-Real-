/**
 * Occasion-map leftovers, items 2 and 11 (rulings Nov 9, 2026; ledger `2026-11-09-occasion-map-2-11`).
 *   O1  item 2 — run of show is the schedule only; the anchors tool stays on the venue (a hosted event has ONE anchor)
 *   O2  item 11 — the anchor sheets name the answer (Wording approved — Leon); every chip label is unchanged
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ANCHOR_SHEET_TITLE, TOOL_LABEL, toolSheetTitle, manifestFor } from "@shared/group-manifest";

const src = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

test("O1 run_of_show mounts the schedule only; SlipAnchorsTool stays on the venue", () => {
  const tray = src("client/src/components/plan/ToolsTray.tsx");
  const ros = tray.slice(tray.indexOf('case "run_of_show":'), tray.indexOf('case "timing_check":'));
  assert.match(ros, /return <ScheduleValidator tripId=\{p\.tripId\} \/>;/);
  assert.doesNotMatch(ros, /SlipAnchorsTool/, "run of show drops its anchor half");
  assert.match(tray, /case "the_venue":\s*case "the_show":\s*return <SlipAnchorsTool /);
  // The hosted-event row still lists the venue first and run of show after it.
  const tools = manifestFor("hosted_events" as any).tools as readonly string[];
  assert.ok(tools.indexOf("the_venue") === 0 && tools.indexOf("run_of_show") > 0, JSON.stringify(tools));
});

test("O2 anchor sheet titles are the approved four; every other sheet keeps its chip label", () => {
  assert.deepEqual(ANCHOR_SHEET_TITLE, {
    where_to_stay: "Where you're staying",
    the_reservation: "The reservation",
    the_venue: "The venue",
    the_show: "The show",
  });
  assert.equal(toolSheetTitle("where_to_stay"), "Where you're staying");
  assert.equal(TOOL_LABEL.where_to_stay, "Where to stay", "the chip still asks the question");
  assert.equal(toolSheetTitle("shared_lodging"), TOOL_LABEL.shared_lodging, "not in the approved set");
  for (const k of Object.keys(TOOL_LABEL) as Array<keyof typeof TOOL_LABEL>) {
    if (!(k in ANCHOR_SHEET_TITLE)) assert.equal(toolSheetTitle(k), TOOL_LABEL[k], k);
  }
  const tray = src("client/src/components/plan/ToolsTray.tsx");
  assert.match(tray, /<SheetTitle>\{toolSheetTitle\(open\)\}<\/SheetTitle>/);
});
