/**
 * E1 — `trip_created` gains its door property (Track A step A0, ledger `2026-09-28-a0-slice-spec`;
 * docs/planning/slip-funnel-events.md §3.1). Pure: no server, no query. `funnelTracker` is imported
 * for its pure `buildFunnelProperties`; its module creates a pg Pool that is never used here, so a
 * placeholder DATABASE_URL is set only when none is present (the pool never connects).
 *
 *   E1  entry sent        ⇒ the event carries `door` + `occasionSource` (client-supplied) and
 *                           `datesConfirmed` (the mint's own fact) and `market` (the row's).
 *   E2  no entry          ⇒ `door` / `occasionSource` are OMITTED — never `none`, never guessed (§13).
 *   E3  unknown door      ⇒ refused by the `.strict()` pick; nothing client-supplied is recorded,
 *                           and the trip body still parses (the mint is not failed, §15b).
 *   E4  extra key         ⇒ refused the same way (`.strict()` refuses, it does not strip).
 *   E5  the trip insert never receives `entry` (§19) — the split removes it, and the client's ONE
 *                           mint body round-trips to a trip body the rail's schema admits.
 *   E6  the tracker's property builder keeps all three keys (none is credential-shaped).
 *   E7  `deriveOccasionSource` truth table.
 *   E8  the rail itself: `POST /api/trips` parses `tripBody`, not `req.body`, and hands the event
 *                           `tripCreatedEventData` — a source pin, so a refactor cannot quietly drop it.
 *
 * Run: npx tsx --test server/services/__tests__/trip-mint-entry.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { splitTripMintBody, tripCreatedEventData } from "../trip-mint-entry";
import { deriveOccasionSource, finishForBranch, PLAN_DOORS, PLAN_FINISHES } from "@shared/slip-funnel-events";
import { tripClientBodySchema } from "@shared/schema";
import { buildTripMintBody } from "../../../client/src/lib/trip-slip";

process.env.DATABASE_URL ??= "postgresql://placeholder:placeholder@127.0.0.1:1/none";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const TRIP = { title: "Kyoto trip", destination: "Kyoto, Japan", startDate: "2026-11-12", endDate: "2026-11-17" };

describe("E1 — trip_created carries the door the traveler came through", () => {
  it("E1 — entry sent ⇒ door and occasionSource ride the event, with datesConfirmed and market", () => {
    const { entry, entryRefused } = splitTripMintBody({ ...TRIP, entry: { door: "hero", occasionSource: "asked" } });
    assert.equal(entryRefused, false);
    assert.deepEqual(tripCreatedEventData({ entry, datesChosenByTraveler: true, marketSlug: "kyoto" }), {
      datesConfirmed: true,
      door: "hero",
      occasionSource: "asked",
      market: "kyoto",
    });
  });

  it("E2 — no entry ⇒ door and occasionSource are omitted, never 'none'; a NULL market is omitted too", () => {
    const { entry, entryRefused } = splitTripMintBody({ ...TRIP });
    assert.equal(entry, null);
    assert.equal(entryRefused, false);
    const data = tripCreatedEventData({ entry, datesChosenByTraveler: true, marketSlug: null });
    assert.deepEqual(data, { datesConfirmed: true });
    assert.equal("door" in data, false);
    assert.equal("occasionSource" in data, false);
    assert.equal("market" in data, false);
  });

  it("E3 — an unknown door is refused by the .strict() pick and the trip body still parses", () => {
    const { tripBody, entry, entryRefused } = splitTripMintBody({ ...TRIP, entry: { door: "not_a_door" } });
    assert.equal(entry, null);
    assert.equal(entryRefused, true);
    assert.deepEqual(tripCreatedEventData({ entry, datesChosenByTraveler: true }), { datesConfirmed: true });
    assert.equal(tripClientBodySchema.safeParse(tripBody).success, true, "the mint is not failed by a bad entry");
  });

  it("E4 — an extra key inside entry is refused, not stripped", () => {
    for (const bad of [
      { door: "hero", userId: "someone-else" },
      { door: "hero", occasionSource: "asked", tripId: "x" },
      "hero",
      ["hero"],
      { occasionSource: "guessed" },
    ]) {
      const { entry, entryRefused } = splitTripMintBody({ ...TRIP, entry: bad });
      assert.equal(entry, null, `refused: ${JSON.stringify(bad)}`);
      assert.equal(entryRefused, true, `refused: ${JSON.stringify(bad)}`);
    }
  });

  it("E5 — the trip insert never receives `entry` (§19)", () => {
    const body = buildTripMintBody({ ...TRIP, entry: { door: "city_grid", occasionSource: "none" } });
    assert.deepEqual(body.entry, { door: "city_grid", occasionSource: "none" }, "the client sends it");
    const { tripBody, entry } = splitTripMintBody(body);
    assert.equal("entry" in tripBody, false, "split removes it before the trip schema");
    assert.deepEqual(entry, { door: "city_grid", occasionSource: "none" });
    const parsed = tripClientBodySchema.parse(tripBody) as Record<string, unknown>;
    assert.equal("entry" in parsed, false);
    assert.deepEqual(Object.keys(tripBody).sort(), ["destination", "endDate", "startDate", "title"]);

    // …and a client that names nothing sends no `entry` key at all (§13).
    assert.equal("entry" in buildTripMintBody({ ...TRIP }), false);
    assert.equal("entry" in buildTripMintBody({ ...TRIP, entry: {} }), false);
  });

  it("E6 — funnelTracker's property builder keeps door, occasionSource and datesConfirmed", async () => {
    const { buildFunnelProperties } = await import("../../utils/funnelTracker");
    const props = buildFunnelProperties({
      eventData: tripCreatedEventData({
        entry: { door: "hero", occasionSource: "asked" },
        datesChosenByTraveler: true,
        marketSlug: "kyoto",
      }),
    });
    assert.deepEqual(props, { datesConfirmed: true, door: "hero", occasionSource: "asked", market: "kyoto" });
  });

  it("E7 — occasionSource is derived from the start step and whether an occasion was chosen", () => {
    assert.equal(deriveOccasionSource({ openedAtOccasionStep: true, occasionChosen: true }), "asked");
    assert.equal(deriveOccasionSource({ openedAtOccasionStep: false, occasionChosen: true }), "door_prefilled");
    assert.equal(deriveOccasionSource({ openedAtOccasionStep: true, occasionChosen: false }), "none");
    assert.equal(deriveOccasionSource({ openedAtOccasionStep: false, occasionChosen: false }), "none");
  });

  it("E8 — POST /api/trips parses the split body and hands the event tripCreatedEventData", () => {
    const src = readFileSync(join(ROOT, "server", "routes.ts"), "utf8");
    const at = src.indexOf("app.post(api.trips.create.path");
    assert.ok(at > 0, "the mint rail is where it was");
    const handler = src.slice(at, at + 9000);
    assert.match(handler, /splitTripMintBody\(req\.body\)/);
    assert.match(handler, /api\.trips\.create\.input\.parse\(tripBody\)/);
    assert.doesNotMatch(handler, /api\.trips\.create\.input\.parse\(req\.body\)/);
    assert.match(handler, /eventData: tripCreatedEventData\(/);
    // The closed list is the doc's thirteen doors (ten, plus the 2026-09-28 amendment's three), stated once.
    assert.equal(PLAN_DOORS.length, 13);
    for (const d of ["billboard", "event_strip", "events_page"]) assert.ok((PLAN_DOORS as readonly string[]).includes(d), d);
  });

  it("E9 — the finish is its own property beside the door (§3.1 amendment 2026-09-29, ledger `2026-09-29-expert-door`)", () => {
    assert.deepEqual([...PLAN_FINISHES], ["myself", "ai", "local_expert"]);
    assert.equal(finishForBranch("local"), "local_expert");
    assert.equal(finishForBranch("myself"), "myself");
    assert.equal(finishForBranch("ai"), "ai");
    assert.equal(finishForBranch("occasion"), null, "a finish that mints nothing sends nothing");
    const { entry } = splitTripMintBody({ ...TRIP, entry: { door: "hero", finish: "local_expert" } });
    assert.deepEqual(tripCreatedEventData({ entry, datesChosenByTraveler: true, marketSlug: "kyoto" }), {
      datesConfirmed: true,
      door: "hero",
      finish: "local_expert",
      market: "kyoto",
    });
    assert.equal(splitTripMintBody({ ...TRIP, entry: { finish: "modal_expert" } }).entryRefused, true, "a finish off the list is refused, not stored");
    assert.deepEqual((buildTripMintBody({ ...TRIP, entry: { finish: "ai" } }) as any).entry, { finish: "ai" });
  });
});
