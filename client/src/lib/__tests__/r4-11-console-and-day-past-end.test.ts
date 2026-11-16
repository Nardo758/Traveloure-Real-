/**
 * QA round 4 R4-11 (the Kyoto page's console errors) and R4-9's approved line.
 *
 *   K1 signed out, `useTrips` never asks `/api/trips` (it read as `null` from the 401 it always got — and still does)
 *   K2 signed out, the Trip Strip never asks `/api/cart`
 *   W1 a day past the plan's last day says "That day is past your plan's last day." — Wording approved — Leon (t2011u)
 *   W2 a plain `unplaceable`, and every other refusal, keep the caller's own words; `event_outside_dates` is unchanged
 *   W3 `dayPastPlanEnd` is the one rule both rails ask
 *
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/lib/__tests__/r4-11-console-and-day-past-end.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { planSaveRefusalFromBody, planSaveRefusalMessage } from "../plan-save-refusal";
import { DAY_PAST_PLAN_END_MESSAGE, dayPastPlanEnd } from "@shared/plan-dates";

const read = (p: string) => fs.readFileSync(p, "utf8");

describe("QA round 4 R4-11 — no signed-out read that can only 401", () => {
  it("K1 useTrips is enabled only for a signed-in user; signed out it reads null, loading while the session is unknown", () => {
    const src = read("client/src/hooks/use-trips.ts");
    const hook = src.slice(src.indexOf("export function useTrips()"), src.indexOf("export function useTrip("));
    assert.match(hook, /const \{ user, isLoading: authLoading \} = useAuth\(\);/);
    assert.match(hook, /enabled: !!user,/);
    assert.match(hook, /if \(user\) return query;\s*return \{ \.\.\.query, data: authLoading \? undefined : null, isLoading: authLoading \} as typeof query;/);
  });

  it("K2 the Trip Strip asks for the cart only when signed in", () => {
    const src = read("client/src/components/trip/trip-strip.tsx");
    assert.match(src, /queryKey: \["\/api\/cart"\],\s*staleTime: 30_000,[\s\S]{0,300}enabled: signedIn,/);
  });
});

describe("QA round 4 R4-9 — the approved line for a day past the plan's end", () => {
  it("W1 the day refusal is named on both rails' bodies", () => {
    assert.equal(DAY_PAST_PLAN_END_MESSAGE, "That day is past your plan's last day.");
    assert.equal(planSaveRefusalFromBody({ code: "unplaceable", reason: "day_past_plan_end" }), DAY_PAST_PLAN_END_MESSAGE);
    assert.equal(
      planSaveRefusalMessage(new Error('400: {"code":"unplaceable","message":"Couldn\'t save that. Try again.","reason":"day_past_plan_end"}')),
      DAY_PAST_PLAN_END_MESSAGE,
    );
  });

  it("W2 nothing else changes", () => {
    assert.equal(planSaveRefusalFromBody({ code: "unplaceable" }), null);
    assert.equal(planSaveRefusalFromBody({ code: "unknown_source", reason: "day_past_plan_end" }), null, "only an unplaceable day");
    assert.equal(planSaveRefusalFromBody({ code: "event_outside_dates", eventDate: "2026-11-17" }), "That event is on Nov 17, outside your plan's dates.");
    assert.equal(planSaveRefusalFromBody(null), null);
  });

  it("W3 dayPastPlanEnd", () => {
    assert.equal(dayPastPlanEnd(5, 4), true);
    assert.equal(dayPastPlanEnd(4, 4), false);
    assert.equal(dayPastPlanEnd(null, 4), false);
    assert.equal(dayPastPlanEnd(9, null), false);
    assert.equal(dayPastPlanEnd(9, Number.NaN), false);
  });
});
