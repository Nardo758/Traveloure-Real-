/**
 * Round 2 ruling (Nov 4, 2026; ledger `2026-11-04-round2-exp-qa`): the upcoming events list includes an event that
 * ends today or later in its own market, orders the marquee market's events first, then by start, and the limit is
 * applied after that order (`orderUpcomingCards`, pure).
 *
 * Run: npx tsx --test server/__tests__/round2-upcoming-order.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { orderUpcomingCards } from "../services/city-events.service";

const now = new Date("2026-11-04T03:00:00Z"); // 12:00 in Kyoto, Nov 4

test("U1 ends today or later; marquee first; start order kept within each part", () => {
  const cards = [
    { id: "porto-a", marketKey: "porto", firstDate: "2026-11-05", lastDate: "2026-11-05" },
    { id: "kyoto-over", marketKey: "kyoto", firstDate: "2026-11-01", lastDate: "2026-11-03" },
    { id: "kyoto-underway", marketKey: "kyoto", firstDate: "2026-11-01", lastDate: "2026-11-04" },
    { id: "goa-b", marketKey: "goa", firstDate: "2026-11-06", lastDate: "2026-11-06" },
    { id: "kyoto-later", marketKey: "kyoto", firstDate: "2027-04-09", lastDate: "2027-04-11" },
  ];
  const out = orderUpcomingCards(cards, "kyoto", now).map((c) => c.id);
  assert.deepEqual(out, ["kyoto-underway", "kyoto-later", "porto-a", "goa-b"]);
});

test("U2 no marquee ⇒ start order only", () => {
  const out = orderUpcomingCards(
    [
      { id: "a", marketKey: "porto", firstDate: "2026-11-05", lastDate: "2026-11-05" },
      { id: "b", marketKey: "kyoto", firstDate: "2026-11-06", lastDate: "2026-11-06" },
    ],
    null,
    now,
  ).map((c) => c.id);
  assert.deepEqual(out, ["a", "b"]);
});
