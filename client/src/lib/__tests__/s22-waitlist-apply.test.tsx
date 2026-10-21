/**
 * S-22 (ledger `2026-10-21-s22-waitlist-apply-path`): a live city shows the apply path; another city does not.
 * The email's once-only send is the database test. DB-free.
 *
 *   S22a  A live city (the list says kyoto) renders the confirmation and the apply link.
 *   S22b  A city that is not on the live list renders no button and no apply sentence.
 *   S22c  The link prefills the application fields the form already asks, and the form reads that parser.
 *   S22d  The invite is sent once: a repeat, a traveler, a non-live city or a missing footer does not send.
 *         The copy matches the ruling and is clear of the surface refusals.
 *
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/lib/__tests__/s22-waitlist-apply.test.tsx
 */
import "./lc1-dom-stub";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { blogBannedHits, siteNeverSayHits } from "@shared/banned-copy";
import { ProviderWaitlistResult } from "../waitlist-apply-done";
import {
  providerApplicationPrefillFromSearch,
  shouldSendWaitlistApplyInvite,
  waitlistApplyFirstName,
  waitlistApplyMail,
  waitlistProviderApplyInvite,
} from "@shared/waitlist-apply-invite";

(globalThis as any).React = React;

const SCREEN_BODY = "Thanks for your interest in Traveloure. If you run a business or guide in Kyoto, you can apply now. We review each application and get back to you by email.";
const MAIL_BODY = "Hi Ada,\n\nThanks for joining the Traveloure list. Traveloure helps travelers plan trips and occasions with local experts and providers.\n\nIf you offer experiences, food, stays or other services in Kyoto, you can apply to list them. It's free to apply, and we review every application and reply by email.";

const invite = waitlistProviderApplyInvite({
  marketKey: "kyoto",
  liveMarketKeys: ["kyoto"],
  email: "ada@example.com",
  contactName: "Ada Lovelace",
  businessName: "Ada Tours",
  serviceType: "experience",
});

function render(node: React.ReactNode): string {
  return renderToString(<Router ssrPath="/kyoto">{node}</Router>)
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");
}

describe("S22a — a live city shows the apply path", () => {
  it("uses the live list's city name and the ruled sentences", () => {
    assert.ok(invite);
    assert.equal(invite.city, "Kyoto");
    assert.equal(invite.screen.heading, "You're on the list");
    assert.equal(invite.screen.body, SCREEN_BODY);
    assert.equal(invite.screen.button, "Apply as a Kyoto provider");
    assert.equal(invite.mail.subject, "You're on the Traveloure list");
    assert.equal(invite.mail.preheader, "Run a business in Kyoto? Apply as a provider.");
    assert.equal(invite.mail.body, MAIL_BODY);
    assert.equal(invite.mail.cta, "Apply as a Kyoto provider");
    assert.equal(waitlistApplyFirstName("Ada Lovelace"), "Ada");
    assert.equal(waitlistApplyFirstName("  "), "there");
    assert.equal(waitlistApplyFirstName(null), "there");
    assert.ok(waitlistApplyMail("Kyoto", "there").body.startsWith("Hi there,"));
    const html = render(<ProviderWaitlistResult invite={invite} hold="unused" />);
    assert.ok(html.includes("You're on the list"));
    assert.ok(html.includes(SCREEN_BODY));
    assert.ok(html.includes("Apply as a Kyoto provider"));
    assert.ok(html.includes('data-testid="link-provider-apply"'));
    assert.ok(html.includes("w-full"));
    assert.ok(html.includes("/become-provider?"));
    assert.ok(html.includes("ada%40example.com"));
  });
});

describe("S22b — a city that is not live shows no invite", () => {
  it("returns no invite and renders no button", () => {
    assert.equal(
      waitlistProviderApplyInvite({ marketKey: "goa", liveMarketKeys: ["kyoto"], email: "a@b.co", contactName: "A" }),
      null,
    );
    const html = render(
      <ProviderWaitlistResult invite={null} hold="Thanks, we've got your details. We'll be in touch when we open in Goa." />,
    );
    assert.equal(html.includes("link-provider-apply"), false);
    assert.equal(html.includes("Apply as a"), false);
    assert.ok(html.includes("We'll be in touch when we open in Goa."));
  });
});

describe("S22c — the application opens prefilled", () => {
  it("round-trips the details the form can hold, and the form reads that parser", () => {
    assert.ok(invite);
    const prefill = providerApplicationPrefillFromSearch(invite.path.slice(invite.path.indexOf("?")));
    assert.equal(prefill.email, "ada@example.com");
    assert.equal(prefill.businessName, "Ada Tours");
    assert.equal(prefill.city, "Kyoto");
    assert.equal(prefill.country, "Japan");
    assert.equal(prefill.serviceType, "experience");
    assert.equal(prefill.serviceTypeLabel, "Experience or activity");
    assert.equal(providerApplicationPrefillFromSearch("email=not-an-email&businessName=Ok").email, "");
    const form = readFileSync("client/src/pages/services-provider.tsx", "utf8");
    assert.ok(form.includes("providerApplicationPrefillFromSearch"));
    assert.ok(form.includes("businessName: prefill.businessName"));
    assert.ok(form.includes("email: prefill.email"));
    assert.ok(form.includes("city: prefill.city"));
    assert.ok(form.includes("country: prefill.country"));
    const page = readFileSync("client/src/pages/launch-waitlist.tsx", "utf8");
    assert.ok(page.includes("LIVE_MARKETS_ROUTE"));
    assert.ok(page.includes("waitlistProviderApplyInvite"));
    assert.equal(page.includes("Apply as a Kyoto provider"), false);
    const moduleSrc = readFileSync("shared/waitlist-apply-invite.ts", "utf8");
    assert.equal(moduleSrc.includes("Kyoto"), false);
    assert.equal(moduleSrc.includes("kyoto"), false);
  });
});

describe("S22d — one invite, and the copy is allowed", () => {
  it("sends only for a new provider row in a live city when the footer is present", () => {
    assert.ok(invite);
    const base = { role: "provider", invite, footerPresent: true };
    assert.equal(shouldSendWaitlistApplyInvite({ ...base, inserted: true }), true);
    assert.equal(shouldSendWaitlistApplyInvite({ ...base, inserted: false }), false);
    assert.equal(shouldSendWaitlistApplyInvite({ ...base, inserted: true, role: "traveler" }), false);
    assert.equal(shouldSendWaitlistApplyInvite({ ...base, inserted: true, invite: null }), false);
    assert.equal(shouldSendWaitlistApplyInvite({ ...base, inserted: true, footerPresent: false }), false);
  });

  it("the ruled sentences are clear of the surface refusals and carry no fee amount", () => {
    assert.ok(invite);
    const blob = [
      invite.screen.heading,
      invite.screen.body,
      invite.screen.button,
      invite.mail.subject,
      invite.mail.preheader,
      invite.mail.body,
      invite.mail.cta,
      waitlistApplyMail("Kyoto", "there").body,
    ].join("\n");
    assert.deepEqual(blogBannedHits(blob), []);
    assert.deepEqual(siteNeverSayHits(blob), []);
    assert.doesNotMatch(blob, /[$€£¥%]|\b\d/);
  });
});
