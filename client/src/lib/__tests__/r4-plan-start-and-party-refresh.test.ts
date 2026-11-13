/**
 * QA round 4 — PR 1: where a start lands, and what a save refreshes.
 *
 * R4-5. The /experiences footer's "Start a plan" opened `/experiences?start=1&step=occasion` because
 * the pop-up's URL was built from the page it was pressed on. A start is now `planEntryHref(step)`:
 * the root path plus the plan-entry params, and nothing from `location.search` or `location.pathname`.
 * Leon accepted the consequence that a start on /about lands on "/" too — one start surface.
 *
 * R4-7. `invalidatePlan` named three exact query keys, and the "Who's coming?" label and the Travel
 * party chip subscribe under their own shapes, so a save only appeared after a reload. The plan now
 * also invalidates the `/api/trips` prefix, which covers every shape beneath it.
 *
 * The source pins exist because both fixes are one-liners in components that need a browser to mount;
 * the pure helper is covered by behaviour above, and the pins stop the URL from being rebuilt from the
 * live location (the exact regression) without needing a Playwright run.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { planEntryHref } from "../plan-entry";

const CONTEXT = fs.readFileSync("client/src/contexts/PlanningContext.tsx", "utf8");
const PANELS = fs.readFileSync("client/src/components/plan/SlipAnchorPanels.tsx", "utf8");

test("R4-5: a start is the root URL, with the step and nothing else", () => {
  assert.equal(planEntryHref(), "/?start=1", "a bare start");
  assert.equal(planEntryHref("occasion"), "/?start=1&step=occasion", "the doors' occasion step");
  assert.equal(planEntryHref("around"), "/?start=1&step=around");
  assert.equal(planEntryHref("nonsense"), "/?start=1", "an unknown step is not written");
});

test("R4-5: opening writes planEntryHref; closing still edits the live URL", () => {
  const fn = CONTEXT.match(/function writeEntryUrl[\s\S]{0,900}?\n}/);
  assert.ok(fn, "writeEntryUrl is present");
  const body = fn[0];
  assert.match(body, /openFlag\s*\n?\s*\?\s*planEntryHref\(step\)/, "the open branch is planEntryHref");
  // The regression was `${window.location.pathname}${next}` reached with openFlag true.
  assert.doesNotMatch(
    body,
    /withPlanEntryUrl\(window\.location\.search,\s*true/,
    "a start never reads the live search",
  );
  assert.match(body, /withPlanEntryUrl\(window\.location\.search,\s*false/, "closing keeps the live search");
});

test("R4-7: a save invalidates the trips prefix, not only the three exact keys", () => {
  const fn = PANELS.match(/function invalidatePlan[\s\S]{0,900}?\n}/);
  assert.ok(fn, "invalidatePlan is present");
  assert.match(fn[0], /invalidateQueries\(\{\s*queryKey:\s*\["\/api\/trips"\]\s*\}\)/, "the prefix is invalidated");
  // The three exact keys stay: other surfaces depend on them.
  assert.match(fn[0], /plancard/, "the plancard read is still refreshed");
  assert.match(fn[0], /\[api\.trips\.get\.path, tripId\]/, "the header's trip read is still refreshed");
});
