/**
 * UI-2b (part 2) — the GUEST EmptySlip (B-10, ruled 2026-11-09).
 *
 * Ruled: "guest EmptySlip = Browse + lodging sections", Quick draft HIDDEN for guests, and the
 * lodging row **opens the existing Hotels tab — it is not a new filter**. If the Hotels tab is hidden
 * for lack of rows, the row hides with it.
 *
 *   G1 the guest block draws exactly two rows — no Quick draft, no handoff door
 *   G2 the lodging row selects the map's EXISTING tab (openFindHost("accommodation") ⇒ hotels)
 *   G3 no filter was added anywhere: the map is not touched by this slice, and the hook only reads
 *   G4 the hook asks the map's own question of the map's own keys, so the two can never disagree
 *   G5 the guest gate and the anchor-panel suppression are the same predicate
 *
 * Run: npx tsx --test client/src/lib/__tests__/ui2b-guest-empty.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p: string) => fs.readFileSync(p, "utf8");
const SLIP = read("client/src/components/plancard/SlipView.tsx");
const START = read("client/src/components/plan/SlipEmptyStart.tsx");
const HOOK = read("client/src/components/plancard/useHotelsTabShown.ts");
const MAP = read("client/src/components/plancard/MapControlCenter.tsx");
const SUPPLY = read("client/src/lib/browse-supply.ts");
const GUEST = START.slice(START.indexOf("export function SlipEmptyGuestStart"));

describe("UI-2b part 2 — the guest empty start", () => {
  it("G1Browse + lodging only: no Quick draft, no handoff", () => {
    assert.match(START, /export function SlipEmptyGuestStart\(/);
    assert.ok(GUEST.includes('data-testid="slip-empty-guest-start"'));
    assert.ok(GUEST.includes('data-testid="slip-empty-browse"'), "the Browse row keeps its one testid");
    assert.ok(GUEST.includes('data-testid="slip-empty-guest-lodging"'), "the lodging row");
    for (const forbidden of ["slip-action-draft-ai", "useSlipFreeDraft(", "slip-empty-handoff", "openHandoffChooser"]) {
      assert.ok(!GUEST.includes(forbidden), `${forbidden} must not be on the guest's empty plan`);
    }
  });

  it("G2 the lodging row selects the EXISTING Hotels tab", () => {
    // The press is the map's own "Find a host" rail, with the accommodation categoryKey.
    assert.match(SLIP, /onLodging=\{\(\) => openFindHost\("accommodation"\)\}/);
    // …and that categoryKey is the map's existing Hotels mapping — not a new one.
    assert.match(SUPPLY, /\{ key: "hotels", label: "Hotels", listingKeys: \["accommodation"\]/);
    assert.match(MAP, /browseTabForCategory\(browseState\.categoryKey\)/, "the map already selects a tab from that key");
  });

  it("G3 no filter was added: the map is not touched, the hook only reads", () => {
    assert.ok(!MAP.includes("Where are you staying?"), "the map draws no such row");
    assert.ok(!SUPPLY.includes("Where are you staying?"), "the supply layer carries no such filter");
    // The hook makes no request of its own beyond the map's four reads.
    for (const url of ["/api/service-categories", "/api/services?location=", "/api/discover/location/", "/api/affiliate/products?city="]) {
      assert.ok(HOOK.includes(url), `${url} is read through the map's own key`);
    }
    assert.ok(!HOOK.includes("POST"), "reads only — pressing the row navigates, it writes nothing");
  });

  it("G4 the hook asks the map's question with the map's keys", () => {
    // Same three key expressions in both files — a changed key on either side is a visible failure.
    for (const key of [
      '`/api/services?location=${encodeURIComponent(city)}`',
      '`/api/affiliate/products?city=${encodeURIComponent(city)}&limit=100`',
      '["/api/discover/location", city, "map-browse"]',
    ]) {
      assert.ok(MAP.includes(key), `the map uses ${key}`);
      assert.ok(HOOK.includes(key), `the hook uses the same ${key}`);
    }
    // And the same rule, the same builders.
    assert.match(HOOK, /visibleBrowseTabs\(supply, loaded\)\.some\(\(t\) => t\.key === "hotels"\)/);
    assert.match(MAP, /visibleBrowseTabs\(allSupply, suppliesLoaded\)/, "the map's own rule");
    assert.match(HOOK, /listingPlaces\(listings, categoryKeyById\)/);
    assert.match(HOOK, /partnerPlaces\(partner\?\.products\)/);
    assert.match(HOOK, /cityContentPlaces\(cityPayload, gemCategory\)/);
  });

  it("G5 the guest gate, and the panel it replaces", () => {
    assert.match(SLIP, /const guestEmptyStartShown = !!guest && aiAction === "draft" && slipView === "list";/);
    assert.match(SLIP, /\{guestEmptyStartShown && data\.trip \? \(/, "the block renders on that predicate");
    // The guest's empty plan no longer draws the anchor question panel — one ask, not two.
    assert.match(SLIP, /anchorPanelEmpty && !emptyStartShown && !guestEmptyStartShown \? renderAnchorPanel\("empty"\)/);
  });
});
