/**
 * HIRE AN EXPERT FROM THE SLIP — the refusal ladder of `POST /api/trips/:tripId/advisors`.
 * Ledger `2026-09-04-hire-from-slip`; clause (c) of `2026-09-04-slip-precondition`; CLAUDE.md
 * Locked Decisions 12 (a PENDING advisor may not write), 29 (an event IS a `user_experiences`
 * row) and §14/§18/§19.
 *
 * WHY THIS EXISTS. This endpoint takes an IDENTITY in its body — which expert to invite — and
 * writes a row that grants a stranger standing on someone's plan. Three things therefore have to
 * be true of every request, and none of them is visible on the happy path:
 *
 *   G1  the caller OWNS the plan (§14: the plan comes from the URL, the user from the session,
 *       and ownership is re-verified server-side). A non-owner is refused BEFORE anything else,
 *       so the endpoint cannot be used to probe which expert ids or event ids exist.
 *   G2  the expert is REAL and approved — a nonexistent id and an unapproved one answer
 *       identically, so the directory cannot be enumerated through the difference.
 *   G3  the row is written by the ONE author, `ensureTripAdvisorRow`, EXACTLY ONCE per accepted
 *       request (§18 rule 1 — a second INSERT into `trip_expert_advisors` is the drift class this
 *       lane exists to avoid), always as an INVITATION the expert has not accepted.
 *   G4  a named event is VERIFIED against the plan (the shared `resolveItemEventLink`), and a
 *       refusal is a refusal — never a silent downgrade to a plan-level hire.
 *   G5  the event context survives ONLY as the note's wording, because there is no advisor->event
 *       column and this lane did not add one; a titleless event adds no line at all (§13).
 *
 * Pure unit: the four dependencies are stubbed, so no DB, no session, no network.
 * Run: npx tsx --test server/__tests__/hire-advisor-guards.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  composeAdvisorNote,
  hireAdvisorFromSlip,
  EXPERT_NOT_AVAILABLE_MESSAGE,
  NOT_YOUR_PLAN_MESSAGE,
  type HireAdvisorDeps,
} from "../services/hire-advisor.service";

interface Calls {
  ensure: Array<[string, string, string | null]>;
  resolved: Array<[string, string]>;
  expertChecked: string[];
}

function stubDeps(
  overrides: Partial<HireAdvisorDeps> = {},
): { deps: HireAdvisorDeps; calls: Calls } {
  const calls: Calls = { ensure: [], resolved: [], expertChecked: [] };
  const deps: HireAdvisorDeps = {
    verifyTripOwnership: async () => true,
    isExpertApproved: async (id) => {
      calls.expertChecked.push(id);
      return true;
    },
    resolveEventOnTrip: async (tripId, eventId) => {
      calls.resolved.push([tripId, eventId]);
      return { ok: true, title: "Ceremony" };
    },
    ensureTripAdvisorRow: async (tripId, expertId, message) => {
      calls.ensure.push([tripId, expertId, message]);
    },
    ...overrides,
  };
  return { deps, calls };
}

const INPUT = { tripId: "trip-1", userId: "user-1", localExpertId: "expert-9" };

describe("G1 — a non-owner is refused, and learns nothing else", () => {
  it("answers 403 and never touches the expert, the event or the writer", async () => {
    const { deps, calls } = stubDeps({ verifyTripOwnership: async () => false });
    const out = await hireAdvisorFromSlip(deps, { ...INPUT, userExperienceId: "ev-1" });
    assert.equal(out.ok, false);
    assert.equal(out.ok === false && out.httpStatus, 403);
    assert.equal(out.ok === false && out.message, NOT_YOUR_PLAN_MESSAGE);
    assert.deepEqual(calls.expertChecked, []);
    assert.deepEqual(calls.resolved, []);
    assert.deepEqual(calls.ensure, []);
  });

  it("re-verifies ownership with the ROUTE's trip and the SESSION's user (§14)", async () => {
    const seen: Array<[string, string]> = [];
    const { deps } = stubDeps({
      verifyTripOwnership: async (t, u) => {
        seen.push([t, u]);
        return false;
      },
    });
    await hireAdvisorFromSlip(deps, INPUT);
    assert.deepEqual(seen, [["trip-1", "user-1"]]);
  });
});

describe("G2 — an expert who is not there to hire", () => {
  it("answers 404 and writes nothing", async () => {
    const { deps, calls } = stubDeps({ isExpertApproved: async () => false });
    const out = await hireAdvisorFromSlip(deps, INPUT);
    assert.equal(out.ok === false && out.httpStatus, 404);
    assert.equal(out.ok === false && out.message, EXPERT_NOT_AVAILABLE_MESSAGE);
    assert.deepEqual(calls.ensure, []);
  });

  it("says the same thing for an unknown id as for an unapproved one", async () => {
    const unknown = await hireAdvisorFromSlip(
      stubDeps({ isExpertApproved: async () => false }).deps,
      { ...INPUT, localExpertId: "nobody" },
    );
    const unapproved = await hireAdvisorFromSlip(
      stubDeps({ isExpertApproved: async () => false }).deps,
      INPUT,
    );
    assert.deepEqual(unknown, unapproved);
  });
});

describe("G3 — success goes through the ONE author, exactly once", () => {
  it("calls ensureTripAdvisorRow a single time with the route's trip and the chosen expert", async () => {
    const { deps, calls } = stubDeps();
    const out = await hireAdvisorFromSlip(deps, { ...INPUT, message: "We need help with flowers." });
    assert.equal(out.ok, true);
    assert.equal(calls.ensure.length, 1);
    assert.equal(calls.ensure[0][0], "trip-1");
    assert.equal(calls.ensure[0][1], "expert-9");
    assert.equal(calls.ensure[0][2], "We need help with flowers.");
  });

  it("reports the invitation as pending — the expert has accepted nothing (Decision 12)", async () => {
    const { deps } = stubDeps();
    const out = await hireAdvisorFromSlip(deps, INPUT);
    assert.equal(out.ok === true && out.status, "pending");
    assert.equal(out.ok === true && out.expertUserId, "expert-9");
  });
});

describe("G4 — a named event is verified against the plan", () => {
  it("refuses with 400 when the event is not on this plan, and does not hire anyway", async () => {
    const { deps, calls } = stubDeps({
      resolveEventOnTrip: async () => ({ ok: false, message: "That event is not on this plan." }),
    });
    const out = await hireAdvisorFromSlip(deps, { ...INPUT, userExperienceId: "ev-elsewhere" });
    assert.equal(out.ok === false && out.httpStatus, 400);
    assert.deepEqual(calls.ensure, []);
  });

  it("verifies against the ROUTE's trip id, not anything from the body", async () => {
    const { deps, calls } = stubDeps();
    await hireAdvisorFromSlip(deps, { ...INPUT, userExperienceId: "ev-1" });
    assert.deepEqual(calls.resolved, [["trip-1", "ev-1"]]);
  });

  it("does not resolve anything when no event was named — a plan-level hire is ordinary", async () => {
    const { deps, calls } = stubDeps();
    const out = await hireAdvisorFromSlip(deps, { ...INPUT, userExperienceId: null });
    assert.equal(out.ok, true);
    assert.deepEqual(calls.resolved, []);
    assert.equal(out.ok === true && out.eventTitle, null);
  });
});

describe("G5 — the event survives as wording, because no column links it", () => {
  it("names the verified event in the note the expert reads, above the traveler's words", async () => {
    const { deps, calls } = stubDeps();
    await hireAdvisorFromSlip(deps, {
      ...INPUT,
      userExperienceId: "ev-1",
      message: "Two hundred guests.",
    });
    const note = calls.ensure[0][2] as string;
    assert.match(note, /Ceremony/);
    assert.match(note, /Two hundred guests\./);
    assert.ok(note.indexOf("Ceremony") < note.indexOf("Two hundred"));
  });

  it("adds no line for an event with no title — 'Untitled event' is a name nobody wrote", async () => {
    const { deps, calls } = stubDeps({
      resolveEventOnTrip: async () => ({ ok: true, title: null }),
    });
    await hireAdvisorFromSlip(deps, { ...INPUT, userExperienceId: "ev-1", message: "Hello." });
    assert.equal(calls.ensure[0][2], "Hello.");
  });

  it("an empty request writes a NULL note rather than a manufactured sentence", async () => {
    assert.equal(composeAdvisorNote(null, null), null);
    assert.equal(composeAdvisorNote("   ", ""), null);
    const { deps, calls } = stubDeps({
      resolveEventOnTrip: async () => ({ ok: true, title: null }),
    });
    await hireAdvisorFromSlip(deps, { ...INPUT, userExperienceId: "ev-1" });
    assert.equal(calls.ensure[0][2], null);
  });

  it("never rewrites the traveler's words", async () => {
    assert.equal(composeAdvisorNote("we want a small dinner", null), "we want a small dinner");
  });
});
