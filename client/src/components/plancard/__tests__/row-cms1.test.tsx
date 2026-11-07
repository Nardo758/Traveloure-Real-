/**
 * CMS-1 Launch (ledger `2026-11-04-cms1-launch-screens`), client half.
 *
 *   T4 gemPhotoCredit: a stored Wikimedia credit wins (text + file-page link + licence link); an Unsplash CDN photo gets
 *      the curated credit; neither → null; the city hero (resolveCoverPhoto) carries the stored credit.
 *   T3 (client) a stock fallback photo renders its credit on the gem card; a photo with no credit renders none; the hook
 *      drops a fallback photo that came without a credit.
 *   T5 (client) /places is the page's route and /hidden-gems redirects to it; the heading names the city (HELD).
 *   T1/T2/T6 (client) the approve card sends the photo tick; the cover editor sends it; the partner editor reaches the
 *      admin routes.
 *   T7 never-say-baseline.json carries no launch-waitlist.tsx block.
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/row-cms1.test.tsx
 */
import { describe, it } from "node:test";
import "../../__tests__/node-navigator";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { CURATED_HERO_CREDIT, gemPhotoCredit, resolveCoverPhoto } from "../../../lib/cover-photo";
import { GemImageCredit } from "../../city-feed-card";
import { PLACES_HEADING } from "../../../pages/places";
import { partnerItemsUrl } from "../../admin/PartnerEditorialPanel";

(globalThis as any).React = React;

const ROOT = resolve(import.meta.dirname, "../../../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const WIKI =
  "Asturio Cantabrio / Wikimedia Commons, CC BY-SA 4.0. Source: https://commons.wikimedia.org/wiki/File:Yoshida_Sanso_ac.JPG License: https://creativecommons.org/licenses/by-sa/4.0/";

describe("CMS-1 — client", () => {
  it("T4 gemPhotoCredit: stored credit, then Unsplash curated, then null", () => {
    assert.deepEqual(gemPhotoCredit("https://upload.wikimedia.org/x.jpg", WIKI), {
      name: "Asturio Cantabrio / Wikimedia Commons, CC BY-SA 4.0",
      url: "https://commons.wikimedia.org/wiki/File:Yoshida_Sanso_ac.JPG",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    });
    assert.deepEqual(gemPhotoCredit("https://images.unsplash.com/photo-1"), CURATED_HERO_CREDIT);
    assert.deepEqual(gemPhotoCredit("https://images.unsplash.com/photo-1", WIKI)?.url, "https://commons.wikimedia.org/wiki/File:Yoshida_Sanso_ac.JPG", "a stored credit wins");
    assert.equal(gemPhotoCredit("https://x.test/a.jpg"), null);
    assert.equal(gemPhotoCredit("https://x.test/a.jpg", "Someone, no link"), null, "a credit with no link is not a CC BY-SA credit");
    const hero = resolveCoverPhoto([{ imageUrl: "https://upload.wikimedia.org/x.jpg", gemScore: 9, imageCredit: WIKI }], "Kyoto");
    assert.equal(hero.credit?.name, "Asturio Cantabrio / Wikimedia Commons, CC BY-SA 4.0");
  });

  it("T3 the gem card renders a stock photo's credit; no credit, no line", () => {
    const stock = { name: "Jane Doe", source: "Unsplash", licenseUrl: "https://unsplash.com/license", link: "https://unsplash.com/photos/abc" };
    const html = renderToString(<GemImageCredit gem={{ id: "g1" }} photoUrl="https://images.unsplash.com/p" stockCredit={stock} />);
    assert.match(html, /data-testid="gem-stock-credit-g1"/);
    assert.match(html, /href="https:\/\/unsplash.com\/photos\/abc"[^>]*>Jane Doe</);
    assert.match(html, /href="https:\/\/unsplash.com\/license"[^>]*>Unsplash</);
    assert.equal(renderToString(<GemImageCredit gem={{ id: "g2" }} photoUrl="https://images.unsplash.com/p" />), "");
    const stored = renderToString(<GemImageCredit gem={{ id: "g3", imageCredit: WIKI }} photoUrl="https://upload.wikimedia.org/x.jpg" stockCredit={stock} />);
    assert.match(stored, /gem-image-credit-g3/);
    assert.doesNotMatch(stored, /Jane Doe/, "the record's stored credit wins");
    const hook = read("client/src/hooks/use-gem-photo.ts");
    assert.match(hook, /setPhotoUrl\(json2\.photoUrl && c \? json2\.photoUrl : null\)/, "a fallback photo with no credit is not used");
  });

  it("T5 /places route, /hidden-gems redirect, the heading", () => {
    const app = read("client/src/App.tsx");
    // A-16 (ledger `2026-11-05-lane4-places`): the page is /places/{city}; /places and /hidden-gems go to it.
    assert.match(app, /<Route path="\/places\/:city">\s*\{\(params: any\) => <Layout><HiddenGemsPage city=\{params\.city\} \/><\/Layout>\}/);
    assert.match(app, /<Route path="\/hidden-gems">\s*<PlacesRedirect \/>\s*<\/Route>/);
    assert.equal(PLACES_HEADING("Kyoto"), "Places to explore in Kyoto");
    assert.ok(read("shared/client-routes.generated.ts").includes('"/places"'));
    assert.match(read("server/routes/seo.routes.ts"), /"\/places",/);
    // The AI scan card is gone (its output can never show here), and an empty list says the approved line.
    const page = read("client/src/pages/places.tsx");
    assert.doesNotMatch(page, /\/api\/discovery\/scan|button-discover|input-discover-destination|Discover Gems/);
    assert.match(page, /data-testid="text-empty-title">Nothing here yet\.<\/h3>/);
  });

  it("the launch-waitlist page carries none of the five never-say phrases", () => {
    const page = read("client/src/pages/launch-waitlist.tsx");
    for (const phrase of [/\bcrowds?\b/i, /most loved/i, /\bpacked\b/i]) assert.doesNotMatch(page, phrase);
    // The marquee market's name comes from its key (WAIT-1), never a literal.
    assert.ok(page.includes("const marqueeCity = waitlistCityName(launchMarket) ?? launchMarket;"));
    assert.ok(page.includes("description={`Closed days, last entry, timed tickets: plan ${marqueeCity} around the days that don't work. Join the ${marqueeCity} list.`}"));
    assert.ok(page.includes("Closed days, last entry, timed tickets. Most {marqueeCity} plans break on a detail"));
    assert.ok(page.includes("In autumn, small details can sink a Kyoto day:"));
    assert.ok(page.includes("<strong>Some entries are timed.</strong> A few places sell tickets for a set slot, and a missed slot can't be used later."));
    assert.ok(page.includes("Put it together across a few full days and one mistake costs you an afternoon."));
  });

  it("T1/T2/T6 the consoles send the tick and reach the editor routes", () => {
    const approvals = read("client/src/pages/admin/template-approvals.tsx");
    assert.match(approvals, /body: JSON\.stringify\(\{ photoRightsTicked: rmTicks\[id\] === true \}\)/);
    assert.match(approvals, /data-testid=\{`checkbox-rm-photo-rights-\$\{l\.id\}`\}/);
    const cover = read("client/src/components/backoffice/handle-claim-card.tsx");
    assert.match(cover, /\{ coverImageUrl: next\.trim\(\), photoRightsTicked: coverRightsTicked \}/);
    assert.equal(partnerItemsUrl("hotel_cache", " Kyoto ", ""), "/api/admin/partner-items?table=hotel_cache&city=Kyoto");
    assert.match(read("client/src/pages/admin/affiliate-partners.tsx"), /<TabsContent value="editorial">\s*<PartnerEditorialPanel \/>/);
  });

  it("T7 the waitlist page's baseline allowance is gone", () => {
    const baseline = JSON.parse(read("scripts/never-say-baseline.json"));
    assert.equal(baseline["client/src/pages/launch-waitlist.tsx"], undefined);
  });
});
