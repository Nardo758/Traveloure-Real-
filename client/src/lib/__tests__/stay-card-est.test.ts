/**
 * Ledger `2026-10-18-stay-pick-est-fallback`: a paid plan's straight-line fallback is marked "est." on the card; the
 * free plan keeps its own wording; a stored pick without `router` is never shown.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STAY_PICK_SUBTITLE,
  STAY_STRAIGHT_LINE_EST_SUBTITLE,
  STAY_STRAIGHT_LINE_SUBTITLE,
  stayCardModel,
  stayCardSubtitle,
} from "../stay-card";
import { readStayPick, stayPickIsShown } from "@shared/stay-pick";

const hotel = { kind: "hotel_cache", id: "h1", name: "Hotel One" } as any;

test("SE1 the paid fallback is marked est.; the free list keeps its wording; the pick keeps its own", () => {
  const paid = stayCardModel({ tier: "straight_line", estimated: true, hotels: [hotel] });
  assert.ok(paid);
  assert.equal(stayCardSubtitle(paid), STAY_STRAIGHT_LINE_EST_SUBTITLE);
  assert.match(STAY_STRAIGHT_LINE_EST_SUBTITLE, /\best\.\B/);
  const free = stayCardModel({ tier: "straight_line", hotels: [hotel] });
  assert.equal(stayCardSubtitle(free!), STAY_STRAIGHT_LINE_SUBTITLE);
  const routed = stayCardModel({ tier: "routed", pick: hotel, scoredCount: 1, candidateCount: 1, changed: false, computedAt: null });
  assert.equal(stayCardSubtitle(routed!), STAY_PICK_SUBTITLE);
});

test("SE2 only an OSRM-ranked pick is shown", () => {
  const base = { hotelId: "h1", hotelKind: "hotel_cache", scoredCount: 1, candidateCount: 1, stopsHash: "1-x", computedAt: "2026-10-01T00:00:00Z", tier: "routed", changed: false };
  assert.equal(stayPickIsShown(readStayPick(base)), false, "no router = Google-ranked");
  assert.equal(stayPickIsShown(readStayPick({ ...base, router: "google" })), false);
  assert.equal(stayPickIsShown(readStayPick({ ...base, router: "osrm" })), true);
  assert.equal(stayPickIsShown(null), false);
});
