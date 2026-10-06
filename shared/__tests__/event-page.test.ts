/**
 * The event page's pure rules (ledger `2026-10-06-event-page`, events-page brief 2b, ruling E2).
 *
 *   EPP1  the page path encodes the source id; a source id is looked up only when it is a plain,
 *         bounded string
 *   EPP2  the organizer host drops "www." and is null for something that is not a URL
 *   EPP3  "N verified in <city>" is absent at zero or unknown — never "0 verified"
 *   EPP4  the headline countdown reads "Starts in N days"; Today, Tomorrow and On now are unchanged
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { eventDetailPath } from "../events-calendar";
import { EVENT_SOURCE_ID_MAX, eventPageCountdown, isLookupableSourceId, organizerHost, verifiedLocalsLine } from "../event-page";
import { countdownLabel } from "../city-events";

test("EPP1 the path encodes the id; only a plain, bounded id is looked up", () => {
  assert.equal(eventDetailPath("estereo-picnic-2027"), "/events/estereo-picnic-2027");
  assert.equal(eventDetailPath("a/b c"), "/events/a%2Fb%20c");
  assert.equal(isLookupableSourceId("estereo-picnic-2027"), true);
  assert.equal(isLookupableSourceId(""), false);
  assert.equal(isLookupableSourceId(" padded"), false);
  assert.equal(isLookupableSourceId("x".repeat(EVENT_SOURCE_ID_MAX)), true);
  assert.equal(isLookupableSourceId("x".repeat(EVENT_SOURCE_ID_MAX + 1)), false);
});

test("EPP2 the organizer host", () => {
  assert.equal(organizerHost("https://www.estereopicnic.com/en/tickets"), "estereopicnic.com");
  assert.equal(organizerHost("https://tickets.example.org/x"), "tickets.example.org");
  assert.equal(organizerHost("not a url"), null);
});

test("EPP3 verified locals: absent at zero or unknown", () => {
  assert.equal(verifiedLocalsLine(null, "Kyoto"), null);
  assert.equal(verifiedLocalsLine(0, "Kyoto"), null);
  assert.equal(verifiedLocalsLine(1, "Kyoto"), "1 verified local in Kyoto");
  assert.equal(verifiedLocalsLine(4, "Bogotá"), "4 verified locals in Bogotá");
});

test("EPP4 the headline countdown", () => {
  assert.equal(eventPageCountdown(countdownLabel(12)), "Starts in 12 days");
  assert.equal(eventPageCountdown(countdownLabel(1)), "Tomorrow");
  assert.equal(eventPageCountdown(countdownLabel(0)), "Today");
  assert.equal(eventPageCountdown(countdownLabel(-2)), "On now");
});
