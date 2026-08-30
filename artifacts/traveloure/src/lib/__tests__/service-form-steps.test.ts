/**
 * WAVE 2 / LANE A1 (S1+S3) — THE BRANCHING FLOW'S SHAPE (pure unit; no DB, no browser).
 *
 * ── WHAT THIS SUITE IS FOR ────────────────────────────────────────────────────────────────────
 * The wizard stopped being four fixed steps and started being SEVEN DIFFERENT FLOWS, chosen by
 * the delivery method. That trade buys a shorter form for six of the seven methods and costs one
 * new failure mode, which is the one worth testing: **a section that belongs to no step in some
 * branch is unreachable** — the provider can neither see the field nor fix it, while the payload
 * still carries whatever the row already had. A form can look perfectly fine in the one branch
 * the author happened to click through and have a hole in the other six.
 *
 * So the negatives here are the point:
 *   N1  every section resolves to a step the flow ACTUALLY CONTAINS, for all 7 methods
 *   N2  a method switch never shrinks the shared set — the fast path survives every pair
 *   N3  an unknown method string cannot produce a flow with no steps (legacy rows)
 *   N4  clamping never lands off the end, and never below step 1
 * and the positives pin the ratified shapes themselves:
 *   P1  the branch shapes, method by method (3 / 3 / 5 / 6), against the mock's own table
 *   P2  the renames — Logistics is the SPATIAL step; the temporal one is Scheduling and the
 *       party-size one is Capacity
 *   P3  the basics fast path: the five answers are on step 1 in EVERY branch
 *   P4  the spatial sections are on the Logistics step for place-anchored methods, and the
 *       Logistics step DOES NOT EXIST for the remote ones
 *
 * Run: npx tsx --test client/src/lib/__tests__/service-form-steps.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_METHODS,
  ALL_SECTIONS,
  clampStep,
  detailsStepFor,
  FAST_PATH_SECTIONS,
  FLOWS,
  flowForMethod,
  sectionsVisibleInBoth,
  STEP_SHORT_TITLES,
  stepForSection,
  stepNumberForSection,
  stepNumberOf,
  type SectionKey,
  type StepKey,
  type UiDeliveryMethod,
} from "../service-form-steps";

// ── NEGATIVES FIRST ───────────────────────────────────────────────────────────────────────────

test("N1: no section is UNREACHABLE — every section lands on a step its own branch has", () => {
  for (const method of ALL_METHODS) {
    const flow = flowForMethod(method);
    for (const section of ALL_SECTIONS) {
      const step = stepForSection(section, method);
      assert.ok(
        flow.includes(step),
        `${method}: section "${section}" resolves to step "${step}", which is not in [${flow.join(", ")}]`,
      );
      // …and the derived 1-based number is therefore always a real position.
      const n = stepNumberForSection(section, method);
      assert.ok(n >= 1 && n <= flow.length, `${method}/${section}: step number ${n} out of range`);
    }
  }
});

test("N2: switching the method never drops the fast path or the last step's content", () => {
  // The never-clobber promise (FP-1 / B5) has two halves. The FORM's half is that
  // `set("deliveryMethod", …)` writes one field and resets nothing — a hidden section's answers
  // stay in state and stay in the payload. THIS half is the placement one: the sections that are
  // shared by both branches must still be VISIBLE after the switch, or "your work is still there"
  // would be true and unprovable at the same time.
  for (const from of ALL_METHODS) {
    for (const to of ALL_METHODS) {
      const shared = sectionsVisibleInBoth(from, to);
      for (const s of FAST_PATH_SECTIONS) {
        assert.ok(shared.includes(s), `${from} → ${to}: fast-path section "${s}" disappeared`);
      }
      for (const s of ["whatIncluded", "photos", "bookingTerms", "requirements", "attestations"] as SectionKey[]) {
        assert.ok(shared.includes(s), `${from} → ${to}: "${s}" disappeared`);
      }
    }
  }
});

test("N3: an unknown or legacy method string still gets a real flow, never an empty one", () => {
  for (const junk of ["", "document", "digital", "in_person", "IN-PERSON", "🙂"]) {
    const flow = flowForMethod(junk);
    assert.ok(flow.length >= 3, `"${junk}" produced ${flow.length} steps`);
    assert.equal(flow[0], "basics");
    assert.equal(flow[flow.length - 1], "review");
    // The fallback is the WIDEST flow deliberately: an unrecognised value must not hide a step
    // that a stored row's data lives on (§13 — never make an answer unreachable).
    assert.deepEqual(flow, FLOWS["in-person"]);
  }
});

test("N4: clamping lands inside the flow — a method switch never strands the wizard off the end", () => {
  // The real sequence: a provider on step 5 of a 5-step in-person draft picks "PDF guide", whose
  // flow is 3 steps. They must land on step 3, not on a blank screen.
  assert.equal(clampStep("pdf", 5), 3);
  assert.equal(clampStep("hybrid", 99), 6);
  assert.equal(clampStep("in-person", 0), 1);
  assert.equal(clampStep("in-person", -4), 1);
  assert.equal(clampStep("call", Number.NaN), 1);
  // …and a step already inside the flow is untouched.
  assert.equal(clampStep("in-person", 4), 4);
});

test("N5: a step a branch does not have has no position at all — it is absent, not disabled", () => {
  assert.equal(stepNumberOf("pdf", "logistics"), 0);
  assert.equal(stepNumberOf("call", "capacity"), 0);
  assert.equal(stepNumberOf("in-person", "online"), 0);
  assert.equal(stepNumberOf("voice_notes", "scheduling"), 0);
});

// ── POSITIVES — the ratified shapes ───────────────────────────────────────────────────────────

test("P1: the branch shapes match the ratified mock, method by method", () => {
  const expected: Record<UiDeliveryMethod, StepKey[]> = {
    "in-person": ["basics", "scheduling", "capacity", "logistics", "review"],
    hybrid: ["basics", "scheduling", "capacity", "logistics", "online", "review"],
    "video-call": ["basics", "session", "review"],
    call: ["basics", "session", "review"],
    pdf: ["basics", "artifact", "review"],
    voice_notes: ["basics", "asyncdet", "review"],
    async_messaging: ["basics", "asyncdet", "review"],
  };
  for (const [method, steps] of Object.entries(expected)) {
    assert.deepEqual([...flowForMethod(method)], steps, `flow for ${method}`);
  }
  // The counts, said plainly — this is the number the step indicator renders.
  assert.equal(flowForMethod("in-person").length, 5);
  assert.equal(flowForMethod("hybrid").length, 6);
  for (const m of ["pdf", "call", "video-call", "voice_notes", "async_messaging"]) {
    assert.equal(flowForMethod(m).length, 3, `${m} is a 3-step flow`);
  }
  // Exactly the canonical 7 methods have a flow of their own — no eighth branch crept in.
  assert.equal(Object.keys(FLOWS).length, 7);
});

test("P2: the renames — Logistics is SPATIAL; the temporal step is Scheduling, the party-size one Capacity", () => {
  assert.equal(STEP_SHORT_TITLES.scheduling, "Scheduling");
  assert.equal(STEP_SHORT_TITLES.capacity, "Capacity");
  assert.equal(STEP_SHORT_TITLES.logistics, "Logistics");
  // The temporal questions are on Scheduling…
  assert.equal(stepForSection("timing", "in-person"), "scheduling");
  assert.equal(stepForSection("bookingRules", "in-person"), "scheduling");
  assert.equal(stepForSection("duration", "in-person"), "scheduling");
  // …party size is on Capacity…
  assert.equal(stepForSection("capacityFields", "in-person"), "capacity");
  // …and NOTHING temporal or numeric is on Logistics, which is spatial only.
  const logisticsSections = ALL_SECTIONS.filter((s) => stepForSection(s, "in-person") === "logistics");
  assert.deepEqual(logisticsSections.sort(), ["map", "place", "surcharge", "transport"]);
});

test("P3: the BASICS FAST PATH is step 1 in every branch", () => {
  for (const method of ALL_METHODS) {
    for (const section of FAST_PATH_SECTIONS) {
      assert.equal(stepForSection(section, method), "basics", `${method}/${section}`);
      assert.equal(stepNumberForSection(section, method), 1);
    }
    // The method tile itself is on step 1 — that IS "method-first": it is asked before anything
    // that branches on it, never halfway down a later step.
    assert.equal(stepForSection("method", method), "basics");
    assert.equal(flowForMethod(method)[0], "basics");
  }
});

test("P4: the spatial block is one step for place-anchored methods, and absent for remote ones", () => {
  for (const method of ["in-person", "hybrid"]) {
    for (const s of ["place", "map", "transport", "surcharge"] as SectionKey[]) {
      assert.equal(stepForSection(s, method), "logistics", `${method}/${s}`);
    }
    assert.equal(stepNumberOf(method, "logistics"), 4, `${method}: Logistics is the FOURTH step`);
  }
  // Remote branches never grow the step at all — absent, not disabled, not skipped over.
  for (const method of ["pdf", "call", "video-call", "voice_notes", "async_messaging"]) {
    assert.ok(!flowForMethod(method).includes("logistics"), `${method} must not have a Logistics step`);
  }
});

test("P5: the branch's second step is the one that changes name with the method", () => {
  assert.equal(detailsStepFor("in-person"), "scheduling");
  assert.equal(detailsStepFor("hybrid"), "scheduling");
  assert.equal(detailsStepFor("call"), "session");
  assert.equal(detailsStepFor("video-call"), "session");
  assert.equal(detailsStepFor("pdf"), "artifact");
  assert.equal(detailsStepFor("voice_notes"), "asyncdet");
  assert.equal(detailsStepFor("async_messaging"), "asyncdet");
  // The deliverable rides the pdf branch's own step; the online half rides hybrid's extra one.
  assert.equal(stepForSection("deliverable", "pdf"), "artifact");
  assert.equal(stepForSection("onlineHalf", "hybrid"), "online");
  assert.equal(stepNumberOf("hybrid", "online"), 5);
});

test("P6: every step in every flow has both a short and a long title — the indicator can't render a blank", () => {
  for (const method of ALL_METHODS) {
    for (const step of flowForMethod(method)) {
      assert.ok(STEP_SHORT_TITLES[step]?.trim().length > 0, `${method}: no short title for ${step}`);
    }
  }
});
