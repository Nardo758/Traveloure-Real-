/**
 * slip-small-additions — the five small things the slip could not say, and D21's header count.
 *
 * Ledger `2026-09-06-slip-small-additions` (CLAUDE.md Locked Decision 42, build-order row 1.3;
 * S3 · S5 · S6 · S7 and the D18–D22 addendum's D20 + D21). §13, §18 rule 1, Locked Decisions 21,
 * 30, 34, 37.
 *
 * WHY THIS EXISTS. Every rule here is an ABSENCE rule, and an absence leaves no trace to notice:
 *
 *  · S5 renders `trips.expert_traveler_note`. Its private sibling `trips.expert_notes` is the
 *    Workstation's build notes and would render identically if a caller ever reached for it — the
 *    traveler would simply start reading the expert's internal working notes and nothing would
 *    look wrong (Locked Decision 21 forbids merging the three by name).
 *  · S6's fallback fires for EVERY legacy plan, because `trip_destinations` has no backfill. A
 *    reader that trusted the array would render a blank where the plan plainly names a city.
 *  · S7's rule is that a NULL zone renders NOTHING. Locked Decision 30 forbids the alternatives by
 *    name — a wrong zone is worse than an honest silence because it looks authoritative — and a
 *    `?? "UTC"` added by a future tidy-up is invisible on any plan whose zone is set.
 *  · D21 is about two populations that must never merge into one number, and the failure mode is
 *    "0 invited" on a roster that simply has not answered.
 *  · S3 is drawn only when there is somebody to ask. With no advisor the line must be ABSENT, not
 *    greyed: a disabled control implies a condition the traveler could meet.
 *
 * PIN RULE (stated because three static pins broke the night before this lane): every source pin
 * below reads the FILE SET the slip is now split across — `SlipView.tsx` + `SlipRail.tsx` — and
 * asserts over their union, or accepts a component's own prop-spelled testid. There is no literal
 * call-site COUNT and no single-file literal anywhere in here, so a later lane may move a block
 * between the two files without breaking a pin that was never about where the block lives.
 *
 * NEGATIVE SPACE: no DOM, no DB, no fetch, no React. These are pure rules plus facts about shipped
 * source. Whether a mounted component RENDERS is the browser's job and this suite cannot see it.
 *
 * Run: npx tsx --test client/src/lib/__tests__/slip-small-additions.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { slipStopsLine, slipHasMultipleStops, slipZoneLine, SLIP_ZONE_PREFIX } from "../slip-meta";
import { planHeaderCountLabel, partyCountLabel, eventCountLabel } from "../plan-vocabulary";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

/**
 * THE SLIP'S FILE SET. Pins read the UNION of these, never one of them, so a block that moves
 * between the view and its rail does not break an assertion about the block's existence.
 */
const SLIP_FILES = [
  ["client", "src", "components", "plancard", "SlipView.tsx"],
  ["client", "src", "components", "plancard", "SlipRail.tsx"],
];
const slipSrc = SLIP_FILES.map((p) => read(...p)).join("\n");
const noteSrc = read("client", "src", "components", "plancard", "TripExpertNote.tsx");

/**
 * Source with its PROSE removed.
 *
 * Half the assertions below are about COPY the surface must not render — a per-occasion event
 * noun (D20), a restated zone sentence, a hand-built "N traveling · M invited". This codebase
 * documents its rulings in the files that implement them, so those exact phrases appear in the
 * comments EXPLAINING why they are not rendered, and a raw-text pin would fail on the explanation
 * rather than on a defect. Stripping comments is what makes the pin about the code.
 *
 * `//` preceded by `:` is left alone so a URL inside a string is never mistaken for a comment.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const slipCode = stripComments(slipSrc);

// ── S6 · the stops line ───────────────────────────────────────────────────────────────────────

describe("S6 — the stops line, and Locked Decision 34's explicit fallback", () => {
  it("renders the ordered sequence when the plan has stop rows", () => {
    assert.equal(
      slipStopsLine("Kyoto", [{ name: "Kyoto" }, { name: "Osaka" }, { name: "Tokyo" }]),
      "Kyoto → Osaka → Tokyo",
    );
  });

  it("ZERO ROWS falls back to `trips.destination` — the position-0 mirror, explicitly", () => {
    // No backfill exists, so this is EVERY legacy plan. It must never render blank.
    assert.equal(slipStopsLine("Kyoto", []), "Kyoto");
    assert.equal(slipStopsLine("Kyoto", null), "Kyoto");
    assert.equal(slipStopsLine("Kyoto", undefined), "Kyoto");
  });

  it("names nowhere ⇒ NOTHING, never an empty arrow-joined string", () => {
    assert.equal(slipStopsLine(null, []), null);
    assert.equal(slipStopsLine("", []), null);
    assert.equal(slipStopsLine("   ", null), null);
    // A row nobody named is not a stop, so it never contributes a dangling arrow.
    assert.equal(slipStopsLine("Kyoto", [{ name: "Kyoto" }, { name: "  " }]), "Kyoto");
  });

  it("is an ORDER and nothing more — no distance, duration or route is derived (LD 22(c))", () => {
    const line = slipStopsLine("Kyoto", [{ name: "Kyoto" }, { name: "Osaka" }]);
    assert.doesNotMatch(String(line), /km|mi\b|min|hour|drive|route/i);
  });

  it("knows whether the plan states more than one place — one stop is not a route", () => {
    assert.equal(slipHasMultipleStops("Kyoto", []), false);
    assert.equal(slipHasMultipleStops("Kyoto", [{ name: "Kyoto" }]), false);
    assert.equal(slipHasMultipleStops("Kyoto", [{ name: "Kyoto" }, { name: "Osaka" }]), true);
  });
});

// ── S7 · the zone line ────────────────────────────────────────────────────────────────────────

describe("S7 — the zone line, and Locked Decision 30's NULL", () => {
  it("names the zone when the plan carries one", () => {
    assert.equal(slipZoneLine("Asia/Tokyo"), "Times shown in Asia/Tokyo");
    assert.equal(slipZoneLine("Europe/Lisbon"), `${SLIP_ZONE_PREFIX} Europe/Lisbon`);
  });

  it("NULL ⇒ NOTHING. Never UTC, never the server's zone, never a guess", () => {
    for (const absent of [null, undefined, "", "   "]) {
      assert.equal(slipZoneLine(absent as any), null);
    }
    // The three substitutions Locked Decision 30 forbids by name are not reachable from here:
    // there is no default anywhere in the module.
    const src = read("client", "src", "lib", "slip-meta.ts");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(code, /"UTC"|'UTC'/);
    assert.doesNotMatch(code, /Intl\.DateTimeFormat|resolvedOptions/);
  });

  it("does not second-guess which zones are real — shape only, no zone database", () => {
    // The value set is app-enforced on the WRITE side (`resolveTripTimezone`, the launch-market
    // lookup). A second opinion here would be a second authority (§18 rule 1).
    assert.equal(slipZoneLine("Mars/Olympus_Mons"), "Times shown in Mars/Olympus_Mons");
  });
});

// ── D21 · the header count ────────────────────────────────────────────────────────────────────

describe("D21 — the header names BOTH populations, and merges neither", () => {
  it("a guest-list occasion with invitees reads `N traveling · M invited`", () => {
    assert.equal(planHeaderCountLabel(2, 64, "guests", true, true), "2 traveling · 64 invited");
    assert.equal(planHeaderCountLabel(2, 18, "attendees", true, true), "2 traveling · 18 invited");
    // The two numbers are never summed and never share a noun (Locked Decision 37).
    const label = planHeaderCountLabel(2, 64, "guests", true, true);
    assert.doesNotMatch(label, /66/);
    assert.equal(label.match(/guests/g), null);
  });

  it("no guest list ⇒ EXACTLY the label this header already printed", () => {
    for (const [count, vocab, guests] of [
      [4, "travelers", false],
      [4, "guests", false],
      [2, null, null],
      [2, "attendees", null],
    ] as Array<[number, string | null, boolean | null]>) {
      assert.equal(
        planHeaderCountLabel(count, null, vocab, guests, true),
        partyCountLabel(count, vocab, guests),
        `${count}/${vocab}/${guests}`,
      );
    }
  });

  it("§13 — a roster that has not answered is the ORDINARY label, never `0 invited`", () => {
    for (const invited of [null, undefined, 0, NaN, -3]) {
      const label = planHeaderCountLabel(2, invited as any, "guests", true, true);
      assert.equal(label, partyCountLabel(2, "guests", true));
      assert.doesNotMatch(label, /invited/);
    }
  });

  it("§13 — a party nobody stated renders the invited count ALONE, never a fabricated party", () => {
    assert.equal(planHeaderCountLabel(null, 64, "guests", true, true), "64 invited");
    assert.equal(planHeaderCountLabel(0, 64, "guests", true, true), "64 invited");
    // …and with neither, nothing at all.
    assert.equal(planHeaderCountLabel(null, null, "guests", true, true), "");
  });

  it("an occasion still in flight claims no branch — the count with no noun", () => {
    // `hasGuestList` is `undefined` until the row lands, which is not `true`, so the guest branch
    // is never taken on a guess and the unresolved rule below is inherited unchanged.
    assert.equal(planHeaderCountLabel(3, 64, "guests", undefined, false), "3");
    assert.equal(planHeaderCountLabel(3, null, "guests", undefined, false), "3");
  });
});

// ── D20 · the event noun ──────────────────────────────────────────────────────────────────────

describe("D20 — an occasion may not rename its events", () => {
  it("`events` is the word, and it comes from the ONE spelling", () => {
    assert.equal(eventCountLabel(3), "3 events");
    assert.equal(eventCountLabel(1), "1 event");
  });

  it("no occasion-derived event noun exists anywhere on the slip", () => {
    // The nouns a per-occasion vocabulary would have introduced. `vocabulary` (migration 276)
    // names the PEOPLE and must never be borrowed for the things they attend.
    for (const noun of [/\brounds\b/i, /\bsessions\b/i, /\bceremonies\b/i, /\bmatches\b/i]) {
      assert.doesNotMatch(slipCode, noun, `slip surface uses a per-occasion event noun: ${noun}`);
    }
  });
});

// ── A: the shipped wiring, over the FILE SET ──────────────────────────────────────────────────

describe("A — what the slip now mounts", () => {
  it("A1 S5 renders the TRAVELER-FACING note and never the private one", () => {
    // The component takes the field by name, so a caller cannot pass the wrong one by accident.
    assert.match(noteSrc, /expertTravelerNote/);
    assert.doesNotMatch(noteSrc, /expertNotes/);
    // The slip mounts it, and `trips.expert_notes` appears nowhere on the surface.
    assert.match(slipSrc, /<TripExpertNote/);
    assert.match(slipSrc, /expertTravelerNote=\{data\.trip\?\.expertTravelerNote\}/);
    assert.doesNotMatch(slipCode, /expertNotes/);
    assert.doesNotMatch(slipCode, /expert-notes/);
  });

  it("A2 S5 is PlanCard's own treatment, extracted — not a second block beside it", () => {
    const planCard = read("client", "src", "components", "plancard", "PlanCard.tsx");
    assert.match(planCard, /<TripExpertNote/);
    // The amber/💡 treatment lives in ONE file now (§18 rule 1).
    assert.match(noteSrc, /From your expert/);
    assert.doesNotMatch(stripComments(planCard), /From your expert/);
    assert.doesNotMatch(slipCode, /From your expert/);
  });

  it("A3 S3 mounts the EXISTING per-item thread, gated on an advisor being on the plan", () => {
    assert.match(slipSrc, /<ItemComments/);
    assert.match(slipSrc, /hasAdvisor && \(isOwner \|\| isExpertViewer\)/);
    // The gate is resolved ONCE for the plan and handed down — never a per-row advisor query.
    assert.match(slipSrc, /hasAdvisor = isExpertViewer \|\| !!/);
    assert.match(slipSrc, /hasAdvisor=\{hasAdvisor\}/);
  });

  it("A4 S3 invents no comment count — the DTO carries none", () => {
    // The component does its own real read; nothing on the slip derives a number for it.
    assert.doesNotMatch(slipCode, /commentCount/);
    assert.doesNotMatch(slipCode, /comments\.length/);
  });

  it("A5 S6's edit affordance opens the ONE plan modal — no second stop editor, no second writer", () => {
    assert.match(slipSrc, /onEditStops=\{\(\) => openPlanModal\(\)\}/);
    assert.match(slipSrc, /usePlanning/);
    // Locked Decision 34: `plan-stops-writer.ts` is the ONE client writer and the slip is not a
    // caller of it. A PUT of the replace-list from here would be a caller that never read the list.
    assert.doesNotMatch(slipCode, /savePlanStops/);
    assert.doesNotMatch(slipCode, /\/destinations/);
  });

  it("A6 the header renders both meta lines through the shared derivations", () => {
    assert.match(slipSrc, /slipStopsLine\(/);
    assert.match(slipSrc, /slipZoneLine\(/);
    // …and restates neither. The wording lives in `slip-meta.ts` alone.
    assert.doesNotMatch(slipCode, /Times shown in/);
  });

  it("A7 D21's label is the ONE derivation — the slip does not restate it", () => {
    assert.match(slipSrc, /planHeaderCountLabel\(/);
    assert.doesNotMatch(slipCode, /traveling ·/);
    assert.doesNotMatch(slipCode, /invited`/);
  });

  it("A8 the invited count is the SERVER's own total, read from the roster route", () => {
    assert.match(slipSrc, /\/api\/trips\/\$\{tripId\}\/guests/);
    assert.match(slipSrc, /totals\?\.invited/);
    // §13 — a refusal must not be retried into a zero (the same posture the totals block takes).
    assert.match(slipSrc, /retry: false/);
  });
});
