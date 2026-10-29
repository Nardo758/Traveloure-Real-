/**
 * Order 279 (ledger `2026-10-29-guest-post-rsvp-card`): after a guest RSVPs, the confirmed step
 * shows one plain card with the event details and one link to /experiences.
 *
 *   P1  the card renders for accepted, maybe and declined, and the page mounts it only on the
 *       confirmed step
 *   P2  it shows the title, date, time and city from `landing` only (an absent key shows nothing),
 *       and the street address only when the server sent it (after an accepted RSVP)
 *   P3  a fresh RSVP re-reads GET /api/invites/:token once; the view beacon keeps its one call site
 *       in its own effect
 *   P4  the button links to exactly "/experiences"
 *   P5  the row 263 pins still hold: two setCurrentStep('confirmed'), no CardDescription after the
 *       confirmed step, no "recommendation", never-say clean
 *   P6  no signup, account, join, waitlist, save or AI wording on the card
 *   P7  the card's words are GUEST_CARD_COPY's, and equal Leon's words
 *   P8  390px: the card, its text and its button carry the classes that keep them inside the width
 *
 * Pure and static: renders with react-dom/server; no git, no ref, no database, no network.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { siteNeverSayHits } from "@shared/banned-copy";
import { GuestPostRsvpCard } from "../../components/GuestPostRsvpCard";
import { guestLandingRows, type GuestLandingPayload } from "../guest-landing";
import { guestCardCity, guestCardRows } from "../guest-card";
import { GUEST_CARD_COPY } from "../guest-card-copy";

(globalThis as any).React = React;

const PAGE = fs.readFileSync(path.join(process.cwd(), "client/src/pages/GuestInvitePage.tsx"), "utf8");
const CARD_SRC = fs.readFileSync(path.join(process.cwd(), "client/src/components/GuestPostRsvpCard.tsx"), "utf8");

const BASE: GuestLandingPayload = {
  hostFirstName: "Maya",
  title: "Maya & Ken",
  eventDate: "2027-04-10",
  startTime: "18:30",
  timezone: "Asia/Tokyo",
  venue: "Garden House",
  area: "Kyoto",
  hostNote: "Dress for the garden.",
  rsvpBy: "2027-03-01",
};
const ACCEPTED: GuestLandingPayload = { ...BASE, venueAddress: "12 Example Lane, Kyoto", hasVenueAddress: true };

function render(landing: GuestLandingPayload | null, status: string): string {
  return renderToString(<GuestPostRsvpCard landing={landing} landingRows={guestLandingRows(landing, status)} />);
}
function text(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
}
function testIds(html: string): string[] {
  return Array.from(html.matchAll(/data-testid="([^"]+)"/g), (m) => m[1]);
}

describe("order 279 guest post-RSVP card", () => {
  it("P1 renders for every answer, and the page mounts it only on the confirmed step", () => {
    for (const [status, landing] of [["accepted", ACCEPTED], ["maybe", BASE], ["declined", BASE]] as const) {
      const html = render(landing, status);
      assert.ok(html.includes('data-testid="guest-post-rsvp-card"'), status);
      assert.ok(html.includes('data-testid="guest-card-button"'), status);
    }
    assert.equal((PAGE.match(/<GuestPostRsvpCard /g) ?? []).length, 1, "one mount");
    const confirmed = PAGE.slice(PAGE.indexOf("currentStep === 'confirmed' &&"));
    assert.ok(confirmed.includes("<GuestPostRsvpCard landing={landing} landingRows={landingRows} />"));
    assert.ok(PAGE.indexOf("<GuestPostRsvpCard ") > PAGE.indexOf("currentStep === 'confirmed' &&"));
    for (const step of ["welcome", "origin", "rsvp"]) {
      const start = PAGE.indexOf(`currentStep === '${step}' &&`);
      const end = PAGE.indexOf("currentStep === '", start + 10);
      assert.ok(!PAGE.slice(start, end).includes("GuestPostRsvpCard"), step);
    }
  });

  it("P2 title, date, time and city from landing only; the address only when the server sent it", () => {
    const yes = render(ACCEPTED, "accepted");
    assert.deepEqual(
      testIds(yes).filter((id) => id.startsWith("guest-card-") && id !== "guest-card-details"),
      ["guest-card-title", "guest-card-date", "guest-card-time", "guest-card-city", "guest-card-address", "guest-card-line", "guest-card-button"],
    );
    assert.ok(text(yes).includes("Maya & Ken"));
    assert.ok(text(yes).includes("18:30 (Asia/Tokyo)"));
    assert.ok(text(yes).includes("12 Example Lane, Kyoto"));
    for (const hidden of ["Hosted by", "Garden House", "Dress for the garden.", "RSVP by", "Note from", "shared after you RSVP"]) {
      assert.ok(!text(yes).includes(hidden), hidden);
    }
    for (const status of ["maybe", "declined"]) {
      const html = render(BASE, status);
      assert.ok(!html.includes("guest-card-address"), status);
      assert.ok(!text(html).includes("Example Lane"), status);
    }
    // The address row has no label (as #1749 left it); the other rows keep row 278's labels.
    const address = guestCardRows(guestLandingRows(ACCEPTED, "accepted")).find((r) => r.key === "address");
    assert.equal(address?.label, undefined);
    const empty = render({}, "accepted");
    assert.deepEqual(testIds(empty), ["guest-post-rsvp-card", "guest-card-line", "guest-card-button"], "absent keys show nothing");
    assert.equal(text(render(null, "maybe")), `${GUEST_CARD_COPY.line()} ${GUEST_CARD_COPY.button}`);
    assert.deepEqual(guestCardRows(guestLandingRows(BASE, "maybe")).map((r) => r.key), ["date", "time", "city"]);
  });

  it("P3 a fresh RSVP re-reads the invite once; the beacon is not re-sent", () => {
    const submit = PAGE.slice(PAGE.indexOf("async function handleSubmitRsvp()"), PAGE.indexOf("if (isLoading) {"));
    const afterConfirm = submit.slice(submit.indexOf("setCurrentStep('confirmed');"), submit.indexOf("} catch"));
    assert.equal((afterConfirm.match(/fetchInvite\(\)/g) ?? []).length, 1, "one re-read after a successful RSVP");
    assert.equal((PAGE.match(/fetchInvite\(\);/g) ?? []).length, 2, "two call sites: the load effect and the one re-read");
    assert.equal((PAGE.match(/fetch\(`\/api\/invites\/\$\{token\}`\)/g) ?? []).length, 1, "one GET call site");
    assert.equal((PAGE.match(/\/view`/g) ?? []).length, 1, "one beacon call site");
    const fetchFn = PAGE.slice(PAGE.indexOf("async function fetchInvite()"), PAGE.indexOf("async function handleSaveOrigin()"));
    assert.ok(!fetchFn.includes("/view"), "the re-read does not carry the beacon");
    assert.ok(!fetchFn.includes("setIsLoading(true)"), "the re-read does not blank the page");
  });

  it("P4 the button links to exactly /experiences", () => {
    for (const html of [render(ACCEPTED, "accepted"), render(null, "maybe")]) {
      const hrefs = Array.from(html.matchAll(/href="([^"]*)"/g), (m) => m[1]);
      assert.deepEqual(hrefs, ["/experiences"]);
    }
  });

  it("P5 the row 263 pins hold", () => {
    assert.equal((PAGE.match(/setCurrentStep\('confirmed'\)/g) ?? []).length, 2);
    assert.ok(!PAGE.slice(PAGE.indexOf("currentStep === 'confirmed' &&")).includes("CardDescription"));
    assert.ok(!CARD_SRC.includes("CardDescription"));
    assert.ok(!CARD_SRC.includes("CardTitle"), "the card has no title");
    for (const src of [PAGE, CARD_SRC]) assert.doesNotMatch(src, /recommendation/i);
    for (const t of [GUEST_CARD_COPY.line("Kyoto"), GUEST_CARD_COPY.line(), GUEST_CARD_COPY.button]) {
      assert.deepEqual(siteNeverSayHits(t), [], t);
    }
  });

  it("P6 no signup, account, join, waitlist, save or AI wording", () => {
    for (const html of [render(ACCEPTED, "accepted"), render(BASE, "declined"), render(null, "maybe")]) {
      assert.doesNotMatch(text(html), /\b(sign ?up|account|join|waitlist|save|AI)\b/i);
      assert.doesNotMatch(text(html), /\bTraveloure\b|\bplanner\b|\bAddress\b/, "no about-Traveloure, planner or Address label");
    }
  });

  it("P7 the card's words are Leon's, from one constants object", () => {
    assert.equal(GUEST_CARD_COPY.line("Kyoto"), "See what there is to do around this event in Kyoto.");
    assert.equal(GUEST_CARD_COPY.line(), "See what there is to do around this event.");
    assert.equal(GUEST_CARD_COPY.line(undefined), "See what there is to do around this event.");
    assert.equal(GUEST_CARD_COPY.button, "See how it works");
    assert.equal(GUEST_CARD_COPY.href, "/experiences");
    assert.equal(guestCardCity("  Kyoto "), "Kyoto");
    assert.equal(guestCardCity("   "), undefined);
    assert.equal(guestCardCity(undefined), undefined);
    assert.ok(text(render(ACCEPTED, "accepted")).includes("See what there is to do around this event in Kyoto."));
    const { area: _drop, ...noCity } = BASE;
    assert.ok(text(render(noCity, "maybe")).includes("See what there is to do around this event."));
    // No string literal of the card's own lives in the component or the page.
    for (const src of [CARD_SRC, PAGE]) {
      assert.ok(!src.includes("See how it works"));
      assert.ok(!src.includes("See what there is to do"));
    }
  });

  it("P8 390px: the card and its button stay inside the width", () => {
    const html = render({ ...ACCEPTED, title: "A".repeat(200), venueAddress: "B".repeat(200) }, "accepted");
    assert.match(html, /data-testid="guest-post-rsvp-card"[^>]*/);
    assert.match(CARD_SRC, /<Card className="min-w-0"/);
    assert.match(CARD_SRC, /className="text-lg font-semibold break-words"/);
    assert.match(CARD_SRC, /<dd className="break-words text-foreground">/);
    assert.match(CARD_SRC, /<p className="break-words" data-testid="guest-card-line">/);
    assert.match(CARD_SRC, /<Button asChild className="w-full sm:w-auto">/);
    assert.ok(html.includes("break-words"));
  });
});
