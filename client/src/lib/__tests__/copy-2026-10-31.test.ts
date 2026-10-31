/**
 * Four one-string copy changes (ledger `2026-10-31-four-copy-strings`).
 *
 *   C1 the approved strings, held once in shared/copy-2026-10-31.ts.
 *   C2 the denied provider page and the waitlist mail say "Sign up as a provider"; the page links to provider sign-up.
 *   C3 the Discover headline over external content reads "Discover ‹Market›" and no longer renders the trend line.
 *   C4 the comparison board's add toast is the one approved line.
 *   C5 no shipped string says "founding": the expert heading reads "Local experts — apply now".
 *
 * Run: npx tsx --test client/src/lib/__tests__/copy-2026-10-31.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { COMPARISON_ADD_TOAST_COPY, DISCOVER_HEADLINE_COPY, PROVIDER_SIGNUP_COPY } from "@shared/copy-2026-10-31";
import { waitlistApplyMail } from "@shared/waitlist-apply-invite";

const read = (p: string) => fs.readFileSync(p, "utf8");

describe("four copy strings (Oct 31)", () => {
  it("C1: the approved strings", () => {
    assert.deepEqual({ ...PROVIDER_SIGNUP_COPY }, {
      label: "Sign up as a provider",
      href: "/signup?intent=supply&supplyRole=provider",
    });
    assert.equal(DISCOVER_HEADLINE_COPY.forMarket("Kyoto"), "Discover Kyoto");
    assert.equal(COMPARISON_ADD_TOAST_COPY.added, "Added. Your other stops are unchanged.");
  });

  it("C2: provider sign-up wording and link", () => {
    assert.equal(waitlistApplyMail("Kyoto", "Aiko").preheader, "Run a business in Kyoto? Sign up as a provider.");
    const status = read("shared/application-status.ts");
    assert.ok(status.includes("actionHref: PROVIDER_SIGNUP_COPY.href"));
    assert.ok(status.includes("actionLabel: PROVIDER_SIGNUP_COPY.label"));
    const listing = read("client/src/pages/dashboard-listing.tsx");
    assert.ok(listing.includes("<Link href={PROVIDER_SIGNUP_COPY.href}>"));
    for (const src of [status, listing]) assert.equal(src.includes("Apply as a provider"), false);
  });

  it("C3: the Discover headline names the market", () => {
    const page = read("client/src/pages/discover-location.tsx");
    assert.ok(page.includes("DISCOVER_HEADLINE_COPY.forMarket(displayCity)"));
    assert.equal(page.includes("externalTrendContext"), false);
  });

  it("C4: the add toast is one line", () => {
    const page = read("client/src/pages/itinerary-comparison.tsx");
    assert.ok(page.includes("title: COMPARISON_ADD_TOAST_COPY.added,"));
    assert.equal(/title: "Added to your plan",\s*description: "Added\. Your other stops are unchanged\."/.test(page), false);
  });

  it("C5: no 'founding' in the expert heading or the experts scroll", () => {
    assert.match(read("client/src/lib/wlb-signup-copy.ts"), /expertHeading: "Local experts — apply now"/);
    const scroll = read("client/src/components/dashboard/ExpertsScroll.tsx")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    assert.equal(/founding/i.test(scroll), false);
  });
});
