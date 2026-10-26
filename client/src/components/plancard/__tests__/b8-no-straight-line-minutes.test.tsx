/**
 * Audit B8 (fix-queue, architect dispatch CB-2026-10-25-I) — minutes print only where a checked (routed) leg
 * exists; a straight-line or estimated figure never prints minutes on the slip or the Trip Card.
 *
 *   B8a S1 the slip's option fit line reads `compareBurdenLine`: no minutes on an est. basis, minutes when every day is checked
 *   B8b S2/S2b the add confirmation: straight and est reaches print the hours line only, footer null; others unchanged
 *   B8c S3 the anchor candidate shows a labelled straight-line distance, "—" when unknown, never minutes
 *   B8d S4 the slip's unrouted estimate row draws nothing; an expert's unrouted row and a routed row are unchanged
 *   B8e S5 the Trip Card's non-routed leg prints its mode only; the routed line is unchanged
 *   B8f the airport row still prints its routed minutes
 *   B8g plan-compare.ts is the rule's one home (unchanged)
 *   B8h S6 Getting around: the estimate gap reads "{mode} · Not checked yet"; other gaps unchanged
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/b8-no-straight-line-minutes.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import type { PlanFit } from "@shared/plan-fit";
import { HOURS_NOT_CHECKED_LINE, type StopChecks } from "@shared/add-checks";
import { PLAN_COMPARE_MINUTE_COPY, compareBurdenLine } from "@/lib/plan-compare";
import { addChecksLines } from "@/lib/add-checks";
import { gettingAroundDays } from "@/lib/getting-around";
import { ANCHOR_CANDIDATE_DISTANCE_COPY, formatAnchorCandidateMedian } from "../BuildAroundDialog";
import { LegRow } from "../../plan/LegRow";
import { GettingAroundBody } from "../../plan/GettingAroundSheet";
import { LegLine } from "../TripCardDays";

(globalThis as any).React = React;
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const MINUTES = /\d+\s*min/;

const fit = (over: Partial<Extract<PlanFit, { scored: true }>> = {}): PlanFit => ({
  scored: true,
  minutesPerDay: 31,
  minutesByDay: {},
  basis: "est",
  coverage: 2 / 3,
  areasNear: 2,
  areasTotal: 3,
  located: 9,
  total: 12,
  ...over,
});

const ROUTE = { durationMin: 24, distanceM: 6100, line: "Keihan Main Line", fare: null, provenance: { source: "google_routes", checkedAt: "2026-10-04T05:00:00Z" } } as any;

describe("audit B8 — no straight-line minutes", () => {
  it("B8a S1 compareBurdenLine on the slip", () => {
    const est = compareBurdenLine(fit());
    assert.doesNotMatch(est, /min|est\./);
    assert.equal(est, "based on 9 of 12 located stops");
    const checked = compareBurdenLine(fit({ basis: "matrix", minutesByDay: { 1: 30, 2: 32 }, checkedByDay: { 1: true, 2: true } }));
    assert.match(checked, /31 min\/day/);
    const src = fs.readFileSync("client/src/components/plancard/SlipOptionSets.tsx", "utf8");
    assert.match(src, /\{compareBurdenLine\(option\.fit\)\}/);
    assert.match(src, /import \{ compareBurdenLine, type DatedPriceView \} from "@\/lib\/plan-compare";/);
    assert.doesNotMatch(src, /planFitLine/);
  });

  it("B8b S2/S2b the add confirmation", () => {
    const base: StopChecks = { itemId: "i", hours: { status: "not_checked" }, reach: null, routedPlan: true, pending: false };
    assert.deepEqual(addChecksLines({ ...base, routedPlan: false, reach: { kind: "straight", from: "Kinkaku-ji", minutes: 40, mode: "transit" } }), { lines: [HOURS_NOT_CHECKED_LINE], footer: null });
    assert.deepEqual(addChecksLines({ ...base, reach: { kind: "est", from: "Kinkaku-ji", minutes: 18, mode: "drive" } }), { lines: [HOURS_NOT_CHECKED_LINE], footer: null });
    assert.deepEqual(addChecksLines({ ...base, reach: { kind: "routed", from: "Kinkaku-ji", line: "22 min · Drive" } }).lines, [HOURS_NOT_CHECKED_LINE, "From Kinkaku-ji: 22 min · Drive"]);
    assert.deepEqual(addChecksLines({ ...base, reach: { kind: "no_route", from: "Kinkaku-ji" } }).lines, [HOURS_NOT_CHECKED_LINE, "From Kinkaku-ji: no route found"]);
    assert.deepEqual(addChecksLines({ ...base, reach: { kind: "unlocated", stop: "Soba" } }).lines, [HOURS_NOT_CHECKED_LINE, "not worked out yet — Soba isn't on the map"]);
    assert.deepEqual(addChecksLines({ ...base, reach: { kind: "pending", from: "Kinkaku-ji" }, pending: true }).lines, [HOURS_NOT_CHECKED_LINE, "From Kinkaku-ji: working out travel time…"]);
  });

  it("B8c S3 the anchor candidate's straight-line distance", () => {
    const c = (medianMeters: number | null) => ({ medianMeters, estMedianWalkMinutes: 15 }) as any;
    assert.equal(formatAnchorCandidateMedian(c(1240)), "about 1.2 km · straight line");
    assert.equal(formatAnchorCandidateMedian(c(1240)), ANCHOR_CANDIDATE_DISTANCE_COPY.distance("1.2"));
    assert.equal(formatAnchorCandidateMedian(c(20)), "about 0.1 km · straight line", "never below 0.1");
    assert.equal(formatAnchorCandidateMedian(c(null)), "—");
    for (const m of [1240, 20, null]) assert.doesNotMatch(formatAnchorCandidateMedian(c(m)), /min/);
    const src = fs.readFileSync("client/src/components/plancard/BuildAroundDialog.tsx", "utf8");
    assert.match(src, /title=\{ANCHOR_CANDIDATE_DISTANCE_COPY\.tooltip\}/);
    assert.doesNotMatch(src, /min median|80 m\/min/);
  });

  it("B8d S4 the slip's leg rows", () => {
    assert.equal(renderToString(<LegRow kind="unrouted" legId="u1" mode="drive" minutes={18} estimate={true} />), "");
    assert.match(text(renderToString(<LegRow kind="unrouted" legId="u2" mode="walk" minutes={15} />)), /15 min · walk/);
    assert.match(text(renderToString(<LegRow kind="routed" legId="r1" mode="transit" route={ROUTE} timeZone="Asia/Tokyo" />)), /24 min/);
  });

  it("B8e S5 the Trip Card's non-routed leg prints its mode only", () => {
    const plain = text(renderToString(<LegLine leg={{ id: "p1", fromActivityId: "a", toActivityId: "b", recommendedMode: "walk", estimatedDurationMinutes: 12 } as any} showMinutes={true} />));
    assert.match(plain, /Walk/);
    assert.doesNotMatch(plain, MINUTES);
    const routedLeg = { id: "r1", fromActivityId: "a", toActivityId: "b", mode: "transit", estimatedDurationMinutes: 24, routed: { line: "Keihan Main Line", fare: null, provenance: { source: "google_routes", checkedAt: "2026-10-04T05:00:00Z" } } };
    const routed = text(renderToString(<LegLine leg={routedLeg as any} showMinutes={true} timeZone="Asia/Tokyo" />));
    assert.match(routed, /24 min/);
    assert.match(routed, /checked/);
    assert.doesNotMatch(fs.readFileSync("client/src/lib/trip-card.ts", "utf8"), /estimatedMinutesSuffix/);
  });

  it("B8f the airport row keeps its routed minutes", () => {
    const html = renderToString(
      React.createElement(Router as any, { ssrPath: "/" }, React.createElement(LegRow as any, { direction: "arrival", stayName: "Hotel Kanra", airport: "KIX", modes: ["rail"], canBook: false, routedMinutes: 41 })),
    );
    assert.match(text(html), /· 41 min/);
  });

  it("B8g plan-compare.ts is the rule's home, unchanged", () => {
    const src = fs.readFileSync("client/src/lib/plan-compare.ts", "utf8");
    assert.match(src, /export function allShownDaysChecked\(/);
    assert.match(src, /export function compareBurdenLine\(/);
  });

  it("B8h S6 Getting around's estimate gap", () => {
    const leg = (id: string, from: string, to: string, mode: string, minutes: number, est: boolean) => ({
      id, fromActivityId: from, toActivityId: to, recommendedMode: mode, estimatedDurationMinutes: minutes,
      alternativeModes: est ? [{ reason: "straight_line_est" }] : [],
    });
    const day = {
      dayNumber: 1,
      activities: [{ id: "a", name: "Kinkaku-ji" }, { id: "b", name: "Ryoan-ji" }, { id: "c", name: "Ninna-ji" }, { id: "d", name: "Myoshin-ji" }],
      transports: [
        leg("L1", "a", "b", "driving", 18, true),
        leg("L2", "b", "c", "walking", 15, false),
        { id: "L3", fromActivityId: "c", toActivityId: "d", mode: "transit", estimatedDurationMinutes: 24, routed: { line: "Keihan Main Line", fare: null, provenance: { source: "google_routes", checkedAt: "2026-10-04T05:00:00Z" } } },
      ],
    };
    const [d] = gettingAroundDays([day], "Asia/Tokyo");
    assert.equal(d.gaps[0].line, `drive · ${PLAN_COMPARE_MINUTE_COPY.notCheckedYet}`);
    assert.equal(d.gaps[0].kind, "unrouted");
    assert.equal(d.gaps[0].title, "Kinkaku-ji → Ryoan-ji");
    assert.doesNotMatch(d.gaps[0].line, MINUTES);
    assert.equal(d.gaps[1].line, "15 min · walk");
    assert.equal(d.gaps[2].kind, "routed");
    assert.match(d.gaps[2].line, /24 min/);
    const html = text(renderToString(<GettingAroundBody data={{ days: [{ ...day, transports: [day.transports[0]] }], trip: { timezone: "Asia/Tokyo" } } as any} />));
    assert.match(html, /drive · Not checked yet/);
    assert.doesNotMatch(html, MINUTES);
  });
});
