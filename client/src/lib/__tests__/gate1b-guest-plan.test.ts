/**
 * GATE-1B (ledger `2026-11-04-gate1b-guest-plan`): the client half of the guest plan, pure.
 *
 *   C1  a browse card's add payload → the guest save body: a gem names its row; a hotel is an accommodation; card
 *       types outside the item vocabulary save as activities; no title ⇒ nothing.
 *   C2  a map place → the save body: a gem sends its id (the server reads its point), a located listing sends its
 *       point, an event sends only its name.
 *   C3  the save error sentence: 429 ⇒ the approved rate-limit sentence, anything else ⇒ the approved failure.
 *   C4  the privacy line: set ⇒ the N-day sentence, unset ⇒ the no-number sentence (both as approved).
 *   C5  the city payload as browse places: visible gems by their place type's tab; an event only with reviewed text.
 *   C6  empty tabs are hidden once every read has answered, and all tabs show while loading.
 *   C7  the plan's items become map days over the plan's window; a stop's point is its own or none.
 *   C8  source pins: the toast is said only after the write; the guest page has no sign-in wall in waitlist mode;
 *       the map tabs are buttons with role="tab" controlling one tabpanel; Budget is drawn only in open mode.
 *
 * Run: npx tsx --test client/src/lib/__tests__/gate1b-guest-plan.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GUEST_PLAN_COPY, guestPlanKeptLine } from "@shared/guest-plan-copy";
import { guestBodyForPlace, guestItemFromFeedItem, guestPlanDays, guestSaveErrorMessage } from "../waitlist-guest-plan";
import { cityContentPlaces, placesInTab, visibleBrowseTabs } from "../browse-supply";
import { gemCategory } from "../feed-stream";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("GATE-1B guest plan (client)", () => {
  it("C1 builds the guest save body from a card's add payload", () => {
    assert.deepEqual(guestItemFromFeedItem({ title: "Ginkaku-ji", type: "gem", sourceContentId: "kyoto-gem-ginkaku-ji", city: "Kyoto" }), {
      title: "Ginkaku-ji",
      itemType: "activity",
      gemId: "kyoto-gem-ginkaku-ji",
    });
    assert.equal(guestItemFromFeedItem({ title: "Ryokan", type: "hotel" })?.itemType, "accommodation");
    assert.equal(guestItemFromFeedItem({ title: "F1", type: "event" })?.itemType, "activity");
    assert.equal(guestItemFromFeedItem({ title: "  " }), null);
  });

  it("C2 builds the save body from a map place", () => {
    assert.deepEqual(guestBodyForPlace({ id: "g1", kind: "gem", name: "Tenryu-ji", lat: null, lng: null }, 2), { title: "Tenryu-ji", gemId: "g1", dayNumber: 2 });
    assert.deepEqual(guestBodyForPlace({ id: "l1", kind: "listing", name: "Tea", lat: 35, lng: 135.7 }, 1), {
      title: "Tea",
      dayNumber: 1,
      locationName: "Tea",
      latitude: "35",
      longitude: "135.7",
    });
    assert.deepEqual(guestBodyForPlace({ id: "e1", kind: "event", name: "Gion Matsuri", lat: null, lng: null }, 1), { title: "Gion Matsuri", dayNumber: 1 });
  });

  it("C3 says the approved sentence for a failed save", () => {
    assert.equal(guestSaveErrorMessage(new Error("429: {}")), GUEST_PLAN_COPY.rateLimited);
    assert.equal(guestSaveErrorMessage(new Error("500: {}")), GUEST_PLAN_COPY.saveFailed);
    assert.equal(guestSaveErrorMessage(null), "Couldn't save that. Try again.");
    assert.equal(GUEST_PLAN_COPY.rateLimited, "You've added a lot in a short time. Give it a minute and try again.");
  });

  it("C4 words the privacy line for set and unset retention", () => {
    assert.equal(guestPlanKeptLine(30), "This plan is kept for 30 days from your last change. Sign in to keep it.");
    assert.equal(guestPlanKeptLine(null), "This plan is kept until you sign in or clear it.");
  });

  it("C5 turns the city payload into tabbed places", () => {
    const places = cityContentPlaces(
      {
        gems: { data: [{ id: "g1", placeName: "Nishiki Market", placeType: "food market" }, { id: "g2", placeName: "Ginkaku-ji", placeType: "temple" }] },
        events: { data: { events: [{ id: "e1", title: "Reviewed event", description: "Our words." }, { id: "e2", title: "Raw event", description: null }] } },
      },
      gemCategory,
    );
    assert.deepEqual(places.map((p) => [p.kind, p.id, p.tabKey]), [
      ["gem", "g1", "dining"],
      ["gem", "g2", "activities"],
      ["event", "e1", "activities"],
    ]);
    assert.deepEqual(placesInTab(places, "dining").map((p) => p.id), ["g1"]);
    assert.deepEqual(placesInTab(places, "activities", "tour_guide"), []);
  });

  it("C6 hides empty tabs once loaded", () => {
    const places = cityContentPlaces({ gems: { data: [{ id: "g2", placeName: "Ginkaku-ji", placeType: "temple" }] } }, gemCategory);
    assert.deepEqual(visibleBrowseTabs(places, true).map((t) => t.key), ["activities"]);
    assert.equal(visibleBrowseTabs(places, false).length, 5);
    assert.deepEqual(visibleBrowseTabs([], true), []);
  });

  it("C7 lays the plan's items over its window", () => {
    const days = guestPlanDays({
      plan: { id: "t", title: null, destination: "Kyoto", startDate: "2027-04-09", endDate: "2027-04-12", datesConfirmed: true, adults: 2, kids: null, numberOfTravelers: 2, eventType: null, updatedAt: null },
      items: [
        { id: "a", title: "Ginkaku-ji", description: null, itemType: "activity", dayNumber: 1, locationName: null, latitude: "35.0270", longitude: "135.7982" },
        { id: "b", title: "Nishiki", description: null, itemType: "activity", dayNumber: 1, locationName: null, latitude: null, longitude: null },
      ],
      retentionDays: null,
    });
    assert.equal(days.length, 4);
    assert.equal(days[0].activities.length, 2);
    assert.equal((days[0].activities[0] as any).lat, 35.027);
    assert.equal((days[0].activities[1] as any).lat, undefined);
  });

  it("C8 pins the sources", () => {
    const save = read("client/src/lib/browse-save.ts");
    assert.match(save, /saveToGuestPlan\(body, .*\)\.then\(\s*\(\) => toast\(\{ title: WAITLIST_COPY\.savedToPlan \}\),/);
    const page = read("client/src/pages/guest-plan-map.tsx");
    assert.match(page, /if \(!isLoading && !user && mode === "waitlist"\) return <WaitlistGuestPlan \/>;/);
    const waitlistBody = page.slice(page.indexOf("function WaitlistGuestPlan()"));
    assert.doesNotMatch(waitlistBody, /openSignInModal|GUEST_MAP_START_LABEL|GUEST_MAP_EYEBROW/);
    const mcc = read("client/src/components/plancard/MapControlCenter.tsx");
    assert.match(mcc, /<button\s+key=\{t\.key\}\s+type="button"\s+role="tab"\s+id=\{`map-browse-tab-\$\{t\.key\}`\}\s+aria-controls="map-browse-tabpanel"/);
    assert.match(mcc, /role=\{browseOn \? "tabpanel" : undefined\}/);
    assert.match(mcc, /const budgetShown = guest \? signupMode === "open" : caps\?\.signup\.mode === "open";/);
    assert.match(mcc, /\{budgetShown \? \(\s*<label/);
  });
});
