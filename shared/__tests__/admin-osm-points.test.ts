/**
 * LG-2 Ask 7 (ledger `2026-10-19-lg2-admin-points-dry-run`): the reviewed points sheet and the exact name attach. Pure;
 * synthetic coordinates only (the real sheet is never committed — it holds coordinates, internal, ODbL).
 *
 *   AP1 the sheet: the OSM credit line is required and kept; missing columns are refused
 *   AP2 admission: reviewed_by AND approved filled; Hanamikoji never; an OSM type/id and a coordinate; a path row is
 *       entered at its START only (`path_start`), its end kept out
 *   AP3 a point's names: the whole name, the part before and inside a bracket, the Japanese name — never a Japanese name
 *       of two characters or fewer (a city's as often as a place's)
 *   AP4 the attach plan: exact match on the title or the stripped title (and which), ambiguous, already admin, unmatched
 *
 * NEGATIVE SPACE (§18d): exact only (ruling 4) — an item named any other way is unmatched, never guessed.
 *
 * Run: npx tsx --test shared/__tests__/admin-osm-points.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { admitPointRow, adminPointId, normaliseTitle, parsePointsSheet, planNameAttach, pointNames, type AdmittedPoint } from "../admin-osm-points";

const CREDIT = '"Data © OpenStreetMap contributors, ODbL. Internal use; credit ""© OpenStreetMap contributors"" wherever shown.",,,';
const HEADER = "place,osm_type,osm_id,lat,lon,end_lat,end_lng,name_ja,point_basis,note,reviewed_by,approved";
const row = (cells: string) => cells;
const sheet = (...rows: string[]) => [CREDIT, HEADER, ...rows].join("\n");

test("AP1 the credit line is required; columns are checked", () => {
  const ok = parsePointsSheet(sheet(row('Alpha Temple,way,101,10.0001,20.0001,,,アルファ寺,entrance,"A note, with a comma",Ops Bot,"Leon, Oct 18"')));
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.ok(ok.credit.includes("© OpenStreetMap contributors"));
    assert.equal(ok.rows[0].note, "A note, with a comma");
    assert.equal(ok.rows[0].approved, "Leon, Oct 18");
  }
  assert.deepEqual(parsePointsSheet([HEADER, "Alpha,way,1,1,1,,,,,,a,b"].join("\n")), { ok: false, reason: "no_credit_line" });
  const missing = parsePointsSheet([CREDIT, "place,osm_type,lat"].join("\n"));
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.reason, "missing_columns");
});

test("AP2 admission", () => {
  const parsed = parsePointsSheet(
    sheet(
      row("Alpha Temple,way,101,10.0001,20.0001,,,,entrance,,Ops Bot,Leon"),
      row("Beta Gate,way,102,10.0002,20.0002,,,,entrance,,,Leon"),
      row("Gamma Hall,way,103,10.0003,20.0003,,,,entrance,,Ops Bot,"),
      row("Hanamikoji Street,way,104,10.0004,20.0004,,,,path (start/end),,Ops Bot,Leon"),
      row("Delta Lane,relation,105,10.0005,20.0005,10.0105,20.0105,,path (start/end),,Ops Bot,Leon"),
      row("Epsilon,area,106,10.0006,20.0006,,,,entrance,,Ops Bot,Leon"),
      row("Zeta,node,107,,20.0007,,,,station,,Ops Bot,Leon"),
    ),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const out = parsed.rows.map(admitPointRow);
  assert.equal(out[0].ok, true);
  assert.deepEqual(out.slice(1).map((o) => (o.ok ? "ok" : o.reason)), ["not_reviewed", "not_approved", "held", "ok", "bad_osm_ref", "bad_coordinate"]);
  const path = out[4];
  assert.ok(path.ok);
  if (path.ok) {
    assert.equal(path.point.pointBasis, "path_start");
    assert.equal(path.point.lat, 10.0005, "a path is its START point");
    assert.equal(adminPointId(path.point), "admin:relation/105");
  }
});

const pt = (place: string, nameJa: string | null, id: number): AdmittedPoint => ({
  place,
  osmType: "way",
  osmId: id,
  lat: 10,
  lng: 20,
  pointBasis: "entrance",
  nameJa,
  note: null,
  reviewedBy: "Ops Bot",
  approved: "Leon",
});

test("AP3 a point's names", () => {
  assert.deepEqual(pointNames(pt("Alpha Temple (Alpha-dera)", "阿爾法寺", 1)).sort(), ["alpha dera", "alpha temple", "alpha temple alpha dera", "阿爾法寺"].sort());
  assert.ok(!pointNames(pt("Central Station", "京都", 2)).includes("京都"), "a two-character Japanese name is not an alias");
  assert.equal(normaliseTitle("Philosopher's Path"), "philosopher s path");
  assert.equal(normaliseTitle("Nijō  Castle!"), "nijo castle");
});

test("AP4 the attach plan", () => {
  const points = [pt("Alpha Temple (Alpha-dera)", null, 1), pt("Beta Garden", null, 2), pt("Beta Garden", null, 3)];
  const items = [
    { id: "i1", title: "Alpha Temple", strippedTitle: null, linkSource: null },
    { id: "i2", title: "Alpha-dera Walk", strippedTitle: "Alpha-dera", linkSource: "osm" },
    { id: "i3", title: "Beta Garden", strippedTitle: null, linkSource: null },
    { id: "i4", title: "Alpha Temple", strippedTitle: null, linkSource: "admin" },
    { id: "i5", title: "Visit the Alpha Temple area", strippedTitle: "the Alpha Temple area", linkSource: null },
  ];
  const plan = planNameAttach(items, points);
  assert.deepEqual(plan[0], { itemId: "i1", kind: "attach", pointId: "admin:way/1", place: "Alpha Temple (Alpha-dera)", basis: "title", replaces: null });
  assert.deepEqual(plan[1], { itemId: "i2", kind: "attach", pointId: "admin:way/1", place: "Alpha Temple (Alpha-dera)", basis: "stripped_title", replaces: "osm" });
  assert.equal(plan[2].kind, "ambiguous", "two points with one name: neither");
  assert.equal(plan[3].kind, "already_admin");
  assert.equal(plan[4].kind, "unmatched", "exact only — a title naming more than the place is not matched");
});
