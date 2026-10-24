/**
 * Row 45 (H-21): the Discover "Need Help Deciding?" body.
 *   NH1  experts available: the expert sentence; none available: the plan-it sentence, with no expert mention
 *   NH2  "perfect" is gone from the shipped page and from both sentences
 *   NH3  the page renders the body from the same `anyExpertAvailable` that gates "Talk to an Expert"
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { NEED_HELP_BODY_EXPERTS, NEED_HELP_BODY_NO_EXPERTS, needHelpBody } from "../discover-need-help";

const page = fs.readFileSync("client/src/pages/discover.tsx", "utf8");

test("NH1 — the body follows expert availability", () => {
  assert.equal(needHelpBody(true), NEED_HELP_BODY_EXPERTS);
  assert.equal(needHelpBody(false), NEED_HELP_BODY_NO_EXPERTS);
  assert.match(NEED_HELP_BODY_EXPERTS, /local experts/);
  assert.doesNotMatch(NEED_HELP_BODY_NO_EXPERTS, /expert|planner/i);
});

test("NH2 — no \"perfect\"", () => {
  assert.doesNotMatch(NEED_HELP_BODY_EXPERTS + NEED_HELP_BODY_NO_EXPERTS, /perfect/i);
  assert.doesNotMatch(page, /find the perfect/i);
});

test("NH3 — one availability answer for the body and the button", () => {
  assert.match(page, /\{needHelpBody\(anyExpertAvailable\)\}/);
  assert.match(page, /\{anyExpertAvailable && \(\s*<Link href="\/experts">/);
});
