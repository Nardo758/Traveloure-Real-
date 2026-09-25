/**
 * Audit R-3 — resume after dismiss (`docs/audits/GAP_REGISTER.md` `plan-modal:dialog-on-open-change`,
 * J6-F1). Ledger `2026-09-25-r3-resume-after-dismiss`.
 *
 * P1–P9 are PURE (`@/lib/plan-resume`). W1–W3 pin the modal's wiring by source, on the H6 precedent
 * in `local-finish-mints.test.ts`: they assert the invariant (the Dialog closes through the one
 * handler; a dismiss can only reach `commitPlan` with no trip id), never a line count.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  draftSignature,
  holdsDraftOnDismiss,
  offersResume,
  realDay,
  resumablePenDraft,
  resumeStep,
  type DraftAnswers,
} from "../plan-resume";

const empty: DraftAnswers = {
  title: "",
  stops: [""],
  startDate: "",
  endDate: "",
  adults: "",
  kids: "",
  budgetApproverName: "",
  budgetApproverEmail: "",
  accessibilityNote: "",
  mainMomentTime: "",
  mainMomentDate: "",
  events: [],
  occasionSlug: "",
};

test("P1: an unminted pen with a city and dates is a draft, named verbatim", () => {
  assert.deepEqual(
    resumablePenDraft({ destination: " Kyoto, Japan ", startDate: "2026-11-03", endDate: "2026-11-08" }),
    { destination: "Kyoto, Japan", startDate: "2026-11-03", endDate: "2026-11-08" },
  );
});

test("P2: a pen bound to a plan is that plan, not a draft", () => {
  assert.equal(resumablePenDraft({ tripId: "t1", destination: "Kyoto", startDate: "2026-11-03" }), null);
});

test("P3: nothing to resume without a city or a start date — party and occasion are never enough (§13)", () => {
  assert.equal(resumablePenDraft({}), null);
  assert.equal(resumablePenDraft({ destination: "   " }), null);
  // The structural type has no party or occasion field at all: a draft can only ever say where/when.
  assert.equal(resumablePenDraft({ destination: "", startDate: "not-a-date" }), null);
});

test("P4: only real calendar days are shown; an end before its start, or without one, is dropped", () => {
  assert.equal(realDay("2026-02-30"), null);
  assert.equal(realDay("2026-2-3"), null);
  assert.equal(realDay("2026-02-28"), "2026-02-28");
  assert.deepEqual(resumablePenDraft({ destination: "Kyoto", startDate: "2026-11-08", endDate: "2026-11-03" }), {
    destination: "Kyoto",
    startDate: "2026-11-08",
    endDate: null,
  });
  assert.deepEqual(resumablePenDraft({ destination: "Kyoto", endDate: "2026-11-03" }), {
    destination: "Kyoto",
    startDate: null,
    endDate: null,
  });
});

test("P5: the prompt is offered only where the form shows the draft", () => {
  const draft = resumablePenDraft({ destination: "Kyoto, Japan", startDate: "2026-11-03" });
  assert.equal(offersResume(draft, {}), true);
  assert.equal(offersResume(draft, { doorDestination: "Kyoto" }), true, "the ONE city rule: same city");
  assert.equal(offersResume(draft, { doorDestination: "Osaka, Japan" }), false, "a door naming another city");
  assert.equal(offersResume(draft, { boundTripId: "t1" }), false, "a door naming a plan");
  assert.equal(offersResume(null, {}), false);
  const datesOnly = resumablePenDraft({ startDate: "2026-11-03" });
  assert.equal(offersResume(datesOnly, { doorDestination: "Kyoto" }), false);
});

test("P6: a dismiss holds a draft only for an unminted plan the traveler changed, and never mid-save", () => {
  assert.equal(holdsDraftOnDismiss({ saving: false, changed: true }), true);
  assert.equal(holdsDraftOnDismiss({ saving: false, changed: false }), false, "untouched form: no write");
  assert.equal(holdsDraftOnDismiss({ boundTripId: "t1", saving: false, changed: true }), false, "bound plan");
  assert.equal(holdsDraftOnDismiss({ saving: true, changed: true }), false, "a save owns the write");
});

test("P7: the signature sees every answer and ignores surrounding whitespace", () => {
  const base = draftSignature(empty);
  assert.equal(draftSignature({ ...empty, title: "  " }), base);
  for (const [k, v] of [
    ["title", "Honeymoon"],
    ["stops", ["Kyoto"]],
    ["startDate", "2026-11-03"],
    ["endDate", "2026-11-08"],
    ["adults", "2"],
    ["kids", "1"],
    ["budgetApproverName", "Ana"],
    ["budgetApproverEmail", "a@b.c"],
    ["accessibilityNote", "step-free"],
    ["mainMomentTime", "15:00"],
    ["mainMomentDate", "2026-11-04"],
    ["events", [{ title: "Ceremony" }]],
    ["occasionSlug", "wedding"],
  ] as const) {
    assert.notEqual(draftSignature({ ...empty, [k]: v } as DraftAnswers), base, `${k} must count as a change`);
  }
});

test("P8: Continue lands on the first missing basic, in flow order, among the visible steps", () => {
  const all = ["occasion", "where", "when", "who", "events"] as const;
  assert.equal(resumeStep(all, { occasion: false, where: true, when: true }), "occasion");
  assert.equal(resumeStep(all, { occasion: true, where: false, when: true }), "where");
  assert.equal(resumeStep(all, { occasion: true, where: true, when: false }), "when");
  assert.equal(resumeStep(all, { occasion: true, where: true, when: true }), "events");
});

test("P9: a step the modal does not show is never a Continue target", () => {
  assert.equal(resumeStep(["where", "when", "who"], { occasion: false, where: true, when: true }), "who");
});

const modal = readFileSync(new URL("../../components/trip/plan-modal.tsx", import.meta.url), "utf8");

test("W1: the Dialog closes through the ONE dismiss handler", () => {
  assert.match(modal, /<Dialog open=\{open\} onOpenChange=\{handleDialogOpenChange\}>/);
  assert.doesNotMatch(modal, /<Dialog open=\{open\} onOpenChange=\{onOpenChange\}>/);
});

test("W2: a dismiss reaches commitPlan with NO trip id (it creates nothing — RC-1)", () => {
  const body = modal.slice(modal.indexOf("const handleDialogOpenChange"), modal.indexOf("const currentAnswers"));
  assert.ok(body.length > 0);
  assert.match(body, /holdsDraftOnDismiss\(/);
  assert.match(body, /commitPlan\(\)/, "commitPlan is called with no bound or kept id");
  assert.doesNotMatch(body, /mintThisPlan|mintPlan|mintTripSlip|apiRequest/, "a dismiss never mints or posts");
});

test("W3: the prompt clears through the same reset Clear plan uses, and says only city and dates", () => {
  assert.match(modal, /const clearAll = \(\) => \{\s*resetPlan\(\);\s*onOpenChange\(false\);/);
  assert.match(modal, /onClick=\{resetPlan\}\s*data-testid="button-plan-resume-clear"/);
  const banner = modal.slice(modal.indexOf('data-testid="plan-modal-resume"'), modal.indexOf("button-plan-resume-clear"));
  assert.doesNotMatch(banner, /adults|kids|travelers|partyTotal/, "no party size on the prompt (RC-12)");
});
