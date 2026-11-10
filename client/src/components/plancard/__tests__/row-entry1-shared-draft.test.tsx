/**
 * ENTRY-1 (ledger `2026-11-03-entry1-shared-draft`): one plan draft — every entry writes it, every step reads it.
 *
 *   T1 guestAnswersLine leads with the occasion's name; the gate description keeps "Your answers are kept."
 *   T2 a PlanEntry start with dates mints them (datesConfirmed true); without, none are sent (false)
 *   T3 planTitle: "Proposal in Kyoto" with an occasion, "Kyoto trip" without — and the mint body uses it
 *   T4 every date/city writer also refreshes the slip header's trip read ([api.trips.get.path, id])
 *   T5 a city page carries its city (the pop-up opens at the occasion step); /about carries nothing ("around")
 *   T6 PlanEntry: no group chip is drawn chosen until one is picked (or a door carried the group or an occasion); the footer reads the held label
 *   T7 the pop-up's URL: ?start=1 (+ &step=), other params kept; the provider pushes, removes and reads it
 *   T8 a neighbourhood with id + slug homes its wanted tile in its own section; the tile names its neighbourhood
 *   T9 every Start-a-plan control on the landing page and in the nav/footer is a real <a href> link
 *
 * Harness: pure helpers, react-dom/server for the chips, and source asserts where a click or a browser
 * history call would need a DOM (none here).
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/row-entry1-shared-draft.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { api } from "@shared/routes";
import { GUEST_ANSWERS_KEPT, guestAnswersLine, guestGateDescription } from "@/lib/guest-map";
import { buildTripMintBody, planTitle } from "@/lib/trip-slip";
import {
  cityPageSource,
  initialPlanEntry,
  planEntryMintBasics,
  planEntryUrlRequested,
  PLAN_START_HREF,
  withPlanEntryUrl,
} from "@/lib/plan-entry";
import { neighbourhoodHomeKey } from "@/lib/wanted-slot-link";
import {
  ARASHIYAMA_ITINERARY_EXPERT_LINK,
  ARASHIYAMA_ITINERARY_PROVIDER_LINK,
  itineraryExpertLink,
  itineraryProviderLink,
} from "@/lib/arashiyama-wanted-copy";
import { PLAN_ENTRY_CONTINUE, PlanEntryPanel } from "@/components/plan/PlanEntry";
import { reservationEventDate } from "@/components/plancard/SlipLogisticsSection";

(globalThis as any).React = React;

const src = (p: string) => fs.readFileSync(p, "utf8");
const ANSWERS = {
  title: "",
  stops: ["Kyoto, Japan"],
  startDate: "2026-11-12",
  endDate: "2026-11-16",
  adults: "2",
  kids: "",
  budgetApproverName: "",
  budgetApproverEmail: "",
  accessibilityNote: "",
  mainMomentTime: "",
  mainMomentDate: "",
  events: [],
  occasionSlug: "proposal",
};

describe("T1 the occasion on the guest map", () => {
  it("leads with the occasion's name; with a city only the kept sentence is intact", () => {
    const line = guestAnswersLine(ANSWERS, "Kyoto, Japan", "Proposal");
    assert.ok(line?.startsWith("Proposal"), String(line));
    assert.equal(line, "Proposal, Kyoto, Thu 12 – Mon 16 Nov 2026 and 2 adults");
    const cityOnly = guestAnswersLine({ ...ANSWERS, startDate: "", endDate: "", adults: "", occasionSlug: "" }, "Kyoto");
    assert.equal(cityOnly, "Kyoto");
    assert.equal(GUEST_ANSWERS_KEPT, "Your answers are kept.");
    assert.equal(guestGateDescription(cityOnly, { kind: "start" }), "Kyoto. Your answers are kept. Your empty plan opens here, on the map.");
    assert.equal(guestAnswersLine(ANSWERS, "Kyoto"), "Kyoto, Thu 12 – Mon 16 Nov 2026 and 2 adults", "no name passed ⇒ no occasion shown");
  });
});

describe("T2 dates are asked once", () => {
  it("dates on the entry reach the mint and confirm; none ⇒ none sent", () => {
    const withDates = planEntryMintBasics({ destination: "Kyoto, Japan", startDate: "2026-11-12", endDate: "2026-11-16" });
    assert.deepEqual(withDates, { destination: "Kyoto, Japan", startDate: "2026-11-12", endDate: "2026-11-16", datesConfirmed: true });
    const none = planEntryMintBasics({ destination: "Kyoto, Japan" });
    assert.deepEqual(none, { destination: "Kyoto, Japan", datesConfirmed: false });
    assert.equal(planEntryMintBasics({ destination: "Kyoto", startDate: "2026-11-12" }).datesConfirmed, false, "one date is not a window");
    const ctx = src("client/src/contexts/PlanningContext.tsx");
    assert.match(ctx, /planEntryMintBasics\(start\)/);
    // The Reservation panel's date follows the plan, and a placeholder window is not a date.
    assert.equal(reservationEventDate({ startDate: "2026-11-12", datesConfirmed: false }), "");
    assert.equal(reservationEventDate({ startDate: "2026-11-12", datesConfirmedAt: null }), "");
    assert.equal(reservationEventDate({ startDate: "2026-11-12", datesConfirmedAt: "2026-11-01T00:00:00Z" }).slice(0, 10), "2026-11-12");
  });
});

describe("T3 the plan title", () => {
  it("composes the occasion with the city; the mint uses it", () => {
    assert.equal(planTitle({ city: "Kyoto", occasionName: "Proposal" }), "Proposal in Kyoto");
    // A-34: no occasion ⇒ "{City}, {date range}", or the city alone when no dates were chosen.
    assert.equal(planTitle({ city: "Kyoto" }), "Kyoto");
    assert.equal(planTitle({ city: "Kyoto", occasionName: "  " }), "Kyoto");
    assert.equal(buildTripMintBody({ destination: "Kyoto, Japan", startDate: "2026-11-12", endDate: "2026-11-16", occasionName: "Proposal" }).title, "Proposal in Kyoto");
    assert.equal(buildTripMintBody({ destination: "Kyoto, Japan", startDate: "2026-11-12", endDate: "2026-11-16" }).title, "Kyoto, Thu 12 – Mon 16 Nov 2026");
    assert.equal(buildTripMintBody({ destination: "Kyoto, Japan", title: "Our anniversary", occasionName: "Proposal" } as any).title, "Our anniversary");
  });
});

describe("T4 the slip header's trip read is refreshed", () => {
  it("invalidatePlan and the three other writers include [api.trips.get.path, tripId]", () => {
    assert.equal(api.trips.get.path, "/api/trips/:id");
    for (const f of [
      "client/src/components/plan/SlipAnchorPanels.tsx",
      "client/src/components/plancard/KeepOccasionDate.tsx",
      "client/src/lib/plan-city-writer.ts",
      "client/src/components/travelpulse/CityGrid.tsx",
    ]) {
      assert.match(src(f), /queryKey: \[api\.trips\.get\.path, tripId\]/, f);
    }
    const presets = src("client/src/components/logistics/wedding-anchor-presets.tsx");
    assert.match(presets, /\/plancard`\] \}\)/, "generated anchors refresh the plancard");
    assert.match(presets, /setCustomEventDate\(eventDate \|\| ""\);\n  \}, \[eventDate\]\);/, "the field follows the plan's date");
  });
});

describe("T5 a city page carries its city", () => {
  it("/discover/location/Kyoto ⇒ Kyoto, occasion step; /about ⇒ nothing, around", () => {
    const kyoto = cityPageSource("/discover/location/Kyoto");
    assert.deepEqual(kyoto, { city: "Kyoto", country: "Japan" });
    assert.equal(initialPlanEntry({ ...kyoto!, newPlan: true } as any).step, "occasion");
    assert.equal(cityPageSource("/discover/location/Atlantis"), null, "not one of the eight ⇒ nothing carried");
    assert.equal(cityPageSource("/about"), null);
    assert.equal(initialPlanEntry({ newPlan: true } as any).step, "around");
    assert.match(src("client/src/components/layout.tsx"), /cityPageSource\(path\)/);
  });
});

function renderPanel(source: any): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, queryFn: async () => [] } } });
  client.setQueryData(["/api/experience-types"], []);
  client.setQueryData(["/api/city-events/upcoming"], []);
  return renderToString(
    <Router ssrPath="/">
      <QueryClientProvider client={client}>
        <PlanEntryPanel active source={source} onStart={async () => ({ ok: true })} container="page" />
      </QueryClientProvider>
    </Router>,
  );
}

describe("T6 the group chips and the footer", () => {
  it("no chip is chosen before a pick; a chosen group is; the footer reads the held label", () => {
    const fresh = renderPanel({ city: "Kyoto", country: "Japan", newPlan: true });
    assert.match(fresh, /data-testid="plan-entry-group-trips"/);
    assert.doesNotMatch(fresh, /aria-pressed="true"[^>]*data-testid="plan-entry-group-/, "the default group is not drawn as chosen");
    // E-2 (round 2 rulings, sanctioned edit): a door that already chose the occasion is not asked again — it opens on
    // dates and party, with the choice named at the top.
    const chosen = renderPanel({ city: "Kyoto", country: "Japan", group: "trips", experienceSlug: "vacation", newPlan: true });
    assert.match(chosen, /data-testid="plan-entry-step-details"/);
    assert.doesNotMatch(chosen, /data-testid="plan-entry-group-/);
    assert.match(chosen, /data-testid="plan-entry-carried-group"/);
    assert.equal(PLAN_ENTRY_CONTINUE, "Continue");
    assert.match(fresh, new RegExp(`data-testid="button-plan-entry-start"[^>]*>${PLAN_ENTRY_CONTINUE}<`));
    const panel = src("client/src/components/plan/PlanEntry.tsx");
    assert.match(panel, /setGroupChosen\(true\);\n\s*setState\(\(s\) => \(\{ \.\.\.s, \.\.\.choosePlanEntryGroup\(s, key\) \}\)\);\n\s*\}\}/, "a click marks the group chosen and does not advance");
  });
});

describe("T7 the pop-up has a URL", () => {
  it("?start=1 and &step= are added and removed, other params kept; the provider pushes, removes and reads it", () => {
    assert.equal(withPlanEntryUrl("", true), "?start=1");
    assert.equal(withPlanEntryUrl("?ref=ig", true, "occasion"), "?ref=ig&start=1&step=occasion");
    assert.equal(withPlanEntryUrl("?ref=ig&start=1&step=occasion", false), "?ref=ig");
    assert.equal(withPlanEntryUrl("", true, "nonsense"), "?start=1", "an unknown step is not written");
    assert.equal(planEntryUrlRequested("?start=1"), true);
    assert.equal(planEntryUrlRequested("?start=0"), false);
    assert.equal(PLAN_START_HREF, "/?start=1");
    const ctx = src("client/src/contexts/PlanningContext.tsx");
    assert.match(ctx, /writeEntryUrl\("push", true\)/, "open() pushes ?start=1");
    assert.match(ctx, /window\.history\.back\(\)/, "close() removes it");
    assert.match(ctx, /addEventListener\("popstate", sync\)/, "Back closes it");
    assert.match(ctx, /if \(planEntryUrlRequested\(window\.location\.search\)\) sync\(\);/, "mounting with ?start=1 opens it");
  });
});

describe("T8 wanted tiles home by slug", () => {
  it("a neighbourhood with id and slug keys both sides on the slug; the tile names its neighbourhood", () => {
    const nb = { id: 41, slug: "fushimi", name: "Fushimi" };
    assert.equal(neighbourhoodHomeKey(nb), "fushimi");
    assert.equal(neighbourhoodHomeKey({ id: 7 }), "7");
    assert.equal(neighbourhoodHomeKey(null), null);
    const page = src("client/src/pages/discover-location.tsx");
    assert.match(page, /const sectionKey = \(nb: any\): string \| null => neighbourhoodHomeKey\(nb\);/);
    assert.match(page, /neighborhoodId: neighbourhoodHomeKey\(\{ slug: nb\.slug, id: nb\.id, name: nbName \}\)/);
    assert.equal(itineraryExpertLink("Arashiyama"), ARASHIYAMA_ITINERARY_EXPERT_LINK);
    assert.equal(itineraryProviderLink("Arashiyama"), ARASHIYAMA_ITINERARY_PROVIDER_LINK);
    assert.equal(itineraryExpertLink("Fushimi"), "Know Fushimi well? Apply now as a local expert.");
    assert.equal(itineraryProviderLink("Fushimi"), "Run a business in Fushimi? Sign up as a provider.");
    assert.match(src("client/src/components/feed/wanted-slot-card.tsx"), /itineraryExpertLink\(neighborhoodName\)/);
  });
});

describe("T9 Start-a-plan controls are links", () => {
  it("each site renders a wouter Link to the pop-up's URL and keeps its handler", () => {
    const sites: Array<[string, number]> = [
      ["client/src/components/landing/landing-hero.tsx", 4],
      ["client/src/components/landing/moments-section.tsx", 1],
      ["client/src/components/landing/events-strip.tsx", 1],
      // Cut-list #1 slice A: the two HEADER CTAs now render through ONE component
      // (`HeaderPlanCTA`), so layout keeps a single inline PLAN_START_HREF link — the footer's. The
      // header's start state is still a real <a href={PLAN_START_HREF}> and still keeps its handler;
      // both are asserted in the component, below.
      ["client/src/components/layout.tsx", 1],
    ];
    for (const [f, n] of sites) {
      const s = src(f);
      assert.equal((s.match(/<Link href=\{PLAN_START_HREF\}/g) ?? []).length, n, f);
      assert.ok((s.match(/onClick=\{planStartClick\(/g) ?? []).length >= n, f);
    }
    const layoutSrc = src("client/src/components/layout.tsx");
    assert.equal((layoutSrc.match(/<HeaderPlanCTA/g) ?? []).length, 2, "both header mounts");
    assert.ok((layoutSrc.match(/onStart=\{planStartClick\(/g) ?? []).length >= 2, "…each with its handler");
    const cta = src("client/src/components/HeaderPlanCTA.tsx");
    assert.match(cta, /<Link href=\{href\}>\{START_PLAN_LABEL\}<\/Link>/, "the label is a real link");
    assert.match(cta, /state\.kind === "start" \? PLAN_START_HREF/, "the start state keeps the pop-up URL");
  });
});
