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
 *   G6  an expert may be named by HANDLE (Locked Decision 40 — the storefront's address), and the
 *       handle is resolved only AFTER ownership, so a non-owner cannot tell an unknown handle from
 *       a real one. Exactly one address; an unknown handle, a non-expert earner and an unapproved
 *       expert are one answer; and the handle path is flagged so the route returns no `users.id`.
 *
 * Pure unit: the four dependencies are stubbed, so no DB, no session, no network.
 * Run: npx tsx --test server/__tests__/hire-advisor-guards.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  composeAdvisorNote,
  hireAdvisorFromSlip,
  EXPERT_ADDRESS_REQUIRED_MESSAGE,
  EXPERT_NOT_AVAILABLE_MESSAGE,
  NOT_YOUR_PLAN_MESSAGE,
  type HireAdvisorDeps,
} from "../services/hire-advisor.service";
import { tripAdvisorHireSchema } from "@shared/schema";
import { HANDLE_MAX_LENGTH } from "@shared/handle";

interface Calls {
  ensure: Array<[string, string, string | null]>;
  resolved: Array<[string, string]>;
  expertChecked: string[];
  handlesResolved: string[];
}

function stubDeps(
  overrides: Partial<HireAdvisorDeps> = {},
): { deps: HireAdvisorDeps; calls: Calls } {
  const calls: Calls = { ensure: [], resolved: [], expertChecked: [], handlesResolved: [] };
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
    // Default: `sofia-chen` names the live earner `expert-sofia`; any other handle names nobody.
    resolveExpertHandle: async (handle) => {
      calls.handlesResolved.push(handle);
      return handle === "sofia-chen" ? "expert-sofia" : null;
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

const BY_HANDLE = { tripId: "trip-1", userId: "user-1", handle: "sofia-chen" };

describe("G6 — naming the expert by HANDLE (Locked Decision 40)", () => {
  it("resolves the handle and writes the row for THAT account, through the ONE author", async () => {
    const { deps, calls } = stubDeps();
    const out = await hireAdvisorFromSlip(deps, BY_HANDLE);
    assert.equal(out.ok, true);
    assert.deepEqual(calls.handlesResolved, ["sofia-chen"]);
    assert.deepEqual(calls.expertChecked, ["expert-sofia"]);
    assert.equal(calls.ensure.length, 1);
    assert.equal(calls.ensure[0][1], "expert-sofia");
  });

  it("flags the handle path, so the route knows to return NO users.id", async () => {
    const out = await hireAdvisorFromSlip(stubDeps().deps, BY_HANDLE);
    assert.equal(out.ok === true && out.addressedBy, "handle");
  });

  it("leaves the legacy id path flagged `id`, so its one existing caller is unchanged", async () => {
    const out = await hireAdvisorFromSlip(stubDeps().deps, INPUT);
    assert.equal(out.ok === true && out.addressedBy, "id");
    assert.equal(out.ok === true && out.expertUserId, "expert-9");
  });

  it("a NON-OWNER is refused 403 and the handle is NEVER resolved — no probe of which handles exist", async () => {
    // The ordering is the whole point: resolving first would let a stranger tell an unknown handle
    // (404) from a real expert on someone else's plan (403).
    const { deps, calls } = stubDeps({ verifyTripOwnership: async () => false });
    const out = await hireAdvisorFromSlip(deps, BY_HANDLE);
    assert.equal(out.ok === false && out.httpStatus, 403);
    assert.deepEqual(calls.handlesResolved, []);
    assert.deepEqual(calls.expertChecked, []);
    assert.deepEqual(calls.ensure, []);
  });

  it("an unknown handle answers 404, writes nothing, and never reaches the approval check", async () => {
    const { deps, calls } = stubDeps();
    const out = await hireAdvisorFromSlip(deps, { ...BY_HANDLE, handle: "nobody-here" });
    assert.equal(out.ok === false && out.httpStatus, 404);
    assert.equal(out.ok === false && out.message, EXPERT_NOT_AVAILABLE_MESSAGE);
    assert.deepEqual(calls.expertChecked, []);
    assert.deepEqual(calls.ensure, []);
  });

  it("a live earner who is not an approved EXPERT (a provider) gets the SAME answer as an unknown handle", async () => {
    // A provider's handle resolves to a real account; `isExpertApproved` is what refuses it. The two
    // refusals must be indistinguishable, or the rail tells a caller which handles are providers.
    const provider = await hireAdvisorFromSlip(
      stubDeps({ isExpertApproved: async () => false }).deps,
      BY_HANDLE,
    );
    const unknown = await hireAdvisorFromSlip(stubDeps().deps, { ...BY_HANDLE, handle: "nobody-here" });
    assert.deepEqual(provider, unknown);
  });

  it("refuses BOTH addresses at once — it will not guess which one the traveler meant", async () => {
    const { deps, calls } = stubDeps();
    const out = await hireAdvisorFromSlip(deps, { ...BY_HANDLE, localExpertId: "expert-9" });
    assert.equal(out.ok === false && out.httpStatus, 400);
    assert.equal(out.ok === false && out.message, EXPERT_ADDRESS_REQUIRED_MESSAGE);
    assert.deepEqual(calls.ensure, []);
  });

  it("refuses NEITHER address, and treats a whitespace-only handle as absent", async () => {
    for (const input of [
      { tripId: "trip-1", userId: "user-1" },
      { tripId: "trip-1", userId: "user-1", handle: "   " },
      { tripId: "trip-1", userId: "user-1", handle: null, localExpertId: null },
    ]) {
      const { deps, calls } = stubDeps();
      const out = await hireAdvisorFromSlip(deps, input);
      assert.equal(out.ok === false && out.httpStatus, 400, JSON.stringify(input));
      assert.deepEqual(calls.ensure, []);
    }
  });
});

describe("G6 — the body allowlist admits exactly one address", () => {
  it("accepts a handle alone, and a localExpertId alone", () => {
    assert.equal(tripAdvisorHireSchema.safeParse({ handle: "sofia-chen" }).success, true);
    assert.equal(tripAdvisorHireSchema.safeParse({ localExpertId: "expert-9" }).success, true);
  });

  it("refuses both, and refuses neither", () => {
    assert.equal(tripAdvisorHireSchema.safeParse({ handle: "sofia-chen", localExpertId: "expert-9" }).success, false);
    assert.equal(tripAdvisorHireSchema.safeParse({}).success, false);
    assert.equal(tripAdvisorHireSchema.safeParse({ handle: "   " }).success, false);
  });

  it("bounds the handle by HANDLE_MAX_LENGTH — the one stated limit, never a restated literal", () => {
    assert.equal(tripAdvisorHireSchema.safeParse({ handle: "a".repeat(HANDLE_MAX_LENGTH) }).success, true);
    assert.equal(tripAdvisorHireSchema.safeParse({ handle: "a".repeat(HANDLE_MAX_LENGTH + 1) }).success, false);
  });

  it("still cannot be used to set status or plan-approval fields (§19 allowlist)", () => {
    const parsed = tripAdvisorHireSchema.safeParse({
      handle: "sofia-chen",
      status: "accepted",
      workspaceStatus: "active",
      planApprovalStatus: "approved",
    });
    assert.equal(parsed.success, true);
    const data = parsed.success ? (parsed.data as Record<string, unknown>) : {};
    for (const k of ["status", "workspaceStatus", "planApprovalStatus"]) {
      assert.equal(k in data, false, `${k} must not survive the allowlist`);
    }
  });
});
