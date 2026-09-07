/**
 * The my-events fold (ledger `2026-09-07-my-events-fold`; CLAUDE.md Locked Decision 45 (5)).
 *
 * Two things are pinned here, and the second is the point of the lane:
 *   · the engagement's title / status / fee WORDS are ONE derivation, so the slip's Coordination
 *     card and `/my-events` cannot drift apart (§18 rule 1);
 *   · §13's absences — a trip-less engagement belongs to NO plan and is never attached to the
 *     nearest-looking one, a status-less row draws no badge, and an unrecognised fee state is
 *     never reported as paid.
 *
 * STATED NEGATIVE SPACE: these are pure functions. They cannot see whether the slip actually
 * MOUNTS the card, whether the sidebar entry is gone, or that no money rail moved — W1/W2 below
 * read those three surface files as text, which is the cheapest durable catch and still cannot
 * see what renders.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  engagementFee,
  engagementStatusLabel,
  engagementTitle,
  engagementTitleCase,
  engagementsForPlan,
  type CoordinationEngagementRow,
} from "../coordination-engagement";

const root = join(import.meta.dirname, "..", "..", "..", "..");
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");

function row(partial: Partial<CoordinationEngagementRow> = {}): CoordinationEngagementRow {
  return { id: "cs-1", tripId: "trip-1", experienceType: "wedding", status: "intake", feePaymentStatus: "unpaid", ...partial };
}

test("C1: the title is the spelling /my-events has always used", () => {
  assert.equal(engagementTitleCase("milestone_birthday"), "Milestone Birthday");
  assert.equal(engagementTitle(row({ experienceType: "wedding" })), "Wedding coordination");
  assert.equal(engagementTitle(row({ experienceType: "milestone_birthday" })), "Milestone Birthday coordination");
});

test("C2: §13 — no experience type is titled 'Coordination', never a guessed occasion", () => {
  assert.equal(engagementTitle(row({ experienceType: null })), "Coordination");
  assert.equal(engagementTitle(row({ experienceType: "   " })), "Coordination");
});

test("C3: §13 — a row recording no status draws NO badge (never the DB's `intake` default)", () => {
  assert.equal(engagementStatusLabel(null), null);
  assert.equal(engagementStatusLabel(""), null);
  assert.equal(engagementStatusLabel("intake"), "Intake");
  assert.equal(engagementStatusLabel("vendor_selection"), "Vendor Selection");
});

test("C4: the four fee states, and §13 — an unknown value is never reported as paid", () => {
  assert.deepEqual(engagementFee("paid"), { label: "Fee paid", tone: "paid" });
  assert.deepEqual(engagementFee("refunded"), { label: "Fee refunded", tone: "refunded" });
  assert.deepEqual(engagementFee("pending"), { label: "Payment in progress", tone: "pending" });
  assert.deepEqual(engagementFee("unpaid"), { label: "Fee due", tone: "due" });
  // Absent and unrecognised both land on the state where the traveler still has something to do.
  assert.equal(engagementFee(null).tone, "due");
  assert.equal(engagementFee("something_new").tone, "due");
});

test("C5: §13 — a trip-less engagement belongs to NO plan and is attached to none", () => {
  const rows = [row({ id: "a", tripId: "trip-1" }), row({ id: "b", tripId: null }), row({ id: "c", tripId: "trip-2" })];
  assert.deepEqual(engagementsForPlan(rows, "trip-1").map((r) => r.id), ["a"]);
  assert.deepEqual(engagementsForPlan(rows, "trip-2").map((r) => r.id), ["c"]);
  // The null-trip row is reachable from NO slip — it stays on /my-events, which stays routed.
  assert.deepEqual(engagementsForPlan(rows, "").map((r) => r.id), []);
  assert.deepEqual(engagementsForPlan(rows, null).map((r) => r.id), []);
  assert.deepEqual(engagementsForPlan(undefined, "trip-1"), []);
});

test("C6: a plan can hold more than one engagement, and all of them render", () => {
  const rows = [row({ id: "a" }), row({ id: "b" })];
  assert.equal(engagementsForPlan(rows, "trip-1").length, 2);
});

test("W1: both surfaces READ the one derivation — neither spells the words itself", () => {
  const slip = read("client", "src", "components", "plancard", "SlipRail.tsx");
  const page = read("client", "src", "pages", "my-events.tsx");
  for (const [name, src] of [["SlipRail.tsx", slip], ["my-events.tsx", page]] as const) {
    assert.match(src, /from "@\/lib\/coordination-engagement"/, `${name} imports the shared module`);
    assert.ok(!/const titleCase\s*=/.test(src), `${name} keeps no private title-caser`);
    assert.ok(
      !/"Payment in progress"/.test(src.replace(/from "@\/lib\/coordination-engagement"/, "")) ||
        /engagementFee/.test(src),
      `${name} does not restate a fee word without the shared derivation`,
    );
  }
  assert.match(slip, /engagementsForPlan/, "the slip filters by plan through the shared predicate");
});

test("W2: the fee-pay rail did not move — the slip card hosts NO charge", () => {
  const slip = read("client", "src", "components", "plancard", "SlipRail.tsx");
  const coordination = slip.slice(slip.indexOf("function CoordinationCard"), slip.indexOf("// ── Plan ─"));
  assert.ok(coordination.length > 200, "the CoordinationCard block was located");
  for (const forbidden of ["/pay", "coordination-states/${", "PaymentIntent", "clientSecret"]) {
    assert.ok(!coordination.includes(forbidden), `the card must not reach for ${forbidden}`);
  }
  // The one money rail stays where it was, untouched by this lane.
  const page = read("client", "src", "pages", "my-events.tsx");
  assert.match(page, /\/api\/coordination-states\/\$\{engagement\.id\}\/pay/);
  assert.match(page, /\/api\/coordination-states\/\$\{engagement\.id\}\/pay\/confirm/);
});

test("W3: the sidebar entry is retired and the /my-events route is NOT redirected", () => {
  const sidebar = read("client", "src", "components", "dashboard-sidebar.tsx");
  assert.ok(!/href: "\/my-events"/.test(sidebar), "no sidebar destination for /my-events");
  const app = read("client", "src", "App.tsx");
  const routeAt = app.indexOf('<Route path="/my-events">');
  assert.ok(routeAt > 0, "the route is still registered");
  const block = app.slice(routeAt, routeAt + 200);
  assert.ok(!/Redirect/.test(block), "a redirect would delete trip-less engagements (§13)");
  assert.match(block, /MyEventsPage/, "the page still renders");
});
