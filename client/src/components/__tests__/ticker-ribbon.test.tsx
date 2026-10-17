/**
 * LW-1f (ledger `2026-10-16-lw1f-kyoto-ticker`; hand-off Part A item 12): the ribbon's render proofs. DB-free, no
 * jsdom — react-dom/server under wouter's <Router ssrPath>, the storefront-link.test.tsx harness.
 *
 *   R1  an empty list renders NOTHING (no ribbon at all).
 *   R2  by default the left label is "Now in beta in Kyoto"; no "N cities" text anywhere, in any mode.
 *   R5  (LW-1f-b, issue #1486) the label names the beta list's cities — two read "Kyoto and Goa", three "Kyoto, Goa
 *       and Porto" — and an empty list falls back to the launch city. Never a count.
 *   R3  the button label follows the switch: "Join the Kyoto waitlist" (to /kyoto) or "Start planning".
 *   R4  a line with a link is a link once; the repeated copies are aria-hidden and not links.
 *
 * Run: npx tsx --test client/src/components/__tests__/ticker-ribbon.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { TickerRibbon } from "../ticker-ribbon";
import { tickerButton } from "../../../../shared/ticker";

const ITEMS = [
  { text: "Now in beta in Kyoto", href: null },
  { text: "Know Kyoto? Guides and providers can join now", href: "/signup?intent=supply" },
];

function render(el: React.ReactElement): string {
  return renderToString(<Router ssrPath="/">{el}</Router>);
}

describe("the ticker ribbon", () => {
  it("R1 — an empty list renders nothing", () => {
    assert.equal(render(<TickerRibbon items={[]} cityName="Kyoto" button={tickerButton("waitlist", "kyoto", "Kyoto")} />), "");
  });

  it("R2 — the label names the launch city and never counts cities", () => {
    for (const mode of ["waitlist", "open"]) {
      const html = render(<TickerRibbon items={ITEMS} cityName="Kyoto" button={tickerButton(mode, "kyoto", "Kyoto")} />);
      assert.match(html, /data-testid="text-ticker-label"[^>]*>Now in beta in Kyoto</);
      assert.doesNotMatch(html, /\d+\s+cities/i);
      assert.doesNotMatch(html, /in beta in \d/i);
    }
  });

  it("R3 — the button label follows the sign-up switch", () => {
    const waitlist = render(<TickerRibbon items={ITEMS} cityName="Kyoto" button={tickerButton("waitlist", "kyoto", "Kyoto")} />);
    assert.match(waitlist, /href="\/kyoto"[^>]*data-testid="link-apply-now"|data-testid="link-apply-now"[^>]*href="\/kyoto"/);
    assert.match(waitlist, /Join the Kyoto waitlist/);
    assert.doesNotMatch(waitlist, /Start planning/);
    const open = render(<TickerRibbon items={ITEMS} cityName="Kyoto" button={tickerButton("open", "kyoto", "Kyoto")} />);
    assert.match(open, /<button[^>]*data-testid="link-apply-now"/);
    assert.match(open, /Start planning/);
    assert.doesNotMatch(open, /waitlist/i);
  });

  it("R4 — each link appears once; the scrolling copies are hidden from assistive tech", () => {
    const html = render(<TickerRibbon items={ITEMS} cityName="Kyoto" button={tickerButton("waitlist", "kyoto", "Kyoto")} />);
    assert.equal((html.match(/href="\/signup\?intent=supply"/g) ?? []).length, 1);
    assert.equal((html.match(/aria-hidden="true"/g) ?? []).filter(Boolean).length >= ITEMS.length * 2, true);
  });

  it("R5 — the label names the beta cities, never a count; an empty list falls back to the launch city", () => {
    const label = (betaCities: string[]) => {
      const html = render(<TickerRibbon items={ITEMS} cityName="Kyoto" betaCities={betaCities} button={tickerButton("waitlist", "kyoto", "Kyoto")} />);
      const m = html.match(/data-testid="text-ticker-label"[^>]*>([^<]*)</);
      assert.ok(m, "the label renders");
      assert.doesNotMatch(html, /\d+\s+cities/i);
      return m![1];
    };
    assert.equal(label([]), "Now in beta in Kyoto");
    assert.equal(label(["Kyoto"]), "Now in beta in Kyoto");
    assert.equal(label(["Kyoto", "Goa"]), "Now in beta in Kyoto and Goa");
    assert.equal(label(["Kyoto", "Goa", "Porto"]), "Now in beta in Kyoto, Goa and Porto");
  });
});
