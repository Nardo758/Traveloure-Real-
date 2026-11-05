/**
 * Lane 7 — A-22: a guest's plan is drawn as the Trip Slip (ledger `2026-11-05-lane7-guest-slip`).
 *
 *   G1  guestSlipDays: every day of the window in order (an empty day too), a machine date only when the guest chose the dates
 *   G2  rendered: the slip's own DayBlock heading and ItemRow rows; the first day open
 *   G3  rendered: no ⋯ menu, no booking line or action, no Navigate, no money anywhere
 *   G4  the guest page mounts GuestPlanSlip and no longer draws its own list
 *
 * Run: npx tsx --test client/src/components/__tests__/lane7-guest-slip.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { GuestPlanSlip } from "../plan/GuestPlanSlip";
import { guestSlipDays, type GuestPlanView } from "@/lib/waitlist-guest-plan";
import { containsNeverSayCopy } from "@shared/banned-copy";

(globalThis as any).React = React;
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const view = (datesConfirmed: boolean): GuestPlanView => ({
  plan: {
    id: "t1", title: "Kyoto", destination: "Kyoto, Japan", startDate: "2026-11-11", endDate: "2026-11-13", datesConfirmed,
    adults: null, kids: null, numberOfTravelers: null, eventType: null, updatedAt: null,
  },
  items: [
    { id: "b", title: "Nishiki Market", description: null, itemType: "activity", dayNumber: 2, locationName: "Nakagyo", latitude: "35.0", longitude: "135.7" },
    { id: "a", title: "Fushimi Inari", description: null, itemType: "activity", dayNumber: 1, locationName: "Fushimi", latitude: null, longitude: null },
  ],
  retentionDays: 30,
});

describe("Lane 7 guest slip", () => {
  it("G1 days in order; a date only when the dates were chosen", () => {
    assert.deepEqual(guestSlipDays(view(true)).map((d) => [d.dayNum, d.dateIso]), [[1, "2026-11-11"], [2, "2026-11-12"], [3, "2026-11-13"]]);
    assert.deepEqual(guestSlipDays(view(false)).map((d) => [d.dayNum, d.dateIso]), [[1, null], [2, null], [3, null]]);
  });

  it("G2 the slip's day heading and rows; the first day is open", () => {
    const html = renderToString(<GuestPlanSlip view={view(true)} />);
    const t = text(html);
    assert.match(t, /Wed · Nov 11/);
    assert.match(t, /Thu · Nov 12/);
    assert.match(html, /data-testid="slip-item-a"/, "day 1's row is drawn by ItemRow");
    assert.doesNotMatch(html, /data-testid="slip-item-b"/, "day 2 starts closed");
    assert.match(text(renderToString(<GuestPlanSlip view={view(false)} />)), /Day 1/, "placeholder dates read as the plan's own Day N");
  });

  it("G3 no menu, booking, navigate or money", () => {
    const html = renderToString(<GuestPlanSlip view={view(true)} />);
    assert.doesNotMatch(html, /slip-item-menu|slip-item-booking|slip-item-navigate|slip-item-booked/);
    assert.doesNotMatch(text(html), /\$|¥|fee|Book|Checkout/i);
    assert.equal(containsNeverSayCopy(text(html)), false);
  });

  it("G4 the guest page mounts the slip", () => {
    const page = fs.readFileSync("client/src/pages/guest-plan-map.tsx", "utf8");
    assert.match(page, /<GuestPlanSlip view=\{view\} \/>/);
    assert.doesNotMatch(page, /`Day \$\{it\.dayNumber\}`/);
  });
});
