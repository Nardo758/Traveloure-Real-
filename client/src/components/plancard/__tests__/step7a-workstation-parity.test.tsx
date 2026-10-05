/**
 * STEP 7a — WORKSTATION PARITY (R322; surface spec §10 step 7, R-bh). Renders the STORED smoke-6
 * plancard payload through `WorkstationDays` — the Workstation's day surface on the shared
 * `DayBlock` + `ItemRow` (mode edit, role expert) + `LegRow` — and asserts:
 *   W1 every item renders exactly once, under its own day, in the payload's order (the slip's rows)
 *   W2 each row's time, title and facts line are the payload's (the slip's own rules)
 *   W3 edit mode, expert role: every row has its ⋯ menu; no traveler read-mode control (no Navigate,
 *      no visited tick)
 *   W4 every day, stop and leg carries its readiness jump target (`@shared/plan-jump-targets`), and a
 *      readiness line resolves to an element that is in the page
 *   W5 a leg between two stops is ONE LegRow in the expert role: mode picker from the leg's candidate
 *      modes, the tip input capped at AUTHOR_TIP_MAX_CHARS, Confirm on a proposed leg, the stamp on a
 *      confirmed one, and the host-pickup limit said rather than a control that cannot work
 *   W6 a pair with no leg says why (§13) — never a fabricated leg
 *   W7 read-only (canEdit false) draws no menu and no leg control
 * Plus the pure helpers: jump-target resolution, leg lookup, gap wording, author's pick, the stamp,
 * and the expert's routing line.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToString } from "react-dom/server";
import { WorkstationDays, expertRoutingLine, legBetween, legGapLine } from "../../plan/WorkstationDays";
import { HOST_PICKUP_UNAVAILABLE_NOTE, authorPickLine, legCheckedLine, type StopLeg } from "../../plan/LegRow";
import { dayBlockHeading } from "@/lib/plan-day";
import { itemFactsLine } from "@/lib/place-facts";
import { AUTHOR_TIP_MAX_CHARS, legModeOptions } from "@shared/trip-plan";
import { planDayDomId, planItemDomId, planLegDomId, planLegPairDomId, readinessJumpTargets } from "@shared/plan-jump-targets";

(globalThis as any).React = React;

const FIXTURE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../server/__tests__/fixtures/smoke6-plancard.json");
const payload = JSON.parse(readFileSync(FIXTURE, "utf8"));
const days: any[] = [...payload.days].sort((a, b) => a.dayNum - b.dayNum);
const all = days.flatMap((d) => d.activities ?? []);
const decode = (s: string) => s.replace(/<!-- -->/g, "").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"');

const d1 = days[0].activities;
const LEGS: StopLeg[] = [
  {
    id: "leg-proposed",
    dayNumber: days[0].dayNum,
    fromActivityId: d1[0].id,
    toActivityId: d1[1].id,
    fromName: d1[0].name,
    toName: d1[1].name,
    recommendedMode: "walk",
    userSelectedMode: null,
    alternativeModes: [{ mode: "bus" }],
    estimatedDurationMinutes: 18,
    distanceDisplay: "1.2 km",
    proposalStatus: "proposed",
    authorTip: null,
  },
  {
    id: "leg-confirmed",
    dayNumber: days[0].dayNum,
    fromActivityId: d1[1].id,
    toActivityId: d1[2].id,
    fromName: d1[1].name,
    toName: d1[2].name,
    recommendedMode: "walk",
    userSelectedMode: "bus",
    alternativeModes: [],
    estimatedDurationMinutes: 12,
    proposalStatus: "confirmed",
    authorTip: "Take the 206 from the stop by the gate",
    checkedAt: "2026-10-04T09:00:00.000Z",
  },
];

function render(canEdit = true): string {
  return decode(
    renderToString(
      React.createElement(WorkstationDays, {
        days,
        placeFacts: payload.placeFacts,
        timeZone: payload.trip.timezone,
        legs: LEGS,
        canEdit,
        onReorder: () => {},
        onRemove: () => {},
        onLegPatch: () => {},
        onLegRemove: () => {},
        pickupChoices: [],
        pickupUnavailableReason: HOST_PICKUP_UNAVAILABLE_NOTE,
        renderEdit: () => null,
        renderAddForm: () => null,
      }),
    ),
  );
}
const html = render();

test("W1 every item renders exactly once, under its own day, in order", () => {
  assert.ok(all.length > 0, "the fixture has items");
  for (const a of all) {
    assert.equal(html.split(`data-testid="slip-item-${a.id}"`).length - 1, 1, `${a.name} renders once`);
  }
  for (const d of days) {
    const start = html.indexOf(`id="${planDayDomId(d.dayNum)}"`);
    assert.ok(start >= 0, `day ${d.dayNum} has its block`);
    const next = days.find((x) => x.dayNum > d.dayNum);
    const end = next ? html.indexOf(`id="${planDayDomId(next.dayNum)}"`) : html.length;
    let last = start;
    for (const a of d.activities) {
      const at = html.indexOf(`data-testid="slip-item-${a.id}"`);
      assert.ok(at > last && at < end, `${a.name} sits in day ${d.dayNum}, after the stop before it`);
      last = at;
    }
    assert.ok(html.includes(dayBlockHeading({ dayNum: d.dayNum, date: d.date, dateIso: d.dateIso ?? null })));
  }
});

test("W2 time, title and facts line are the payload's", () => {
  for (const d of days) {
    for (const a of d.activities) {
      assert.ok(html.includes(a.name), `title ${a.name}`);
      if (a.time) assert.ok(html.includes(`data-testid="slip-item-time-${a.id}"`));
      const facts = itemFactsLine(payload.placeFacts?.[a.id], d.dateIso ?? null);
      if (facts) assert.ok(html.includes(facts.text), `facts line for ${a.name}`);
    }
  }
});

test("W3 edit mode, expert role: a menu on every row; no traveler read-mode controls", () => {
  for (const a of all) assert.ok(html.includes(`data-testid="item-menu-${a.id}"`), `menu on ${a.name}`);
  assert.ok(!html.includes('data-testid="slip-item-navigate-'), "no Navigate link on the build surface");
  assert.ok(!html.includes('data-testid="button-visited-'), "no visited tick");
  assert.ok(html.includes('data-item-mode="edit"'));
});

test("W4 every day, stop and leg is a jump target, and readiness lines resolve into the page", () => {
  for (const a of all) assert.ok(html.includes(`id="${planItemDomId(a.id)}"`), `stop ${a.name}`);
  for (const l of LEGS) assert.ok(html.includes(`id="${planLegDomId(l.id)}"`), `leg ${l.id}`);
  const lines = [
    { requirement: "hours", dayNumber: days[0].dayNum, itemId: d1[0].id },
    { requirement: "legs", dayNumber: days[0].dayNum, fromItemId: d1[0].id, toItemId: d1[1].id, legId: "leg-proposed" },
    { requirement: "legs", dayNumber: days[0].dayNum, fromItemId: d1[2].id, toItemId: d1[3].id },
    { requirement: "schedule", dayNumber: days[1].dayNum, anchorId: "anchor-x" },
  ];
  for (const line of lines) {
    const hit = readinessJumpTargets(line).find((id) => html.includes(`id="${id}"`));
    assert.ok(hit, `${line.requirement} line resolves to an element on the page`);
  }
});

test("W5 a leg is ONE LegRow in the expert role", () => {
  assert.ok(html.includes('data-testid="leg-row-leg-proposed"'));
  const opts = legModeOptions(LEGS[0]);
  for (const m of opts) assert.ok(html.includes(`value="${m}"`), `mode option ${m}`);
  assert.ok(html.includes(`maxLength="${AUTHOR_TIP_MAX_CHARS}"`), "the tip is capped at the shared limit");
  assert.ok(html.includes('data-testid="leg-confirm-leg-proposed"'), "a proposed leg offers Confirm");
  assert.ok(!html.includes('data-testid="leg-confirm-leg-confirmed"'), "a confirmed leg does not");
  assert.ok(html.includes("Author's pick: Bus · Take the 206 from the stop by the gate"));
  assert.ok(html.includes('data-testid="leg-checked-leg-confirmed"'), "the stamp shows on the confirmed leg");
  assert.ok(html.includes(HOST_PICKUP_UNAVAILABLE_NOTE), "the host-pickup limit is said");
  assert.ok(!html.includes('data-testid="leg-pickup-select-'), "no pickup control while nothing can be picked");
});

test("W6 a pair with no leg says why — never a fabricated leg", () => {
  const gap = `data-testid="leg-gap-${d1[2].id}-${d1[3].id}"`;
  assert.ok(html.includes(gap));
  assert.ok(html.includes(`id="${planLegPairDomId(days[0].dayNum, d1[2].id, d1[3].id)}"`));
});

test("W7 read-only draws no menu and no leg control", () => {
  const ro = render(false);
  assert.ok(!ro.includes('data-testid="item-menu-'));
  assert.ok(!ro.includes('data-testid="leg-mode-select-'));
  assert.ok(!ro.includes('data-testid="workstation-add-stop-day-'));
});

test("pure helpers", () => {
  assert.deepEqual(readinessJumpTargets({ dayNumber: 2, itemId: "i" }), [planItemDomId("i"), planDayDomId(2)]);
  assert.deepEqual(readinessJumpTargets({}), [], "a line naming nothing has no target");
  assert.equal(legBetween(LEGS, days[0].dayNum, d1[0].id, d1[1].id)?.id, "leg-proposed");
  assert.equal(legBetween(LEGS, days[0].dayNum, d1[1].id, d1[0].id), null, "pairs are ordered");
  assert.match(legGapLine({ lat: null, lng: null } as any, { lat: 35, lng: 135 } as any), /Add a location/);
  assert.match(legGapLine({ lat: 35, lng: 135 } as any, { lat: 35.1, lng: 135.1 } as any), /Not routed yet/);
  assert.equal(authorPickLine({ authorTip: "  ", recommendedMode: "walk", userSelectedMode: null }), null);
  assert.equal(legCheckedLine({ proposalStatus: "proposed", checkedAt: "2026-10-04T00:00:00Z" }), null, "only a confirmed leg is stamped");
  assert.equal(legCheckedLine({ proposalStatus: "confirmed", checkedAt: null }), null);
  assert.equal(expertRoutingLine({ id: "x", routingStatus: "with_expert" } as any), "With your expert");
  assert.equal(expertRoutingLine({ id: "x", routingStatus: "in_planning" } as any), null);
});
