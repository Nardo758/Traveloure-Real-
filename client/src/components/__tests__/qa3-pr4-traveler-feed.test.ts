/**
 * QA round 3, PR 4 — the traveler feed carries no recruit card, and the ribbon is off for members.
 *
 * Two rulings (Leon, Nov 11 2026):
 *   ruling 7 — the launch-market ribbon is off the traveler path for a SIGNED-IN member, on every
 *              path including `/`; and because a member must never see it, an UNKNOWN viewer (auth
 *              still in flight) is held rather than shown.
 *   ruling 2 — partner/recruit cards come off the traveler /discover feed: (a) wanted slots,
 *              (b) the `/earn` card, (c) the unstocked-neighbourhood "Wanted" hero/section and
 *              (d) the empty-market "Local experts wanted" section.
 *
 *   P1 the page composes no wanted slots and no earn card
 *   P2 the two reads that only fed them are gone (a query with no reader is the §18c shape)
 *   P3 the empty-market recruitment section and its copy are gone
 *   P4 an unstocked neighbourhood is no longer a section (no heading, no Wanted tile)
 *   P5 the components are KEPT (the ruling keeps them for an /earn lane) and are unmounted
 *   P6 the ribbon rule: signed-in ⇒ none anywhere; auth unsettled ⇒ held; guest ⇒ today's paths
 *
 * Run: npx tsx --test client/src/components/__tests__/qa3-pr4-traveler-feed.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { existsSync } from "node:fs";
import { showsTicker, TICKER_MARKETING_PATHS } from "../../lib/ticker-mount";

const PAGE = fs.readFileSync("client/src/pages/discover-location.tsx", "utf8");
const LAYOUT = fs.readFileSync("client/src/components/layout.tsx", "utf8");

describe("QA3 PR 4 — the traveler feed's recruit cards are gone", () => {
  it("P1 no wanted slots are built or composed, and no earn card is spliced", () => {
    assert.doesNotMatch(PAGE, /wantedSlotsData|rawWantedSlotsData|recruitmentPool/, "the wanted-slot pool is gone");
    assert.doesNotMatch(PAGE, /kind:\s*"wanted-slot"/, "nothing composes a wanted-slot item");
    assert.doesNotMatch(PAGE, /kind:\s*"earn-card"/, "nothing composes an earn-card item");
    // The composition layer is still called (it places the lead expert), with NO slots handed to it.
    assert.match(
      PAGE,
      /composeDiscoverFeed\(\s*\n\s*withoutUnstockedNeighbourhoods\(feedItems\),\s*\n\s*discoverySlotResult\.candidates,\s*\n\s*\[\],/,
      "composeDiscoverFeed receives an empty slot list",
    );
  });

  it("P2 the two reads that only fed them are gone", () => {
    // Code, not prose: the retiring comment names both paths, so the needle must be the CALL.
    assert.doesNotMatch(PAGE, /queryKey: \["\/api\/offering-types\/experts"\]/, "the offering-type read has no reader");
    assert.doesNotMatch(PAGE, /fetch\("\/api\/offering-types\/experts"\)/, "…and no fetch of it remains");
    assert.doesNotMatch(PAGE, /queryKey: \["\/api\/services\/demand"/, "the demand read has no reader");
    assert.doesNotMatch(PAGE, /fetch\(`\/api\/services\/demand/, "…and no fetch of it remains");
  });

  it("P3 the empty-market recruitment section is gone, copy included", () => {
    assert.doesNotMatch(PAGE, /section-expert-recruitment-generic/, "the section is retired");
    assert.doesNotMatch(PAGE, /link-expert-recruitment-earn/, "its link is retired");
    // The rendered copy, not the comment that records the removal.
    assert.doesNotMatch(PAGE, /Local experts wanted in \{toTitleCase/, "its headline is retired");
    assert.doesNotMatch(PAGE, /Start earning in \{toTitleCase/, "its link copy is retired");
    assert.doesNotMatch(PAGE, /become-expert\?type=local_expert/, "its destination is retired from this page");
  });

  it("P4 an unstocked neighbourhood is no longer a section of its own", () => {
    assert.doesNotMatch(PAGE, /placeUnstockedNeighbourhoods\(/, "nothing re-homes an unstocked neighbourhood");
    // The STOCKED hero still renders (it is the section's own anchor face); the EMPTY one is gone
    // because its section never renders at all — asserted by the early return just below.');
    assert.match(
      PAGE,
      /if \(neighbourhood && neighbourhoodIsUnstocked\(neighbourhood\)\) return null;/,
      "the section itself returns nothing for an unstocked neighbourhood",
    );
  });

  it("P5 the earn card is unmounted, and the kept components keep only their one render site", () => {
    for (const file of [
      "client/src/components/feed/wanted-slot-card.tsx",
      "client/src/components/feed/earn-card.tsx",
      "client/src/components/feed/neighbourhood-wanted-card.tsx",
    ]) {
      assert.ok(existsSync(file), `${file} is kept by the ruling`);
    }
    // The EARN card has no production mount at all. The two Wanted components keep ONE render site:
    // the page's card switch, reached for a slot the composition layer composes (nothing does now)
    // or for the STOCKED neighbourhood's anchor hero that bento-spans still mints. An EMPTY
    // neighbourhood never reaches either — its section is omitted (P4).
    const renderers: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          if (entry.name === "__tests__" || entry.name === "node_modules") continue;
          walk(full);
        } else if (/\.(tsx|ts)$/.test(entry.name)) {
          const src = fs.readFileSync(full, "utf8");
          if (/<FeedEarnCard\b/.test(src)) renderers.push(full);
        }
      }
    };
    walk("client/src");
    assert.deepEqual(renderers, [], `the earn card has no production mount; found: ${renderers.join(", ")}`);
    assert.match(PAGE, /<FeedNeighbourhoodWantedCard\b/, "the stocked hero still renders from the card switch");
  });
});

describe("QA3 PR 4 — the ribbon is off for members", () => {
  it("P6 signed in ⇒ no ribbon on any path, `/` included", () => {
    for (const path of ["/", "/about", "/pricing", "/blog/some-post", "/help/billing", "/plans/new"]) {
      assert.equal(showsTicker(path, { signedIn: true, authSettled: true }), false, path);
    }
  });

  it("P6b an unknown viewer is HELD — no ribbon until auth settles", () => {
    assert.equal(showsTicker("/", { authSettled: false }), false, "auth pending ⇒ held");
    assert.equal(showsTicker("/", { signedIn: false, authSettled: false }), false, "still held");
    // …and a settled guest keeps today's marketing rule.
    assert.equal(showsTicker("/", { signedIn: false, authSettled: true }), true);
    for (const path of TICKER_MARKETING_PATHS) {
      assert.equal(showsTicker(path, { signedIn: false, authSettled: true }), true, path);
    }
  });

  it("P6c the page passes BOTH facts, and the rule lives in one place", () => {
    assert.match(LAYOUT, /showsTicker\(location, \{ signedIn: !!user, authSettled: !isAuthLoading \}\)/);
  });
});
