/**
 * B-11 (ruled 2026-11-09) — the party sheet's roster rows.
 *
 *   P1 mapping — joined = attending ANY event; invited = pending somewhere and attending nothing;
 *      a decline-only or never-invited person is neither, and a nameless row is no row (§13)
 *   P2 the five approved strings, word for word
 *   P3 the invited row ships WITHOUT the RSVP-by clause (the roster carries no such date; the clause
 *      waits on a server follow-up and must not be approximated here)
 *   P4 the guest view — no names, no controls, and no read at all
 *   P5 "Invite someone" presses the plan menu's OWN share handler — one share rail, not two
 *
 * Run: npx tsx --test client/src/lib/__tests__/ui2b-party-sheet.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { partyRosterRows, partyRowLine } from "../party-roster";

const read = (p: string) => fs.readFileSync(p, "utf8");
const ROSTER = read("client/src/components/plancard/SlipPartyRoster.tsx");
const RAIL = read("client/src/components/plancard/SlipRail.tsx");
const TRAY = read("client/src/components/plan/ToolsTray.tsx");
const SLIP = read("client/src/components/plancard/SlipView.tsx");

describe("B-11 — the mapping", () => {
  it("P1 attending ⇒ joined; pending ⇒ invited; nothing else is a row", () => {
    const rows = partyRosterRows([
      { name: "Ana", rsvp: { e1: "attending", e2: "pending" } },
      { name: "Ben", rsvp: { e1: "pending", e2: "pending" } },
      { name: "Cleo", rsvp: { e1: "declined" } },
      { name: "Dev", rsvp: { e1: "not_invited" } },
      { name: "Eve", rsvp: {} },
      { name: "  ", rsvp: { e1: "attending" } },
      { name: null, rsvp: { e1: "pending" } },
    ]);
    assert.deepEqual(rows, [
      { kind: "joined", name: "Ana" },
      { kind: "invited", name: "Ben" },
    ]);
    // Joined sorts before invited, and names inside a kind sort — a stable sheet between reads.
    assert.deepEqual(
      partyRosterRows([
        { name: "Zoe", rsvp: { e1: "pending" } },
        { name: "Yan", rsvp: { e1: "attending" } },
        { name: "Abe", rsvp: { e1: "attending" } },
      ]),
      [
        { kind: "joined", name: "Abe" },
        { kind: "joined", name: "Yan" },
        { kind: "invited", name: "Zoe" },
      ],
    );
    // §13: an absent roster is no rows, not an empty claim.
    assert.deepEqual(partyRosterRows(null), []);
    assert.deepEqual(partyRosterRows(undefined), []);
  });
});

describe("B-11 — the strings", () => {
  it("P2 the five approved strings, word for word", () => {
    assert.equal(partyRowLine({ kind: "joined", name: "Ana" }), "Ana · joined");
    assert.equal(partyRowLine({ kind: "invited", name: "Ben" }), "Ben · invited");
    assert.ok(ROSTER.includes("You · owner"), "the owner's own row, literal — no name needed");
    assert.ok(ROSTER.includes("Invite someone"));
    assert.ok(ROSTER.includes("Copy link"));
  });

  it("P3 the invited row carries NO RSVP-by clause", () => {
    assert.doesNotMatch(partyRowLine({ kind: "invited", name: "Ben" }), /RSVP/i);
    // No template in the component interpolates one, whatever a comment may say.
    assert.doesNotMatch(ROSTER, /RSVP by \$\{/);
    assert.doesNotMatch(ROSTER, /\$\{[^}]*rsvpBy[^}]*\}/);
  });
});

describe("B-11 — the guest view and the one share rail", () => {
  it("P4 a guest gets no names, no controls, and no read", () => {
    assert.match(ROSTER, /if \(!isOwner\) return null;/, "the component refuses a non-owner outright");
    assert.match(ROSTER, /enabled: isOwner && !!tripId/, "and does not even read the roster for them");
    // The caller passes nothing for a non-owner, so the tray renders today's count view.
    assert.match(SLIP, /partyRoster=\{isOwner && data\.trip \? <SlipPartyRoster/);
    // The editable party list stays mounted for every viewer, as it was.
    assert.match(TRAY, /\{p\.partyRoster \?\? null\}/);
    assert.match(TRAY, /<SlipTravelingParty tripId=\{p\.tripId\} \/>/);
  });

  it("P5 'Invite someone' presses the plan menu's OWN share handler", () => {
    // One handler, exported from the rail, used by the menu AND the roster.
    assert.match(RAIL, /export function useSlipShare\(/);
    assert.match(RAIL, /const share = useSlipShare\(trip, tripId\);/);
    assert.match(ROSTER, /import \{ useSlipShare \} from "\.\/SlipRail";/);
    assert.match(ROSTER, /const share = useSlipShare\(trip, tripId\);/);
    // …and exactly ONE mint path exists: one POST to /share in the whole rail file.
    assert.equal((RAIL.match(/POST", `\/api\/trips\/\$\{tripId\}\/share`/g) ?? []).length, 1, "no second path");
    // "Copy link" is the same mutation with the native sheet suppressed — not a second route.
    assert.match(ROSTER, /onClick=\{\(\) => share\.mutate\(\{ copyOnly: true \}\)\}/);
    assert.match(ROSTER, /onClick=\{\(\) => share\.mutate\(\{\}\)\}/);
  });
});
