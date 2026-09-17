/**
 * ask-ai-postfinal.test.ts — L16 lane 4; ledger `2026-09-17-l16-lane4-postfinal`.
 *
 * Brief of record: `docs/design/ASK_AI_DRAWER_BRIEF.md` §5.1 (the two mounts) and §7.2 item 4,
 * read against the LOCKED rulings **D-45..D-50** (`2026-09-16-l16-rulings-d45-d50`) — **D-49** in
 * particular: applying a proposal on a plan that is CURRENTLY final re-finalizes it, so the
 * traveler is buying a NEW Trip Card version and is told so before the charge. CLAUDE.md Locked
 * Decision 45 (3) and 45 (6), Locked Decision 41 (b), Locked Decision 42 **D8** / **D16** /
 * **D18**, §8, §13, §18 rule 1.
 *
 * ── WHAT IS PINNED, AND IN WHAT FORM ─────────────────────────────────────────────────────────
 * F*  — `askAiApplyConsequence`, the ONE derivation the post-final mount adds: which plan states
 *        produce which sentence, which produce NONE, and when a version number may be named.
 * M*  — STATIC facts about the two mounts: the Trip Card rail mounts the SAME component the slip
 *        does, it passes the PLAN's state rather than branching on the page, the slip mount is
 *        untouched, and **neither surface spells a sentence of its own** — the whole point of
 *        lane 4 being a mount rather than a second drawer.
 *
 * ── NEGATIVE SPACE, and it is the load-bearing half (§18d posture) ───────────────────────────
 * These are PREDICATE and SOURCE facts. They prove no browser painted anything; they prove none
 * of the SERVER's gates (lane 1's `ai-ask-create-rail.db.test.ts` and
 * `proposal-apply-authorization.test.ts` own those); and they do NOT prove that
 * `reFinalizeIfCurrentlyFinal` runs — that is lane 1's call, proven by
 * `server/__tests__/trip-card-snapshot-render.db.test.ts` **R4**. What they prove is that the
 * drawer DESCRIBES it correctly and says nothing where it cannot know.
 *
 * Run: npx tsx --test client/src/lib/__tests__/ask-ai-postfinal.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { ASK_AI_COPY, askAiApplyConsequence } from "../ask-ai-drawer";

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

/**
 * The ABSENCE assertions run against CODE ONLY, for the reason the lane-3 suite states: all three
 * files document the rules they obey, and a predicate a doc comment can trip is a predicate that
 * punishes writing the rule down (§18d).
 */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((line) => line.replace(/(^|[^:"'`\\])\/\/.*$/, "$1"))
    .join("\n");
}

const DRAWER_SRC = read("client/src/components/plancard/AskAiDrawer.tsx");
const TRIP_RAIL_SRC = read("client/src/components/plancard/TripCardRail.tsx");
const SLIP_RAIL_SRC = read("client/src/components/plancard/SlipRail.tsx");
const MODULE_SRC = read("client/src/lib/ask-ai-drawer.ts");
const DRAWER = code(DRAWER_SRC);
const TRIP_RAIL = code(TRIP_RAIL_SRC);
const SLIP_RAIL = code(SLIP_RAIL_SRC);
const MODULE = code(MODULE_SRC);

// ── F — D-49's consequence sentence ──────────────────────────────────────────────────────────

test("F1 — a surface that does not state the plan's final standing says NOTHING (§13)", () => {
  // The slip passes nothing. An omitted sentence is honest; a guessed one is not.
  assert.equal(askAiApplyConsequence(null), null);
  assert.equal(askAiApplyConsequence(undefined), null);
  assert.equal(askAiApplyConsequence("final" as any), null);
});

test("F2 — a CURRENTLY-final plan with a known version names BOTH: the next one and this one", () => {
  const line = askAiApplyConsequence({ isFinalized: true, finalVersion: 2 });
  assert.ok(line, "a final plan must say what an apply does to its card");
  // `finalizeTrip` numbers a new final max(version)+1, and an EMPTY change set draws no apply
  // control at all (copy rule 8) — so the fingerprint always moves and v3 is arithmetic, not a
  // forecast.
  assert.match(line!, /\bv3\b/);
  assert.match(line!, /\bv2\b/);
  // D18: it describes what the apply CREATES; it never offers a way back.
  assert.doesNotMatch(line!, /undo|revert|restore|roll ?back/i);
});

test("F3 — a CURRENTLY-final plan with NO known version says 'a new version' and names no number", () => {
  for (const finalVersion of [null, undefined as any, Number.NaN, "3" as any]) {
    const line = askAiApplyConsequence({ isFinalized: true, finalVersion });
    assert.equal(line, ASK_AI_COPY.applyMakesNewVersion, `version ${String(finalVersion)}`);
    assert.doesNotMatch(line!, /\bv\d/, "invented a version number");
  }
});

test("F4 — a REVISING plan is told its card KEEPS its version, never that an apply advances it", () => {
  // `reFinalizeIfCurrentlyFinal` returns null when `finalized_at` is NULL: no version is written.
  // Claiming one here would be a promise the server refuses to keep.
  const line = askAiApplyConsequence({ isFinalized: false, finalVersion: 4 });
  assert.equal(line, ASK_AI_COPY.applyWhileRevising);
  assert.doesNotMatch(line!, /\bnew version\b/i);
});

test("F5 — a plan with NO final at all says nothing about a Trip Card it does not have", () => {
  assert.equal(askAiApplyConsequence({ isFinalized: false, finalVersion: null }), null);
});

test("F6 — the sentence is formed in ONE place, so both renders cannot drift apart", () => {
  // The only version-naming template literal in the module belongs to this function.
  const templates = [...MODULE.matchAll(/`[^`]*\$\{[^`]*\bversion\b[^`]*`/g)];
  assert.equal(templates.length, 1, `version sentence spelled ${templates.length} times`);
});

// ── M — the two mounts ───────────────────────────────────────────────────────────────────────

test("M1 — the Trip Card rail mounts the SAME drawer and passes the PLAN's state, not the page's", () => {
  assert.match(TRIP_RAIL_SRC, /import \{ AskAiDrawer \} from "\.\/AskAiDrawer"/);
  assert.match(TRIP_RAIL, /<AskAiDrawer/);
  assert.match(TRIP_RAIL, /surface="trip-card"/);
  // The final standing comes off the plancard DTO the page already read — `finalizedAt` for
  // "currently final" and `finalVersion` for the number — and nothing is invented for either.
  assert.match(TRIP_RAIL, /isFinalized:\s*!!trip\.finalizedAt/);
  assert.match(TRIP_RAIL, /finalVersion:\s*typeof trip\.finalVersion === "number"/);
});

test("M2 — the slip mount is UNTOUCHED: it states no final standing, so it claims none", () => {
  const slipMount = SLIP_RAIL.match(/<AskAiDrawer[\s\S]*?\/>/);
  assert.ok(slipMount, "the slip's mount disappeared");
  assert.doesNotMatch(slipMount![0], /surface=/);
  assert.doesNotMatch(slipMount![0], /planFinal=/);
  // And it is still the same four props lane 3 landed.
  assert.match(slipMount![0], /aiAction=\{slipBuildAiAction\(activities\.length\)\}/);
});

test("M3 — ONE copy home: neither mount and neither component spells the version sentence", () => {
  for (const [name, src] of [
    ["AskAiDrawer.tsx", DRAWER],
    ["TripCardRail.tsx", TRIP_RAIL],
    ["SlipRail.tsx", SLIP_RAIL],
  ] as const) {
    assert.doesNotMatch(src, /new version of your Trip Card/, `${name} restates D-49's sentence`);
    assert.doesNotMatch(src, /keeps the version/, `${name} restates the revising sentence`);
  }
  // The renderer draws the module's answer, twice, from one call.
  assert.match(DRAWER, /askAiApplyConsequence\(planFinal\)/);
  assert.equal([...DRAWER.matchAll(/askAiApplyConsequence\(/g)].length, 1);
  // Two RENDERS (the drawer body and the applicable row) plus the one prop hand-off between them.
  assert.equal([...DRAWER.matchAll(/^\s*\{applyConsequence\}$/gm)].length, 2);
  assert.equal([...DRAWER.matchAll(/applyConsequence=\{applyConsequence\}/g)].length, 1);
});

test("M4 — post-final branches on the PLAN, never on the surface: `surface` picks a test id only", () => {
  const surfaceTests = [...DRAWER.matchAll(/surface === "trip-card"/g)];
  assert.ok(surfaceTests.length > 0, "the surface is never read at all");
  // Every read of it sits in a `data-testid` expression. A rule keyed on the page would be a
  // second way of asking a question the plancard DTO already answers.
  for (const line of DRAWER.split("\n").filter((l) => l.includes('surface === "trip-card"'))) {
    assert.match(line, /data-testid/, `surface drives behaviour: ${line.trim()}`);
  }
});

test("M5 — LD 41 (b)'s empty-plan branch is KEPT, read from its one home and never short-circuited", () => {
  assert.match(TRIP_RAIL, /aiAction=\{slipBuildAiAction\(itemCount\)\}/);
  // Never a literal answer typed in beside it — that is the third copy of the rule
  // `check-ai-draft-eligibility` exists to prevent.
  assert.doesNotMatch(TRIP_RAIL, /aiAction="(draft|optimize)"/);
});

test("M6 — the post-final mount draws no undo and introduces no second rail or fee read", () => {
  assert.doesNotMatch(TRIP_RAIL, /\bUndo\b(?!2)/);
  assert.doesNotMatch(TRIP_RAIL, /api\/pricing|aiTaskCents/);
  assert.doesNotMatch(TRIP_RAIL, /api\/trips\/[^`]*proposals/);
  // §8 — no fee literal reaches this rail either.
  assert.doesNotMatch(TRIP_RAIL_SRC, /\b(599|1999|4999|900|4500|19900|49900|499900)\b/);
  assert.doesNotMatch(TRIP_RAIL_SRC, /\$\d/);
});

test("M7 — Ask AI sits in the SUGGESTION card's slot: after Your expert, before the panel", () => {
  const rail = TRIP_RAIL.slice(TRIP_RAIL.indexOf('data-testid="trip-card-rail"'));
  const expert = rail.indexOf("<YourExpertCard");
  const askAi = rail.indexOf("<AskAiDrawer");
  const suggestions = rail.indexOf("<ExpertSuggestionsPanel");
  const back = rail.indexOf("<BackToPlanningCard");
  assert.ok(expert >= 0 && askAi >= 0 && suggestions >= 0 && back >= 0, "a rail card went missing");
  assert.ok(expert < askAi && askAi < suggestions && suggestions < back, "rail order changed");
});
