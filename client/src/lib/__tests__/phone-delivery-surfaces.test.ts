/**
 * §8 phone delivery — where the chooser and the calendar link may appear (ledger `2026-10-17-phone-delivery-calendar`).
 *   S1 the chooser's words are Part C's, word for word.
 *   S2 the calendar link never appears on a signed-out or shared page: no public page imports the chooser or names
 *      `/cal/` or the phone-delivery API, and the shared-plan Trip Card mount is a viewer (no exports row).
 *   S3 Share never shares the feed: the Share handler builds only the share-token / plan links.
 *   S4 the LD 53 push card draws nothing unless its switch says shown; the push config read returns that switch.
 *   S5 every switch starts off: the admin defaults and the server's flag reads default to false.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  PHONE_DELIVERY_CALENDAR_BODY,
  PHONE_DELIVERY_CALENDAR_HEADING,
  PHONE_DELIVERY_CALENDAR_WARNING,
  PHONE_DELIVERY_HOME_BODY,
  PHONE_DELIVERY_HOME_HEADING,
  PHONE_DELIVERY_RESET_LINK,
  PHONE_DELIVERY_SWITCH_KEYS,
  PHONE_DELIVERY_TITLE,
} from "@shared/phone-delivery";

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

test("S1: the chooser's words, word for word", () => {
  assert.equal(PHONE_DELIVERY_TITLE, "Get your Trip Card on your phone");
  assert.equal(
    `${PHONE_DELIVERY_CALENDAR_HEADING} ${PHONE_DELIVERY_CALENDAR_BODY}`,
    "Add to my calendar. Each stop goes into your phone’s calendar with its time, address and a map link.",
  );
  assert.equal(`${PHONE_DELIVERY_CALENDAR_WARNING} ${PHONE_DELIVERY_RESET_LINK}`, "Anyone with this link can see your trip. Reset link.");
  assert.equal(`${PHONE_DELIVERY_HOME_HEADING} ${PHONE_DELIVERY_HOME_BODY}`, "Add to Home Screen. Open your Trip Card in one tap.");
});

const PUBLIC_PAGES = [
  "client/src/pages/shared-trip.tsx",
  "client/src/pages/itinerary-view.tsx",
  "client/src/pages/ready-made-preview.tsx",
  "client/src/pages/ready-made-detail.tsx",
  "client/src/pages/shared-saved-places.tsx",
];

test("S2: no signed-out or shared page carries the link or the chooser", () => {
  for (const page of PUBLIC_PAGES) {
    const src = read(page);
    assert.doesNotMatch(src, /PhoneDelivery|phone-delivery|\/cal\//, `${page} must not reach the calendar link`);
  }
  // The shared plan renders the Trip Card as a viewer, whose header draws no exports row (and so no phone button).
  assert.match(read("client/src/pages/itinerary-view.tsx"), /<PlanCard\s+role="viewer"/);
  assert.match(read("client/src/components/plancard/PlanCard.tsx"), /showExports=\{!isViewer && !embedded\}/);
  // The only mounts are the owner's Finish card and the Trip Card header.
  const hero = read("client/src/components/plancard/HeroSection.tsx");
  const exportsBlock = hero.slice(hero.indexOf("{showExports ? ("), hero.indexOf(") : (", hero.indexOf("{showExports ? (")));
  assert.match(exportsBlock, /<PhoneDeliveryButton/);
  assert.equal((hero.match(/<PhoneDeliveryButton/g) ?? []).length, 1);
});

test("S3: Share never shares the feed", () => {
  const hero = read("client/src/components/plancard/HeroSection.tsx");
  const share = hero.slice(hero.indexOf("function handleShare()"), hero.indexOf("return (", hero.indexOf("function handleShare()")));
  assert.match(share, /itinerary-view\/\$\{shareToken\}/);
  assert.doesNotMatch(share, /cal|ics|phone/i);
  const server = read("server/routes/phone-delivery.routes.ts");
  assert.doesNotMatch(read("server/services/phone-delivery.service.ts"), /shareToken|share_token/, "the feed is never keyed on a share token");
  assert.match(server, /X-Robots-Tag", "noindex/);
  assert.match(server, /Cache-Control", "no-store"/);
});

test("S4: the push card is hidden unless its switch is on", () => {
  const card = read("client/src/components/settings/phone-notifications-card.tsx");
  assert.match(card, /if \(!config \|\| config\.shown !== true\) return null;/);
  assert.match(read("server/routes/push.routes.ts"), /const shown = await getPlatformFlag\(PHONE_DELIVERY_SWITCH\.push, false\);/);
});

test("S5: every switch starts off", () => {
  const system = read("client/src/pages/admin/system.tsx");
  for (const key of PHONE_DELIVERY_SWITCH_KEYS) assert.match(system, new RegExp(`${key}: false`));
  assert.match(read("server/services/phone-delivery.service.ts"), /getPlatformFlag\(PHONE_DELIVERY_SWITCH\[channel\], false\)/);
});
