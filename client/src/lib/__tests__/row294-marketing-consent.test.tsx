/**
 * Row 294 (ledger `2026-10-30-row294-marketing-consent`): the waitlist news box.
 * DB-free. The storage half is server/__tests__/row294-marketing-consent.db.test.ts.
 *
 *   D1  the label is exactly "Send me news and offers from Traveloure. You can unsubscribe at any time."
 *   D2  traveler, provider and expert each start the box unticked.
 *
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/lib/__tests__/row294-marketing-consent.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import {
  WAITLIST_MARKETING_BOX_ENABLED,
  WAITLIST_MARKETING_CONSENT_LINE,
  WAITLIST_MARKETING_CONSENT_VERSION,
} from "@shared/launch-waitlist";
import { ExpertForm } from "../../components/waitlist/ExpertWaitlistForm";
import { ConsentBoxes, marketingBoxOpen } from "../../pages/launch-waitlist";

(globalThis as any).React = React;

const PAGE = fs.readFileSync("client/src/pages/launch-waitlist.tsx", "utf8");
const EXPERT = fs.readFileSync("client/src/components/waitlist/ExpertWaitlistForm.tsx", "utf8");
const LINE = "Send me news and offers from Traveloure. You can unsubscribe at any time.";
const noop = () => {};

function render(node: React.ReactElement): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, enabled: false } } });
  return renderToString(<Router ssrPath="/kyoto"><QueryClientProvider client={client}>{node}</QueryClientProvider></Router>);
}

function checkbox(html: string, id: string): string {
  return html.match(new RegExp(`<button[^>]*data-testid="${id}"[^>]*>`))?.[0] ?? "";
}

describe("row 294 — the news box starts unticked", () => {
  it("D1 the label is the approved sentence", () => {
    assert.equal(WAITLIST_MARKETING_CONSENT_LINE, LINE);
    assert.equal(WAITLIST_MARKETING_CONSENT_VERSION, "r294-2026-10-31");
    assert.ok(WAITLIST_MARKETING_CONSENT_VERSION.length <= 40);
    assert.equal(WAITLIST_MARKETING_BOX_ENABLED, true);
    assert.equal(marketingBoxOpen("kyoto"), true);
  });

  it("D2 traveler, provider and expert render the box unticked", () => {
    assert.equal((PAGE.match(/const \[marketingConsent, setMarketingConsent\] = useState\(false\);/g) ?? []).length, 2);
    assert.equal((EXPERT.match(/const \[marketingConsent, setMarketingConsent\] = useState\(false\);/g) ?? []).length, 1);
    for (const [role, id] of [["traveler", "checkbox-waitlist-marketing-consent"], ["provider", "checkbox-provider-marketing-consent"]] as const) {
      const html = render(
        <ConsentBoxes
          role={role}
          market="kyoto"
          consent={false}
          onConsent={noop}
          marketingConsent={false}
          onMarketingConsent={noop}
          marketingOpen={marketingBoxOpen("kyoto")}
        />,
      );
      assert.match(checkbox(html, id), /aria-checked="false"/, role);
      assert.ok(html.includes(`>${LINE}<`), role);
    }
    const expert = render(<ExpertForm source={null} launchMarket="kyoto" keepRates={null} />);
    assert.match(checkbox(expert, "checkbox-expert-marketing-consent"), /aria-checked="false"/);
    assert.ok(expert.includes(`>${LINE}<`));
  });
});
