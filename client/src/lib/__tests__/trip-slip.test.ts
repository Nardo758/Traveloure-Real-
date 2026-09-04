/**
 * THE SLIP IS THE PRECONDITION — the negatives that stop a `template_inquiry` lead from being
 * born unreachable again. CLAUDE.md Locked Decision 32 lane (a); ledger
 * `2026-09-04-slip-precondition` / `2026-09-04-template-inquiry-slip`.
 *
 * WHY THESE ARE PINNED HERE. A trip-less expert request does not throw, does not 4xx and does
 * not look wrong on the happy path: the server answers 200 with a queue position, the traveler
 * is toasted "Shared with an expert", and only much later does anyone notice that no advisor
 * row, no notification and no Assigned Trips entry were ever created and that the admin confirm
 * path refuses the row outright. The failure is INVISIBLE at the call site, which is exactly
 * the shape that comes back the moment someone "simplifies" the ordering here. So the ordering
 * is a module with tests rather than a habit at one call site.
 *
 *   S1  NO REQUEST WITHOUT A tripId — the request is never sent unbound, in any path.
 *   S2  ABSENT DATES ⇒ NO MINT AND NO REQUEST. `trips.start_date`/`end_date` are NOT NULL and
 *       §13 forbids inventing one, so the traveler is ASKED. Neither dependency is called.
 *   S3  AN EXISTING tripId IS REUSED — nothing is minted beside the plan the traveler has.
 *   S4  A MINT THAT PRODUCES NO ID SENDS NOTHING. `undefined` is not a slip.
 *   S5  A missing destination is refused before the server is touched.
 *   S6  Inverted dates are refused; a good range is not.
 *   S7  The mint body carries only stated values — no invented dates, no server-derived fields.
 *   S8  A blank/whitespace tripId is NOT a bound slip (it would forward as `""`).
 *
 * Pure unit: no DOM, no DB, no fetch, no React. Every network dependency is injected.
 * Run: npx tsx --test client/src/lib/__tests__/trip-slip.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildTripMintBody,
  checkSlipPrecondition,
  ensureSlipForExpertRequest,
  hasBoundSlip,
  mintTripSlip,
  SLIP_REFUSAL_MESSAGES,
  TRIP_MINT_ENDPOINT,
  type SlipBasics,
  type SlipMintOutcome,
  type TripMintBody,
} from "../trip-slip";

const GOOD: SlipBasics = {
  destination: "Kyoto, Japan",
  startDate: "2026-10-01",
  endDate: "2026-10-08",
};

/** Records every call so a test can assert on what was NOT called, which is the whole point. */
function spies(mintOutcome: SlipMintOutcome) {
  const mintCalls: SlipBasics[] = [];
  const requestCalls: string[] = [];
  const mintedCalls: string[] = [];
  return {
    mintCalls,
    requestCalls,
    mintedCalls,
    deps: {
      mint: async (basics: SlipBasics) => {
        mintCalls.push(basics);
        return mintOutcome;
      },
      sendRequest: async (tripId: string) => {
        requestCalls.push(tripId);
        return { ok: true };
      },
      onMinted: (tripId: string) => {
        mintedCalls.push(tripId);
      },
    },
  };
}

describe("S1 — no expert request is ever sent without a tripId", () => {
  it("binds the freshly minted trip to the request", async () => {
    const s = spies({ ok: true, tripId: "trip-new" });
    const outcome = await ensureSlipForExpertRequest({ basics: GOOD }, s.deps);

    assert.equal(outcome.status, "sent");
    assert.deepEqual(s.requestCalls, ["trip-new"]);
    // Every id that reached the request is a real bound slip.
    for (const id of s.requestCalls) assert.ok(hasBoundSlip(id));
  });

  it("sends nothing at all when the mint refuses", async () => {
    const s = spies({
      ok: false,
      reason: "dates_missing",
      message: SLIP_REFUSAL_MESSAGES.dates_missing,
    });
    const outcome = await ensureSlipForExpertRequest(
      { basics: { destination: "Kyoto, Japan" } },
      s.deps,
    );

    assert.equal(outcome.status, "blocked");
    assert.deepEqual(s.requestCalls, []);
  });

  it("across every entry shape, a request call implies a non-empty tripId", async () => {
    const cases: Array<{ existingTripId?: string | null; basics: SlipBasics }> = [
      { basics: GOOD },
      { existingTripId: "trip-bound", basics: GOOD },
      { existingTripId: "", basics: GOOD },
      { existingTripId: null, basics: {} },
      { existingTripId: undefined, basics: { destination: "Kyoto, Japan" } },
      { basics: { destination: "  ", startDate: "2026-10-01", endDate: "2026-10-08" } },
    ];
    for (const input of cases) {
      const s = spies({ ok: true, tripId: "trip-new" });
      await ensureSlipForExpertRequest(input, s.deps);
      for (const id of s.requestCalls) {
        assert.ok(hasBoundSlip(id), `unbound tripId sent for ${JSON.stringify(input)}`);
      }
    }
  });
});

describe("S2 — absent dates: no mint, no request, the traveler is asked", () => {
  it("refuses before either dependency runs", async () => {
    const s = spies({ ok: true, tripId: "trip-should-not-exist" });
    // The real mint is `mintTripSlip`, which refuses on its own; the injected spy stands in for
    // it here so the assertion is that the ORDERING never reaches the network either way.
    const outcome = await ensureSlipForExpertRequest(
      {
        basics: { destination: "Kyoto, Japan" },
      },
      {
        ...s.deps,
        mint: async (basics: SlipBasics) => {
          s.mintCalls.push(basics);
          return mintTripSlip(basics, async () => {
            throw new Error("the mint door must not be opened without dates");
          });
        },
      },
    );

    assert.equal(outcome.status, "blocked");
    assert.equal(outcome.status === "blocked" && outcome.reason, "dates_missing");
    assert.deepEqual(s.requestCalls, [], "no expert request may be sent");
    assert.deepEqual(s.mintedCalls, [], "nothing was minted");
  });

  it("mintTripSlip itself never calls the server when a date is missing", async () => {
    let posted = 0;
    const poster = async () => {
      posted += 1;
      return { id: "trip-invented" };
    };

    for (const basics of [
      { destination: "Kyoto, Japan" },
      { destination: "Kyoto, Japan", startDate: "2026-10-01" },
      { destination: "Kyoto, Japan", endDate: "2026-10-08" },
      { destination: "Kyoto, Japan", startDate: "", endDate: "" },
      { destination: "Kyoto, Japan", startDate: null, endDate: null },
      { destination: "Kyoto, Japan", startDate: "not-a-date", endDate: "2026-10-08" },
    ] as SlipBasics[]) {
      const outcome = await mintTripSlip(basics, poster);
      assert.equal(outcome.ok, false, `${JSON.stringify(basics)} must not mint`);
      assert.equal(outcome.ok === false && outcome.reason, "dates_missing");
    }
    assert.equal(posted, 0, "no POST may be made for a plan with no stated dates");
  });

  it("the refusal is a question, not a fabricated date", () => {
    const refusal = checkSlipPrecondition({ destination: "Kyoto, Japan" });
    assert.ok(refusal);
    assert.equal(refusal!.reason, "dates_missing");
    // Nothing date-shaped is handed back for a caller to "use as a default".
    assert.equal(Object.prototype.hasOwnProperty.call(refusal!, "startDate"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(refusal!, "endDate"), false);
  });
});

describe("S3 — an existing trip is reused, never duplicated", () => {
  it("mints nothing and requests against the bound trip", async () => {
    const s = spies({ ok: true, tripId: "trip-should-not-exist" });
    const outcome = await ensureSlipForExpertRequest(
      { existingTripId: "trip-bound", basics: GOOD },
      s.deps,
    );

    assert.equal(outcome.status, "sent");
    assert.equal(outcome.status === "sent" && outcome.tripId, "trip-bound");
    assert.equal(outcome.status === "sent" && outcome.minted, false);
    assert.deepEqual(s.mintCalls, [], "an existing slip must not be re-minted");
    assert.deepEqual(s.mintedCalls, [], "onMinted is for new slips only");
    assert.deepEqual(s.requestCalls, ["trip-bound"]);
  });

  it("reuses the bound trip even when the page's own basics are short", async () => {
    // The bound trip already carries dates; the page not having them is irrelevant.
    const s = spies({ ok: true, tripId: "trip-should-not-exist" });
    const outcome = await ensureSlipForExpertRequest(
      { existingTripId: "trip-bound", basics: {} },
      s.deps,
    );
    assert.equal(outcome.status, "sent");
    assert.deepEqual(s.mintCalls, []);
    assert.deepEqual(s.requestCalls, ["trip-bound"]);
  });
});

describe("S4 — a mint that yields no id is not a slip", () => {
  it("blocks and sends nothing when the server answers without an id", async () => {
    const s = spies({ ok: true, tripId: "unused" });
    const outcome = await ensureSlipForExpertRequest({ basics: GOOD }, {
      ...s.deps,
      mint: (basics) => mintTripSlip(basics, async () => ({}) as { id?: string }),
    });

    assert.equal(outcome.status, "blocked");
    assert.equal(outcome.status === "blocked" && outcome.reason, "mint_returned_no_id");
    assert.deepEqual(s.requestCalls, []);
  });

  it("surfaces a failed mint as a refusal, still with no request", async () => {
    const s = spies({ ok: true, tripId: "unused" });
    const outcome = await ensureSlipForExpertRequest({ basics: GOOD }, {
      ...s.deps,
      mint: (basics) =>
        mintTripSlip(basics, async () => {
          throw new Error("503: upstream down");
        }),
    });

    assert.equal(outcome.status, "blocked");
    assert.equal(outcome.status === "blocked" && outcome.reason, "mint_failed");
    assert.deepEqual(s.requestCalls, []);
  });

  it("a request failure leaves the slip intact and reports it", async () => {
    const s = spies({ ok: true, tripId: "trip-new" });
    const outcome = await ensureSlipForExpertRequest({ basics: GOOD }, {
      ...s.deps,
      sendRequest: async (tripId: string) => {
        s.requestCalls.push(tripId);
        throw new Error("network");
      },
    });

    assert.equal(outcome.status, "request_failed");
    assert.equal(outcome.status === "request_failed" && outcome.tripId, "trip-new");
    assert.equal(outcome.status === "request_failed" && outcome.minted, true);
  });
});

describe("S5/S6 — the other two ways the basics fall short", () => {
  it("refuses a missing or blank destination without touching the server", async () => {
    let posted = 0;
    for (const basics of [
      { startDate: "2026-10-01", endDate: "2026-10-08" },
      { destination: "   ", startDate: "2026-10-01", endDate: "2026-10-08" },
      { destination: null, startDate: "2026-10-01", endDate: "2026-10-08" },
    ] as SlipBasics[]) {
      const outcome = await mintTripSlip(basics, async () => {
        posted += 1;
        return { id: "x" };
      });
      assert.equal(outcome.ok, false);
      assert.equal(outcome.ok === false && outcome.reason, "destination_missing");
    }
    assert.equal(posted, 0);
  });

  it("refuses an inverted range and accepts a same-day one", async () => {
    assert.equal(
      checkSlipPrecondition({ ...GOOD, startDate: "2026-10-08", endDate: "2026-10-01" })?.reason,
      "dates_inverted",
    );
    assert.equal(
      checkSlipPrecondition({ ...GOOD, startDate: "2026-10-01", endDate: "2026-10-01" }),
      null,
    );
    assert.equal(checkSlipPrecondition(GOOD), null);
  });
});

describe("S7 — the mint body carries only what the traveler stated", () => {
  it("posts the stated destination and dates to the one mint door", async () => {
    const bodies: TripMintBody[] = [];
    const outcome = await mintTripSlip(GOOD, async (body) => {
      bodies.push(body);
      return { id: "trip-new" };
    });

    assert.equal(outcome.ok, true);
    assert.equal(bodies.length, 1);
    assert.deepEqual(bodies[0], {
      title: "Kyoto trip",
      destination: "Kyoto, Japan",
      startDate: "2026-10-01",
      endDate: "2026-10-08",
    });
    // Server-derived facts (Locked Decision 30) are never client-sent.
    assert.equal("timezone" in bodies[0], false);
    assert.equal("marketSlug" in bodies[0], false);
    // No money, no identity (§14/§19).
    for (const key of ["userId", "amount", "price", "rate"]) {
      assert.equal(key in bodies[0], false, `${key} must never ride the mint body`);
    }
    assert.equal(TRIP_MINT_ENDPOINT, "/api/trips");
  });

  it("keeps a traveler-authored title and derives one only when there is none", () => {
    assert.equal(buildTripMintBody({ ...GOOD, title: "Anniversary" }).title, "Anniversary");
    assert.equal(buildTripMintBody({ ...GOOD, title: "   " }).title, "Kyoto trip");
    assert.equal(buildTripMintBody(GOOD).title, "Kyoto trip");
  });
});

describe("S8 — an empty tripId is not a bound slip", () => {
  it("treats blank ids as no slip and mints instead of forwarding them", async () => {
    for (const blank of ["", "   ", null, undefined]) {
      assert.equal(hasBoundSlip(blank as any), false);
      const s = spies({ ok: true, tripId: "trip-new" });
      const outcome = await ensureSlipForExpertRequest(
        { existingTripId: blank as any, basics: GOOD },
        s.deps,
      );
      assert.equal(outcome.status, "sent");
      assert.deepEqual(s.requestCalls, ["trip-new"]);
    }
    assert.equal(hasBoundSlip("trip-1"), true);
  });
});
