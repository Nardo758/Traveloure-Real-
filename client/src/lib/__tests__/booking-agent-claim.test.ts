/**
 * THE POOLED QUEUE SAYS UNCLAIMED WHEN IT IS UNCLAIMED — the render half of ledger
 * `2026-09-08-assignment-is-claimed`, executed by `2026-09-15-booking-agent-claim`.
 *
 * §13, in the ruling's own words: "an unclaimed request says it is unclaimed and is never rendered
 * as someone's". The inverse matters just as much — a row a legacy auto-assignment already stamped
 * (there is NO BACKFILL) must not be re-rendered as "unassigned", which would invent a fact about
 * a row that really does have a holder.
 *
 * WHY A THIRD STATE EXISTS. `GET /api/affiliate-booking-requests/expert` serves
 * `expert_id = me OR expert_id IS NULL`, so a row in that list is either unclaimed or the viewer's
 * own — no other agent's identity is ever on the wire. But the inbox renders before `useAuth`
 * resolves, and a reader that does not yet know who the viewer is may answer neither "yours" (a
 * claim about a person it cannot make) nor "unclaimed" (which would offer a Claim control the
 * server answers 409).
 *
 * NEGATIVE SPACE. These are pure proofs about a RENDER decision. They grant nothing and prove
 * nothing about authorization: the claim rail's own gate and its atomic `expert_id IS NULL`
 * conditional are what keep a write out (§14 posture — a rule about which buttons draw never is).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { readBookingRequestClaim } from "../booking-agent-claim";

const VIEWER = "agent-viewer-1";
const OTHER = "agent-other-2";

test("an unclaimed row reads unclaimed, offers the Claim control, and names nobody", () => {
  for (const row of [{ expertId: null }, { expertId: undefined }, {}, { expertId: "   " }]) {
    const reading = readBookingRequestClaim(row, VIEWER);
    assert.equal(reading.state, "unclaimed");
    assert.equal(reading.canClaim, true);
    assert.equal(reading.label, "Unclaimed");
    assert.equal(reading.label.includes(VIEWER), false);
  }
});

test("the viewer's own claim reads 'Claimed by you' and withdraws the control", () => {
  const reading = readBookingRequestClaim({ expertId: VIEWER }, VIEWER);
  assert.equal(reading.state, "claimed_by_you");
  assert.equal(reading.canClaim, false);
  assert.equal(reading.label, "Claimed by you");
});

test("a held row whose viewer is unknown reads 'Claimed' — never 'by you', never unclaimed", () => {
  for (const viewer of [undefined, null, "", "   "]) {
    const reading = readBookingRequestClaim({ expertId: OTHER }, viewer);
    assert.equal(reading.state, "claimed");
    assert.equal(reading.canClaim, false, "a held row must never offer a control the server refuses");
    assert.equal(reading.label, "Claimed");
  }
});

test("no reading ever publishes a holder's user id", () => {
  const readings = [
    readBookingRequestClaim({ expertId: OTHER }, VIEWER),
    readBookingRequestClaim({ expertId: OTHER }, undefined),
    readBookingRequestClaim({ expertId: VIEWER }, VIEWER),
    readBookingRequestClaim({ expertId: null }, VIEWER),
  ];
  for (const r of readings) {
    assert.equal(r.label.includes(OTHER), false);
    assert.equal(r.label.includes(VIEWER), false);
  }
});

test("a legacy auto-assigned row is never re-rendered as unassigned (no backfill)", () => {
  // Exactly the shape the retired `getExpertUserIds(10)[0]` left behind: a holder the traveler
  // never picked, and a row that nonetheless HAS one.
  const reading = readBookingRequestClaim({ expertId: "legacy-auto-assigned-expert" }, VIEWER);
  assert.equal(reading.state, "claimed");
  assert.equal(reading.canClaim, false);
});

test("whitespace around a holder id is trimmed on BOTH sides before the identity compare", () => {
  const reading = readBookingRequestClaim({ expertId: `  ${VIEWER}  ` }, ` ${VIEWER} `);
  assert.equal(reading.state, "claimed_by_you");
});
