/**
 * Fever card place line (ledger `2026-10-21-blog-checks-fever-area`).
 * The area name, and the OpenStreetMap credit only as the exact sentence. Never the street.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { FEVER_CARD_OSM_CREDIT, feverCardPlace } from "../fever-card-place";

test("FC1: a partner card uses the area name and the exact credit", () => {
  const place = feverCardPlace({
    provider: "fever",
    areaName: " Gion ",
    osmCredit: FEVER_CARD_OSM_CREDIT,
  });
  assert.deepEqual(place, { label: "Gion", credit: FEVER_CARD_OSM_CREDIT });
});

test("FC2: a credit that is not the ODbL sentence is dropped, and a non-partner card is unchanged", () => {
  assert.deepEqual(feverCardPlace({ provider: "fever", areaName: "Gion", osmCredit: "maps by us" }), {
    label: "Gion", credit: null,
  });
  assert.equal(feverCardPlace({ provider: "other", areaName: "Gion", osmCredit: FEVER_CARD_OSM_CREDIT }), null);
  assert.equal(feverCardPlace(null), null);
});

test("FC3: the event card puts the street and the maps link on the non-partner arm only", () => {
  const src = readFileSync(path.join(process.cwd(), "client/src/components/city-feed-card.tsx"), "utf8");
  assert.match(src, /feverCardPlace/);
  const sheet = src.slice(src.indexOf("const partnerPlace = feverCardPlace(data);"));
  const partnerArm = sheet.slice(0, sheet.indexOf(") : (data.venueName"));
  assert.equal(partnerArm.includes("maps.google.com"), false);
  assert.equal(partnerArm.includes("venueAddress"), false);
  assert.match(partnerArm, /event-area/);
  assert.match(partnerArm, /event-osm-credit/);
  assert.match(sheet, /maps\.google\.com/);
  assert.match(src, /event-osm-credit-\$\{event\.id\}/);
  assert.match(src, /partnerPlace \? \(partnerPlace\.label/);
});
