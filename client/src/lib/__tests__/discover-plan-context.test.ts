/**
 * DISCOVER'S PLAN CONTEXT — the "For your plan" derivation, and the four silences it must keep.
 *
 * Lane L11, ledger `2026-09-07-discover-in-shell`; CLAUDE.md Locked Decision 45 (7),
 * Locked Decision 42 D6, Locked Decision 31, §13, §18 rule 1.
 *
 * WHY THIS EXISTS. Locked Decision 31 spends most of its words on ONE invariant: `roles_needed`
 * NULL means NOT SET, and is never "this occasion needs nobody" — a claim only a planner can make.
 * A plan-wide role strip is the first place that invariant can break in a way happy-path data
 * hides: a plan whose occasions all carry roles renders perfectly while the code that would draw a
 * bare heading over an empty list sits there untested.
 *
 * What these hold:
 *   R1  a plan whose events carry roles ⇒ one chip per key, in the SERVER's order, each linking
 *       to the EXISTING provider browse pre-filtered by that key and carrying the plan's id.
 *   R2  EVERY empty shape — no events, NULL, undefined, `[]`, all-blank — produces the SAME empty
 *       list. Two ways to say nothing must not become two different renders (Locked Decision 31
 *       declined to make `[]` a second empty state).
 *   R3  a key repeated across two events draws ONE chip. Both chips would have been the same fact
 *       and would have pointed at the same browse.
 *   R4  the derivation DELEGATES: `planRoleChips` produces exactly what `slipEventRoleChips` does
 *       for the flattened keys, so the slip and the browse can never disagree about a role or its
 *       link (§18 rule 1). This is asserted by comparing the two, not by re-deriving the href.
 *   R5  the surface renders NOTHING without a `tripId` and NOTHING for a plan it could not read —
 *       asserted against the component source, since a chip naming an unread plan is a claim
 *       about someone else's plan.
 *
 * Pure unit: no DOM, no DB, no fetch, no React.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planRoleChips, slipEventRoleChips } from "../slip-event-roles";

const TRIP = "trip-abc";

test("R1 a plan's events yield one chip per role key, in the server's order, linked to the browse", () => {
  const chips = planRoleChips(
    [{ rolesNeeded: ["florist", "photographer"] }, { rolesNeeded: ["caterer"] }],
    TRIP,
  );
  assert.deepEqual(
    chips.map((c) => c.key),
    ["florist", "photographer", "caterer"],
    "order is the server's event order, then the seeder's within each event",
  );
  for (const chip of chips) {
    assert.match(chip.href, /^\/services\?/, "the EXISTING provider browse, not a new one");
    assert.ok(chip.href.includes(encodeURIComponent(TRIP)), "the plan id rides so Add to plan lands on it");
    assert.ok(chip.href.includes(chip.key), "pre-filtered by that category key");
  }
});

test("R2 every empty shape is the SAME empty answer — never a heading with nothing under it", () => {
  // §13 / Locked Decision 31: NULL is NOT SET, `[]` is not a second empty state, and neither is
  // ever rendered as "this occasion needs nobody".
  assert.deepEqual(planRoleChips(null, TRIP), []);
  assert.deepEqual(planRoleChips(undefined, TRIP), []);
  assert.deepEqual(planRoleChips([], TRIP), [], "a plan with no events");
  assert.deepEqual(planRoleChips([{ rolesNeeded: null }], TRIP), [], "an occasion with NOT SET roles");
  assert.deepEqual(planRoleChips([{}], TRIP), [], "an event row that carries no roles field at all");
  assert.deepEqual(planRoleChips([{ rolesNeeded: [] }], TRIP), [], "an explicitly empty list");
  assert.deepEqual(planRoleChips([{ rolesNeeded: ["", "   "] }], TRIP), [], "blanks are not roles");
});

test("R3 the same key on two events draws ONE chip", () => {
  const chips = planRoleChips(
    [{ rolesNeeded: ["photographer"] }, { rolesNeeded: ["photographer", "florist"] }],
    TRIP,
  );
  assert.deepEqual(chips.map((c) => c.key), ["photographer", "florist"]);
});

test("R4 the plan derivation DELEGATES to the slip's — the two can never disagree (§18 rule 1)", () => {
  const events = [{ rolesNeeded: ["florist", ""] }, { rolesNeeded: ["florist", "caterer"] }];
  const flattened = events.flatMap((e) => e.rolesNeeded ?? []);
  assert.deepEqual(
    planRoleChips(events, TRIP),
    slipEventRoleChips(flattened, TRIP),
    "same keys, same order, same hrefs — one derivation with two callers",
  );
});

test("R5 the browse strip is silent without a plan id and silent for a plan it could not read", () => {
  const src = readFileSync(new URL("../../pages/discover.tsx", import.meta.url), "utf8");
  assert.match(
    src,
    /\{expertHandoffTripId && <PlanBrowseContext/,
    "no `?tripId=` ⇒ the strip does not mount at all",
  );
  assert.match(
    src,
    /if \(!trip\) return null;/,
    "a plan still loading, or one the viewer may not read, renders NOTHING (§13)",
  );
  assert.match(
    src,
    /chips\.length > 0 && \(/,
    "the role row is gated on there being chips — never a bare heading (Locked Decision 31)",
  );
  assert.match(
    src,
    /planRoleChips\(/,
    "the surface CALLS the one derivation and reconstructs no role list of its own",
  );
});
