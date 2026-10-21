/**
 * Add-plan target (ledger `2026-10-20-add-plan-open-plans`).
 *
 * `?tripId=` still wins. Otherwise exactly one open plan is a direct add, and
 * two or more always open the picker — the tab's last-opened plan is not an
 * input. In the picker, preselect the plan whose city matches and, for an
 * event, whose dates contain the item's date; otherwise New plan.
 *
 * H1–H4 and Q1 keep the detail href and the quote-request rail.
 *
 * Run: npx tsx --test client/src/lib/__tests__/trip-target.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addItemFit,
  openPlansArgument,
  preselectAddPlan,
  quoteRequestTripId,
  readTripIdParam,
  resolveAddPlanTarget,
  resolveTargetTripId,
  serviceDetailHref,
  type OpenPlanRef,
} from "../trip-target";

const TRIP_URL = "11111111-1111-4111-8111-111111111111";
const LAST_OPENED = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const THIRD = "44444444-4444-4444-8444-444444444444";

function plan(
  id: string,
  fields: Partial<Pick<OpenPlanRef, "title" | "city" | "startDate" | "endDate">> = {},
): OpenPlanRef {
  return { id, title: fields.title ?? "Plan", city: fields.city ?? null, startDate: fields.startDate ?? null, endDate: fields.endDate ?? null };
}

const kyotoWeek = plan(OTHER, { title: "Kyoto week", city: "Kyoto", startDate: "2026-11-01", endDate: "2026-11-08" });
const osakaWeek = plan(LAST_OPENED, { title: "Osaka week", city: "Osaka", startDate: "2026-11-01", endDate: "2026-11-08" });
const kyotoLater = plan(THIRD, { title: "Kyoto later", city: "Kyoto, Japan", startDate: "2026-12-01", endDate: "2026-12-04" });

test("tripId wins over every open plan, including a single one and a city-date fit", () => {
  const many = resolveAddPlanTarget(`?tripId=${TRIP_URL}`, [osakaWeek, kyotoWeek], {
    city: "Kyoto",
    isEvent: true,
    date: "2026-11-03",
  });
  assert.deepEqual(many, { status: "direct", tripId: TRIP_URL });

  const only = resolveAddPlanTarget(`?tripId=${TRIP_URL}`, [plan(LAST_OPENED, { city: "Kyoto" })]);
  assert.deepEqual(only, { status: "direct", tripId: TRIP_URL });

  assert.equal(resolveTargetTripId(`tripId=${TRIP_URL}`, [osakaWeek, kyotoWeek]), TRIP_URL);
  assert.equal(resolveTargetTripId(`?tripId=${TRIP_URL}`), TRIP_URL);
  assert.equal(readTripIdParam(`?showExperts=true&tripId=${TRIP_URL}`), TRIP_URL);
});

test("exactly one open plan is a direct add, even when its city and dates do not fit", () => {
  const resolved = resolveAddPlanTarget("", [plan(LAST_OPENED, { city: "Osaka", startDate: "2026-11-01", endDate: "2026-11-02" })], {
    city: "Kyoto",
    isEvent: true,
    date: "2026-11-03",
  });
  assert.deepEqual(resolved, { status: "direct", tripId: LAST_OPENED });
  assert.equal(resolveTargetTripId("?q=kyoto&page=2", [plan(LAST_OPENED)]), LAST_OPENED);
});

test("two or more open plans always ask — the first plan is not a silent target", () => {
  const resolved = resolveAddPlanTarget("", [osakaWeek, kyotoWeek], { city: "Tokyo", isEvent: false });
  assert.equal(resolved.status, "picker");
  if (resolved.status !== "picker") return;
  assert.notEqual(resolved.preselect.kind === "plan" ? resolved.preselect.tripId : "", LAST_OPENED);
  assert.equal(resolveTargetTripId("", [osakaWeek, kyotoWeek]), "");
  assert.equal(resolveTargetTripId("?q=kyoto", [osakaWeek, kyotoWeek, kyotoLater]), "");
});

test("a blank tripId does not win, and an unknown list does not guess a plan", () => {
  assert.deepEqual(resolveAddPlanTarget("?tripId=", [plan(LAST_OPENED)]), { status: "direct", tripId: LAST_OPENED });
  assert.deepEqual(resolveAddPlanTarget("?tripId=%20%20", [osakaWeek, kyotoWeek]).status, "picker");
  assert.deepEqual(resolveAddPlanTarget("", null), { status: "pending" });
  assert.deepEqual(resolveAddPlanTarget(undefined, undefined), { status: "pending" });
  assert.equal(resolveTargetTripId("", null), "");
  assert.equal(resolveTargetTripId("?tripId=", []), "");
  // A context-shaped object is not a plan list. It must not become the target.
  assert.equal(resolveTargetTripId("", { tripId: LAST_OPENED } as unknown as OpenPlanRef[]), "");
});

test("picker preselects the plan whose city matches and whose dates contain the event", () => {
  const item = { city: "Kyoto", isEvent: true, date: "2026-11-03" };
  const resolved = resolveAddPlanTarget("", [osakaWeek, kyotoLater, kyotoWeek], item);
  assert.deepEqual(resolved, { status: "picker", preselect: { kind: "plan", tripId: kyotoWeek.id } });
  assert.deepEqual(preselectAddPlan([osakaWeek, kyotoLater, kyotoWeek], item), { kind: "plan", tripId: kyotoWeek.id });

  assert.equal(preselectAddPlan([kyotoWeek], { ...item, date: "2026-11-01" }).kind === "plan" && kyotoWeek.id, kyotoWeek.id);
  const onEnd = preselectAddPlan([kyotoWeek], { ...item, date: "2026-11-08" });
  assert.deepEqual(onEnd, { kind: "plan", tripId: kyotoWeek.id });
  const instant = preselectAddPlan([kyotoWeek], { ...item, date: "2026-11-03T18:00:00.000Z" });
  assert.deepEqual(instant, { kind: "plan", tripId: kyotoWeek.id });
});

test("no fitting plan preselects New plan", () => {
  const plans = [osakaWeek, kyotoWeek];
  assert.deepEqual(preselectAddPlan(plans, { city: "Tokyo", isEvent: true, date: "2026-11-03" }), { kind: "new" });
  assert.deepEqual(
    preselectAddPlan(plans, { city: "Kyoto", isEvent: true, date: "2026-11-20" }),
    { kind: "new" },
  );
  assert.deepEqual(preselectAddPlan(plans, { city: "Kyoto", isEvent: true, date: null }), { kind: "new" });
  assert.deepEqual(preselectAddPlan(plans, { city: "Unknown", isEvent: false }), { kind: "new" });
  assert.deepEqual(preselectAddPlan([], { city: "Kyoto", isEvent: false }), { kind: "new" });
  assert.deepEqual(resolveAddPlanTarget("", [], { city: "Kyoto", isEvent: true, date: "2026-11-03" }), {
    status: "picker",
    preselect: { kind: "new" },
  });
  const half = plan(OTHER, { city: "Kyoto", startDate: "2026-11-01", endDate: null });
  assert.deepEqual(preselectAddPlan([half, osakaWeek], { city: "Kyoto", isEvent: true, date: "2026-11-03" }), {
    kind: "new",
  });
});

test("a non-event matches on city only, and the day it carries is not a date test", () => {
  const gem = addItemFit({ city: "Kyoto", type: "gem", scheduledDate: "2026-12-02" });
  assert.equal(gem.isEvent, false);
  assert.deepEqual(preselectAddPlan([osakaWeek, kyotoLater], gem), { kind: "plan", tripId: kyotoLater.id });

  const event = addItemFit({ city: "Kyoto", type: "event", scheduledDate: "2026-12-02" });
  assert.equal(event.isEvent, true);
  assert.deepEqual(preselectAddPlan([kyotoWeek, kyotoLater], event), { kind: "plan", tripId: kyotoLater.id });
});

test("openPlansArgument waits for a signed-in list and does not wait for a guest", () => {
  const plans = [kyotoWeek];
  assert.equal(openPlansArgument({ authLoading: true, signedIn: true, known: false, openPlans: plans }), null);
  assert.equal(openPlansArgument({ authLoading: false, signedIn: true, known: false, openPlans: plans }), null);
  assert.deepEqual(openPlansArgument({ authLoading: false, signedIn: false, known: false, openPlans: plans }), []);
  assert.deepEqual(openPlansArgument({ authLoading: false, signedIn: true, known: true, openPlans: plans }), plans);
});

test("H1 the detail href carries the target trip forward", () => {
  assert.equal(serviceDetailHref("svc-1", TRIP_URL), `/services/svc-1?tripId=${TRIP_URL}`);
});

test("H2 with no target trip the href is the plain pre-existing link", () => {
  assert.equal(serviceDetailHref("svc-1"), "/services/svc-1");
  assert.equal(serviceDetailHref("svc-1", ""), "/services/svc-1");
  assert.equal(serviceDetailHref("svc-1", null), "/services/svc-1");
  assert.equal(serviceDetailHref("svc-1", "   "), "/services/svc-1");
});

test("H3 the href round-trips back through the resolver (grid → detail is one contract)", () => {
  const href = serviceDetailHref("svc-1", TRIP_URL);
  const search = href.slice(href.indexOf("?"));
  assert.equal(resolveTargetTripId(search, []), TRIP_URL);
});

test("H4 ids are encoded into the query string", () => {
  assert.equal(serviceDetailHref("svc-1", "a b&c=d"), "/services/svc-1?tripId=a%20b%26c%3Dd");
});

test("Q1 a quote request names only the URL trip", () => {
  assert.equal(quoteRequestTripId(`?tripId=${TRIP_URL}`), TRIP_URL);
  assert.equal(quoteRequestTripId(`tripId=${TRIP_URL}`), TRIP_URL);
  assert.equal(quoteRequestTripId(""), "");
  assert.equal(quoteRequestTripId("?q=kyoto"), "");
  assert.equal(quoteRequestTripId("?tripId=%20%20"), "");
});

test("the picker shows name, city and dates, and New plan is the last row", () => {
  const src = readFileSync(new URL("../../components/plan-picker.tsx", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  const listStart = src.indexOf("export function PlanPickerList");
  const dialogStart = src.indexOf("export function PlanPickerDialog");
  assert.ok(listStart > 0 && dialogStart > listStart);
  const list = src.slice(listStart, dialogStart);
  const plansMap = list.indexOf("plans.map");
  const newPlan = list.indexOf("New plan");
  assert.ok(plansMap > 0 && newPlan > plansMap, "New plan is rendered after the plan rows");
  assert.match(list, /text-plan-picker-name/);
  assert.match(list, /text-plan-picker-city/);
  assert.match(list, /text-plan-picker-dates/);
  assert.match(list, /preselectAddPlan\(/);
  assert.match(list, /button-plan-picker-confirm/);
  assert.match(src, /statedCity\(/);
});

test("add surfaces resolve through the open-plan rule, not the tab pen", () => {
  const read = (rel: string) =>
    readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
  for (const rel of [
    "pages/discover.tsx",
    "pages/service-detail.tsx",
    "components/add-to-experience-dialog.tsx",
  ]) {
    const src = read(rel);
    assert.match(src, /useAddPlanResolution\(/, rel);
    assert.doesNotMatch(src, /resolveTargetTripId\(/, rel);
  }
});
