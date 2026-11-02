/**
 * CN-1d-UI (ledger `2026-11-01-cn1d-ui-hire-for-this-trip`): "Hire for this trip".
 *
 *   U1  a concierge listing shows its per-trip price, the response line (only when hours are set), its task list
 *       (with caps) and the link-only line once; a planning listing is unchanged
 *   U2  the CTA reads "Hire for this trip" for concierge; "Book" and the other labels are unchanged
 *   U3  the picker lists only plans with chosen dates and a last day, offers no "New plan", and with none shows H1
 *       and no confirm (so nothing is posted)
 *   U4  consent: confirm disabled until ticked; {end_date} is the trip's own last day (Tokyo trip ending 2027-04-05 →
 *       "Apr 5", never Apr 4/6); hireAuthNote / hireReleased text never renders
 *   U5  confirm → ONE POST /api/cart with { serviceId, quantity: 1, tripId } (never the plan-item path); a double
 *       click is one request; a 409 shows the server's own sentence
 *   U6  trip page: a concierge advisor shows hireAccessDates with the trip's dates; past accessUntil → H5; a handoff
 *       advisor's card gets nothing new
 *   U7  every new string comes from the constants object; no "authorized", "hold", "released", "AI" or "fee"
 *   U8  390px: the dialog and the task list wrap instead of overflowing (asserted on classes — no screenshot here)
 *
 * Harness: react-dom/server renderToString, no DOM (the which-event-picker posture). A Radix dialog does not
 * server-render, so the consent BODY is rendered directly; the trips list is seeded into a QueryClient.
 *
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/components/__tests__/cn1d-ui-hire-for-this-trip.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CN1_COPY, conciergePerTripPrice } from "@shared/cn1-copy";
import { api } from "@shared/routes";
import { resolveBuyAction, type BuyActionBuyer, type BuyActionRow } from "@shared/buy-action";
import { serviceDetailBuyRender } from "@/lib/service-buy-action";
import { resolvePriceUnit, priceUnitPhrase } from "@/lib/price-unit";
import {
  CONCIERGE_HIRE_COPY,
  conciergeAccessLine,
  consentLine,
  createSingleFlight,
  formatTripDay,
  hireCartBody,
  hireEligiblePlan,
  noEligiblePlanLine,
  serverMessageOf,
} from "@/lib/concierge-hire-copy";
import { ConciergeHireConsent, ConciergeListingDetails } from "../concierge-hire";
import { PlanPickerList } from "../plan-picker";

(globalThis as any).React = React;

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const PAGE = "client/src/pages/service-detail.tsx";

const MEMBER: BuyActionBuyer = { principal: "member", plans: "many" };
const row = (over: Partial<BuyActionRow> = {}): BuyActionRow => ({
  kind: "listing",
  bookability: "native",
  deliveryMethod: "async_messaging",
  productShape: null,
  bookingMode: "instant",
  hasPrice: true,
  hasPublishedAvailability: true,
  isLive: true,
  ...over,
});

const tasks = [
  { taskKindKey: "meals", label: "Meals", domain: "meals", linkOnly: false, cap: 3 },
  { taskKindKey: "entry", label: "Entry tickets", domain: "entry", linkOnly: false, cap: null },
  { taskKindKey: "stays", label: "Stays", domain: "stays", linkOnly: true, cap: null },
  { taskKindKey: "transport", label: "Transport", domain: "transport", linkOnly: true, cap: null },
];

function renderPicker(plans: unknown[], mode: Parameters<typeof PlanPickerList>[0]["mode"]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData([api.trips.list.path], plans);
  return renderToString(
    <QueryClientProvider client={qc}>
      <PlanPickerList onPick={() => {}} onStartNew={() => {}} mode={mode} />
    </QueryClientProvider>,
  );
}

const FUTURE = "2099-04-05";
const confirmedPlan = { id: "p-ok", title: "Kyoto", destination: "Kyoto", startDate: "2099-04-02", endDate: FUTURE, datesConfirmedAt: "2026-10-01T00:00:00Z" };
const placeholderPlan = { id: "p-placeholder", title: "Someday", destination: "Osaka", startDate: "2099-05-01", endDate: "2099-05-01", datesConfirmedAt: null };
const hireMode = (name: string) => ({
  planFilter: (p: any) => hireEligiblePlan(p),
  hideStartNew: true,
  emptyNote: noEligiblePlanLine(name),
  confirmLabel: CONCIERGE_HIRE_COPY.cta,
});

describe("CN-1d-UI Hire for this trip", () => {
  it("U1 concierge details: response line only with hours, tasks with caps, link-only line once; price per trip", () => {
    const html = renderToString(<ConciergeListingDetails tasks={tasks} responseWindowHours={6} expertName="Aya" />);
    assert.match(html, /data-testid="text-concierge-response-hours"[^>]*>Aims to reply within 6 hours\.</);
    assert.match(html, /data-testid="concierge-task-meals"/);
    assert.match(html, /data-testid="concierge-task-cap-meals"[^>]*>up to 3</);
    assert.doesNotMatch(html, /concierge-task-cap-entry/, "no cap ⇒ no cap line");
    assert.equal((html.match(/data-testid="text-concierge-link-only"/g) ?? []).length, 1, "link-only line once");
    assert.match(html, /You book stays and transport yourself\. Aya can send you the link\./);

    const noHours = renderToString(<ConciergeListingDetails tasks={tasks} responseWindowHours={null} expertName="Aya" />);
    assert.doesNotMatch(noHours, /text-concierge-response-hours/);
    assert.equal(renderToString(<ConciergeListingDetails tasks={[]} responseWindowHours={null} expertName="Aya" />), "");

    assert.equal(resolvePriceUnit({ pricingUnit: "per_trip" }), "trip");
    assert.equal(priceUnitPhrase({ pricingUnit: "per_trip" }), "per trip");
    assert.equal(conciergePerTripPrice("$120"), "$120 per trip");

    // A planning listing: the concierge block, label and response override are gated on the concierge type.
    const page = strip(read(PAGE));
    assert.match(page, /\{isConcierge && \(\s*<div className="pt-\[17px\]">\s*<ConciergeListingDetails/);
    assert.match(page, /const conciergePerTrip = service\.serviceType === "concierge" && service\.pricingUnit === "per_trip" && priceNum > 0;/);
    assert.match(page, /const responseWindowText = service\.serviceType === "concierge" \? null : formatResponseWindow\(service\.responseWindowHours\);/);
  });

  it("U2 the CTA is 'Hire for this trip' for concierge; other labels unchanged; the primary keeps button-book-now", () => {
    const hire = serviceDetailBuyRender(resolveBuyAction(row({ serviceType: "concierge", bookingMode: "request" }), MEMBER));
    assert.equal(hire.hire?.label, "Hire for this trip");
    assert.equal(hire.book, null);
    assert.equal(hire.request, null);
    assert.equal(hire.add, null);
    assert.deepEqual(hire.unrenderedKinds, []);
    assert.equal(hire.refusal, null);

    const book = serviceDetailBuyRender(resolveBuyAction(row(), MEMBER));
    assert.equal(book.book?.label, "Book");
    assert.equal(book.hire, null);
    const req = serviceDetailBuyRender(resolveBuyAction(row({ bookingMode: "request" }), MEMBER));
    assert.equal(req.request?.label, "Request to book");

    const page = read(PAGE);
    const hireBlock = page.slice(page.indexOf("{buy.hire && ("), page.indexOf("{buy.book && ("));
    assert.match(hireBlock, /data-testid="button-book-now"/);
    assert.match(hireBlock, /\{buy\.hire\.label\}/);
  });

  it("U3 hire picker: only plans with chosen dates, no New plan; none ⇒ H1 and no confirm", () => {
    assert.equal(hireEligiblePlan(confirmedPlan), true);
    assert.equal(hireEligiblePlan(placeholderPlan), false, "a placeholder window is not a planned trip");
    assert.equal(hireEligiblePlan({ id: "x", endDate: null, datesConfirmedAt: "2026-10-01" }), false);

    const listed = renderPicker([confirmedPlan, placeholderPlan], hireMode("Aya"));
    assert.match(listed, /data-testid="button-pick-plan-p-ok"/);
    assert.doesNotMatch(listed, /button-pick-plan-p-placeholder/);
    assert.doesNotMatch(listed, /button-plan-picker-start-new/, "no New plan in hire mode");
    assert.match(listed, /data-testid="button-plan-picker-confirm"[^>]*>Hire for this trip</);

    const none = renderPicker([placeholderPlan], hireMode("Aya"));
    assert.match(none, /data-testid="text-plan-picker-empty"[^>]*>Add dates to a plan first, then you can hire Aya for it\.</);
    assert.doesNotMatch(none, /button-plan-picker-confirm/, "nothing to confirm, so nothing is posted");
    assert.doesNotMatch(none, /button-plan-picker-start-new/);

    // The ordinary picker is unchanged.
    const ordinary = renderPicker([confirmedPlan, placeholderPlan], undefined);
    assert.match(ordinary, /button-pick-plan-p-placeholder/);
    assert.match(ordinary, /button-plan-picker-start-new/);

    // The page's door: signed in with no eligible plan, the CTA does nothing and states H1.
    const page = strip(read(PAGE));
    assert.match(page, /if \(hireNoPlan \|\| !hireName\) return;/);
    assert.match(page, /data-testid="text-concierge-no-eligible-plan"/);
  });

  it("U4 consent: confirm disabled until ticked; the last day in the trip's own calendar; no hold/release copy", () => {
    const unticked = renderToString(
      <ConciergeHireConsent expertName="Aya" tripEndDate="2027-04-05" pending={false} error={null} onConfirm={() => {}} />,
    );
    assert.match(unticked, /<button[^>]*disabled=""[^>]*data-testid="button-concierge-hire-confirm"/);
    assert.match(unticked, />Hire Aya</);
    assert.match(unticked, /They can view and suggest changes until Apr 5\./);
    assert.match(unticked, /You&#x27;re charged now\. If Aya can&#x27;t take this trip, you get a full refund\./);
    assert.match(unticked, /You can cancel for a full refund until Aya completes a task\./);

    const ticked = renderToString(
      <ConciergeHireConsent expertName="Aya" tripEndDate="2027-04-05" pending={false} error={null} onConfirm={() => {}} initiallyTicked />,
    );
    assert.doesNotMatch(ticked, /<button[^>]*disabled=""[^>]*data-testid="button-concierge-hire-confirm"/);

    // Tokyo trip ending 2027-04-05: the stored day, whatever shape the wire gives it — never Apr 4 or Apr 6.
    for (const v of ["2027-04-05", "2027-04-05T00:00:00.000Z", "2027-04-05T15:00:00.000Z"]) {
      assert.equal(formatTripDay(v), "Apr 5", v);
    }
    assert.match(consentLine("Aya", "2027-04-05")!, /until Apr 5\./);

    for (const html of [unticked, ticked]) {
      assert.equal(html.includes(CN1_COPY.hireAuthNote.split("{name}")[0]), false, "hireAuthNote never renders");
      assert.equal(html.includes(CN1_COPY.hireReleased.split("{name}")[1] ?? "@@"), false, "hireReleased never renders");
      assert.doesNotMatch(html, /authori[sz]ed|\bhold\b|released/i);
    }
  });

  it("U5 one POST /api/cart with { serviceId, quantity: 1, tripId }; a double click is one request; a 409 shows the server's sentence", () => {
    assert.deepEqual(hireCartBody("svc-1", "trip-1"), { serviceId: "svc-1", quantity: 1, tripId: "trip-1" });

    const flight = createSingleFlight();
    let posts = 0;
    const click = () => {
      if (flight.tryStart()) posts += 1;
    };
    click();
    click();
    assert.equal(posts, 1, "double click = one request");
    flight.settle();
    click();
    assert.equal(posts, 2, "after the first settles, a new press is a new request");

    const msg = 'This listing is not open for booking right now. You can still message the provider about it.';
    assert.equal(serverMessageOf(new Error(`409: ${JSON.stringify({ reason: "line_trip_not_owned", message: msg })}`)), msg);
    assert.equal(serverMessageOf(new Error("400: plain text from the server")), "plain text from the server");

    const page = strip(read(PAGE));
    assert.match(page, /apiRequest\("POST", "\/api\/cart", hireCartBody\(id \?\? "", tripId\)\)/);
    const hireMutation = page.slice(page.indexOf("const hireMutation = useMutation"), page.indexOf("onError: (err: unknown) => setHireError(serverMessageOf(err))"));
    assert.doesNotMatch(hireMutation, /itinerary-items/, "never the plan-item path");
    assert.match(page, /if \(hireTrip && !hireMutation\.isPending\) hireMutation\.mutate\(hireTrip\.id\);/);
    assert.match(page, /navigate\(HIRE_CART_PATH\)/);
  });

  it("U6 trip page: concierge access dates in the trip's dates; ended → H5; handoff → nothing new", () => {
    const trip = { startDate: "2027-04-02", endDate: "2027-04-05" };
    const now = new Date("2027-04-03T00:00:00Z");
    assert.deepEqual(
      conciergeAccessLine({ source: "concierge", first_name: "Aya", accessUntil: "2027-04-05T15:00:00.000Z" }, trip, now),
      { kind: "active", text: "Aya can help with this trip from Apr 2 to Apr 5." },
    );
    assert.deepEqual(
      conciergeAccessLine({ source: "concierge", first_name: "Aya", accessUntil: "2027-04-05T15:00:00.000Z" }, trip, new Date("2027-04-06T00:00:00Z")),
      { kind: "ended", text: "Aya's access to this trip ended on Apr 5." },
    );
    for (const source of ["handoff", null, undefined]) {
      assert.equal(conciergeAccessLine({ source, first_name: "Aya", accessUntil: null }, trip, now), null, String(source));
    }

    const rail = strip(read("client/src/components/plancard/SlipRail.tsx"));
    assert.match(rail, /conciergeLine=\{isOwner \? conciergeAccessLine\(advisor, trip, new Date\(\)\) : null\}/);
    // The line is the only addition to the card, and it draws nothing when null — a handoff card is unchanged.
    assert.match(rail, /\{conciergeLine && \(/);
    assert.match(rail, /conciergeLine = null,/);
  });

  it("U7 every new string comes from the one object; no hold/authorized/released/AI/fee wording", () => {
    const banned = [/authori[sz]ed/i, /\bhold\b/i, /released?\b/i, /\bAI\b/, /\bfee\b/i, /paypal/i, /\bfounding\b/i, /\btop\b/i, /\bbest\b/i];
    const held = Object.entries(CONCIERGE_HIRE_COPY).filter(([k]) => !["cta", "consent", "accessDates", "pricePerTrip", "responseHours", "taskLinkOnly"].includes(k));
    for (const [key, text] of held) for (const b of banned) assert.doesNotMatch(text, b, key);
    const component = strip(read("client/src/components/concierge-hire.tsx"));
    for (const literal of component.match(/"[^"\n]*"/g) ?? []) {
      for (const b of banned) assert.doesNotMatch(literal, b, literal);
    }
    // The page holds none of the new sentences itself.
    const page = read(PAGE);
    for (const text of ["Add dates to a plan first", "You're charged now", "Hire {name}", "access to this trip ended"]) {
      assert.equal(page.includes(text), false, text);
    }
    assert.equal(read("client/src/lib/concierge-hire-copy.ts").includes("hireAuthNote:"), false);
    assert.equal(/CN1_COPY\.hire(AuthNote|Released)/.test(strip(read("client/src/lib/concierge-hire-copy.ts")) + strip(page) + strip(read("client/src/components/concierge-hire.tsx"))), false);
  });

  it("U8 at 390px the dialog and the task list wrap rather than overflow (class assertions; no screenshot taken)", () => {
    const component = read("client/src/components/concierge-hire.tsx");
    assert.match(component, /DialogContent className="max-w-md w-\[calc\(100vw-2rem\)\] sm:w-full"/);
    const details = renderToString(<ConciergeListingDetails tasks={tasks} responseWindowHours={6} expertName="Aya" />);
    assert.match(details, /class="[^"]*min-w-0[^"]*" data-testid="concierge-listing-details"/);
    assert.match(details, /flex flex-wrap[^"]*break-words min-w-0/);
    const consent = renderToString(
      <ConciergeHireConsent expertName="Aya" tripEndDate="2027-04-05" pending={false} error={null} onConfirm={() => {}} />,
    );
    assert.match(consent, /break-words min-w-0"[^>]*data-testid="label-concierge-hire-consent"/);
  });
});
