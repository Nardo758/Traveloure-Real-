import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  ITINERARY_FOLLOWUPS, buildItineraryFollowupEmail, marketingPreferences,
  localMarketingClock, nextMarketingWindow,
} from "../itinerary-followup-email";
import { messagingAutomationRegistry } from "../../automations/messaging";

test("exactly three active marketing definitions and durable delay values", () => {
  assert.deepEqual(ITINERARY_FOLLOWUPS.map((entry) => entry.hours), [2, 24, 120]);
  for (const entry of ITINERARY_FOLLOWUPS) {
    const node = messagingAutomationRegistry.byId.get(entry.automationId)!;
    assert.equal(node.type, "marketing");
    assert.equal(node.enabled, true);
    assert.equal(node.condition.evaluate({ eligible: false }), false);
    assert.equal(node.condition.evaluate({ eligible: true }), true);
  }
  assert.equal(messagingAutomationRegistry.byId.has("messaging.ai-chat-abandoned"), false);
});

for (let loop = 1; loop <= 2; loop++) {
  test(`copy loop ${loop}: real expert or top-rated activity, escaped text, bookable-only urgency`, () => {
    const base = {
      itineraryId: `test-${loop}`, firstName: "<QA & User>", destination: "<City>",
      baseUrl: "https://app.example.test", unsubscribeToken: `token-${loop}`, bookable: true,
    };
    const expert = buildItineraryFollowupEmail({ ...base, kind: "itinerary_followup_24h", expertName: "<QA Expert>" })!;
    assert.match(expert.html, /Ask &lt;QA Expert&gt;/);
    assert.match(expert.html, /destination=%3CCity%3E/);
    assert.doesNotMatch(expert.html, /Prices may change/);
    const fallback = buildItineraryFollowupEmail({ ...base, kind: "itinerary_followup_24h" })!;
    assert.match(fallback.text, /top-rated activity/);
    assert.doesNotMatch(fallback.text, /local expert/);
    for (const entry of ITINERARY_FOLLOWUPS) {
      const message = buildItineraryFollowupEmail({ ...base, kind: entry.kind })!;
      assert.match(message.text, new RegExp(`itinerary-comparison/test-${loop}`));
      assert.match(message.text, /Unsubscribe:/);
      assert.equal(message.text.includes("Prices may change"), entry.kind === "itinerary_reengagement_5d");
    }
    assert.equal(buildItineraryFollowupEmail({ ...base, kind: "itinerary_reengagement_5d", bookable: false }), null);
  });
}

test("consent and timezone/quiet hours are explicit; missing or invalid values fail closed", () => {
  assert.equal(marketingPreferences({}), null);
  const input = { enabled: true, timeZone: "Asia/Calcutta", quietStart: "22:00", quietEnd: "08:00" };
  assert.ok(marketingPreferences({ itineraryMarketing: input }));
  for (const patch of [{ enabled: false }, { timeZone: "not-a-zone" }, { quietStart: "25:00" }, { quietEnd: "" }]) {
    assert.equal(marketingPreferences({ itineraryMarketing: { ...input, ...patch } }), null);
  }
});
test("local calendar cap and quiet hours defer across midnight and DST without dropping mail", () => {
  const preferences = { enabled: true, timeZone: "Asia/Calcutta", quietStart: "22:00", quietEnd: "08:00" };
  const now = new Date("2026-10-04T17:00:00Z");
  assert.deepEqual(localMarketingClock(now, preferences), { day: "2026-10-04", quiet: true });
  const later = nextMarketingWindow(now, preferences, "2026-10-04");
  assert.deepEqual(localMarketingClock(later, preferences), { day: "2026-10-05", quiet: false });
  const dst = { ...preferences, timeZone: "America/New_York" };
  assert.equal(localMarketingClock(nextMarketingWindow(new Date("2026-11-01T03:00:00Z"), dst), dst).quiet, false);
});