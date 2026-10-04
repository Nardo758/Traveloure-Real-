/**
 * Surface step 1 — the pure rules under `DayBlock`, `ItemRow`'s ⋯ menu and `AnchorRow` (surface spec
 * v1.2 §3/§10; rulings R-l, R-r, R-aa; ledger `2026-10-03-surface-step1-item-row`).
 *   H1 day heading "<Wkd> · <Mon d>"; no date ⇒ "Day N"; an event-only undated slot ⇒ "Undated"
 *   H2 day stats "N stops · <areas> · hours on K"; absent areas / zero hours are omitted, never "0"
 *   M1 "Find a host" only on a GENERIC item whose type maps to a category, with that category preset
 *   M2 a named place, or a type with no hireable counterpart, gets no "Find a host"
 *   M3 the anchor's "from <tool>": Where to stay / Build my days around this / your booking / none
 *   M4 R-r: "Ask a local" reads the door's overview — any live local ⇒ the door
 *   A1 R-aa: the arrival/departure words, and a placeholder never claims "fixed"
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dayBlockHeading, dayBlockStats } from "../plan-day";
import { ASK_LOCAL_WORDS, FIND_A_HOST_CATEGORY, anchorFromTool, anyLocalLive, findHostHref } from "../item-row-menu";
import { anchorLabel, TRAVEL_ANCHOR_WORDS } from "../../components/plan/AnchorRow";
import { ITEM_MENU_LABELS } from "../../components/plan/ItemRow";

test("H1: the day heading", () => {
  assert.equal(dayBlockHeading({ dayNum: 1, dateIso: "2026-11-11" }), "Wed · Nov 11");
  assert.equal(dayBlockHeading({ dayNum: 3, dateIso: null }), "Day 3");
  assert.equal(dayBlockHeading({ dayNum: 3, date: "Nov 13", dateIso: "garbage" }), "Day 3 · Nov 13");
  assert.equal(dayBlockHeading({ dayNum: null, dateIso: null }), "Undated");
});

test("H2: the day stats", () => {
  // Smoke 10 S10-8: no ward names on a day header, any day.
  assert.equal(dayBlockStats({ stops: 5, hoursOn: 4 }), "5 stops · hours on 4");
  assert.equal(dayBlockStats({ stops: 1, hoursOn: 0 }), "1 stop");
  assert.equal(dayBlockStats({ stops: 0, hoursOn: 0 }), null);
});

test("M1: Find a host on a generic item, category preset", () => {
  const href = findHostHref({ name: "Dinner", type: "meal", locationName: null }, { city: "Kyoto, Japan", tripId: "t1" });
  assert.ok(href && href.startsWith("/services?"));
  const q = new URLSearchParams(href!.split("?")[1]);
  assert.equal(q.get("categoryKey"), FIND_A_HOST_CATEGORY.meal);
  assert.equal(q.get("tripId"), "t1");
});

test("M1b (step 5, R-w): the slip's MAPPED types get their preset — the bug the rule closed", () => {
  // The slip passes the plancard's mapped type: activity → attraction, meal → dining. Before the fix
  // only transport and stays offered "Find a host" on the slip.
  const q = (type: string) =>
    new URLSearchParams(findHostHref({ name: "Lunch", type, locationName: null }, { city: "Kyoto", tripId: "t1" })!.split("?")[1]);
  assert.equal(q("attraction").get("categoryKey"), "activity_provider");
  assert.equal(q("dining").get("categoryKey"), "dining_venue");
  assert.equal(q("transport").get("categoryKey"), "private_transportation");
});

test("M2 (step 5, R-w): no Find a host for a named place; ANY venue-less item gets one, whatever its type", () => {
  assert.equal(findHostHref({ name: "Kinkaku-ji visit", type: "activity", locationName: null }, { city: "Kyoto", tripId: "t1" }), null);
  const free = findHostHref({ name: "Free time", type: "free_time" }, { city: "Kyoto", tripId: "t1" });
  assert.ok(free && free.startsWith("/services?"));
  assert.equal(new URLSearchParams(free!.split("?")[1]).get("categoryKey"), null, "no invented preset — an unfiltered browse");
  assert.ok(findHostHref({ name: "Dinner", type: null }, { city: "Kyoto", tripId: "t1" }));
});

test("M3: where an anchor was fixed", () => {
  assert.equal(anchorFromTool({ isPrimaryAnchor: true, anchorSetCategory: "accommodation", purchasedAndOptimized: false }), "Where to stay");
  assert.equal(anchorFromTool({ isPrimaryAnchor: true, anchorSetCategory: null, purchasedAndOptimized: false }), "Build my days around this");
  assert.equal(anchorFromTool({ isPrimaryAnchor: false, anchorSetCategory: null, purchasedAndOptimized: true }), "your booking");
  assert.equal(anchorFromTool({ isPrimaryAnchor: false, anchorSetCategory: null, purchasedAndOptimized: false }), null);
  assert.equal(anchorLabel("Where to stay"), "Anchor · fixed · from Where to stay");
});

test("M4: Ask a local — a live local opens the door, none records the question", () => {
  assert.equal(anyLocalLive({ levels: [{ expertCount: 0 }, { expertCount: 2 }] }), true);
  assert.equal(anyLocalLive({ levels: [{ expertCount: 0 }] }), false);
  assert.equal(anyLocalLive(null), false);
  assert.match(ASK_LOCAL_WORDS.saved("Kyoto"), /Kyoto.*nothing was charged/);
  assert.doesNotMatch(ASK_LOCAL_WORDS.saved("Kyoto"), /notify|we'll tell you|email/i, "no promise of a notification nothing sends");
  // Step 6 R-ap: "Details" (the ItemSheet) leads the menu; the spec §3 order follows it.
  assert.deepEqual(Object.values(ITEM_MENU_LABELS).slice(0, 5), ["Details", "Swap", "Move up", "Move down", "Remove"]);
  assert.equal(ITEM_MENU_LABELS.askLocal, "Ask a local about this");
  assert.equal(ITEM_MENU_LABELS.findHost, "Find a host");
});

test("A1: the travel placeholders", () => {
  assert.equal(TRAVEL_ANCHOR_WORDS.arrival("Kyoto"), "Arrival in Kyoto");
  assert.equal(TRAVEL_ANCHOR_WORDS.departure("Kyoto"), "Departure from Kyoto");
  assert.equal(TRAVEL_ANCHOR_WORDS.addFlight, "Add your flight");
});
