/**
 * DOORS PASS WHAT THEY HOLD — the static pins for Locked Decision 42 (D13).
 * Ledger `2026-09-05-doors-source-fields`; CLAUDE.md Locked Decision 42, and Locked Decision 33
 * for the door table this completes.
 *
 * WHY THIS EXISTS BESIDE THE GUARD, AND WHY IT IS NOT THE SAME THING.
 * `scripts/check-planning-entry.cjs` answers "does the named door still pass the named key?" — one
 * bit per surface, deliberately coarse, so a door that stops passing a field fails CI. It cannot
 * say WHICH VALUE a door passes, and it has no opinion at all about a surface nobody listed. This
 * file pins the specific, reviewable facts that make the guard's list correct in the first place:
 *
 *   S1  each named door passes the field it was ruled to pass, and passes the RIGHT source for it
 *       (the trip row's own `experienceType`; the listing's own `market`; the resolved
 *       `selectedTripId`).
 *   S2  (the experience template's three doors) was retired with the page in step 8c.
 *   S3  the two §13 doors pass NO city. The ticker rail names eight markets and no one of them;
 *       the storefront's `earner.location` is a NEIGHBOURHOOD as often as a city
 *       (`resolveEarnerLocation`). D13's second clause is that a door passes only what is TRUE, so
 *       an invented field here is a failure, not a nicety.
 *   S4  the ticker STILL holds no single city. If that rail ever becomes single-city this pin
 *       fails, which forces the ticker's source, the guard's REQUIRED_SOURCE_FIELDS entry and S3
 *       to be revisited together instead of one of them drifting.
 *   S5  `/experiences` passes the city it holds (step 8a: the picked market, through its door), and
 *       the intake panel still ACCEPTS a city for the mounts that keep it until D11.
 *
 * WHAT THIS FILE DOES NOT CLAIM (its own negative space). These are static source pins: they read
 * the files as TEXT and prove what a door PASSES, never what a page KNOWS, never that the value is
 * correct at runtime, and never that the CTA is visible or reachable. Placement and visibility are
 * an e2e question; whether a surface should be a door at all is a review question.
 *
 * Pure: no DOM, no React, no DB, no network — `fs.readFileSync` and assertions only.
 * Run: npx tsx --test client/src/lib/__tests__/plan-entry-source-fields.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const TICKER = "client/src/components/CityTickerTape.tsx";
const DETAILS = "client/src/pages/trip-details.tsx";
const READYMADE = "client/src/pages/ready-made-detail.tsx";
const CHAT = "client/src/pages/chat.tsx";
const EXPERIENCES = "client/src/pages/experiences.tsx";
const STOREFRONT = "client/src/pages/storefront.tsx";
const PROVIDERS = "client/src/pages/providers-directory.tsx";
const INTAKE = "client/src/components/intake-panel.tsx";

describe("S1 — trip-details passes the occasion the trip row holds", () => {
  const src = read(DETAILS);
  it("passes trips.experience_type, not a key invented on the page", () => {
    assert.ok(src.includes("experienceType: trip?.experienceType ?? undefined"));
  });
  it("keeps the destination and tripId it already passed", () => {
    assert.ok(src.includes("destination: trip?.destination"));
    assert.ok(src.includes("tripId: trip?.id"));
  });
});

describe("S1 — ready-made detail passes the listing's own market", () => {
  const src = read(READYMADE);
  it("passes listing.market verbatim — nothing is parsed out of it (§13)", () => {
    assert.ok(src.includes("source={{ city: listing.market }}"));
    assert.ok(!/city:\s*listing\.market\.split/.test(src), "the market string must not be re-parsed here");
  });
});

describe("S1 — chat passes the trip its thread is about, and only when there is one", () => {
  const src = read(CHAT);
  it("passes selectedTripId — the page's own resolution, the same value the header badge renders", () => {
    assert.ok(src.includes("source={selectedTripId ? { tripId: selectedTripId } : undefined}"));
  });
  it("§13 — nothing resolved means NO source at all, never an empty tripId", () => {
    assert.ok(!src.includes('tripId: selectedTripId ?? ""'));
    assert.ok(!src.includes("tripId: selectedTripId ?? undefined }"));
  });
  it("is a TRAVELER door — an earner reading a client inbox is not one", () => {
    assert.ok(/\{!isEarner && \(\s*<div className="mt-6">/.test(src));
  });
});

describe("S3/S4 — the two doors that pass NOTHING, and why", () => {
  it("the ticker rail passes no city — it names eight markets and no single one", () => {
    const src = read(TICKER);
    assert.ok(src.includes("onClick={() => openPlanning()}"), "the ticker door must stay bare");
    assert.ok(!/openPlanning\(\{[^)]*city/.test(src), "a city here would be manufactured (§13)");
  });

  it("S4 — the rail still holds ALL the operating markets, so there is still no single city to pass", () => {
    const src = read(TICKER);
    // If this ever becomes a single-city rail, this pin fails and the ticker's source, the guard's
    // REQUIRED_SOURCE_FIELDS entry and S3 above all have to be revisited together.
    assert.ok(src.includes("const markets = OPERATING_MARKETS;"));
    assert.ok(src.includes("Beta in {markets.length} cities"));
  });

  it("the storefront passes no city — earner.location is a neighbourhood as often as a city", () => {
    const src = read(STOREFRONT);
    assert.ok(src.includes('testId="button-plan-entry-storefront"'));
    assert.ok(!/source=\{\{[^}]*earner\.location/.test(src));
  });

  it("the providers directory passes nothing — its endpoint carries no location facet", () => {
    const src = read(PROVIDERS);
    assert.ok(src.includes('<PlanEntryCta variant="outline" testId="button-plan-entry-providers" />'));
  });
});

describe("S5 — /experiences passes the city it holds; the intake panel still accepts one", () => {
  // Step 8a (ledger `2026-10-06-step8a-experiences-entry`): the page no longer mounts the intake.
  // Its door passes the city the traveler PICKED on the page (one of the eight, with its country),
  // never the raw query string — `?destination=`/`?city=` only pre-pick an exact match.
  it("the page's door passes the picked market's city and country, never the raw param", () => {
    const src = read(EXPERIENCES);
    assert.ok(src.includes("city: market.cityName"));
    assert.ok(src.includes("country: market.country"));
    assert.ok(!src.includes("<IntakePanel"));
  });

  it("the panel ACCEPTS them and seeds its destination field from them", () => {
    const src = read(INTAKE);
    assert.ok(/city\?:\s*string;/.test(src));
    assert.ok(/country\?:\s*string;/.test(src));
    assert.ok(src.includes("useState(doorDestination)"));
    // A country alone is not a destination — joining "" to it would produce ", France".
    assert.ok(src.includes('const doorDestination = (city ?? "").trim()'));
  });

  it("D11 is NOT started here — the panel is still its own component, by ruling", () => {
    const src = read(INTAKE);
    assert.ok(src.includes("export function IntakePanel("));
  });
});
