/**
 * E2 — the detail-page action block, the event POST body, and the saved-refs shape.
 *
 * The five button rules (Leon, Nov 13) are asserted on the PURE view, so they hold for every page that
 * mounts it; the POST body is asserted with `deepStrictEqual` so an extra key fails; and the saved-refs
 * dedupe is asserted for the case the server had to change for — one event on TWO plans.
 *
 * Strings: "On Day {n}" / "Back to plan" come from `plan-stop-links.ts` (approved on #2004). This file
 * asserts them by identity, so a wording change there fails here rather than drifting.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import React, { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { DetailPlanActions } from "../../components/plan/DetailPlanActions";
import { PENDING_LL1_STRINGS } from "../plan-stop-links";
import { planItemRefFromFeedItem } from "@shared/plan-item-ref";
import { dedupeSavedRefs } from "../../../../server/services/guest-plan.service";

// The repo JSX transform is classic, so the module must see React on the global before it renders.
(globalThis as any).React = React;

/** Same harness as add-to-plan-button.test.tsx: Router + a fresh QueryClient, no jsdom. */
const html = (node: Parameters<typeof renderToString>[0]) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    createElement(Router as any, { ssrPath: "/" }, createElement(QueryClientProvider as any, { client }, node)) as any,
  );
};

function view(over: Record<string, unknown> = {}) {
  return html(
    createElement(DetailPlanActions, {
      page: "event-detail",
      plan: null,
      alreadyOnDay: null,
      mode: "waitlist",
      signedIn: false,
      planAroundHref: "/?start=1",
      ...over,
    } as any),
  );
}

test("E2: no plan keeps 'Plan around it' as the primary and draws no Add", () => {
  const out = view();
  assert.match(out, /data-testid="event-detail-plan-around"/, "the primary is the plan-around link");
  assert.doesNotMatch(out, /event-detail-add/, "no Add without a plan");
  assert.doesNotMatch(out, /event-detail-book/, "no Book without a plan");
});

test("E2: a dated plan draws Add as primary, with 'Plan around it' secondary", () => {
  const out = view({ plan: { tripId: "t1", datesConfirmed: true }, signedIn: true, mode: "open" });
  assert.match(out, /data-testid="event-detail-add"/, "Add is drawn");
  assert.match(out, /data-testid="event-detail-plan-around-secondary"/, "the secondary link is drawn");
  assert.doesNotMatch(out, /event-detail-book/, "an event is not a bookable product");
});

test("E2: already on the plan shows On Day {n} and Back to plan, never a second Add", () => {
  const out = view({ plan: { tripId: "t1", datesConfirmed: true }, alreadyOnDay: 2, signedIn: true, mode: "open" });
  assert.match(out, new RegExp(PENDING_LL1_STRINGS.onDay(2)), "the day is stated");
  assert.match(out, new RegExp(PENDING_LL1_STRINGS.backToPlan), "the way back is offered");
  assert.match(out, /href="\/plans\/t1"/, "it links to THAT plan");
  assert.doesNotMatch(out, /event-detail-add/, "no second Add");
});

test("E2: a guest gets Add only - no priced control, even for a bookable product", () => {
  const out = view({ plan: { tripId: "t1", datesConfirmed: true }, signedIn: false, mode: "waitlist", bookable: true });
  assert.match(out, /data-testid="event-detail-add"/);
  assert.doesNotMatch(out, /event-detail-book/, "a guest never sees Book");
});

test("E2: waitlist mode suppresses Book for a signed-in traveler too", () => {
  const out = view({ plan: { tripId: "t1", datesConfirmed: true }, signedIn: true, mode: "waitlist", bookable: true });
  assert.doesNotMatch(out, /event-detail-book/, "waitlist mode carries no priced control");
});

test("E2: open mode + signed in + bookable draws Book (ready-made)", () => {
  const out = html(
    createElement(DetailPlanActions, {
      page: "ready-made-detail",
      plan: { tripId: "t1", datesConfirmed: true },
      alreadyOnDay: null,
      mode: "open",
      signedIn: true,
      bookable: true,
      planAroundHref: "/?start=1",
    } as any),
  );
  assert.match(out, /data-testid="ready-made-detail-book"/, "Book is the primary for a bookable product");
  assert.match(out, /data-testid="ready-made-detail-add"/, "Add rides beside it");
});

test("E2: the event POST body names its row and carries NO placement day", () => {
  const ref = planItemRefFromFeedItem({ type: "city_event", sourceContentId: "chionin-autumn-lightup-2026" }, "Kyoto", null);
  assert.ok(ref, "the ref resolves");
  // Exact body: the server places the event from the event's own dates, so no `placement` travels.
  assert.deepStrictEqual(ref, { kind: "city_event", source_id: "chionin-autumn-lightup-2026", city: "Kyoto" });
  assert.equal((ref as any).placement, undefined, "no placement key at all");
});

test("E2: saved-refs answers one entry per (key, plan) - the same event on two plans is two entries", () => {
  const key = { contentType: "city_event", contentId: "chionin-autumn-lightup-2026" };
  const entries = dedupeSavedRefs([
    { ...key, dayNumber: 3, planId: "plan-b" },
    { ...key, dayNumber: 1, planId: "plan-a" },
  ]);
  assert.equal(entries.length, 2, "one entry per plan, not one per key");
  assert.deepStrictEqual(
    entries.map((e) => [e.key, e.planId, e.dayNumber]),
    [
      ["city_event:chionin-autumn-lightup-2026", "plan-a", 1],
      ["city_event:chionin-autumn-lightup-2026", "plan-b", 3],
    ],
    "sorted by key then plan, each carrying its own day",
  );
});

test("E2: a repeated item on the SAME plan is one entry, lowest day winning", () => {
  const key = { contentType: "city_event", contentId: "chionin-autumn-lightup-2026" };
  const entries = dedupeSavedRefs([
    { ...key, dayNumber: 4, planId: "plan-a" },
    { ...key, dayNumber: 2, planId: "plan-a" },
  ]);
  assert.deepStrictEqual(entries.map((e) => [e.planId, e.dayNumber]), [["plan-a", 2]]);
});
