/**
 * T2.2 — anchor-registry → dmo_sources sync: pure builder test (no DB).
 * Run: tsx --test server/seeds/__tests__/dmo-anchor-registry-sync.test.ts
 *
 * Asserts the sync's PURE row-builder honors the T2.2 rulings without a database:
 *   - affiliate access is rejected (affiliate is not a DMO source);
 *   - agent-unverified rows are born inert (source_type='unverified', is_active=false) — §13 never assume live;
 *   - the already-live Kyoto anchor is enriched, not demoted;
 *   - access + rights ride existing columns (no invented schema);
 *   - the four primary city-DMO portals are present and born unverified (the registry's "four unverified URLs").
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dmoSourceTypeEnum, dmoSourceConfidenceEnum } from "@shared/schema";
import {
  ANCHOR_REGISTRY_SOURCES,
  buildAnchorSourceRow,
  type AnchorSourceDef,
} from "../lib/dmo-anchor-registry";

const SOURCE_TYPES = new Set<string>(dmoSourceTypeEnum);
const CONFIDENCES = new Set<string>(dmoSourceConfidenceEnum);

test("every anchor source has a real, non-empty domain (never invent a domain, §13)", () => {
  for (const def of ANCHOR_REGISTRY_SOURCES) {
    assert.ok(def.domain && def.domain.includes("."), `${def.id} has a real domain`);
  }
});

test("no affiliate (AFF-*) access reaches the builder — affiliate is not a DMO source", () => {
  for (const def of ANCHOR_REGISTRY_SOURCES) {
    assert.ok(def.access !== "AFF-TP" && def.access !== "AFF-NET", `${def.id} is not affiliate`);
  }
  // And the builder actively rejects one if it ever slips in.
  const bad: AnchorSourceDef = { ...ANCHOR_REGISTRY_SOURCES[1], access: "AFF-TP" };
  assert.throws(() => buildAnchorSourceRow(bad), /affiliate/i);
});

test("built rows use only real enum values for source_type and confidence", () => {
  for (const def of ANCHOR_REGISTRY_SOURCES) {
    const row = buildAnchorSourceRow(def);
    assert.ok(SOURCE_TYPES.has(row.sourceType), `${def.id} source_type ${row.sourceType} is a real enum member`);
    assert.ok(CONFIDENCES.has(row.confidence), `${def.id} confidence ${row.confidence} is a real enum member`);
  }
});

test("§13: an agent-unverified row is born inert (source_type='unverified', is_active=false)", () => {
  const unverified = ANCHOR_REGISTRY_SOURCES.filter((d) => !d.agentVerified);
  assert.ok(unverified.length > 0);
  for (const def of unverified) {
    const row = buildAnchorSourceRow(def);
    assert.equal(row.sourceType, "unverified", `${def.id} born unverified`);
    assert.equal(row.isActive, false, `${def.id} born inert`);
    assert.match(row.notes, /UNVERIFIED/, `${def.id} notes say so out loud`);
  }
});

test("the already-live Kyoto anchor is enriched (live + mapped source_type), never demoted to unverified", () => {
  const kyoto = ANCHOR_REGISTRY_SOURCES.find((d) => d.domain === "kyoto.travel")!;
  const row = buildAnchorSourceRow(kyoto);
  assert.equal(kyoto.agentVerified, true);
  assert.equal(row.isActive, true);
  assert.equal(row.sourceType, "scraped"); // SCRAPE access → scraped, not 'unverified'
});

test("the four primary city-DMO portals are present and born unverified (the registry's 'four unverified URLs')", () => {
  const fourUrls = [
    "bogota.gov.co",
    "cartagenadeindias.travel",
    "mtdc.co",
    "tourism.rajasthan.gov.in",
  ];
  for (const domain of fourUrls) {
    const def = ANCHOR_REGISTRY_SOURCES.find((d) => d.domain === domain);
    assert.ok(def, `${domain} present in the anchor sync`);
    assert.equal(def!.agentVerified, false, `${domain} is one of the four unverified URLs`);
    assert.equal(buildAnchorSourceRow(def!).isActive, false, `${domain} born inert`);
  }
});

test("access + rights ride existing columns: scrapeConfig carries access/rights, notes echo them (no new schema)", () => {
  const row = buildAnchorSourceRow(ANCHOR_REGISTRY_SOURCES[0]);
  assert.ok(typeof (row.scrapeConfig as any).access === "string");
  assert.ok(typeof (row.scrapeConfig as any).rights === "string");
  assert.match(row.notes, /access=/);
  assert.match(row.notes, /rights:/);
});

test("builder is pure/deterministic — same def → identical row", () => {
  const def = ANCHOR_REGISTRY_SOURCES[2];
  assert.deepEqual(buildAnchorSourceRow(def), buildAnchorSourceRow(def));
});

test("row id is preserved so the (domain,market) upsert lines up with a stable PK", () => {
  for (const def of ANCHOR_REGISTRY_SOURCES) {
    assert.equal(buildAnchorSourceRow(def).id, def.id);
  }
});
