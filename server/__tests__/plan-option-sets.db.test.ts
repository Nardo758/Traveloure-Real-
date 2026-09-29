/**
 * A3 — plan option sets against a real database (ledger `2026-09-29-a3-option-sets`; product map
 * §E2/§E3, R124–R126, R129; §M7/§M8).
 *
 *   O1  a set on an item holds the incumbent at position 1; two more fill it; a 4th is 409 set_full;
 *       a second open set on the same item is 409 set_already_open
 *   O2  a custom candidate: a half pin is 400; no pin is stored with NULL precision (never guessed)
 *   O3  R129: a WRITE advisor may add but never choose (404); a PENDING advisor may not add; a
 *       stranger reads nothing
 *   O4  choose is atomic: two concurrent chooses ⇒ exactly one wins, the other is 409; the incumbent
 *       item is rewritten in place with the chosen place's facts
 *   O5  an empty slot: choose writes ONE item (origin traveler, day 1, accommodation) and links it
 *   O6  R125/§E3: an open set is listed as open and blocks its item's routing; closed ⇒ neither
 *   O7  the incumbent cannot be removed; a candidate can
 *   O8  M7: the first lodging anchor is primary, a second is secondary (one primary per stop)
 *   O9  M8: promote needs a located, dated item; it demotes the previous primary; a finalized plan is 409
 *   O10 the finalize and routing rails carry the open-set guards before their writes
 *   O11 (A3b) M9 suggest: too few located stops ⇒ 409; enough ⇒ ONE open set of `engine` options,
 *       ranked by plan-fit only, the nearest first; a second suggest on a non-empty set ⇒ 409
 *   O12 (A3b) the list carries each option's server-derived plan-fit ("est." here — no matrix)
 *   O13 (A3b) reopen: owner only; choosing the incumbent back rewrites the item to the original place
 *
 * DISPOSABLE DB ONLY: every row is keyed by a per-run prefix and deleted afterwards.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { storage } from "../storage";
import {
  OptionSetError,
  addOption,
  listOptionSetsWithFit,
  reopenOptionSet,
  suggestLodging,
  chooseOption,
  closeOptionSet,
  createOptionSet,
  itemHasOpenSet,
  listOptionSets,
  openOptionSets,
  planRole,
  promoteAnchor,
  removeOption,
} from "../services/plan-option-sets.service";
import { OPTION_SET_CAP } from "@shared/plan-options";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `a3-${RUN}-${s}`;
const ids = {
  owner: id("owner"),
  advisor: id("advisor"),
  pending: id("pending"),
  stranger: id("stranger"),
  trip: id("trip"),
  item: id("item"),
  item2: id("item2"),
  unlocated: id("unlocated"),
  h1: id("h1"),
  h2: id("h2"),
  h3: id("h3"),
};

async function expectError(p: Promise<unknown>, status: number, code?: string) {
  await assert.rejects(p, (err: any) => {
    assert.ok(err instanceof OptionSetError, `expected OptionSetError, got ${err}`);
    assert.equal(err.status, status);
    if (code) assert.equal(err.code, code);
    return true;
  });
}

before(async () => {
  for (const [uid, role] of [
    [ids.owner, "traveler"],
    [ids.advisor, "local_expert"],
    [ids.pending, "local_expert"],
    [ids.stranger, "traveler"],
  ] as const) {
    await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${uid}, ${`${uid}@t.test`}, 'A3', ${role}, ${role})`);
  }
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status)
    VALUES (${ids.trip}, ${ids.owner}, ${`A3 plan ${RUN}`}, 'Kyoto, Japan', '2027-05-01', '2027-05-06', 'draft')
  `);
  await db.execute(sql`
    INSERT INTO itinerary_items (id, trip_id, day_number, title, item_type, origin, latitude, longitude)
    VALUES (${ids.item}, ${ids.trip}, 1, 'Incumbent inn', 'accommodation', 'traveler', 35.0037, 135.7788),
           (${ids.item2}, ${ids.trip}, 2, 'Tee time', 'activity', 'traveler', 35.0100, 135.7000),
           (${ids.unlocated}, ${ids.trip}, 3, 'Somewhere', 'activity', 'traveler', NULL, NULL)
  `);
  for (const [hid, name, lat, lng] of [
    [ids.h1, "Gion Hotel", 35.0040, 135.7790],
    [ids.h2, "Station Hotel", 34.9858, 135.7588],
    [ids.h3, "River Hotel", 35.0094, 135.6669],
  ] as const) {
    await db.execute(sql`
      INSERT INTO hotel_cache (id, hotel_id, city_code, name, city, latitude, longitude, expires_at)
      VALUES (${hid}, ${hid}, 'KYO', ${name}, 'Kyoto', ${lat}, ${lng}, now() + interval '1 day')
    `);
  }
  const adv = await storage.createTripExpertAdvisor({ tripId: ids.trip, localExpertId: ids.advisor, message: "A3 fixture" } as any);
  await db.execute(sql`UPDATE trip_expert_advisors SET status = 'accepted' WHERE id = ${(adv as any).id}`);
  await storage.createTripExpertAdvisor({ tripId: ids.trip, localExpertId: ids.pending, message: "A3 fixture" } as any);
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM funnel_events WHERE trip_id = ${ids.trip}`);
    await db.execute(sql`DELETE FROM plan_option_sets WHERE trip_id = ${ids.trip}`);
    await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${ids.trip}`);
    await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id = ${ids.trip}`);
    await db.execute(sql`DELETE FROM trip_collaborators WHERE trip_id = ${ids.trip}`);
    await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`);
    await db.execute(sql`DELETE FROM hotel_cache WHERE id LIKE ${`a3-${RUN}-%`}`);
    await db.execute(sql`DELETE FROM users WHERE id LIKE ${`a3-${RUN}-%`}`);
  } finally {
    await pool.end();
  }
});

let itemSetId = "";

test("O1: incumbent at 1, two candidates fill the set, a fourth is 409 set_full", async () => {
  const set = await createOptionSet({ tripId: ids.trip, userId: ids.owner, itineraryItemId: ids.item, categoryKey: "accommodation" });
  itemSetId = set.id;
  assert.equal(set.options.length, 1);
  assert.equal(set.options[0].position, 1);
  assert.equal(set.options[0].sourceKind, "incumbent");
  assert.equal(set.dayNumber, 1, "the set takes the item's day");

  const a = await addOption({ tripId: ids.trip, setId: set.id, userId: ids.owner, source: { kind: "hotel_cache", hotelCacheId: ids.h1 } });
  const b = await addOption({ tripId: ids.trip, setId: set.id, userId: ids.owner, source: { kind: "hotel_cache", hotelCacheId: ids.h2 } });
  assert.deepEqual([a.position, b.position], [2, 3]);
  assert.equal(a.title, "Gion Hotel", "the title is copied from the source row (§14)");
  assert.equal(a.locationPrecision, "exact");
  assert.equal(a.priceSnapshot, null, "hotel_cache states no price, so none is recorded");

  await expectError(
    addOption({ tripId: ids.trip, setId: set.id, userId: ids.owner, source: { kind: "hotel_cache", hotelCacheId: ids.h3 } }),
    409,
    "set_full",
  );
  const [row] = await listOptionSets(ids.trip);
  assert.equal(row.options.length, OPTION_SET_CAP);
  await expectError(
    createOptionSet({ tripId: ids.trip, userId: ids.owner, itineraryItemId: ids.item }),
    409,
    "set_already_open",
  );
});

test("O2: a half pin is refused; no pin is NULL precision, never a guessed point", async () => {
  const set = await createOptionSet({ tripId: ids.trip, userId: ids.owner, dayNumber: 2, label: "Dinner" });
  await expectError(
    addOption({ tripId: ids.trip, setId: set.id, userId: ids.owner, source: { kind: "custom", title: "Half", lat: 35 } }),
    400,
    "half_pin",
  );
  const bare = await addOption({ tripId: ids.trip, setId: set.id, userId: ids.owner, source: { kind: "custom", title: "Named only" } });
  assert.equal(bare.locationPrecision, null);
  assert.equal(bare.latitude, null);
  const pinned = await addOption({ tripId: ids.trip, setId: set.id, userId: ids.owner, source: { kind: "custom", title: "Pinned", lat: 35.01, lng: 135.77 } });
  assert.equal(pinned.locationPrecision, "exact", "a stated pin is the traveler's own exact point");
  await closeOptionSet({ tripId: ids.trip, setId: set.id, userId: ids.owner });
});

test("O3: R129 — a write advisor adds but never chooses; pending may not add; a stranger reads nothing", async () => {
  const set = await createOptionSet({ tripId: ids.trip, userId: ids.owner, dayNumber: 3, label: "Lunch" });
  const opt = await addOption({ tripId: ids.trip, setId: set.id, userId: ids.advisor, source: { kind: "custom", title: "Expert pick" } });
  assert.equal(opt.addedByRole, "expert");
  await expectError(chooseOption({ tripId: ids.trip, setId: set.id, optionId: opt.id, userId: ids.advisor }), 404);
  await expectError(
    addOption({ tripId: ids.trip, setId: set.id, userId: ids.pending, source: { kind: "custom", title: "Pending pick" } }),
    404,
  );
  assert.equal(await planRole(ids.trip, ids.pending, "read"), "advisor", "a pending advisor still reads (§12)");
  assert.equal(await planRole(ids.trip, ids.stranger, "read"), null);
  await closeOptionSet({ tripId: ids.trip, setId: set.id, userId: ids.owner });
});

test("O6: an open set is open and blocks its item's routing; closing lifts both", async () => {
  assert.ok((await openOptionSets(ids.trip)).some((s) => s.id === itemSetId));
  assert.equal(await itemHasOpenSet(ids.item), true);
});

test("O7: the incumbent cannot be removed; a candidate can", async () => {
  const [row] = (await listOptionSets(ids.trip)).filter((s) => s.id === itemSetId);
  const incumbent = row.options.find((o) => o.sourceKind === "incumbent")!;
  const candidate = row.options.find((o) => o.position === 3)!;
  await expectError(removeOption({ tripId: ids.trip, setId: itemSetId, optionId: incumbent.id, userId: ids.owner }), 409, "incumbent");
  await removeOption({ tripId: ids.trip, setId: itemSetId, optionId: candidate.id, userId: ids.owner });
  const again = await addOption({ tripId: ids.trip, setId: itemSetId, userId: ids.owner, source: { kind: "hotel_cache", hotelCacheId: ids.h3 } });
  assert.equal(again.position, 3, "a freed position is reused");
});

test("O4: choose is atomic — two concurrent chooses, one winner, the incumbent rewritten in place", async () => {
  const [row] = (await listOptionSets(ids.trip)).filter((s) => s.id === itemSetId);
  const pick = row.options.find((o) => o.position === 2)!;
  const other = row.options.find((o) => o.position === 3)!;
  const results = await Promise.allSettled([
    chooseOption({ tripId: ids.trip, setId: itemSetId, optionId: pick.id, userId: ids.owner }),
    chooseOption({ tripId: ids.trip, setId: itemSetId, optionId: other.id, userId: ids.owner }),
  ]);
  const won = results.filter((r) => r.status === "fulfilled");
  const lost = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  assert.equal(won.length, 1);
  assert.equal(lost.length, 1);
  assert.equal((lost[0].reason as OptionSetError).status, 409);
  const winner = (won[0] as PromiseFulfilledResult<{ itemId: string }>).value;
  assert.equal(winner.itemId, ids.item, "the incumbent item is rewritten, not duplicated");
  const [set] = (await listOptionSets(ids.trip)).filter((s) => s.id === itemSetId);
  const chosen = set.options.find((o) => o.id === set.chosenOptionId)!;
  const item = await storage.getItineraryItemByIdAndTrip(ids.item, ids.trip);
  assert.equal(item?.title, chosen.title);
  assert.equal(String(item?.latitude), String(chosen.latitude));
  assert.equal(set.status, "chosen");
  assert.equal(await itemHasOpenSet(ids.item), false);
  assert.ok(!(await openOptionSets(ids.trip)).some((s) => s.id === itemSetId));
});

test("O5: choosing into an empty slot writes ONE traveler item and links it", async () => {
  const before = Number(((await db.execute(sql`SELECT count(*)::int AS n FROM itinerary_items WHERE trip_id = ${ids.trip}`)).rows[0] as any).n);
  const set = await createOptionSet({ tripId: ids.trip, userId: ids.owner, categoryKey: "accommodation", label: "Second stay" });
  const opt = await addOption({ tripId: ids.trip, setId: set.id, userId: ids.owner, source: { kind: "hotel_cache", hotelCacheId: ids.h2 } });
  const out = await chooseOption({ tripId: ids.trip, setId: set.id, optionId: opt.id, userId: ids.owner });
  const after = Number(((await db.execute(sql`SELECT count(*)::int AS n FROM itinerary_items WHERE trip_id = ${ids.trip}`)).rows[0] as any).n);
  assert.equal(after, before + 1);
  const item = await storage.getItineraryItemByIdAndTrip(out.itemId, ids.trip);
  assert.equal(item?.title, "Station Hotel");
  assert.equal(item?.dayNumber, 1);
  assert.equal(item?.itemType, "accommodation");
  assert.equal((item as any)?.origin, "traveler");
  assert.equal(out.set.itineraryItemId, out.itemId);
});

test("O8: M7 — the first lodging anchor is primary, the next is secondary", async () => {
  const first = await createOptionSet({ tripId: ids.trip, userId: ids.owner, categoryKey: "accommodation", anchor: true });
  const second = await createOptionSet({ tripId: ids.trip, userId: ids.owner, categoryKey: "accommodation", anchor: true });
  assert.equal(first.anchorRole, "primary", "no recorded occasion ⇒ the plain-trip shape, lodging-first");
  assert.equal(second.anchorRole, "secondary", "one primary per stop");
  await closeOptionSet({ tripId: ids.trip, setId: first.id, userId: ids.owner });
  await closeOptionSet({ tripId: ids.trip, setId: second.id, userId: ids.owner });
});

test("O9: M8 — promote needs a located dated item, demotes the old primary, refuses a finalized plan", async () => {
  await expectError(promoteAnchor({ tripId: ids.trip, itemId: ids.unlocated, userId: ids.owner }), 409, "not_located_or_dated");
  await expectError(promoteAnchor({ tripId: ids.trip, itemId: ids.item2, userId: ids.advisor }), 404);
  const r = await promoteAnchor({ tripId: ids.trip, itemId: ids.item2, userId: ids.owner });
  const primaries = (await db.execute(sql`
    SELECT id, itinerary_item_id FROM plan_option_sets WHERE trip_id = ${ids.trip} AND anchor_role = 'primary'
  `)).rows as any[];
  assert.equal(primaries.length, 1, "exactly one primary after the promote");
  assert.equal(primaries[0].itinerary_item_id, ids.item2);
  assert.equal(primaries[0].id, r.setId);
  // trackFunnelEvent is written after the commit and never awaited by the caller; poll briefly.
  let n = 0;
  for (let i = 0; i < 20 && n === 0; i++) {
    n = Number(((await db.execute(sql`
      SELECT count(*)::int AS n FROM funnel_events WHERE trip_id = ${ids.trip} AND event_type = 'slip_anchor_changed'
    `)).rows[0] as any).n);
    if (n === 0) await new Promise((res) => setTimeout(res, 50));
  }
  assert.equal(n, 1, "E14: one slip_anchor_changed row");

  await db.execute(sql`UPDATE trips SET finalized_at = now() WHERE id = ${ids.trip}`);
  await expectError(promoteAnchor({ tripId: ids.trip, itemId: ids.item, userId: ids.owner }), 409, "plan_finalized");
  await db.execute(sql`UPDATE trips SET finalized_at = NULL WHERE id = ${ids.trip}`);
});

test("O10: the finalize and routing rails check open sets before they write", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "server/routes/routing.routes.ts"), "utf8");
  const finalize = src.slice(src.indexOf('router.post("/api/trips/:tripId/finalize"'));
  assert.ok(finalize.indexOf("openOptionSets(tripId)") > 0);
  assert.ok(finalize.indexOf("openOptionSets(tripId)") < finalize.indexOf("await finalizeTrip("), "guard precedes the one finalize author");
  const route = src.slice(src.indexOf('router.post("/api/trips/:tripId/items/:itemId/route"'));
  assert.ok(route.indexOf("itemHasOpenSet(itemId)") > 0);
  assert.ok(route.indexOf("itemHasOpenSet(itemId)") < route.indexOf("isTripOwner(tripId, userId)"), "guard precedes any transition");
});

test("O11: M9 suggest — refused below the located threshold, then ranks by plan-fit into one engine set", async () => {
  await expectError(suggestLodging({ tripId: ids.trip, userId: ids.owner }), 409, "too_few_located");
  // Two more located stops near Gion (h1), so h1 should rank first.
  await db.execute(sql`
    INSERT INTO itinerary_items (id, trip_id, day_number, title, item_type, origin, latitude, longitude)
    VALUES (${id("s1")}, ${ids.trip}, 1, 'Yasaka Shrine', 'activity', 'traveler', 35.0036, 135.7786),
           (${id("s2")}, ${ids.trip}, 2, 'Kennin-ji', 'activity', 'traveler', 35.0005, 135.7736)
  `);
  const set = await suggestLodging({ tripId: ids.trip, userId: ids.owner });
  assert.equal(set.status, "open");
  assert.equal(set.categoryKey, "accommodation");
  assert.equal(set.options.length, 3);
  assert.ok(set.options.every((o) => o.sourceKind === "engine"));
  assert.equal(set.options[0].title, "Gion Hotel", "nearest to the plan's stops ranks first");
  assert.equal(set.options[0].position, 1);
  await expectError(suggestLodging({ tripId: ids.trip, userId: ids.owner }), 409, "set_not_empty");
  const items = Number(((await db.execute(sql`SELECT count(*)::int AS n FROM itinerary_items WHERE trip_id = ${ids.trip} AND item_type = 'accommodation'`)).rows[0] as any).n);
  assert.equal(items, 2, "suggesting writes no stay item (R126): the incumbent inn and O5's chosen stay only");
});

test("O12: the list carries server-derived plan-fit per option", async () => {
  const sets = await listOptionSetsWithFit(ids.trip);
  const open = sets.find((st) => st.status === "open" && st.categoryKey === "accommodation")!;
  for (const o of open.options) {
    assert.equal(o.fit.scored, true);
    assert.equal((o.fit as any).basis, "est", "no matrix for this plan ⇒ every figure is est.");
    assert.equal(o.fit.located, 3);
    assert.equal(o.fit.total, 4, "the unlocated stop is excluded and counted");
  }
  const mins = open.options.map((o) => (o.fit as any).minutesPerDay as number);
  assert.deepEqual([...mins].sort((a, b) => a - b), mins, "the suggestion order is the plan-fit order");
  await closeOptionSet({ tripId: ids.trip, setId: open.id, userId: ids.owner });
});

test("O13: reopen is the owner's; choosing the incumbent back restores the original place", async () => {
  await expectError(reopenOptionSet({ tripId: ids.trip, setId: itemSetId, userId: ids.advisor }), 404);
  const reopened = await reopenOptionSet({ tripId: ids.trip, setId: itemSetId, userId: ids.owner });
  assert.equal(reopened.status, "open");
  const [set] = (await listOptionSets(ids.trip)).filter((st) => st.id === itemSetId);
  const incumbent = set.options.find((o) => o.sourceKind === "incumbent")!;
  await chooseOption({ tripId: ids.trip, setId: itemSetId, optionId: incumbent.id, userId: ids.owner });
  const item = await storage.getItineraryItemByIdAndTrip(ids.item, ids.trip);
  assert.equal(item?.title, "Incumbent inn");
  await expectError(reopenOptionSet({ tripId: ids.trip, setId: itemSetId + "x", userId: ids.owner }), 404);
});
