/**
 * QA round 3, PR 4 — the traveler feed carries no recruit card, and the ribbon keeps its paths.
 *
 * RULINGS (Leon, Nov 12 2026), superseding the earlier auth-gated ticker:
 *   1. The ribbon is visible whether or not the traveler is signed in — there is NO auth dimension
 *      and nothing is held while auth is in flight. The only question is the path.
 *   2. ALL FOUR recruit cards come off the traveler /discover feed — the stocked "Wanted" hero
 *      included, not just the empty-neighbourhood one.
 *
 *   P1 the page composes no wanted slots and no earn card
 *   P2 the two reads that only fed them are gone (a query with no reader is the §18c shape)
 *   P3 the empty-market recruitment section and its copy are gone
 *   P4 an unstocked neighbourhood is no longer a section, and no Wanted hero is minted anywhere
 *   P5 the three components are KEPT (for an /earn lane) and nothing mounts any of them
 *   P6 the ribbon: on the marketing pages for everyone; `/experiences` off the list
 *
 * Run: npx tsx --test client/src/components/__tests__/qa3-pr4-traveler-feed.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { existsSync } from "node:fs";
import { showsTicker, TICKER_MARKETING_PATHS } from "../../lib/ticker-mount";

const PAGE = fs.readFileSync("client/src/pages/discover-location.tsx", "utf8");
const BENTO = fs.readFileSync("client/src/lib/bento-spans.ts", "utf8");
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
    assert.doesNotMatch(PAGE, /queryKey: \["\/api\/offering-types\/experts"\]/, "the offering-type read has no reader");
    assert.doesNotMatch(PAGE, /fetch\("\/api\/offering-types\/experts"\)/, "…and no fetch of it remains");
    assert.doesNotMatch(PAGE, /queryKey: \["\/api\/services\/demand"/, "the demand read has no reader");
    assert.doesNotMatch(PAGE, /fetch\(`\/api\/services\/demand/, "…and no fetch of it remains");
  });

  it("P3 the empty-market recruitment section is gone, copy included", () => {
    assert.doesNotMatch(PAGE, /section-expert-recruitment-generic/, "the section is retired");
    assert.doesNotMatch(PAGE, /link-expert-recruitment-earn/, "its link is retired");
    assert.doesNotMatch(PAGE, /Local experts wanted in \{toTitleCase/, "its headline is retired");
    assert.doesNotMatch(PAGE, /Start earning in \{toTitleCase/, "its link copy is retired");
    assert.doesNotMatch(PAGE, /become-expert\?type=local_expert/, "its destination is retired from this page");
  });

  it("P4 an unstocked neighbourhood is omitted, and no Wanted hero is minted", () => {
    assert.doesNotMatch(PAGE, /placeUnstockedNeighbourhoods\(/, "nothing re-homes an unstocked neighbourhood");
    assert.match(
      PAGE,
      /if \(neighbourhood && neighbourhoodIsUnstocked\(neighbourhood\)\) return null;/,
      "the section itself returns nothing for an unstocked neighbourhood",
    );
    // RULING 2: the hero is not produced at all — not for an empty neighbourhood and not for a
    // stocked one with no anchor.
    assert.doesNotMatch(BENTO, /\[ \{ item: neighbourhoodWantedHeroItem/, "bento-spans mints no Wanted hero");
    assert.match(BENTO, /if \(tagged\.length === 0\) return \[\];/, "an empty neighbourhood yields no tiles");
    assert.doesNotMatch(PAGE, /<FeedNeighbourhoodWantedCard/, "the page renders no Wanted hero");
  });

  it("P5 the three components are kept, and nothing mounts any of them", () => {
    for (const file of [
      "client/src/components/feed/wanted-slot-card.tsx",
      "client/src/components/feed/earn-card.tsx",
      "client/src/components/feed/neighbourhood-wanted-card.tsx",
    ]) {
      assert.ok(existsSync(file), `${file} is kept by the ruling`);
    }
    const renderers: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          if (entry.name === "__tests__" || entry.name === "node_modules") continue;
          walk(full);
        } else if (/\.(tsx|ts)$/.test(entry.name)) {
          const src = fs.readFileSync(full, "utf8");
          if (/<(FeedWantedSlotCard|FeedEarnCard|FeedNeighbourhoodWantedCard)\b/.test(src)) renderers.push(full);
        }
      }
    };
    walk("client/src");
    assert.deepEqual(renderers, [], `no production mount of the kept components; found: ${renderers.join(", ")}`);
  });
});

describe("QA3 PR 4 — the ribbon keeps its marketing paths, signed in or not", () => {
  it("P6 every marketing path shows it", () => {
    for (const path of TICKER_MARKETING_PATHS) assert.equal(showsTicker(path), true, path);
    assert.equal(showsTicker("/"), true);
    assert.equal(showsTicker("/blog/some-post"), true, "a post keeps it");
    assert.equal(showsTicker("/help/billing"), true, "a help article keeps it");
  });

  it("P6b there is no auth dimension left in the rule", () => {
    const MOUNT = fs.readFileSync("client/src/lib/ticker-mount.ts", "utf8");
    assert.doesNotMatch(MOUNT, /TickerViewer|signedIn|authSettled/, "the auth dimension is gone");
    // A viewer object from an old call site is simply ignored: the answer is the path's answer.
    for (const viewer of [{ signedIn: true }, { authSettled: false }, { signedIn: false, authSettled: true }]) {
      assert.equal((showsTicker as any)("/", viewer), true, JSON.stringify(viewer));
      assert.equal((showsTicker as any)("/plans/new", viewer), false, JSON.stringify(viewer));
    }
  });

  it("P6c /experiences is off the list, and the mount passes only the path", () => {
    assert.doesNotMatch(fs.readFileSync("client/src/lib/ticker-mount.ts", "utf8"), /"\/experiences"/);
    assert.match(LAYOUT, /\{showsTicker\(location\) && <CityTickerTape \/>\}/, "the mount asks only for the path");
  });
});
