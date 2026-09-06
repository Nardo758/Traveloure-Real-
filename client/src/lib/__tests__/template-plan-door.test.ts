/**
 * THE EXPERIENCE TEMPLATE LINKS TO THE PLAN; IT NO LONGER DRAWS ONE.
 * Ledger `2026-09-05-template-card-and-preview-door`; CLAUDE.md §13, §18 rule 1, Locked
 * Decision 39 ("plan" is the noun, the slip is the surface) and Locked Decision 41 (Optimize is
 * the paid, review-first rail, and it runs from the slip); ratified Locked Decision 42 D8 (the
 * trip card is not a planning surface — a plan still being built is read at /plans/:tripId) and
 * D12 (no mint or rail may invent a destination or a date).
 *
 * WHY THIS EXISTS. Both defects this pins were INVISIBLE on happy-path data.
 *
 *   (a) The page mounted a `PlanCard` built out of its own form state. Nothing on an add surface
 *       knows a plan's days, activities, legs or time-of-day, so the card rendered zeroes for all
 *       four — counts nobody counted — and it handed the CART TOTAL over as the plan's `budget`,
 *       which is a different fact from the traveler's stated budget. A reader with a full cart
 *       saw a plausible-looking card; only an empty one showed the zeroes for what they were.
 *   (b) The "Itinerary Preview" ribbon built an optimizer comparison out of that cart, and when
 *       the traveler had not given dates it substituted TODAY and TODAY + 7 DAYS. A traveler who
 *       had answered never saw it. One who had not got a comparison — and every artifact keyed
 *       off it — stamped with two dates they never gave.
 *
 * Both are the same shape: a surface answering, on the traveler's behalf, a question only the
 * traveler can answer. So these are source pins, not behavioural ones — the failure mode is a
 * value quietly reappearing in a component's props or a `||` fallback, which typechecks, renders
 * and tests green everywhere else.
 *
 * What these hold:
 *   C1-C3  the card is gone — no import, no mount, and none of the three fabricated props can
 *          come back by name; the page inherits the ONE global Trip Strip rather than mounting
 *          a second copy of that display (§18 rule 1).
 *   L1-L2  the replacement is a link to the plan's own reader, at the address D8 names, and that
 *          address is a registered route.
 *   D1-D3  no invented date survives anywhere in the file, and the comparison the two remaining
 *          legacy call sites still build now REFUSES a missing date instead of filling it in.
 *   R1-R4  the ribbon hands off: one handler, three renderings, the slip when the page is bound
 *          to a plan and the ONE planning modal when it is not — and it quotes no fee, calls no
 *          pay gate and mints no comparison of its own.
 *   S1     the modal is opened with the ratified door source shape, not a fourth one.
 *
 * NEGATIVE SPACE (§18d's posture, applied to a pin): these read the SHIPPED SOURCE. They do not
 * prove the button is visible, reachable by keyboard or placed where a mock says, and they say
 * nothing about what the slip then renders — that is `slip-first-paint` and the e2e suite. They
 * also do not police the two remaining `createComparison` callers on this page (the cart
 * drawer's "Compare AI Alternatives" and the right panel's generate); those keep the legacy
 * comparison rail deliberately, and D3 is what holds them honest about dates.
 *
 * Pure: no DOM, no DB, no fetch. Run:
 *   npx tsx --test client/src/lib/__tests__/template-plan-door.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf-8");

const pageSrc = read("client", "src", "pages", "experience-template.tsx");
const layoutSrc = read("client", "src", "components", "layout.tsx");
const appSrc = read("client", "src", "App.tsx");

/** The body of the one hand-off handler, so R-assertions read it rather than the whole file. */
function doorHandlerBody(): string {
  const start = pageSrc.indexOf("const openItineraryPreviewDoor = () => {");
  assert.notEqual(start, -1, "the one hand-off handler must exist");
  const end = pageSrc.indexOf("\n  };", start);
  assert.notEqual(end, -1, "the hand-off handler must terminate");
  return pageSrc.slice(start, end);
}

// ── C — the client-assembled card is gone ────────────────────────────────────────────────────

describe("C — no zero-filled trip card", () => {
  it("C1: the page neither imports nor mounts PlanCard", () => {
    assert.equal(pageSrc.includes("@/components/plancard/PlanCard"), false);
    assert.equal(/<PlanCard\b/.test(pageSrc), false);
  });

  it("C2: none of the three fabricated props can return by name", () => {
    // The card was handed the cart total as the plan's budget, a party count assembled here,
    // and the occasion's display name lower-cased into an `eventType`. Each is a claim this
    // page is not the source of.
    // Narrow on purpose: the card took the raw number (`budget: cartTotal,`). The legacy
    // comparison rail still passes `cartTotal.toString()` as an optimizer budget constraint —
    // a different consumer, and out of this lane.
    assert.equal(/budget:\s*cartTotal,/.test(pageSrc), false);
    assert.equal(/numberOfTravelers:\s*adults\s*\+\s*kids/.test(pageSrc), false);
    assert.equal(/eventType:\s*experienceType\?\.name\?\.toLowerCase\(\)/.test(pageSrc), false);
  });

  it("C3: the Trip Strip is inherited from Layout, never mounted a second time", () => {
    // The page renders inside <Layout>, and Layout mounts the ONE global strip. A second mount
    // would be a second copy of destination · dates · party · cart (§18 rule 1).
    // A component that is never imported cannot be mounted, and the import is the one signal a
    // comment cannot forge (the block above this control names the global strip in prose).
    assert.equal(pageSrc.includes("@/components/trip/trip-strip"), false);
    assert.equal(/import\s*\{[^}]*TripStrip[^}]*\}/.test(pageSrc), false);
    assert.match(pageSrc, /<Layout>/);
    assert.match(layoutSrc, /<TripStrip \/>/);
  });
});

// ── L — the link that replaced it ────────────────────────────────────────────────────────────

describe("L — the plan is opened, not redrawn", () => {
  it("L1: a single 'Open your plan' control points at the plan's own reader", () => {
    assert.equal(pageSrc.split('data-testid="button-open-plan"').length - 1, 1);
    const at = pageSrc.indexOf('data-testid="button-open-plan"');
    const block = pageSrc.slice(Math.max(0, at - 600), at);
    assert.match(block, /href=\{`\/plans\/\$\{linkedTripId\}`\}/);
    assert.match(pageSrc.slice(at, at + 400), /Open your plan/);
  });

  it("L2: /plans/:tripId is a registered route", () => {
    assert.match(appSrc, /path="\/plans\/:tripId"/);
  });
});

// ── D — D12: nothing here invents a date ─────────────────────────────────────────────────────

describe("D — no invented dates", () => {
  it("D1: the today/+7-days fallback is gone and cannot return in that shape", () => {
    assert.equal(/Date\.now\(\)\s*\+\s*7\s*\*\s*24/.test(pageSrc), false);
    assert.equal(/new Date\(Date\.now\(\)\s*\+/.test(pageSrc), false);
  });

  it("D2: no date expression in the file falls back to a manufactured one", () => {
    // The exact shape the defect wore: `<answer> || new Date()...`. An absent date is a finished
    // answer, so there is nothing legitimate on the right of that `||`.
    assert.equal(/\|\|\s*new Date\(/.test(pageSrc), false);
  });

  it("D3: the surviving comparison rail refuses a missing date and derives the day once", () => {
    const at = pageSrc.indexOf("const createComparison = async () => {");
    assert.notEqual(at, -1, "the two legacy callers still need this handler");
    const body = pageSrc.slice(at, at + 3000);
    // One extraction (§18 rule 1) — and the calendar-day one, not the instant one.
    assert.match(body, /const startIso = calendarDateToIso\(startDate\);/);
    assert.match(body, /const endIso = calendarDateToIso\(endDate\);/);
    // Missing ⇒ ask, never fill in.
    assert.match(body, /if \(!startIso \|\| !endIso\)/);
    assert.match(body, /startDate: startIso,/);
    assert.match(body, /endDate: endIso,/);
  });
});

// ── R — the ribbon hands off ─────────────────────────────────────────────────────────────────

describe("R — the Itinerary Preview control", () => {
  it("R1: one handler, and it routes a bound page to the slip", () => {
    const body = doorHandlerBody();
    assert.match(body, /if \(linkedTripId\)/);
    assert.match(body, /setLocation\(`\/plans\/\$\{linkedTripId\}`\)/);
    // D8: a plan being built is read on the slip, never on the trip card.
    assert.equal(/\/trip\/\$\{linkedTripId\}/.test(body), false);
  });

  it("R2: an unbound page opens the ONE planning modal", () => {
    assert.match(doorHandlerBody(), /openPlanModal\(\{/);
  });

  it("R3: the hand-off quotes no fee, calls no pay gate and mints no comparison", () => {
    const body = doorHandlerBody();
    for (const forbidden of [
      "createComparisonRequest",
      "createComparison",
      "optimization-preview",
      "optimization-payments",
      "itinerary-comparisons",
      "comparison_baseline_",
    ]) {
      assert.equal(body.includes(forbidden), false, `hand-off must not reference ${forbidden}`);
    }
  });

  it("R4: all three renderings of the control share that one handler", () => {
    for (const testid of ["button-generate-ribbon", "button-generate-ribbon-mobile"]) {
      const at = pageSrc.indexOf(`data-testid="${testid}"`);
      assert.notEqual(at, -1, `${testid} must still exist`);
      const block = pageSrc.slice(Math.max(0, at - 400), at);
      assert.match(block, /onClick=\{openItineraryPreviewDoor\}/);
      assert.equal(/onClick=\{createComparison\}/.test(block), false);
    }
    // Desktop ribbon, mobile ribbon, and the twin floating over the mobile map.
    assert.equal(pageSrc.split("onClick={openItineraryPreviewDoor}").length - 1, 3);
  });
});

// ── S — one door source shape ────────────────────────────────────────────────────────────────

describe("S — the door's source", () => {
  it("S1: the modal is handed the ratified pair, with a blank passed as absent", () => {
    // The same shape every other door on this page passes — one door worn several ways, never a
    // fourth shape (§18 rule 1). `|| undefined` is load-bearing: an ABSENT field is how
    // `PlanningSource` says "not known", while "" would be a stated blank (§13).
    assert.match(
      doorHandlerBody(),
      /openPlanModal\(\{ experienceSlug: slug \|\| undefined, destination: destination\.trim\(\) \|\| undefined \}\)/,
    );
  });
});
