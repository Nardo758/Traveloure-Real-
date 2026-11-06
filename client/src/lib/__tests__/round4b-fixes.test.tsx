/**
 * Round 4b fixes (ledger `2026-11-06-round4b-fixes`).
 *
 *   R4b-1 an event outside a plan's CONFIRMED dates is refused `event_outside_dates` on both rails, toasted "That event
 *         is on {date}, outside your plan's dates." (Wording approved — Leon); an unconfirmed plan accepts it.
 *   R4b-2 the signed-in plan picker never auto-selects: one open plan still asks.
 *   R4b-3 "Saved to plan" reads the plan's items on the server; the in-session store is retired.
 *   R4b-4 a stated event day renders as that day in a US zone (the card read UTC midnight in the viewer's zone).
 *   R4b-5 the guest row draws an event's start time.
 *   R4b-6 /events draws a count-free skeleton until the calendar and the market have answered.
 *
 * Run: TZ=America/New_York node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/lib/__tests__/round4b-fixes.test.tsx
 */
process.env.TZ = "America/New_York";
import { describe, it } from "node:test";
import "../../components/__tests__/node-navigator";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { eventOutsideConfirmedDates, eventOutsideDatesMessage } from "@shared/plan-dates";
import { savedRefKeyOfItem } from "@shared/plan-item-ref";
import { planSaveRefusalMessage } from "../plan-save-refusal";
import { guestPlanDays, guestSaveErrorMessage } from "../waitlist-guest-plan";
import { resolveAddPlanTarget } from "../trip-target";
import { formatCalendarDate } from "../calendar-date";
import { SAVED_REFS_QUERY_KEY, savedActionInert, savedKeysFromGuestView, useSavedRefKeys } from "../saved-refs";
import { PlanActions } from "../../components/plan/PlanActions";
import { SaveToPlanButton } from "../../components/plan/SaveToPlanButton";
import { GUEST_PLAN_QUERY_KEY } from "../waitlist-guest-plan";
import { EventsCalendarSkeleton, eventsCalendarLoading } from "../../components/events/EventsCalendar";

(globalThis as any).React = React;
const ROOT = resolve(import.meta.dirname, "../../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const walk = (dir: string, out: string[] = []): string[] => {
  for (const n of readdirSync(join(ROOT, dir))) {
    const p = join(dir, n);
    if (n === "__tests__" || n === "node_modules") continue;
    if (statSync(join(ROOT, p)).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(n)) out.push(p);
  }
  return out;
};

describe("Round 4b fixes", () => {
  it("R4b-1 outside confirmed dates is refused with the dated toast; unconfirmed accepts", () => {
    const confirmed = { startDate: "2026-11-07", endDate: "2026-11-08", datesConfirmed: true };
    assert.equal(eventOutsideConfirmedDates("2026-11-17", confirmed), true);
    assert.equal(eventOutsideConfirmedDates("2026-11-07", confirmed), false, "first day is inside");
    assert.equal(eventOutsideConfirmedDates("2026-11-08", confirmed), false, "last day is inside");
    assert.equal(eventOutsideConfirmedDates("2026-11-06", confirmed), true);
    assert.equal(eventOutsideConfirmedDates("2026-11-17", { ...confirmed, datesConfirmed: false }), false, "unconfirmed accepts");
    assert.equal(eventOutsideConfirmedDates(null, confirmed), false, "no event day ⇒ no claim");
    assert.equal(eventOutsideDatesMessage("2026-11-17"), "That event is on Nov 17, outside your plan's dates.");
    const refusal = new Error('400: {"code":"event_outside_dates","eventDate":"2026-11-17"}');
    assert.equal(planSaveRefusalMessage(refusal), "That event is on Nov 17, outside your plan's dates.");
    assert.equal(guestSaveErrorMessage(refusal), "That event is on Nov 17, outside your plan's dates.");
    assert.equal(planSaveRefusalMessage(new Error('400: {"code":"unknown_source"}')), null);
    assert.equal(planSaveRefusalMessage(new Error("Failed")), null);
    // Both rails apply the one rule.
    assert.match(read("server/services/guest-plan.service.ts"), /if \(eventOutsideConfirmedDates\(source\.eventDate, \{ startDate: trip\.startDate, endDate: trip\.endDate, datesConfirmed: trip\.datesConfirmedAt != null \}\)\)/);
    assert.match(read("server/routes.ts"), /eventOutsideConfirmedDates\(src\.eventDate, \{ startDate: tripRow\.startDate, endDate: tripRow\.endDate, datesConfirmed: \(tripRow as any\)\.datesConfirmedAt != null \}\)/);
    // The signed-in dialog and the map rail show it.
    assert.match(read("client/src/components/add-to-experience-dialog.tsx"), /title: planSaveRefusalMessage\(err\) \?\? GUEST_PLAN_COPY\.saveFailed/);
    assert.match(read("client/src/components/plancard/MapControlCenter.tsx"), /const refusal = planSaveRefusalMessage\(e\);/);
  });

  it("R4b-2 one open plan still asks — the picker never auto-selects", () => {
    const one = [{ id: "t1", city: "Kyoto", startDate: "2026-11-01", endDate: "2026-11-30" }] as any;
    assert.equal(resolveAddPlanTarget("", one, { city: "Kyoto", isEvent: true, date: "2026-11-17" }).status, "picker");
    assert.doesNotMatch(read("client/src/lib/trip-target.ts"), /plans\.length === 1\) return \{ status: "direct"/);
  });

  it("R4b-3 Saved to plan reads the plan's items; no session store", () => {
    assert.equal(savedRefKeyOfItem({ contentType: "city_event", contentId: "chionin-autumn-lightup-2026" }), "city_event:chionin-autumn-lightup-2026");
    assert.equal(savedRefKeyOfItem({ providerServiceId: "s1" }), "listing:s1");
    assert.equal(savedRefKeyOfItem({ affiliateProductId: "p1" }), "affiliate_product:p1");
    assert.equal(savedRefKeyOfItem({ contentType: "viator", contentId: "x" }), null, "not a kind");
    assert.equal(savedRefKeyOfItem({}), null);
    assert.deepEqual(Array.from(savedKeysFromGuestView({ items: [{ contentType: "gem", contentId: "g1" }, { contentType: null }] } as any)), ["gem:g1"]);
    for (const f of walk("client/src")) assert.doesNotMatch(read(f), /markRefSaved|resetSavedRefs|isRefSaved/, `${f}: the session store is retired`);
    // The hook reads the server answer: signed in ⇒ the owner keys; guest ⇒ the guest plan's items.
    let got: string[] = [];
    const Probe = () => {
      got = Array.from(useSavedRefKeys());
      return null;
    };
    const signedIn = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
    signedIn.setQueryData(["/api/public/signup-mode"], { mode: "open" });
    signedIn.setQueryData(["/api/auth/user"], { id: "u" });
    signedIn.setQueryData(SAVED_REFS_QUERY_KEY, { keys: ["gem:g1"] });
    renderToString(<QueryClientProvider client={signedIn}><Probe /></QueryClientProvider>);
    assert.deepEqual(got, ["gem:g1"]);
    const guest = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
    guest.setQueryData(["/api/public/signup-mode"], { mode: "waitlist" });
    guest.setQueryData(["/api/auth/user"], null);
    guest.setQueryData(GUEST_PLAN_QUERY_KEY, { plan: {}, items: [{ id: "i", contentType: "city_event", contentId: "c1" }], retentionDays: null });
    renderToString(<QueryClientProvider client={guest}><Probe /></QueryClientProvider>);
    assert.deepEqual(got, ["city_event:c1"]);
    assert.match(read("server/routes/guest-plans.routes.ts"), /router\.get\("\/api\/plans\/saved-refs", isAuthenticated,/);
  });

  it("R4b-3 ruling: signed in, Saved to plan is informational and still opens the picker; inert on the guest rail only", () => {
    assert.equal(savedActionInert(true, false), false, "signed in: pressable");
    assert.equal(savedActionInert(true, true), true, "guest rail: inert");
    assert.equal(savedActionInert(false, true), false);
    // Two plans; the item is on plan A. Signed in, the card reads "Saved to plan" and the press still asks (plan B).
    const qc = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
    qc.setQueryData(["/api/public/signup-mode"], { mode: "waitlist" });
    qc.setQueryData(["/api/auth/user"], { id: "u" });
    qc.setQueryData(SAVED_REFS_QUERY_KEY, { keys: ["city_event:chionin-autumn-lightup-2026"] });
    const wrap = (n: React.ReactNode) => renderToString(<QueryClientProvider client={qc}>{n}</QueryClientProvider>);
    const card = wrap(<PlanActions site="bento" save={{ placeable: true, testId: "s", savedKey: "city_event:chionin-autumn-lightup-2026", onClick: () => {} }} />);
    assert.match(card, /data-testid="s"[^>]*>Saved to plan</);
    assert.doesNotMatch(card, /disabled=""/, "signed in: the press opens the picker for plan B");
    const btn = wrap(<SaveToPlanButton testId="b" savedKey="city_event:chionin-autumn-lightup-2026" onSave={() => {}} />);
    assert.match(btn, />Saved to plan</);
    assert.doesNotMatch(btn, /disabled=""/);
    // The guest rail (one plan): inert.
    const g = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
    g.setQueryData(["/api/public/signup-mode"], { mode: "waitlist" });
    g.setQueryData(["/api/auth/user"], null);
    g.setQueryData(GUEST_PLAN_QUERY_KEY, { plan: {}, items: [{ id: "i", contentType: "city_event", contentId: "chionin-autumn-lightup-2026" }], retentionDays: null });
    const guestCard = renderToString(<QueryClientProvider client={g}><PlanActions site="bento" save={{ placeable: true, testId: "s", savedKey: "city_event:chionin-autumn-lightup-2026", onClick: () => {} }} /></QueryClientProvider>);
    assert.match(guestCard, /data-testid="s"[^>]*disabled=""[^>]*>Saved to plan</);
  });

  it("R4b-4 a stated event day is that day in a US zone", () => {
    assert.equal(new Date("2026-11-17").toLocaleDateString("en-US", { month: "short", day: "numeric" }), "Nov 16", "the bug, reproduced");
    assert.equal(formatCalendarDate("2026-11-17", { month: "short", day: "numeric" }), "Nov 17");
    assert.equal(formatCalendarDate("nope", { month: "short" }), "");
    assert.doesNotMatch(read("client/src/components/city-feed-card.tsx"), /new Date\(event\.date\)/);
  });

  it("R4b-5 the guest row draws the event's time", () => {
    const days = guestPlanDays({
      plan: { id: "p", title: null, destination: "Kyoto", startDate: "2026-11-01", endDate: "2026-11-03", datesConfirmed: false, adults: null, kids: null, numberOfTravelers: null, eventType: null, updatedAt: null },
      items: [
        { id: "a", title: "Chion-in lit for autumn", description: null, itemType: "activity", dayNumber: 1, locationName: "Chion-in", latitude: null, longitude: null, scheduledDate: "2026-11-17", startTime: "17:30" },
        { id: "b", title: "Untimed", description: null, itemType: "activity", dayNumber: 1, locationName: null, latitude: null, longitude: null },
      ],
      retentionDays: null,
    } as any);
    const acts = (days[0].activities as any[]).map((a) => [a.id, a.time]);
    assert.deepEqual(acts, [["a", "17:30"], ["b", ""]]);
  });

  it("R4b-6 /events: a skeleton with no count until both reads answer", () => {
    assert.equal(eventsCalendarLoading({ calendarLoading: true, marketSettled: true, modeLoading: false }), true);
    assert.equal(eventsCalendarLoading({ calendarLoading: false, marketSettled: false, modeLoading: false }), true);
    assert.equal(eventsCalendarLoading({ calendarLoading: false, marketSettled: true, modeLoading: true }), true);
    assert.equal(eventsCalendarLoading({ calendarLoading: false, marketSettled: true, modeLoading: false }), false);
    const html = renderToString(<EventsCalendarSkeleton />);
    assert.match(html, /data-testid="events-calendar-skeleton"/);
    assert.match(html, /aria-busy="true"/);
    assert.doesNotMatch(html.replace(/<[^>]+>/g, ""), /\d|All|Loading/, "no count, no chip label, no text");
    const src = read("client/src/components/events/EventsCalendar.tsx");
    assert.match(src, /if \(eventsCalendarLoading\(\{ calendarLoading: isLoading, marketSettled, modeLoading \}\)\) return <EventsCalendarSkeleton \/>;/);
    assert.doesNotMatch(src, /Loading the calendar…/);
  });
});
