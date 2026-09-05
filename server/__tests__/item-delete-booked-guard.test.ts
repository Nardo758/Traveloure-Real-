/**
 * A BOOKED ROW IS NEVER DELETABLE — the server's own refusal, and the one predicate behind it.
 * Ledger `2026-09-05-slip-own-your-plan` (review R14); CLAUDE.md Locked Decision 42 rows S2/D16,
 * §15 ("a booked row is money"), §18 rule 1.
 *
 * WHY THIS EXISTS. `DELETE /api/trips/:tripId/itinerary-items/:itemId` deleted any row its caller
 * was authorized to touch. `itinerary_items.booking_id` is the ONLY plan-side link to a real
 * `service_bookings` row, and NOTHING in this repo puts it back once the item is gone: the TTL
 * sweep, `promotePaidCheckout` and the drift job all key on the booking, and none of them can
 * re-create the plan row that made it visible to the traveler. So the destruction is silent,
 * total, and looks exactly like a successful delete.
 *
 * The machine side of this class was closed a year of lanes ago — `itineraryItemRebuildDeletable()`
 * spares those rows from a regenerate. The human side was not. This lane closes it with the SAME
 * notion, expressed for one row, because two predicates answering "is this row money?" is how one
 * rail ends up deleting what the other protects (§18 rule 1).
 *
 * THE RENDER RULE IS NOT THE GUARD. The slip hides its ✕ on such a row (that is D16's half, held
 * in `client/src/lib/__tests__/slip-own-your-plan.test.ts`), but a hidden button keeps nothing out
 * — a crafted request, the Workstation, or any future caller reaches the same handler. This suite
 * holds the half that actually refuses.
 *
 * What these hold:
 *   P1  the predicate — purchased, or a booking reference, in either spelling; and the two
 *       absences that are NOT commitments.
 *   P2  the relationship to the rebuild guard, in the direction that matters: everything this
 *       predicate calls money is ALSO spared by the machine wipe. (Not the converse — the rebuild
 *       set is deliberately wider, and P2 states why.)
 *   R1  the shipped refusal: a 409 with the shared `item_booked` body, on the trip-scoped DELETE,
 *       AFTER the row is read and BEFORE anything is deleted.
 *   R2  role-blind — the refusal is not inside an owner/advisor/author branch.
 *   R3  ONE author: no second copy of the predicate anywhere under `server/`.
 *   N1  NO NEW ROUTE. The item CRUD + reorder surface is exactly the five paths that existed
 *       before this lane; the slip's four controls are callers, not new rails.
 *
 * Pure + static source pins: no DB, no server, no network.
 * Run: npx tsx --test server/__tests__/item-delete-booked-guard.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ITEM_BOOKED_DELETE_ERROR,
  ITEM_MONEY_COMMITTED_STATUSES,
  itineraryItemIsMoneyCommitted,
  itineraryItemIsPaid,
} from "@shared/itinerary-item-money";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SERVER = join(ROOT, "server");
const tripsRoutesSrc = readFileSync(join(SERVER, "routes", "trips.routes.ts"), "utf8");
const guardSrc = readFileSync(join(SERVER, "services", "itinerary-rebuild-guard.ts"), "utf8");

/** Every .ts under server/, tests excluded. */
function serverFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "__tests__") continue;
      serverFiles(full, out);
    } else if (entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("P1 — is this row money?", () => {
  it("says yes to a purchased row", () => {
    assert.equal(itineraryItemIsMoneyCommitted({ routingStatus: "purchased", bookingId: null }), true);
    assert.equal(itineraryItemIsPaid({ routingStatus: "purchased", bookingId: null }), true);
  });

  it("says yes to a row carrying a booking WHATEVER its routing status reads", () => {
    // Belt-and-suspenders, exactly as the rebuild guard's booking clause is: a booked row whose
    // status has drifted is still booked.
    assert.equal(itineraryItemIsMoneyCommitted({ routingStatus: "in_planning", bookingId: "bk_1" }), true);
    assert.equal(itineraryItemIsMoneyCommitted({ routingStatus: null, bookingId: "bk_1" }), true);
    // …but such a row is not PAID, which is why it keeps reorder and edit on the slip.
    assert.equal(itineraryItemIsPaid({ routingStatus: "in_planning", bookingId: "bk_1" }), false);
  });

  it("says no to a plain planning row, a staged-for-checkout row, and an unknown status", () => {
    assert.equal(itineraryItemIsMoneyCommitted({ routingStatus: "in_planning", bookingId: null }), false);
    assert.equal(itineraryItemIsMoneyCommitted({ routingStatus: "ready_for_checkout", bookingId: null }), false);
    assert.equal(itineraryItemIsMoneyCommitted({ routingStatus: "with_expert", bookingId: null }), false);
    assert.equal(itineraryItemIsMoneyCommitted({ routingStatus: "something_new", bookingId: null }), false);
  });

  it("treats an absent row and absent columns as no commitment, and never throws", () => {
    assert.equal(itineraryItemIsMoneyCommitted(null), false);
    assert.equal(itineraryItemIsMoneyCommitted(undefined), false);
    assert.equal(itineraryItemIsMoneyCommitted({}), false);
  });

  it("keeps ONE spelling of the paid status", () => {
    assert.deepEqual([...ITEM_MONEY_COMMITTED_STATUSES], ["purchased"]);
  });
});

describe("P2 — the two rails can never disagree", () => {
  it("has every money-committed status ALSO spared by the rebuild delete", () => {
    const declared = guardSrc.match(/REBUILD_PROTECTED_STATUSES = \[([^\]]+)\]/);
    assert.ok(declared, "the rebuild guard must still declare its protected statuses");
    const rebuild = declared![1].split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
    for (const status of ITEM_MONEY_COMMITTED_STATUSES) {
      assert.ok(
        rebuild.includes(status),
        `${status} is refused a delete but not spared a rebuild — one rail would destroy what the other protects`,
      );
    }
    // The converse is deliberately NOT asserted: `ready_for_checkout` is spared a MACHINE wipe and
    // is still the traveler's to remove from their own checkout queue. Refusing that as
    // "item_booked" would be a false statement about their plan (§13).
    assert.ok(rebuild.includes("ready_for_checkout"));
  });

  it("re-exports the row-level answer from the guard module, so the two are read together", () => {
    assert.match(guardSrc, /itineraryItemIsMoneyCommitted/);
    assert.match(guardSrc, /@shared\/itinerary-item-money/);
  });
});

describe("R1 — the shipped refusal", () => {
  // The handler's own text: from its registration to the next route registration in the file.
  const start = tripsRoutesSrc.indexOf('router.delete("/api/trips/:tripId/itinerary-items/:itemId"');
  const rest = tripsRoutesSrc.slice(start);
  const next = rest.slice(1).search(/\nrouter\.(get|post|patch|put|delete)\(/);
  const body = next >= 0 ? rest.slice(0, next + 1) : rest;

  it("409s with the SHARED error body, not a re-typed sentence", () => {
    assert.match(body, /res\.status\(409\)\.json\(ITEM_BOOKED_DELETE_ERROR\)/);
    assert.equal(ITEM_BOOKED_DELETE_ERROR.code, "item_booked");
    assert.ok(ITEM_BOOKED_DELETE_ERROR.message.length > 0);
  });

  it("reads the row FIRST and refuses BEFORE anything is deleted", () => {
    const read = body.indexOf("storage.getItineraryItemByIdAndTrip");
    const refuse = body.indexOf("itineraryItemIsMoneyCommitted(existing)");
    const del = body.indexOf("storage.deleteItineraryItem");
    assert.ok(read >= 0 && refuse >= 0 && del >= 0);
    assert.ok(read < refuse, "the refusal must read the real row, never the request");
    assert.ok(refuse < del, "the refusal must come before the delete, not after it");
  });

  it("R2 — is role-blind: no owner/advisor/author condition guards it", () => {
    const line = body.split("\n").find((l) => l.includes("itineraryItemIsMoneyCommitted(existing)"))!;
    assert.match(line, /^\s*if \(itineraryItemIsMoneyCommitted\(existing\)\) \{\s*$/);
    assert.doesNotMatch(line, /tripRole|isOwner|owned|authorMayMutate|isAdvisor/);
  });
});

describe("R3 — one author", () => {
  it("has no second copy of the predicate under server/", () => {
    const offenders: string[] = [];
    for (const file of serverFiles(SERVER)) {
      const text = readFileSync(file, "utf8");
      // A hand-rolled "is this row booked?" test: a purchased-status comparison ANDed or ORed with
      // a booking-id null check, anywhere other than the shared module's own consumers.
      if (/routingStatus\s*===\s*"purchased"[\s\S]{0,80}bookingId/.test(text)) {
        offenders.push(file.slice(ROOT.length + 1));
      }
    }
    assert.deepEqual(offenders, [], `re-derived money predicate(s): ${offenders.join(", ")}`);
  });
});

describe("N1 — no new route", () => {
  it("keeps the item CRUD + reorder surface at exactly the five paths that already existed", () => {
    const found = new Set<string>();
    for (const file of serverFiles(SERVER)) {
      const text = readFileSync(file, "utf8");
      for (const line of text.split("\n")) {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue; // an annotated dead twin is prose, not a route
        const m = line.match(/(?:app|router)\.(get|post|patch|put|delete)\("(\/api\/trips\/:tripId\/itinerary(?:-items[^"]*|\/reorder))"/);
        if (m) found.add(`${m[1].toUpperCase()} ${m[2]}`);
      }
    }
    assert.deepEqual(
      [...found].sort(),
      [
        "DELETE /api/trips/:tripId/itinerary-items/:itemId",
        "GET /api/trips/:tripId/itinerary-items",
        "PATCH /api/trips/:tripId/itinerary-items/:itemId",
        "POST /api/trips/:tripId/itinerary-items",
        "POST /api/trips/:tripId/itinerary/reorder",
      ],
      "this lane adds CALLERS of the existing rails, never a new one",
    );
  });
});
