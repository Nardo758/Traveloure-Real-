/**
 * A1 — THE TRIPS FRAME (ledger `2026-09-29-a1-trips-frame`; product map §B2, §M7; R127, R132).
 *   G1–G4  experienceGroupFor: the §B2 rule in order, R132's coarse fallback, and NULL ⇒ plain plan
 *   Q1–Q3  tripsAnchorFor / tripsAnchorQuestion: M7's schedule switch and its stated fallback
 *   S1–S4  tripsAnchorState / tripsAnchorLine: none, open (A3 feeds it), chosen — from real columns
 *   R1–R2  resolveOccasionForPlan: the plan's recorded slug resolves a `travel` plan; unknown slug falls through
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  experienceGroupFor,
  tripsAnchorFor,
  tripsAnchorLine,
  tripsAnchorQuestion,
  tripsAnchorState,
} from "../experience-group";
import { resolveOccasionForPlan } from "../occasions";

const row = (o: Record<string, unknown>) => ({ defaultStops: "many", ...o }) as any;
const travel = row({ slug: "travel", name: "Travel", defaultDuration: "range", defaultGuests: false, defaultSchedule: false });
const golf = row({ slug: "golf-trip", name: "Golf trip", defaultDuration: "range", defaultGuests: false, defaultSchedule: true });
const sports = row({ slug: "sports-event", name: "Sports Event", defaultDuration: "range", defaultGuests: false, defaultSchedule: true });

test("G1: the §B2 rule, in order", () => {
  assert.equal(experienceGroupFor(row({ defaultDuration: "day", defaultGuests: false })), "moments");
  assert.equal(experienceGroupFor(row({ defaultDuration: "day", defaultGuests: true })), "celebrations");
  assert.equal(experienceGroupFor(travel), "trips");
  assert.equal(experienceGroupFor(golf), "trips");
  assert.equal(experienceGroupFor(row({ defaultDuration: "range", defaultGuests: true, rolesNeeded: ["venue", "caterer"] })), "hosted_events");
  assert.equal(experienceGroupFor(row({ defaultDuration: "range", defaultGuests: true, rolesNeeded: ["accommodation"] })), "group_travel");
});

test("G2: any of the three switches NULL ⇒ plain plan (LD 28 fallback)", () => {
  assert.equal(experienceGroupFor(row({ defaultDuration: null, defaultGuests: false })), "plain_plan");
  assert.equal(experienceGroupFor(row({ defaultDuration: "range", defaultGuests: null })), "plain_plan");
  assert.equal(experienceGroupFor(row({ defaultDuration: "range", defaultGuests: false, defaultStops: null })), "plain_plan");
});

test("G3: R132 — no row, a coarse type only one group can mean still names the group", () => {
  assert.equal(experienceGroupFor(null, "vacation"), "trips");
  assert.equal(experienceGroupFor(null, "birthday"), "celebrations");
  assert.equal(experienceGroupFor(null, "corporate"), "plain_plan");
  assert.equal(experienceGroupFor(null, "other"), "plain_plan");
  assert.equal(experienceGroupFor(null, null), "plain_plan");
});

test("G4: a group name is an internal key, never display text (R127) — no key is title-cased", () => {
  for (const g of [experienceGroupFor(travel), experienceGroupFor(null, "birthday")]) assert.match(g, /^[a-z_]+$/);
});

test("Q1: M7 — schedule false ⇒ lodging first; the question is 'Where are you staying?'", () => {
  const a = tripsAnchorFor(travel);
  assert.deepEqual(a, { kind: "lodging", fromFallback: false });
  assert.equal(tripsAnchorQuestion(a).question, "Where are you staying?");
});

test("Q2: M7 — schedule true (golf-trip, sports-event) ⇒ the fixed dated item first", () => {
  for (const r of [golf, sports]) {
    const a = tripsAnchorFor(r);
    assert.deepEqual(a, { kind: "fixed_item", fromFallback: false });
    assert.equal(tripsAnchorQuestion(a).question, "What's fixed on these dates?");
  }
});

test("Q3: schedule NULL or no row ⇒ lodging, and says it was a fallback (§13)", () => {
  assert.deepEqual(tripsAnchorFor(row({ defaultSchedule: null })), { kind: "lodging", fromFallback: true });
  assert.deepEqual(tripsAnchorFor(null), { kind: "lodging", fromFallback: true });
});

test("S1: nothing on the plan ⇒ none, stated as not chosen yet", () => {
  const a = tripsAnchorFor(travel);
  const s = tripsAnchorState({ anchor: a, items: [{ type: "activity", name: "Fushimi Inari" }], events: [] });
  assert.deepEqual(s, { state: "none" });
  assert.equal(tripsAnchorLine(a, s), "Where you'll stay: not chosen yet");
});

test("S2: an accommodation item is the chosen stay (item_type column, never a name match)", () => {
  const a = tripsAnchorFor(travel);
  const s = tripsAnchorState({ anchor: a, items: [{ type: "accommodation", name: "Ryokan B" }, { type: "activity", name: "Hotel-ish tour" }] });
  assert.deepEqual(s, { state: "chosen", label: "Ryokan B", count: 1 });
  assert.equal(tripsAnchorLine(a, s), "Staying at Ryokan B");
  assert.deepEqual(tripsAnchorState({ anchor: a, items: [{ type: "activity", name: "Hotel Okura dinner" }] }), { state: "none" });
});

test("S3: fixed item — only DATED events count; an undated one is not a fixed point", () => {
  const a = tripsAnchorFor(golf);
  assert.deepEqual(tripsAnchorState({ anchor: a, events: [{ title: "Round 1", eventDate: null }] }), { state: "none" });
  const s = tripsAnchorState({ anchor: a, events: [{ title: "Round 1", eventDate: "2026-11-12" }, { title: "Round 2", eventDate: "2026-11-13" }] });
  assert.deepEqual(s, { state: "chosen", label: "Round 1", count: 2 });
  assert.equal(tripsAnchorLine(a, s), "Built around Round 1 + 1 more");
  assert.equal(tripsAnchorLine(a, { state: "none" }), "Built around: nothing fixed yet");
});

test("S4: an open set (A3) reads as N to compare; a choice outranks it", () => {
  const a = tripsAnchorFor(travel);
  const s = tripsAnchorState({ anchor: a, items: [], openSetSize: 3 });
  assert.deepEqual(s, { state: "open", count: 3 });
  assert.equal(tripsAnchorLine(a, s), "Where you'll stay: 3 to compare");
});

test("R1: the recorded slug resolves a `travel` plan that its coarse type alone cannot", () => {
  const occasions = [
    { id: "1", slug: "travel" },
    { id: "2", slug: "romance" },
    { id: "3", slug: "golf-trip" },
  ];
  assert.equal(resolveOccasionForPlan({ eventType: "vacation", occasions }), null);
  assert.equal(resolveOccasionForPlan({ eventType: "vacation", penSlug: "travel", occasions })?.slug, "travel");
  // Events still come first (exact by id).
  assert.equal(resolveOccasionForPlan({ events: [{ experienceTypeId: "3" }], penSlug: "travel", occasions })?.slug, "golf-trip");
});

test("R2: a recorded slug the catalog does not carry resolves nothing and falls through", () => {
  const occasions = [{ id: "9", slug: "wedding" }];
  assert.equal(resolveOccasionForPlan({ eventType: "wedding", penSlug: "retired-slug", occasions })?.slug, "wedding");
  assert.equal(resolveOccasionForPlan({ penSlug: "retired-slug", occasions }), null);
});
