/**
 * CN-1g-UI (ledger `2026-11-03-cn1g-ui-retire-legacy-concierge`): the legacy /concierge funnel is gone from the client.
 *
 *   T1 App.tsx: no route renders a concierge page; /concierge and /optimize both redirect to the Local concierge filter
 *   T2 no "/concierge" href or Link in client/src outside the two redirects; no eventConcierge, EVENT_CONCIERGE_SETTING,
 *      EventConciergeRoute, ConciergeModule or "concierge?tier" in client/src or shared (tests excluded); the deleted
 *      files are gone
 *   T3 FinalizeBookingModal's Lane type has no "concierge"; at most the two lanes plus the hidden agent lane constant
 *   T4 the doors read carries { handoffBooking } and nothing else; handoff_booking behaviour unchanged
 *   T5 the handoff 24 h line and the server notification both read H24; neither names a concierge
 *   T7 the CN-1 "Local concierge" surfaces still render: the listing details, the Trip Card access line, the task log
 *   (T6 — the browser redirects — is playwright/tests/deprecated-route-redirects.spec.ts.)
 *
 * Run: npx tsx --test client/src/components/__tests__/cn1g-ui-retired.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { travelerDoors, offeredHandoffKinds } from "@shared/traveler-doors";
import { HANDOFF_FALLBACK_LINE, HANDOFF_KINDS } from "@shared/handoff";
import { handoffBannerLine } from "@/lib/handoff-client";
import { siteNeverSayHits } from "@shared/banned-copy";
import { ConciergeListingDetails } from "@/components/concierge-hire";
import { conciergeAccessLine } from "@/lib/concierge-hire-copy";
import { TaskLogBody } from "@/components/concierge-task-log";
import { kindOptions } from "@/lib/concierge-task-copy";

(globalThis as any).React = React;
const read = (f: string) => fs.readFileSync(f, "utf8");
const REDIRECT = '<Redirect to="/services?serviceType=concierge" />';

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const SOURCES = [...walk("client/src"), ...walk("shared")];

describe("T1 routes", () => {
  it("/concierge and /optimize redirect to the concierge filter and no route renders a concierge page", () => {
    const app = read("client/src/App.tsx");
    assert.match(app, new RegExp(`<Route path="/concierge">\\s*${REDIRECT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*</Route>`));
    assert.match(app, new RegExp(`<Route path="/optimize">\\s*${REDIRECT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*</Route>`));
    assert.ok(!app.includes("ConciergePage"));
    assert.ok(!app.includes('import("@/pages/concierge")'));
    assert.ok(!app.includes("useClaimGuestConcierge"));
    assert.ok(!/tier=ai/.test(app));
  });
});

describe("T2 nothing points at the retired funnel", () => {
  it("no /concierge link and none of the retired names in client/src or shared", () => {
    const hits: string[] = [];
    for (const f of SOURCES) {
      const src = read(f);
      for (const name of ["eventConcierge", "EVENT_CONCIERGE_SETTING", "EventConciergeRoute", "ConciergeModule", "concierge?tier"]) {
        if (src.includes(name)) hits.push(`${f}: ${name}`);
      }
      if (/href=\{?["'`]\/concierge|to=["'`]\/concierge|setLocation\(["'`]\/concierge|navigate\(["'`]\/concierge/.test(src)) hits.push(`${f}: /concierge link`);
    }
    assert.deepEqual(hits, []);
  });
  it("the deleted files are gone", () => {
    for (const f of [
      "client/src/pages/concierge/index.tsx",
      "client/src/components/concierge/EventConciergeRoute.tsx",
      "client/src/components/concierge/IntentForm.tsx",
      "client/src/components/concierge/DoneForYouCard.tsx",
      "client/src/components/plancard/ConciergeModule.tsx",
      "client/src/lib/concierge-request.ts",
      "client/src/lib/concierge-tiers.ts",
      "client/src/hooks/use-claim-guest-concierge.ts",
      "playwright/tests/journeys/j2-ai-entry.spec.ts",
    ]) {
      assert.equal(fs.existsSync(f), false, f);
    }
  });
});

describe("T3 Finalize lanes", () => {
  it("the Lane type has no concierge and the lanes are myself, the hidden agent and the travel expert", () => {
    const src = read("client/src/components/plancard/FinalizeBookingModal.tsx");
    assert.match(src, /type Lane = "myself" \| "agent" \| "expert";/);
    assert.ok(!/"concierge"/.test(src));
    assert.ok(!src.includes("useTravelerDoors"));
    assert.match(src, /export const FINALIZE_AGENT_LANE_SHOWN = false;/);
  });
});

describe("T4 the doors read", () => {
  it("carries { handoffBooking } and nothing else; book is offered only with the door on", () => {
    assert.deepEqual(Object.keys(travelerDoors({ handoffBooking: true, eventConcierge: true })), ["handoffBooking"]);
    assert.deepEqual(travelerDoors({ handoffBooking: true }), { handoffBooking: true });
    assert.deepEqual(travelerDoors(undefined), { handoffBooking: false });
    assert.deepEqual(offeredHandoffKinds(HANDOFF_KINDS, { handoffBooking: false }), ["polish", "plan_all"]);
    assert.deepEqual(offeredHandoffKinds(HANDOFF_KINDS, { handoffBooking: true }), ["polish", "book", "plan_all"]);
    const route = read("server/routes/traveler-doors.routes.ts");
    assert.match(route, /res\.json\(\{ handoffBooking \}\)/);
  });
});

describe("T5 the handoff 24 h line", () => {
  it("both sites read H24 and neither names a concierge", () => {
    assert.equal(HANDOFF_FALLBACK_LINE, "No local has accepted yet. Keep waiting, or withdraw the ask.");
    assert.equal(handoffBannerLine({ banner: { kind: "fallback_offered" } as any, city: null, typicalAcceptHours: null, handoff: null } as any), HANDOFF_FALLBACK_LINE);
    const svc = read("server/services/handoff.service.ts");
    assert.match(svc, /"handoff_fallback", "Still finding your local", HANDOFF_FALLBACK_LINE,/);
    assert.ok(!/concierge/i.test(HANDOFF_FALLBACK_LINE));
    assert.ok(!svc.includes("Our concierge can take this on"));
    assert.deepEqual(siteNeverSayHits(HANDOFF_FALLBACK_LINE), []);
    assert.ok(!/\bAI\b|soon/i.test(HANDOFF_FALLBACK_LINE));
    const banner = read("client/src/components/plan/HandoffBanner.tsx");
    assert.ok(!banner.includes("Hand it to our concierge"));
  });
});

describe("T7 the CN-1 Local concierge surfaces still render", () => {
  it("listing details, the Trip Card access line and the task log", () => {
    const details = renderToString(
      <ConciergeListingDetails tasks={[{ taskKindKey: "meal", label: "Restaurant booking", linkOnly: false, cap: 2 }]} responseWindowHours={4} expertName="Aya" />,
    );
    assert.ok(details.includes("Restaurant booking"));
    const line = conciergeAccessLine(
      { source: "concierge", accessUntil: "2099-01-01T00:00:00Z", first_name: "Aya" },
      { startDate: "2098-12-28", endDate: "2098-12-31" },
      new Date("2098-12-01T00:00:00Z"),
    );
    assert.equal(line?.kind, "active");
    const noop = () => {};
    const log = renderToString(
      <TaskLogBody
        tasks={[]}
        viewer="traveler"
        expertFirstName="Aya"
        options={kindOptions([{ taskKindKey: "meal", label: "Restaurant booking", linkOnly: false, cap: null }], [])}
        busy={false}
        formOpen={false}
        doneTaskId={null}
        onOpenForm={noop}
        onCloseForm={noop}
        onCreate={noop}
        onAction={noop}
        onDone={noop}
        onCloseDone={noop}
      />,
    );
    assert.ok(log.includes("task-log-traveler"));
  });
});
