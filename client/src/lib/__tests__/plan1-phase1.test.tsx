/**
 * PLAN-1 Phase 1 (ledger `2026-11-06-plan1-one-planner`): one planner surface.
 *
 *   P1 one component, two modes: MapControlCenter takes `mode: { kind: "guest" | "owner", … }`; the `guest` prop and the
 *      loose owner props are gone, and every mount names its mode.
 *   P2 owner map view is the header, the map band and the map: the tools tray (where-to-stay inside it) and the cost
 *      strip are Days-view only, and nothing in the map view draws "Stay here" or the lodging ranking.
 *   P3 the claim lands on `/plans/{id}` (slip-first: Days unless the traveler saved Map) on every sign-in path; the no-navigation branch is
 *      retired.
 *   P4 one mint, every create lands on the slip's Days view (slip-first): `planEntryView` is Days for every door; IntakePanel starts through
 *      the provider's mint (no `POST /api/trips` of its own).
 *   P5 the shared DTO: the guest view carries `occasionLabel`, `endTime` and the listing / partner ids, and the guest
 *      row passes them through.
 *   P6 R3-21 stands: a member with no first name reads as their email's name in the user menu, never "Traveler".
 *
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/lib/__tests__/plan1-phase1.test.tsx
 */
import { describe, it } from "node:test";
import "../../components/__tests__/node-navigator";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { claimLandingPath } from "../plan-landing";
import { emptyPlanEntry, planEntryView } from "../plan-entry";
import { buildTripMintBody } from "../trip-slip";
import { guestPlanDays } from "../waitlist-guest-plan";
import { UserMenu } from "../../components/user-menu";
import { SignInModalProvider } from "../../contexts/SignInModalContext";

(globalThis as any).React = React;
const ROOT = resolve(import.meta.dirname, "../../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const MOUNTS = [
  "client/src/components/plancard/SlipView.tsx",
  "client/src/components/plancard/PlanCard.tsx",
  "client/src/components/plancard/VersionsBoard.tsx",
  "client/src/pages/expert/workspace.tsx",
  "client/src/pages/itinerary-view.tsx",
  "client/src/pages/guest-plan-map.tsx",
];
/** Every `<MapControlCenter …/>` element in a file. */
const mounts = (src: string) => {
  const out: string[] = [];
  let i = src.indexOf("<MapControlCenter");
  while (i >= 0) {
    // PLAN-1 Phase 3: SlipView's mount opens its mode with a guest/owner ternary (`mode={guest ? {…} : {`).
    const m = src.slice(i).search(/mode=\{(\{|guest \?)/);
    out.push(src.slice(i, src.indexOf("/>", i + m) + 2));
    i = src.indexOf("<MapControlCenter", i + 1);
  }
  return out;
};

describe("PLAN-1 Phase 1", () => {
  it("P1 one component, two modes", () => {
    const mcc = read("client/src/components/plancard/MapControlCenter.tsx");
    const props = mcc.slice(mcc.indexOf("export interface MapControlCenterProps {"), mcc.indexOf("export function MapControlCenter("));
    assert.match(props, /mode: MapPlannerMode;/);
    for (const gone of ["guest?:", "readOnly?:", "anchor?:", "versions?:", "candidates?:", "expertTravelerNote?:", "compareHref?:"]) {
      assert.ok(!props.includes(gone), `${gone} is the mode's, not a loose prop`);
    }
    assert.match(mcc, /\| \{\s*kind: "guest";/);
    assert.match(mcc, /\| \{\s*kind: "owner";/);
    let n = 0;
    for (const f of MOUNTS) {
      for (const m of mounts(read(f))) {
        n++;
        // PLAN-1 Phase 3: SlipView's one map names both modes (guest page / owner page) in one ternary.
        assert.match(m, /mode=\{(?:guest \? \{ kind: "guest"[^}]*\} : )?\{\s*kind: "(guest|owner)"/, `${f}: names its mode`);
        assert.doesNotMatch(m, /\bguest=\{|\breadOnly\b|\banchor=\{|\bversions=\{|\bcandidates=\{/, `${f}: no loose mode prop`);
      }
    }
    assert.equal(n, 7, "the seven mounts (PLAN-1 Phase 3: the guest page's plan map is now SlipView's)");
    const guestPage = read("client/src/pages/guest-plan-map.tsx");
    // PLAN-1 Phase 3: the guest page keeps one map of its own (before any plan); its plan's map is SlipView's, in guest mode.
    assert.equal((guestPage.match(/mode=\{\{ kind: "guest"/g) ?? []).length, 1, "the guest page's own map is guest mode");
    assert.match(read("client/src/components/plancard/SlipView.tsx"), /mode=\{guest \? \{ kind: "guest", center: guest\.center, onSave: guest\.onSavePlace, withPlan: true \} : \{/);
  });

  it("P2 owner map view: header, band, map — no tools tray, cost strip, Stay here or lodging ranking", () => {
    const slip = read("client/src/components/plancard/SlipView.tsx");
    assert.match(slip, /\{isOwner && data\.trip && slipView === "list" \? \(\s*<ToolsTray/);
    assert.match(slip, /\{slipView === "list" && !guest \? \(\s*<PlanCostStrip/); // PLAN-1 Phase 3: and never for a guest
    const mapStart = slip.indexOf('{slipView === "map" && data.trip ? (');
    const mapView = slip.slice(mapStart, slip.indexOf("      ) : (\n", mapStart));
    assert.ok(mapView.length > 200);
    for (const absent of ["ToolsTray", "PlanCostStrip", "renderAnchorPanel", "AnchorPanel", "StayBookButton", "WhereToStay"]) {
      assert.ok(!mapView.includes(absent), `map view draws no ${absent}`);
    }
    assert.match(mapView, /mode=\{guest \? \{ kind: "guest"[^}]*\} : \{\s*kind: "owner",/); // PLAN-1 Phase 3
    assert.match(mapView, /quickDraft: isOwner && aiAction === "draft" \? <SlipDraftAiRow/);
    assert.match(mapView, /tripCardBanner: <FinishCard /);
    // "Stay here" and the ranking live only in AnchorPanel; the map planner itself never draws either.
    const mcc = read("client/src/components/plancard/MapControlCenter.tsx");
    const code = mcc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(code, /STAY_HERE_LABEL|STAY_STRAIGHT_LINE_TITLE|STAY_PICK_TITLE|"stay_here"|<AnchorPanel/);
    assert.match(read("client/src/components/plan/AnchorPanel.tsx"), /\{routed \? STAY_PICK_TITLE : STAY_STRAIGHT_LINE_TITLE\}/);
  });

  // TEST EDIT (slip-first hotfix, ledger `2026-11-07-slip-first-landing`): the claim lands on the slip, no view named.
  it("P3 the claim lands on the plan's slip, every sign-in path", () => {
    assert.equal(claimLandingPath(["t-1", "t-2"]), "/plans/t-1");
    assert.equal(claimLandingPath([]), null, "nothing claimed ⇒ stay put");
    assert.equal(claimLandingPath(null), null);
    const app = read("client/src/App.tsx");
    // Cut-list #1 header fix v2: the claim binds the claimed plan into the pen (the ONE active-plan rule)
    // between resolving and landing; the landing itself is unchanged — `claimLandingPath`, every path.
    assert.match(app, /void claimGuestPlans\(\(user as any\)\?\.id \?\? null\)\.then\(async \(ids\) => \{\s*if \(ids\.length === 0\) return;\s*const to = claimLandingPath\(ids\);/);
    assert.match(app, /if \(claimed\) syncActiveTripToContext\(claimed\);[\s\S]{0,400}if \(to\) setLocation\(to\);/);
    assert.doesNotMatch(app, /if \(ids\.length > 0\) qc\.invalidateQueries\(\{ queryKey: \["\/api\/trips"\] \}\);\s*\}\);/, "the no-navigation branch is retired");
  });

  // TEST EDIT (slip-first hotfix, ledger `2026-11-07-slip-first-landing`): every create lands on the slip's Days view.
  it("P4 one mint, and every create lands on the slip's Days view", () => {
    const base = emptyPlanEntry();
    for (const group of ["trips", "group_travel", "moments", "celebrations", "hosted_events"] as const) {
      assert.equal(planEntryView({ ...base, group } as any, null), "list", group);
    }
    const ctx = read("client/src/contexts/PlanningContext.tsx");
    assert.match(ctx, /setLocation\(`\/plans\/\$\{tripId\}`\);/);
    assert.doesNotMatch(ctx, /\?view=map/, "no create names the map");
    assert.match(ctx, /continueOn\(branch, plan, from, start\.view\);/);
    assert.equal((ctx.match(/mintTripSlip\(/g) ?? []).length, 1, "one mint call");
    const intake = read("client/src/components/intake-panel.tsx");
    assert.match(intake, /const out = await planning\.start\(\{/);
    assert.match(intake, /view: "list", \/\/ slip-first/);
    assert.doesNotMatch(intake, /useCreateTrip|navigate\(`\/plans\//, "no second mint, no list landing");
    // The typed party total rides the one mint as a count — never a split, never invented.
    assert.equal(buildTripMintBody({ destination: "Kyoto, Japan", numberOfTravelers: 3 }).numberOfTravelers, 3);
    assert.equal("numberOfTravelers" in buildTripMintBody({ destination: "Kyoto, Japan" }), false);
    assert.equal("numberOfTravelers" in buildTripMintBody({ destination: "Kyoto, Japan", numberOfTravelers: 0 }), false);
  });

  it("P5 the shared DTO: the guest row carries end time and the listing / partner ids", () => {
    const days = guestPlanDays({
      plan: { id: "p", title: null, destination: "Kyoto", startDate: "2026-11-01", endDate: "2026-11-02", datesConfirmed: true, adults: 2, kids: null, numberOfTravelers: 2, eventType: null, occasionLabel: "Anniversary", updatedAt: null },
      items: [
        { id: "a", title: "Tea ceremony", description: null, itemType: "activity", dayNumber: 1, locationName: null, latitude: null, longitude: null, startTime: "10:00", endTime: "11:30", providerServiceId: "svc-1" },
        { id: "b", title: "Partner tour", description: null, itemType: "activity", dayNumber: 1, locationName: null, latitude: null, longitude: null, affiliateProductId: "ap-1" },
      ],
      retentionDays: null,
    } as any);
    const [a, b] = days[0].activities as any[];
    assert.deepEqual([a.time, a.endTime, a.providerServiceId], ["10:00", "11:30", "svc-1"]);
    assert.equal(b.affiliateProductId, "ap-1");
    assert.equal(b.endTime, undefined, "no end stated ⇒ none");
    const svc = read("server/services/guest-plan.service.ts");
    for (const f of ["occasionLabel,", "endTime: (i as any).endTime ?? null,", "providerServiceId: (i as any).providerServiceId ?? null,", "affiliateProductId: (i as any).affiliateProductId ?? null,"]) {
      assert.ok(svc.includes(f), f);
    }
  });

  it("P6 R3-21: no first name ⇒ the email's name, never Traveler", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });
    qc.setQueryData(["/api/auth/user"], { id: "u", email: "kenji@x.test", firstName: null, lastName: null, role: "user" });
    qc.setQueryData(["/api/public/signup-mode"], { mode: "waitlist" });
    const html = renderToString(
      <QueryClientProvider client={qc}>
        <Router ssrPath="/">
          <SignInModalProvider>
            <UserMenu />
          </SignInModalProvider>
        </Router>
      </QueryClientProvider>,
    );
    assert.match(html, /aria-label="User menu for kenji"/);
    assert.match(html, /data-testid="user-avatar-fallback"[^>]*>K</);
    assert.doesNotMatch(html.replace(/<[^>]+>/g, " "), /\bTraveler\b/);
  });
});
