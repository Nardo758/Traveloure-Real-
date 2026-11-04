/**
 * OCC-1 (ledger `2026-11-04-occ1-occasion-entries`; Leon, Nov 3: "/weddings, /proposals and /experiences/:occasion open
 * the generic flow with the occasion set … /experiences?group= filters the content, and /marketplace gets fixed or
 * removed from the nav").
 *
 *   T1 /weddings → /experiences/wedding, which opens PlanEntry with the catalog slug `wedding` carried (the group follows
 *      the catalog row once it loads; `wedding` is the hosted-events group's own slug).
 *   T2 /proposals → /experiences/proposal likewise; /marketplace → /destinations.
 *   T3 /experiences?group=celebrations shows only that group's chip (and, under "More specific", only its occasions);
 *      ?group=bogus filters nothing.
 *   T4 the Marketplace trigger is a link to /destinations; the dropdown keeps its children; one open menu (QA F6).
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/row-occ1.test.tsx
 */
import { describe, it } from "node:test";
import "../../__tests__/node-navigator";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { OCCASION_GROUP_DEFAULT_SLUG, OCCASION_GROUP_ORDER } from "@shared/experience-group";
import { initialPlanEntry, shownOccasionGroups } from "../../../lib/plan-entry";
import { preselectedGroup } from "../../../lib/experiences-entry";
import { navGroupsConfig, authNavConfig } from "../../../lib/nav-config";
import { PlanEntryPanel } from "@/components/plan/PlanEntry";
import { OccasionPicker } from "@/components/plan/OccasionPicker";

(globalThis as any).React = React;

const ROOT = resolve(import.meta.dirname, "../../../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const APP = read("client/src/App.tsx");

function redirect(from: string, to: string) {
  const esc = (s: string) => s.replace(/[/.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(APP, new RegExp(`<Route path="${esc(from)}">\\s*<Redirect to="${esc(to)}" />\\s*</Route>`), `${from} → ${to}`);
}

function renderPanel(source: any): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, queryFn: async () => [] } } });
  client.setQueryData(["/api/experience-types"], []);
  client.setQueryData(["/api/city-events/upcoming"], []);
  return renderToString(
    <Router ssrPath="/experiences">
      <QueryClientProvider client={client}>
        <PlanEntryPanel active source={source} onStart={async () => ({ ok: true })} container="page" />
      </QueryClientProvider>
    </Router>,
  );
}

describe("OCC-1", () => {
  it("T1 /weddings opens the generic flow with the wedding occasion", () => {
    redirect("/weddings", "/experiences/wedding");
    assert.match(APP, /<Route path="\/experiences\/:slug">/, "the occasion route the redirect lands on");
    const { state } = initialPlanEntry({ experienceSlug: "wedding", newPlan: true } as any);
    assert.equal(state.occasionSlug, "wedding", "the catalog slug is carried");
    assert.equal(OCCASION_GROUP_DEFAULT_SLUG.hosted_events, "wedding", "wedding is the hosted-events group's slug");
    assert.match(read("client/src/pages/experiences.tsx"), /\.\.\.\(routeSlug \? \{ experienceSlug: routeSlug \} : \{\}\)/);
  });

  it("T2 /proposals and /marketplace", () => {
    redirect("/proposals", "/experiences/proposal");
    redirect("/marketplace", "/destinations");
    assert.equal(initialPlanEntry({ experienceSlug: "proposal", newPlan: true } as any).state.occasionSlug, "proposal");
    const routes = read("shared/client-routes.generated.ts");
    for (const r of ["/weddings", "/proposals", "/marketplace"]) assert.ok(routes.includes(`"${r}"`), r);
  });

  it("T3 ?group= filters the occasion step; an unknown group filters nothing", () => {
    assert.equal(preselectedGroup(new URLSearchParams("group=celebrations")), "celebrations");
    assert.equal(preselectedGroup(new URLSearchParams("group=bogus")), null);
    assert.deepEqual(shownOccasionGroups(OCCASION_GROUP_ORDER, "celebrations"), ["celebrations"]);
    assert.deepEqual(shownOccasionGroups(OCCASION_GROUP_ORDER, null), [...OCCASION_GROUP_ORDER]);
    assert.deepEqual(shownOccasionGroups(["trips", "moments"], "celebrations"), ["trips", "moments"], "a group the catalog lacks filters nothing");

    const filtered = renderPanel({ city: "Kyoto", country: "Japan", onlyGroup: "celebrations", newPlan: true });
    assert.match(filtered, /data-testid="plan-entry-group-celebrations"/);
    for (const g of OCCASION_GROUP_ORDER.filter((k) => k !== "celebrations")) {
      assert.doesNotMatch(filtered, new RegExp(`data-testid="plan-entry-group-${g}"`), g);
    }
    const all = renderPanel({ city: "Kyoto", country: "Japan", newPlan: true });
    for (const g of OCCASION_GROUP_ORDER) assert.match(all, new RegExp(`data-testid="plan-entry-group-${g}"`), g);

    const catalog = [
      { id: "1", slug: "birthday", name: "Birthday", defaultGuests: true, defaultDuration: "day", defaultStops: "one", vocabulary: "guests" },
      { id: "2", slug: "travel", name: "Trip", defaultGuests: false, defaultDuration: "range", defaultStops: "many", vocabulary: "travelers" },
    ];
    const picker = (onlyGroup: any) =>
      renderToString(<OccasionPicker occasions={catalog as any} value="" onPick={() => {}} initialGroup={onlyGroup} onlyGroup={onlyGroup} />);
    const p = picker("celebrations");
    assert.doesNotMatch(p, /data-testid="occasion-see-all"/, "a filtered picker has no See all");
    const groupChips = p.match(/data-testid="occasion-group-[a-z_]+"/g) ?? [];
    assert.deepEqual(groupChips, ['data-testid="occasion-group-celebrations"'], "only the filtered group's chip");
    assert.match(p, />Birthday</, "the group's occasion is listed");
    assert.doesNotMatch(p, />Trip</, "another group's occasion is not");
    const open = picker(null);
    assert.match(open, /data-testid="occasion-see-all"/);
    assert.match(open, /data-testid="occasion-group-trips"/);

    assert.match(read("client/src/pages/experiences.tsx"), /\.\.\.\(group \? \{ onlyGroup: group \} : \{\}\)/);
  });

  it("T4 the Marketplace trigger is a link; the dropdown and the one-open-menu rule stay", () => {
    const market = navGroupsConfig.find((g) => g.name === "Marketplace");
    assert.ok(market);
    assert.equal(market!.href, "/destinations");
    assert.ok((market!.sections ?? []).some((s) => s.items.length > 0), "the dropdown keeps its children");
    assert.ok(!authNavConfig.some((i) => i.label === "Marketplace"), "the unused flat entry is gone");
    const layout = read("client/src/components/layout.tsx");
    assert.match(layout, /\{item\.href \? \(\s*<Link\s+href=\{item\.href\}/, "a group with an href renders its trigger as a Link");
    assert.match(layout, /data-testid=\{`button-nav-dropdown-\$\{slugify\(item\.name\)\}`\}[\s\S]{0,400}<\/Link>/);
    assert.match(layout, /if \(e\.key === "Enter"\) return;/, "Enter follows the link");
    assert.match(layout, /setOpenMenu\(\(prev\) => \(next \? item\.name : prev === item\.name \? null : prev\)\)/, "QA F6: one open menu");
  });
});
