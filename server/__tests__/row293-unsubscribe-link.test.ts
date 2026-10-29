/**
 * Row 293 — the waitlist "we're open" unsubscribe link is the /unsubscribe page.
 *
 * Pure checks of the URL builder and the two mail builders. No query, no route.
 * Run:
 *   npx tsx --test server/__tests__/row293-unsubscribe-link.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { marketingEmailFooterFromValues } from "@shared/marketing-email-footer";
import { buildItineraryFollowupEmail } from "../services/itinerary-followup-email";
import { buildWaitlistOpenEmail } from "../services/waitlist-open-email";
import {
  verifyWaitlistUnsubscribeToken,
  waitlistUnsubscribeUrl,
} from "../services/waitlist-unsubscribe-token";

const WAITLIST_ID = "11111111-2222-4333-8444-555555555555";

function withAppBaseUrl(base: string, run: () => void): void {
  const previous = process.env.APP_BASE_URL;
  process.env.APP_BASE_URL = base;
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = previous;
  }
}

function footer() {
  const parsed = marketingEmailFooterFromValues({
    marketing_email_sender_name: "Example Sender LLC",
    marketing_email_opt_out_address: "opt-out@example.test",
    marketing_email_postal_address: "CONFIGURED-POSTAL-LINE-1",
    marketing_email_complaint_contact: "complaints@example.test",
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("footer fixture");
  return parsed.footer;
}

test("L1 APP_BASE_URL builds /unsubscribe?token= and not an API path", () => {
  withAppBaseUrl("https://app.example.test", () => {
    const link = waitlistUnsubscribeUrl(WAITLIST_ID);
    assert.equal(link.startsWith("https://app.example.test/unsubscribe?token="), true);
    assert.equal(link.includes("/unsubscribe?token="), true);
    assert.equal(link.includes("/api/"), false);
  });
});

test("L2 a trailing slash on the base does not double the slash before unsubscribe", () => {
  for (const base of ["https://app.example.test", "https://app.example.test/"]) {
    withAppBaseUrl(base, () => {
      const link = waitlistUnsubscribeUrl(WAITLIST_ID);
      assert.equal(link.startsWith("https://app.example.test/unsubscribe?token="), true);
      assert.equal(link.includes("example.test//unsubscribe"), false);
    });
  }
});

test("L3 the page token round-trips, and a tampered token does not", () => {
  withAppBaseUrl("https://app.example.test", () => {
    const link = waitlistUnsubscribeUrl(WAITLIST_ID);
    const token = new URL(link).searchParams.get("token");
    assert.equal(typeof token, "string");
    assert.equal(verifyWaitlistUnsubscribeToken(token!), WAITLIST_ID);
    const tampered = token!.slice(0, -1) + (token!.endsWith("a") ? "b" : "a");
    assert.equal(verifyWaitlistUnsubscribeToken(tampered), null);
  });
});

test("L4 the waitlist-open body and footer carry the page link and not the API path", () => {
  withAppBaseUrl("https://app.example.test", () => {
    const link = waitlistUnsubscribeUrl(WAITLIST_ID);
    const message = buildWaitlistOpenEmail({
      cityName: "Exampleville",
      unsubscribeUrl: link,
      footer: footer(),
    });
    assert.ok(message);
    const combined = `${message.html}\n${message.text}`;
    assert.equal(message.html.includes("/unsubscribe?token="), true);
    assert.equal(message.text.includes("/unsubscribe?token="), true);
    assert.equal(combined.includes(link), true);
    assert.equal(combined.includes("/api/waitlist/unsubscribe"), false);
    assert.equal(message.html.includes("Unsubscribe from waitlist emails"), true);
  });
});

test("L5 non-waitlist footer links stay the itinerary path and mailto", () => {
  const followup = buildItineraryFollowupEmail({
    kind: "itinerary_nudge_2h",
    itineraryId: "plan-1",
    firstName: "QA",
    destination: "Exampleville",
    baseUrl: "https://app.example.test",
    unsubscribeToken: "token-1",
    bookable: true,
  });
  assert.ok(followup);
  assert.equal(
    followup.unsubscribeUrl,
    "https://app.example.test/email-preferences/unsubscribe/token-1",
  );
  assert.equal(followup.html.includes("/email-preferences/unsubscribe/token-1"), true);
  assert.equal(followup.text.includes("/email-preferences/unsubscribe/token-1"), true);
  assert.equal(`${followup.html}\n${followup.text}`.includes("/unsubscribe?token="), false);

  const applyInvite = readFileSync(
    new URL("../services/waitlist-apply-invite-email.ts", import.meta.url),
    "utf8",
  );
  assert.equal(
    applyInvite.includes("renderMarketingEmailFooter(identity.footer, `mailto:${identity.footer.optOutAddress}`)"),
    true,
  );
  assert.equal(applyInvite.includes("/unsubscribe?token="), false);
  assert.equal(applyInvite.includes("waitlistUnsubscribeUrl"), false);
});
