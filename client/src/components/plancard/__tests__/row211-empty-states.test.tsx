/**
 * Row 211 (strings 31–34, approved by Leon Oct 26, 2026; Architect rulings Oct 27, 2026): the
 * "Check back soon" empty states say what is true now. #31 guest invite, #32 discover feed, #33 the
 * city grid's second line deleted, #34 HOTELS_COMING_SOON unchanged. Reads page source with fs (the
 * pages are not importable here) and imports pure constants; runs no git and compares to no ref.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EMPTY_STATE_COPY } from "../../../lib/empty-state-copy";
import { HOTELS_COMING_SOON } from "../../plan/AnchorPanel";
import { siteNeverSayHits } from "@shared/banned-copy";

const CLIENT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const read = (p: string) => readFileSync(resolve(CLIENT, p), "utf8");
const GUEST = read("pages/GuestInvitePage.tsx");
const DISCOVER = read("pages/discover-location.tsx");
const GRID = read("components/travelpulse/CityGrid.tsx");
const ANCHOR = read("components/plan/AnchorPanel.tsx");

describe("row 211 empty states", () => {
  it("CS1 the two approved strings", () => {
    assert.equal(EMPTY_STATE_COPY.guestNoSuggestions, "No travel suggestions for this event.");
    assert.equal(EMPTY_STATE_COPY.feedEmpty("Kyoto"), "Nothing here yet for Kyoto.");
  });

  it("CS2 never-say sweep: no AI, slip, price, or promise of later", () => {
    for (const v of [EMPTY_STATE_COPY.guestNoSuggestions, EMPTY_STATE_COPY.feedEmpty("Kyoto")]) {
      assert.doesNotMatch(v, /\bAI\b/);
      assert.doesNotMatch(v, /\bslip\b/i);
      assert.doesNotMatch(v, /\$|\d+(\.\d+)?\s*(USD|EUR|JPY)/);
      assert.doesNotMatch(v, /check back|coming soon|\bsoon\b/i);
      assert.deepEqual(siteNeverSayHits(v), []);
    }
  });

  it("CS3 the guest invite shows one muted line; the Tabs branch is untouched", () => {
    for (const gone of ["aren't available yet", "We're working on integrating", "Check back soon"]) {
      assert.ok(!GUEST.includes(gone), gone);
    }
    assert.ok(GUEST.includes("EMPTY_STATE_COPY.guestNoSuggestions"));
    assert.ok(GUEST.includes('data-testid="guest-no-suggestions"'));
    assert.ok(GUEST.includes("recommendations?.needsApiIntegration"));
    assert.ok(GUEST.includes('<Tabs defaultValue="flights">'));
  });

  it("CS4 the discover feed reads #32 inside feed-empty; feed-empty-filtered is unchanged", () => {
    assert.ok(!DISCOVER.includes("Check back soon"));
    assert.ok(!DISCOVER.includes("No items to show yet"));
    const empty = DISCOVER.match(/<p[^>]*data-testid="feed-empty"[^>]*>([\s\S]*?)<\/p>/);
    assert.ok(empty, "feed-empty element present");
    assert.match(empty![1], /\{EMPTY_STATE_COPY\.feedEmpty\(toTitleCase\(city\)\)\}/);
    assert.ok(DISCOVER.includes('data-testid="feed-empty-filtered"'));
  });

  it("CS5 the city grid keeps its heading and drops the second line", () => {
    assert.ok(!GRID.includes("Check back soon"));
    assert.ok(!GRID.includes("EMPTY_STATE_COPY"));
    assert.ok(!GRID.includes("noDestinations"));
    assert.ok(GRID.includes("No cities available yet"));
  });

  it("CS6 #34 is unchanged", () => {
    assert.equal(HOTELS_COMING_SOON, "No hotels to compare yet");
    assert.ok(ANCHOR.includes("{HOTELS_COMING_SOON}"));
  });
});
