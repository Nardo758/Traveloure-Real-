/**
 * A BOOKED STOP DOES NOT CHANGE DAY (Leon, Nov 20, 2026) - the server's refusal behind the Move sheet.
 *
 *   P1  the predicate: money-committed AND a different day; never an update that names no day or the same day
 *   P2  the refusal's body is the Move sheet's approved sentence, under the delete refusal's code
 *   R1  the item update refuses with it after the row is read, before any write or filed suggestion, role-blind
 *   R2  the reorder route cannot move a stop between days at all (it takes only the day's own stops)
 *
 * The refusal over HTTP is held in `mutation-auth/mutation-auth.http.test.ts`. Pure + static pins: no DB.
 * Run: npx tsx --test server/__tests__/item-move-booked-guard.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ITEM_BOOKED_DELETE_ERROR, ITEM_BOOKED_MOVE_ERROR, bookedItemDayMoveRefused } from "@shared/itinerary-item-money";
import { reorderRefused } from "@shared/itinerary-reorder";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const routes = readFileSync(join(ROOT, "server", "routes", "trips.routes.ts"), "utf8");
const booked = { bookingId: "bk_1", routingStatus: "in_planning", dayNumber: 2 };
const paid = { bookingId: null, routingStatus: "purchased", dayNumber: 2 };
const free = { bookingId: null, routingStatus: "in_planning", dayNumber: 2 };

describe("P1 - the predicate", () => {
  it("refuses a booked or paid stop a different day", () => {
    assert.equal(bookedItemDayMoveRefused(booked, 3), true);
    assert.equal(bookedItemDayMoveRefused(booked, "1"), true);
    assert.equal(bookedItemDayMoveRefused(paid, 3), true);
    assert.equal(bookedItemDayMoveRefused(booked, null), true, "off every day is a move too");
  });

  it("never refuses an update that names no day, or the day the stop is on", () => {
    assert.equal(bookedItemDayMoveRefused(booked, undefined), false);
    assert.equal(bookedItemDayMoveRefused(booked, 2), false);
    assert.equal(bookedItemDayMoveRefused(booked, "2"), false);
  });

  it("never refuses a stop with no booking and no payment", () => {
    assert.equal(bookedItemDayMoveRefused(free, 3), false);
    assert.equal(bookedItemDayMoveRefused(null, 3), false);
  });
});

describe("P2 - the refusal's body", () => {
  it("is the Move sheet's approved sentence under the delete refusal's code", () => {
    assert.equal(ITEM_BOOKED_MOVE_ERROR.message, "This stop is booked. Change the booking to move it.");
    assert.equal(ITEM_BOOKED_MOVE_ERROR.code, ITEM_BOOKED_DELETE_ERROR.code);
    const sheet = readFileSync(join(ROOT, "shared", "itinerary-item-money.ts"), "utf8");
    assert.equal(sheet.split(ITEM_BOOKED_MOVE_ERROR.message).length - 1, 1, "one author of the sentence on the server side");
  });
});

describe("R1 - the item update refuses", () => {
  const start = routes.indexOf('router.patch("/api/trips/:tripId/itinerary-items/:itemId"');
  const handler = routes.slice(start, routes.indexOf('router.delete("/api/trips/:tripId/itinerary-items/:itemId"'));

  it("with a 409 after the row is read and before any write or filed suggestion", () => {
    assert.ok(start > 0 && handler.length > 0, "the item update handler is present");
    const read = handler.indexOf("storage.getItineraryItemByIdAndTrip(itemId, tripId)");
    const guard = handler.indexOf("bookedItemDayMoveRefused(existing, (req.body as any)?.dayNumber)");
    assert.ok(read > 0 && guard > read, "the guard reads the stored row");
    assert.match(handler.slice(guard, guard + 200), /return res\.status\(409\)\.json\(ITEM_BOOKED_MOVE_ERROR\);/);
    for (const write of ["storage.updateItineraryItem(", "fileExpertSuggestion("]) {
      const at = handler.indexOf(write);
      assert.ok(at === -1 || at > guard, `${write} comes after the guard`);
    }
  });

  it("role-blind: the guard sits outside every owner/advisor/author branch", () => {
    const guard = handler.indexOf("bookedItemDayMoveRefused(");
    const line = handler.slice(handler.lastIndexOf("\n", guard) + 1, guard);
    assert.equal(line, "      if (", "top-level statement of the handler's try block");
  });
});

describe("R2 - reorder cannot move a stop between days", () => {
  it("a stop that is not on the day sent is refused, booked or not", () => {
    assert.equal(reorderRefused({ dayNumber: 1, itemIds: ["a", "booked-on-day-2"], dayItemIds: ["a", "b"] }), true);
  });
});
