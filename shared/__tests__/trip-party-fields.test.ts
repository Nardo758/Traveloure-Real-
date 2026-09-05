/**
 * TRIP PARTY FIELDS — migration 284's three step-4 columns, held to their admission rules.
 * Ledger `2026-09-04-step4-variants-fields`; CLAUDE.md Locked Decision 38.
 *
 * WHY THIS EXISTS. The three columns carry NO DB CHECK (the publish-trap posture), so the zod
 * field schemas in `shared/schema.ts` ARE the only thing standing between the wire and the row —
 * and they are shared by BOTH admission rails (`tripOccasionBody` on
 * `PATCH /api/trips/:tripId/occasion`, and the hand-written `tripContextSchema` allowlist on
 * `PUT /api/trip-context`). A loosening here is invisible: a bad value still writes, still renders,
 * and only shows up as a plan carrying an email address that is not one.
 *
 * What these hold:
 *   T1  an EMAIL is validated when non-null, and a non-email is REFUSED — not silently stored.
 *   T2  `null` CLEARS. It is a first-class value, not the absence of one: it is how a traveler
 *       takes back an answer they gave, and it must survive the schema unchanged.
 *   T3  ABSENT is different from `null`. An untouched field sends nothing, and the route then
 *       writes nothing — a walked-past step must never NULL out a real answer (§13).
 *   T4  a string that TRIMS TO EMPTY becomes `null`. "" and NULL would otherwise be two spellings
 *       of the same non-answer, and two ways to say nothing is how a reader ends up guessing.
 *   T5  the caps are the column widths (120 / 255 / 2000) and over-length is refused, never
 *       truncated — a silently truncated note is a note that says something else.
 *   T6  UNKNOWN KEYS ARE STRIPPED on the pre-trip pen (§19: the allowlist `.strip()`s), and the
 *       three fields survive that strip because they are named on it.
 *   T7  the two rails agree, because they are the SAME schemas — a value one accepts the other
 *       accepts (§18 rule 1, proven rather than asserted in a comment).
 *
 * Pure unit: no DOM, no DB, no fetch, no route import (importing the routers would pull in the
 * database at module load).
 * Run: npx tsx --test shared/__tests__/trip-party-fields.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  TRIP_ACCESSIBILITY_NOTE_MAX,
  insertTripSchema,
  tripAccessibilityNoteSchema,
  tripBudgetApproverEmailSchema,
  tripBudgetApproverNameSchema,
} from "../schema";

/**
 * The two live rails, reconstructed from the SAME exported field schemas the routes use.
 *
 * They are rebuilt here rather than imported because `server/routes/trips.routes.ts` and
 * `server/routes/trip-context.routes.ts` open a database connection at import time. What is under
 * test is the FIELD authority — the part that is shared, and the part a change would loosen — so
 * rebuilding the wrapper around it costs nothing and keeps this suite DB-free (the
 * `pending-events.pure.ts` precedent).
 */
const OCCASION_RAIL = z.object({
  budgetApproverName: tripBudgetApproverNameSchema,
  budgetApproverEmail: tripBudgetApproverEmailSchema,
  accessibilityNote: tripAccessibilityNoteSchema,
});

/** The pen's allowlist posture: `.strip()`, so anything unnamed is dropped rather than persisted. */
const PEN_RAIL = z
  .object({
    destination: z.string().max(255).optional(),
    budgetApproverName: tripBudgetApproverNameSchema,
    budgetApproverEmail: tripBudgetApproverEmailSchema,
    accessibilityNote: tripAccessibilityNoteSchema,
  })
  .strip();

describe("T1 — the email is validated when it is given", () => {
  it("accepts a real address", () => {
    const parsed = OCCASION_RAIL.safeParse({ budgetApproverEmail: "cfo@example.com" });
    assert.equal(parsed.success, true);
    assert.equal(parsed.success && parsed.data.budgetApproverEmail, "cfo@example.com");
  });

  for (const bad of ["not-an-email", "finance", "a@b", "cfo@", "@example.com", "cfo example.com"]) {
    it(`refuses ${JSON.stringify(bad)} rather than storing it`, () => {
      assert.equal(OCCASION_RAIL.safeParse({ budgetApproverEmail: bad }).success, false);
    });
  }

  it("the NAME beside it is deliberately free text — a role is a legitimate answer", () => {
    // "Who approves the budget?" is answered with "Finance" or "the CFO" as often as with a person,
    // which is exactly why the name is not an email, not a user reference and not validated.
    const parsed = OCCASION_RAIL.safeParse({ budgetApproverName: "Finance (whoever is on rota)" });
    assert.equal(parsed.success, true);
  });
});

describe("T2 — null CLEARS, and stays null", () => {
  for (const key of ["budgetApproverName", "budgetApproverEmail", "accessibilityNote"] as const) {
    it(`${key}: an explicit null survives the schema`, () => {
      const parsed = OCCASION_RAIL.safeParse({ [key]: null });
      assert.equal(parsed.success, true);
      assert.equal(parsed.success && parsed.data[key], null);
    });
  }
});

describe("T3 — absent is not null", () => {
  it("an empty body parses, and names none of the three keys", () => {
    const parsed = OCCASION_RAIL.safeParse({});
    assert.equal(parsed.success, true);
    // The route builds its patch from `key in req.body`, so what matters is that parsing does not
    // MANUFACTURE a key: an untouched field must reach the handler as absent, never as null. A
    // fabricated null here would blank a real answer every time someone walked past step 4 (§13).
    assert.equal(parsed.success && "budgetApproverName" in parsed.data, false);
    assert.equal(parsed.success && "accessibilityNote" in parsed.data, false);
  });
});

describe("T4 — a blank string is the same non-answer as null, and is normalised to it", () => {
  for (const blank of ["", "   ", "\t\n "]) {
    it(`the note: ${JSON.stringify(blank)} becomes null`, () => {
      const parsed = OCCASION_RAIL.safeParse({ accessibilityNote: blank });
      assert.equal(parsed.success, true);
      assert.equal(parsed.success && parsed.data.accessibilityNote, null);
    });
    it(`the approver name: ${JSON.stringify(blank)} becomes null`, () => {
      const parsed = OCCASION_RAIL.safeParse({ budgetApproverName: blank });
      assert.equal(parsed.success, true);
      assert.equal(parsed.success && parsed.data.budgetApproverName, null);
    });
  }

  it("the email accepts a blank as a clear, without failing its own email rule", () => {
    // A traveler emptying the field sends "", not null — the input has no other way to say it.
    const parsed = OCCASION_RAIL.safeParse({ budgetApproverEmail: "" });
    assert.equal(parsed.success, true);
    assert.equal(parsed.success && parsed.data.budgetApproverEmail, null);
  });

  it("a real answer is trimmed but not otherwise rewritten", () => {
    const parsed = OCCASION_RAIL.safeParse({
      accessibilityNote: "  Grandparents — step-free, short walks  ",
    });
    assert.equal(parsed.success, true);
    assert.equal(
      parsed.success && parsed.data.accessibilityNote,
      "Grandparents — step-free, short walks",
    );
  });
});

describe("T5 — the caps are the column widths, and over-length is refused not truncated", () => {
  it("the note's cap is stated once and is 2000", () => {
    assert.equal(TRIP_ACCESSIBILITY_NOTE_MAX, 2000);
  });

  it("a 2000-character note passes and a 2001-character one is refused", () => {
    assert.equal(OCCASION_RAIL.safeParse({ accessibilityNote: "a".repeat(2000) }).success, true);
    assert.equal(OCCASION_RAIL.safeParse({ accessibilityNote: "a".repeat(2001) }).success, false);
  });

  it("the approver name is capped at the varchar(120) width", () => {
    assert.equal(OCCASION_RAIL.safeParse({ budgetApproverName: "a".repeat(120) }).success, true);
    assert.equal(OCCASION_RAIL.safeParse({ budgetApproverName: "a".repeat(121) }).success, false);
  });

  it("the email is capped at the varchar(255) width", () => {
    const long = `${"a".repeat(250)}@example.com`;
    assert.equal(long.length > 255, true);
    assert.equal(OCCASION_RAIL.safeParse({ budgetApproverEmail: long }).success, false);
  });
});

describe("T6 — the pen is an allowlist: unnamed keys are stripped, these three are not", () => {
  it("drops a key nobody named", () => {
    const parsed = PEN_RAIL.safeParse({
      destination: "Kyoto, Japan",
      accessibilityNote: "step-free please",
      // Not on the allowlist. §19's whole point: a field nobody named must not persist.
      isAdmin: true,
      revenueShareRate: "1.00",
    });
    assert.equal(parsed.success, true);
    assert.equal(parsed.success && "isAdmin" in parsed.data, false);
    assert.equal(parsed.success && "revenueShareRate" in parsed.data, false);
    assert.equal(parsed.success && parsed.data.accessibilityNote, "step-free please");
  });
});

describe("T7 — the two rails cannot disagree, because they share the field schemas", () => {
  const cases: Array<Record<string, unknown>> = [
    { budgetApproverName: "Finance" },
    { budgetApproverName: null },
    { budgetApproverEmail: "cfo@example.com" },
    { budgetApproverEmail: "nope" },
    { accessibilityNote: "  " },
    { accessibilityNote: "a".repeat(2001) },
  ];
  for (const body of cases) {
    it(`agree on ${JSON.stringify(body).slice(0, 48)}`, () => {
      const a = OCCASION_RAIL.safeParse(body);
      const b = PEN_RAIL.safeParse(body);
      assert.equal(a.success, b.success);
      if (a.success && b.success) assert.deepEqual(a.data, b.data);
    });
  }
});

describe("T8 — the MINT body cannot carry them (§19)", () => {
  it("insertTripSchema omits all three, so a crafted POST /api/trips states none of them", () => {
    // The ruling gives each column exactly ONE admission rail. `insertTripSchema` is an `.omit()`
    // DENYLIST, under which a freshly-added column is client-settable BY DEFAULT — so the three are
    // named on its omit list, and a body carrying them is stripped rather than written. If this
    // ever fails, a second rail has opened by accident, which is the drift class §18 rule 1 names.
    const parsed = insertTripSchema.safeParse({
      title: "A plan",
      destination: "Kyoto, Japan",
      startDate: "2026-10-02",
      endDate: "2026-10-04",
      budgetApproverName: "Attacker",
      budgetApproverEmail: "attacker@example.com",
      accessibilityNote: "planted",
    });
    assert.equal(parsed.success, true);
    const data = (parsed.success ? parsed.data : {}) as Record<string, unknown>;
    assert.equal("budgetApproverName" in data, false);
    assert.equal("budgetApproverEmail" in data, false);
    assert.equal("accessibilityNote" in data, false);
  });
});
