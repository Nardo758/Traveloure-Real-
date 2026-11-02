/**
 * PS-4 (ledger `2026-11-02-ps4-entry-carry-forward`): entry points carry forward what they already hold.
 *
 *   T2 a plan drafted from a saved occasion, dates unconfirmed: the owner sees "Keep {date}?" and "Change"; the one
 *      tap sends the plan's own dates (the re-date rail stamps the confirmation); no chip for a non-owner, a confirmed
 *      plan, or a plan not drafted from an occasion
 *   T3 /experiences?destinations=Kyoto,Osaka (and the queue's "Kyoto, Japan; Osaka, Japan") pre-picks Kyoto
 *   T4 the assistant's door carries dates and party; PlanEntry seeds the dates (valid pairs only) and they ride the mint
 *   T5 the Arashiyama card opens the planner (billboard door, Kyoto, new plan, the trips group) — no bare link
 *   T6 the new strings: no "AI", nothing banned
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/row-ps4-carry-forward.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { siteNeverSayHits } from "@shared/banned-copy";
import { SlipHeaderMeta } from "../SlipHeaderMeta";
import { OCCASION_DRAFT_COPY, keepDateBody, keepDateLabel, showsKeepDate } from "@/lib/occasion-draft-copy";
import { preselectedMarket } from "@/lib/experiences-entry";
import { assistantDoor } from "@/components/ai-planner-draft-panel";
import { doorDates, initialPlanEntry, planEntryMintDates } from "@/lib/plan-entry";
import { arashiyamaPlanDaySource } from "@/lib/arashiyama-wanted-copy";

(globalThis as any).React = React;

const DAY = "2027-03-13"; // a Saturday

function meta(props: Partial<React.ComponentProps<typeof SlipHeaderMeta>>) {
  const qc = new QueryClient();
  return renderToString(
    <QueryClientProvider client={qc}>
      <SlipHeaderMeta
        tripId="t1"
        startDate={DAY}
        endDate={DAY}
        datesConfirmed={false}
        isOwner
        partyLabel=""
        eventCount={0}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe("T2 Keep {date}?", () => {
  it("shows for the owner of an occasion-drafted plan with unconfirmed dates, and sends the plan's own dates", () => {
    assert.equal(keepDateLabel(DAY), "Keep Sat Mar 13?");
    assert.deepEqual(keepDateBody(DAY, DAY), { startDate: DAY, endDate: DAY });
    assert.equal(keepDateBody(DAY, "2027-03-12"), null);
    const html = meta({ fromOccasionDraft: true });
    assert.ok(html.includes("slip-keep-occasion-date") && html.includes("Keep Sat Mar 13?"));
    assert.ok(html.includes("slip-keep-occasion-date-change") && html.includes(OCCASION_DRAFT_COPY.change));
    assert.ok(!html.includes("slip-dates-set-cta"));
  });
  it("does not show otherwise", () => {
    assert.ok(!meta({ fromOccasionDraft: false }).includes("slip-keep-occasion-date"));
    assert.ok(!meta({ fromOccasionDraft: true, isOwner: false }).includes("slip-keep-occasion-date"));
    assert.ok(!meta({ fromOccasionDraft: true, datesConfirmed: true }).includes("slip-keep-occasion-date"));
    assert.equal(showsKeepDate({ isOwner: true, fromOccasionDraft: true, datesUnset: true, startDate: null, endDate: null }), false);
  });
});

describe("T3 trip queue", () => {
  it("pre-picks the first queued city on an exact match", () => {
    assert.equal(preselectedMarket(new URLSearchParams("destinations=Kyoto,Osaka&multiCity=true"))?.cityName, "Kyoto");
    assert.equal(preselectedMarket(new URLSearchParams(`destinations=${encodeURIComponent("Kyoto, Japan; Osaka, Japan")}&multiCity=true`))?.cityName, "Kyoto");
    assert.equal(preselectedMarket(new URLSearchParams("destinations=Atlantis,Kyoto")), null);
    const seeded = initialPlanEntry({ city: "Kyoto" });
    assert.equal(seeded.state.market?.cityName, "Kyoto");
  });
});

describe("T4 assistant", () => {
  it("passes dates and party; PlanEntry seeds the dates and the mint carries them", () => {
    assert.deepEqual(
      assistantDoor({ destination: " Kyoto ", experienceSlug: "date-night", startDate: "2027-04-02", endDate: "2027-04-05", adults: 2, kids: 1 }),
      { destination: "Kyoto", experienceSlug: "date-night", startDate: "2027-04-02", endDate: "2027-04-05", adults: 2, kids: 1 },
    );
    assert.deepEqual(assistantDoor({ destination: null, startDate: "2027-04-02", endDate: null, adults: null }), {});
    assert.deepEqual(assistantDoor({ adults: 0 }), { adults: 0 });
    assert.equal(doorDates({ startDate: "2027-04-05", endDate: "2027-04-02" }), null);
    assert.equal(doorDates({ startDate: "soon", endDate: "2027-04-02" }), null);
    const { state } = initialPlanEntry({ city: "Kyoto", experienceSlug: "date-night", startDate: "2027-04-02", endDate: "2027-04-05" });
    assert.equal(state.startDate, "2027-04-02");
    assert.equal(state.endDate, "2027-04-05");
    const mint = planEntryMintDates(state, new Date("2027-01-01T00:00:00Z"));
    assert.deepEqual(mint, { startDate: "2027-04-02", endDate: "2027-04-05" });
    assert.equal(initialPlanEntry({ city: "Kyoto" }).state.startDate, null);
  });
});

describe("T5 Arashiyama card", () => {
  it("opens the planner with Kyoto, a new plan and the trips group; local_city_itinerary is not passed as a slug", () => {
    const s = arashiyamaPlanDaySource();
    assert.deepEqual(s, { door: "billboard", city: "Kyoto", country: "Japan", destination: "Kyoto", group: "trips", newPlan: true });
    assert.equal("experienceSlug" in s, false);
    const { state } = initialPlanEntry(s);
    assert.equal(state.market?.cityName, "Kyoto");
    assert.equal(state.group, "trips");
  });
});

describe("T6 strings", () => {
  it("the new strings carry no AI and nothing banned", () => {
    for (const s of Object.values(OCCASION_DRAFT_COPY)) {
      assert.ok(!/\bAI\b/.test(s), s);
      assert.deepEqual(siteNeverSayHits(s), [], s);
    }
  });
});
