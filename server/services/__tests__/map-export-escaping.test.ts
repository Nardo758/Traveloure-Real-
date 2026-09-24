/**
 * KML / GPX exports escape traveler text (board #1318 audit). Pure.
 *   X1 an activity named "Fish & Chips <b>" yields well-formed XML in both formats — `&` and `<`
 *      are escaped, and no raw markup reaches the KML description balloon.
 *   X2 the trip name and destination in the document header are escaped too.
 * Run: npx tsx --test server/services/__tests__/map-export-escaping.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKml, escXml } from "../kml-generator";
import { generateGpx } from "../gpx-generator";

const input = {
  tripName: `Chef's "best" tour`,
  destination: `Kyoto & <Osaka>`,
  days: [
    {
      dayNumber: 1,
      date: "2026-10-01",
      activities: [
        { name: "Fish & Chips <b>", lat: 35.0, lng: 135.7, scheduledTime: "12:00" },
        { name: "Tea ]]> house", lat: 35.01, lng: 135.71 },
      ],
      transportLegs: [],
    },
  ],
} as any;

/** Every `&` in the document starts a known entity, and no raw `<` sits inside element text. */
function assertWellFormedText(xml: string) {
  assert.ok(!/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(xml), "no bare ampersand");
  assert.ok(!xml.includes("<b>Fish") && !xml.includes("Chips <b>"), "no raw markup from the activity name");
  assert.ok(!xml.includes("<![CDATA["), "no CDATA section a `]]>` in a name could close");
}

test("X1: activity names are escaped in both exports", () => {
  const kml = generateKml(input);
  const gpx = generateGpx(input);
  assertWellFormedText(kml);
  assertWellFormedText(gpx);
  assert.ok(kml.includes("Fish &amp; Chips &lt;b&gt;"));
  assert.ok(gpx.includes("Fish &amp; Chips &lt;b&gt;"));
});

test("X2: the header name is escaped", () => {
  const expected = `${escXml(input.tripName)} - ${escXml(input.destination)}`;
  assert.ok(generateKml(input).includes(`<name>${expected}</name>`));
  assert.ok(generateGpx(input).includes(`<name>${expected}</name>`));
  assert.equal(escXml(`a&b<"'>`), "a&amp;b&lt;&quot;&apos;&gt;");
});
