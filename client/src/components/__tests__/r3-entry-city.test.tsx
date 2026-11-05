/**
 * Round 3 lane R3-2 (entry and city; ledger `2026-11-05-r3-entry-city`). Behaviour pins, one per row:
 *   E6  R3-6: `/experiences?group=` (onlyGroup) is a FILTER, not an answer — a city plus the filter asks the occasion
 *       (the wedding is offered under hosted events); a door that NAMES a group still goes straight to the party.
 *   E7  R3-7: a landing moment pill goes to `/experiences/<slug>?destination=<marquee>`, never the start pop-up.
 *   E8  R3-8: "Next month" scopes the picker to next month and sets no dates.
 *   E9  R3-9: the event drawer draws the date always, the time when stated, the image when present, and the
 *       description only when the server sent reviewed text.
 *   E11 R3-11: the ribbon drops its beta label on `/` only; the Continue bar is sticky at phone width only.
 *   E12 R3-12: "Recent plans in Kyoto", in the server's recency order, no eyebrow, count or popularity cue.
 */
import { describe, it } from "node:test";
import "./node-navigator";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { SignInModalProvider } from "../../contexts/SignInModalContext";
import { EventSheetBody } from "../city-feed-card";
import { TickerRibbon } from "../ticker-ribbon";
import { ExperiencesRailView, recentPlanCards } from "../landing/experiences-rail";
import { doorChoseGroup, initialPlanEntry, momentPillHref, nextMonthScope } from "../../lib/plan-entry";
import { eventDrawerWhen } from "../../lib/event-drawer";
import { ribbonShowsBetaLabel } from "@shared/ticker";
import { orderRecentPlanOccasions, recentPlansHeading } from "@shared/landing-recent-plans";

(globalThis as any).React = React;
const ROOT = resolve(import.meta.dirname, "../../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function render(node: React.ReactNode, path = "/"): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  qc.setQueryData(["/api/public/signup-mode"], { mode: "waitlist" });
  qc.setQueryData(["/api/auth/user"], null);
  return renderToString(
    <QueryClientProvider client={qc}>
      <Router ssrPath={path}>
        <SignInModalProvider>{node}</SignInModalProvider>
      </Router>
    </QueryClientProvider>,
  );
}

describe("R3-2 entry and city", () => {
  it("E6 a ?group= filter asks the occasion; a named group does not", () => {
    assert.equal(doorChoseGroup({ group: "hosted_events", onlyGroup: "hosted_events" }), false);
    assert.equal(doorChoseGroup({ group: "hosted_events" }), true);
    assert.equal(doorChoseGroup(null), false);
    const filtered = initialPlanEntry({ city: "Kyoto", country: "Japan", group: "hosted_events", onlyGroup: "hosted_events" });
    assert.equal(filtered.step, "occasion", "the visitor answers the occasion (the wedding is offered)");
    assert.equal(filtered.state.group, "hosted_events", "the filter still pre-selects its group chip");
    const named = initialPlanEntry({ city: "Kyoto", country: "Japan", group: "hosted_events" });
    assert.equal(named.step, "details", "a door that names the group has answered it");
    const src = read("client/src/components/plan/PlanEntry.tsx");
    assert.match(src, /useState\(doorChoseGroup\(source\)\)/);
    assert.doesNotMatch(src, /!!\(source\?\.group \|\| groupChosen\)/);
  });

  it("E7 a moment pill opens its occasion page in the marquee city", () => {
    assert.equal(momentPillHref("proposal", "Kyoto"), "/experiences/proposal?destination=Kyoto");
    assert.equal(momentPillHref(null, "Kyoto"), null);
    assert.equal(momentPillHref("proposal", ""), null);
    const src = read("client/src/components/landing/moments-section.tsx");
    const body = src.slice(src.indexOf("const openMoment"), src.indexOf("open({", src.indexOf("const openMoment")));
    assert.match(body, /momentPillHref\(m\.experienceSlug, marquee\.cityName\)/);
    assert.match(body, /setLocation\(href\)/);
  });

  it("E8 Next month scopes the picker and sets no dates", () => {
    assert.deepEqual(nextMonthScope(new Date(2026, 10, 5)), { min: "2026-12-01", max: "2026-12-31" });
    assert.deepEqual(nextMonthScope(new Date(2026, 11, 20)), { min: "2027-01-01", max: "2027-01-31" });
    const src = read("client/src/components/plan/PlanEntry.tsx");
    assert.doesNotMatch(src, /\.\.\.nextMonth\(/, "no chip spreads next month's dates into the state");
    assert.match(src, /setDateScope\(nextMonthScope\(new Date\(\)\)\)/);
    assert.equal((src.match(/min=\{dateScope\?\.min\} max=\{dateScope\?\.max\}/g) ?? []).length, 2);
  });

  it("E9 the event drawer: date always, time when stated, image when present, reviewed text only", () => {
    const tz = { timeZone: "Asia/Tokyo" };
    assert.deepEqual(eventDrawerWhen("2026-11-21T19:30:00+09:00", "2026-11-21T21:00:00+09:00", tz), { dateLine: "Sat, Nov 21, 2026", timeLine: "7:30 PM" });
    assert.deepEqual(eventDrawerWhen("2026-11-21", "2026-11-30", tz), { dateLine: "Sat, Nov 21, 2026 – Mon, Nov 30, 2026", timeLine: null });
    assert.equal(eventDrawerWhen("2026-11-21T00:00:00+09:00", null, tz)?.timeLine, null, "midnight is no time claimed");
    assert.equal(eventDrawerWhen(null, null), null);
    const full = render(<EventSheetBody data={{ id: "e1", title: "Yoga by the river", date: "2026-11-21T19:30:00+09:00", endDate: null, imageUrl: "https://img.example/y.jpg", description: "Our reviewed words." }} />);
    assert.match(full, /data-testid="event-when-date-e1"/);
    assert.match(full, /data-testid="event-when-time-e1"/);
    assert.match(full, /data-testid="event-sheet-image-e1"[^>]*|<img[^>]*data-testid="event-sheet-image-e1"/);
    assert.match(full, /data-testid="event-about-e1"/);
    const bare = render(<EventSheetBody data={{ id: "e2", title: "Bare", date: "2026-11-21", description: null, imageUrl: null }} />);
    assert.match(bare, /data-testid="event-when-date-e2"/);
    assert.doesNotMatch(bare, /event-when-time-e2|event-sheet-image-e2|event-about-e2/);
  });

  it("E11 the beta line renders once on the landing; the Continue bar is not sticky on a wide screen", () => {
    assert.equal(ribbonShowsBetaLabel("/"), false);
    assert.equal(ribbonShowsBetaLabel("/?start=1"), false);
    assert.equal(ribbonShowsBetaLabel("/experiences"), true);
    const props = { items: [{ id: "t1", text: "Kyoto line" } as any], cityName: "Kyoto", button: { kind: "none" } as any };
    assert.doesNotMatch(render(<TickerRibbon {...props} showLabel={false} />), /text-ticker-label/);
    assert.match(render(<TickerRibbon {...props} />), /data-testid="text-ticker-label"[^>]*>Now in beta in Kyoto</);
    assert.match(read("client/src/components/CityTickerTape.tsx"), /showLabel=\{ribbonShowsBetaLabel\(location\)\}/);
    // Migration 384 seeds the label as a line too: it is not scrolled beside the label, and the landing draws none.
    const seeded = { ...props, items: [{ id: "b", text: "Now in beta in Kyoto" } as any, { id: "p", text: "Know Kyoto? Guides and providers can join now" } as any] };
    const elsewhere = render(<TickerRibbon {...seeded} />);
    assert.equal((elsewhere.match(/Now in beta in Kyoto/g) ?? []).length, 1, "once: the label");
    assert.match(elsewhere, /Know Kyoto\? Guides/);
    const landing = render(<TickerRibbon {...seeded} showLabel={false} />);
    assert.doesNotMatch(landing, /Now in beta in Kyoto/);
    assert.equal(render(<TickerRibbon {...props} items={[{ id: "b", text: "Now in beta in Kyoto" } as any]} showLabel={false} />), "");
    assert.match(read("client/src/components/plan/PlanEntry.tsx"), /"max-md:sticky bottom-0 z-10/);
  });

  it("E12 Recent plans in Kyoto, in recency order, with no count or eyebrow", () => {
    assert.equal(recentPlansHeading("Kyoto"), "Recent plans in Kyoto");
    assert.deepEqual(
      orderRecentPlanOccasions([
        { slug: "travel", latest: "2026-11-01T00:00:00Z" },
        { slug: "proposal", latest: "2026-11-04T00:00:00Z" },
        { slug: "wedding", latest: "2026-10-01T00:00:00Z" },
        { slug: "retreats", latest: "2026-11-05T00:00:00Z" },
        { slug: "birthday", latest: null },
      ]),
      ["proposal", "travel", "wedding"],
    );
    assert.deepEqual(recentPlanCards(["proposal", "nope", "travel"]).map((c) => c.slug), ["proposal", "travel"]);
    const html = render(<ExperiencesRailView city="Kyoto" order={["proposal", "travel"]} />);
    assert.match(html, />Recent plans in Kyoto</);
    assert.ok(html.indexOf("experience-card-proposal") < html.indexOf("experience-card-travel"));
    assert.doesNotMatch(html, /What people are planning|On Traveloure now|trending|popular/i);
    assert.doesNotMatch(html, /experience-card-wedding/);
    assert.equal(render(<ExperiencesRailView city="Kyoto" order={[]} />), "");
  });
});
