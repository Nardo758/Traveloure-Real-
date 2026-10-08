/**
 * slip-conformance — the six ways the shipped slip differed from the ratified canvas.
 *
 * Ledger `2026-09-06-slip-conformance` (CLAUDE.md Locked Decision 42, its D6 / D16 / D21 / D22 and
 * the D18–D22 addendum); the ratified "Slip as the Surface" canvas — `slip-canvas/gen.py`'s `rail`,
 * `page`, `build_card`, `plan_card`, `viewbar`, `event_group` and the SlipExpert rail's Expert
 * card. §13, §18 rule 1, Locked Decisions 30, 31, 33, 34, 39, 40.
 *
 * WHY THIS EXISTS. Five of the six are LAYOUT and COPY, which no server test can see and no type
 * can hold, and each one fails silently in its own direction:
 *
 *  · THE RAIL'S PLACEMENT AND ORDER. A rail rendered in the flow above the day list still shows
 *    every control — nothing throws, nothing 404s — and the plan itself simply starts below the
 *    fold. The card ORDER is the same shape of silence: Build · Finish · Plan · Share reads as a
 *    working rail and puts "Finalize plan" above the plan's own facts.
 *  · D6's ROLE CHIPS. The failure this pin exists for is a chip list RESTATED in the component —
 *    a literal florist/photographer/caterer array looks right on a wedding and is a taxonomy the
 *    client invented, which is exactly what `roles_needed` and its reachability guard exist to
 *    prevent. The second failure is a NULL rendered as a claim: Locked Decision 31 says NOT SET is
 *    never "this occasion needs nobody".
 *  · THE HEADER'S VERSION LINE. `planVersion` is the transition-log ROW COUNT. Printed at the top
 *    of a working plan it reads as a released version, and it is not one — the only version a
 *    traveler can hold is the FINALIZED card's. Both numbers render as `v<n>`, so the wrong one is
 *    invisible unless something pins WHICH surface may print one.
 *  · THE EXPERT CARD'S STOREFRONT LINK. `/s/<handle>` for an expert who claimed no handle is a
 *    link to a page that does not exist. A dead link looks identical to a live one until pressed
 *    (Locked Decision 40 — the handle IS the public address, and `users.id` is never one).
 *  · THE ITEM ROW'S ASK LINE. Its label is the SLIP's decision and its count must be absent: the
 *    plancard activity carries no comment count, so a number there could only come from somewhere
 *    other than the thread it describes (§13).
 *
 * PIN RULE (the neighbouring suites' rule, kept): every source pin reads the FILE SET the slip is
 * split across — `SlipView.tsx` + `SlipRail.tsx` — and asserts over their union, or over one
 * file's own body where the assertion is about that file's structure. There is no literal
 * call-site COUNT anywhere in here, so a later lane may move a block between the two files without
 * breaking a pin that was never about where the block lives.
 *
 * NEGATIVE SPACE: no DOM, no DB, no fetch, no React. These are pure rules plus facts about shipped
 * source. Whether a mounted component RENDERS, whether a Tailwind class produces the intended
 * geometry, and whether the rail is VISIBLE beside the list are the browser's answers and this
 * suite cannot see them — that is an e2e and a mock audit.
 *
 * Run: npx tsx --test client/src/lib/__tests__/slip-conformance.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SERVICES_BROWSE_CATEGORY_PARAM,
  SERVICES_BROWSE_PATH,
  serviceBrowseHrefForRole,
  slipEventRoleChips,
} from "../slip-event-roles";
// The ONE home of the browse's URL contract (ledger `2026-09-06-role-chips-filter`). Imported
// here so the pin below reads the same module both ends of the contract do.
import { servicesBrowseHref } from "../services-browse";
import { SLIP_RAIL_CARDS, slipAdvisorStandingLine, slipExpertRailState } from "../slip-rail";
import { slipPlanMetaLine, slipStopsLine, slipZoneLine } from "../slip-meta";
import { SLIP_ASK_EXPERT_LABEL } from "../slip-item-tools";
import { earnerProfilePath } from "../earner-address";
// The ONE extractor of the slip's control inventory, shared with the fixture generator so the
// snapshot and the comparison can never be produced by two different readings (§18 rule 1). It
// carries its own committed `--self-test` fixtures, run before this suite in CI (§18d).
import { inventoryOfFiles } from "../../../../scripts/lib/slip-action-inventory.cjs";
import SLIP_ACTIONS_MAIN from "./fixtures/slip-actions.main.json" with { type: "json" };

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIENT_SRC = join(HERE, "..", "..");
const readClient = (rel: string) => readFileSync(join(CLIENT_SRC, rel), "utf8");

const RAIL = "components/plancard/SlipRail.tsx";
const VIEW = "components/plancard/SlipView.tsx";
// Smoke 4 B5 (ledger `2026-10-02-smoke4-draft-fixes`): the header's meta line moved out of SlipView
// into its own component so it can be rendered in a test. Same controls, same file-set inventory.
const HEADER_META = "components/plancard/SlipHeaderMeta.tsx";
const LOGISTICS = "components/plancard/SlipLogisticsSection.tsx";
const COMMENTS = "components/plancard/ItemComments.tsx";

/**
 * THE SLIP'S FILE SET. Pins read the UNION of these, never one of them, so a block that moves
 * between the view and its rail does not break an assertion about the block's existence.
 */
const SLIP_FILES = [VIEW, RAIL];
const slipSrc = SLIP_FILES.map(readClient).join("\n");

/**
 * Source with its PROSE removed.
 *
 * This codebase documents its rulings in the files that implement them, so every phrase an
 * assertion below forbids also appears in the comment EXPLAINING why it is not rendered. A raw
 * text pin would be satisfied by the explanation and would never see the thing come back.
 *
 * `//` preceded by `:` is left alone so a URL inside a string is never mistaken for a comment.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const slipCode = stripComments(slipSrc);
const railCode = stripComments(readClient(RAIL));
const viewCode = stripComments(readClient(VIEW));

/**
 * The body of a named component, from its declaration to the NEXT top-level declaration.
 *
 * Deliberately not "to the next `\n}`": every component in these files destructures its props, so
 * the first column-0 `}` closes the parameter object and a pin scoped that way would silently be
 * about nothing but the prop names. Scoping to the next top-level `function` keeps the assertion
 * about the component while still refusing to widen into its neighbours.
 */
function functionBody(src: string, declaration: string): string {
  const start = src.indexOf(declaration);
  assert.ok(start >= 0, `expected to find ${declaration}`);
  const rest = src.slice(start + declaration.length);
  const next = rest.search(/\n(?:export )?(?:function|const|class) /);
  const body = next >= 0 ? rest.slice(0, next) : rest;
  assert.ok(body.length > 100, `expected a real body for ${declaration}`);
  return declaration + body;
}

// ── 0 · EVERY CONTROL SURVIVED THE RELAYOUT, AND STILL POINTS WHERE IT DID ────────────────────

/**
 * THE DECISION-MAKER'S OWN CONSTRAINT ON THIS LANE, PINNED: every action control on the slip keeps
 * the SAME testid and the SAME handler target, and the only permitted differences are the six
 * scope items. A relayout is the change most likely to LOSE a control quietly — a card left out of
 * the new container, a row dropped in a merge, a handler re-pointed while moving a block — and
 * none of that throws.
 *
 * `slip-actions.main.json` is the inventory taken from `origin/main` (35be83d3) BEFORE the
 * relayout, by the same extractor this suite runs over the shipped files. It is a FILE-SET
 * inventory, so a control that moves between `SlipView` and `SlipRail` reads as unchanged — the
 * pin is about the control existing and pointing where it did, never about which file holds it.
 */
const ALLOWED_ADDITIONS = {
  // R321 S11-1 (ledger `2026-10-05-smoke11-fixes`): on a finalized plan whose working copy changed
  // (or that was reopened), the Finished card offers the SAME finalize mutation again.
  "slip-action-refinalize": "R321 S11-1 — Make it final again; appends the next trip_finals version",
  // R323 (step 7b, R-be/L2-6): a bought copy's provenance line on the slip header.
  "slip-ready-made-source": "R323 R-be — \"from {author}'s Ready Made Trip\" (+ legs-checked stamp where one exists)",
  // A1 · the Trips frame (ledger `2026-09-29-a1-trips-frame`): the empty Trip's anchor question
  // card carries ONE existing rail each, owner only — the services browse for a stay, or the day-1
  // add control for a fixed dated item (product map §M7).
  // Surface step 3 (ledger `2026-10-03-surface-step3-anchor-panel`): the empty Trip's question card
  // became the ONE `AnchorPanel` (`components/plan/AnchorPanel.tsx`, outside this inventory's file
  // set). `slip-anchor-question` and `slip-anchor-fallback` live there now, pinned by
  // `anchor-panel.test.tsx`; the "Browse places to stay" link is gone — the brief's three answers
  // are Add places I'm considering / I've got lodging sorted / Skip for now.
  "slip-anchor-add-fixed": "A1 — schedule-first Trip: the day-1 add control, as the delegate note uses",
  // A3b · comparisons on the slip (ledger `2026-09-29-a3b-option-sets-slip`): the open sets sit
  // above the days (golden path Step 2); the controls themselves live in SlipOptionSets.tsx.
  "slip-option-sets": "A3b — the plan's open comparisons and the lodging entry, above the day list",
  "slip-occasion-name": "A1 — the B1 header eyebrow: the occasion's OWN name, never the group (R127)",
  // 1 · the two-column relayout and the merged view bar
  "slip-columns": "1 — the plan column (Main-rail: one centered column; the rail track is gone, ruling 7)",
  "slip-viewbar": "1 — the status counts and the List | Map toggle, merged into one row",
  // 3 · the rail's Expert card
  "slip-rail-expert": "3 — the Expert card itself",
  "slip-rail-expert-name": "3 — the advisor's name",
  "slip-rail-expert-standing": "3 — pending / advising, from the ONE shared sentence",
  "slip-rail-expert-storefront": "3 — /s/<handle>, and ONLY when a handle exists (§13, LD 40)",
  // 1 (continued) · ledger `2026-09-06-role-chips-filter`. The merged bar rendered only when the
  // plan already held rows, so a FRESH plan had no view bar and therefore no List | Map toggle at
  // all — the canvas draws that row with "Nothing added yet" beside the toggle. This is the
  // placeholder, not a new action: it carries no handler, and the zero-omitting rule on the count
  // SEGMENTS is untouched (§13 — four zeroes would be four claims about rows that do not exist).
  "slip-viewbar-empty": "1 — the empty plan's placeholder, so the view toggle still renders",
  // Smoke 4 B5 (ledger `2026-10-02-smoke4-draft-fixes`): the header's range and its day count are
  // their own nodes so a walkthrough can read "5 days" without matching the party or the events.
  // Text only — no handler.
  "slip-meta-dates": "B5 — the header's date range, its own node",
  "slip-meta-days": "B5 — the header's day count, from the plan's own start and end dates",
  // A5's two ask controls (`slip-draft-anchor-ask`, `slip-draft-without-anchor`) are GONE by a later
  // ruling (smoke 4 item 5, ledger `2026-10-02-smoke4-draft-fixes`: "Hotel is optional and
  // recommended after the draft, not asked before it") — "Draft it with AI" always drafts. They
  // were never on main's inventory, so they leave this list rather than joining the removals.
  // Ledger `2026-09-07-my-events-fold` (Locked Decision 45 (5)). A LATER ruling's card, declared
  // here for the reason this list exists: a control that appears without a named ruling behind it
  // is exactly what the pin refuses. It renders ONLY when this plan has a `coordination_states`
  // row, hosts NO charge (the fee-pay rail stays on `/my-events`), and its per-engagement rows
  // carry template testids the extractor does not see — which is why only the card is listed.
  "slip-rail-coordination": "L8 — the done-for-you engagement on ITS plan, folded off /my-events",
  // Ledger `2026-09-07-all-advisors-reader` (Locked Decision 42 **D7**). Another LATER ruling's
  // control, declared here for the reason this list exists. D7 rules that the advisor reader
  // returns ALL advisors on a plan, "not the first — a reader that silently returns one of many is
  // a plan quietly hiding a person who can write to it". The Expert card still PORTRAYS one
  // advisor (the server's own named pick, the most recently assigned); this line names the rest.
  // It carries NO handler — it is a sentence, not an action — and §13 keeps it silent for a plan
  // with zero or one advisor rather than stating "1 expert" or "no others".
  "slip-rail-expert-others": "D7 — the other advisors on this plan, named rather than hidden",
  // Ledger `2026-09-24-ea-plans-for-executive` (Locked Decision 52 (C)). A LATER ruling's control:
  // an empty plan has no day slot, so the delegate (an executive assistant building the plan for
  // its owner) is given the SAME add control, on day 1, inside its own note. It renders for the
  // delegate only and writes through the one shared add rail.
  "slip-delegate-note": "LD 52 (C) — tells the delegate the client approves, books and pays (no handler)",
  "slip-delegate-add-first": "LD 52 (C) — the delegate's first item on an empty plan",
  // Ledger `2026-09-25-rc12-party-size` (audit RC-12). A LATER ruling's control: where the header
  // used to print an invented "1 traveler", the OWNER of a plan with no stated party is asked. It
  // opens the one plan modal on step 4 of this plan; nobody else sees it.
  "slip-meta-ask-party": "RC-12 — 'Who's coming?' on a plan whose party nobody stated (owner only)",
  // Ledger `2026-09-27-service-fee-before-checkout` (R144). A LATER ruling's control: the Finish
  // card states the traveler service fee (or its Trip Pass waiver) beside "Go to checkout", from the
  // server's own `travelerFeePreview` on `GET /api/cart` — the same per-line basis the charge uses
  // (R148). It carries NO handler — it is a sentence, not an action — and renders only when there is
  // something ready for checkout and the server answered with a figure (§13: no answer, no number).
  "slip-traveler-fee-preview": "R144 — the service fee stated before checkout (no handler)",
  // Smoke 9 S9-4 (ledger `2026-10-04-smoke9-fixes`): the optimizer LEADS the page (§8) — the rail
  // renders its OptimizerLead into this slot directly under the tools tray at every width (a portal;
  // its state stays in the rail). It carries no handler of its own.
  "slip-optimizer-slot": "S9-4 — the slot under the tools tray where the optimizer card renders",
  // Step 6 R-ay (ledger `2026-10-04-step6-trip-card`): a plan with no run sees its free findings once
  // more where it is made final — a link to Optimize, never a block on Finalize.
  "slip-finalize-free-prompt": "R-ay — the free plan's findings line on the Finish card (links to Optimize)",
  "slip-finalize-unreachable-stops": "S12-4 (ledger `2026-10-06-smoke12-expert-fixes`) — the stops behind the reachability count, one line each with its day; a read-out under the findings line, no handler",
  // Step 6 finalize smoke: inside the 48-hour window with no final version, the banner says to make
  // the plan final instead of claiming a card is ready (no handler).
  "slip-trip-card-finalize-now": "Step 6 — 'make your plan final' in place of a false 'ready' (no handler)",
  // Slip conformance, Empty board (boards rev 15; ledger `2026-10-08-conformance-slip-phase0`). The
  // placeholder-dates subline and its chips; the chips are the EXISTING dates dialog and party ask.
  "slip-meta-dates-unset": "Empty board — 'Dates not set yet' in place of a window nobody chose (no handler)",
  "slip-meta-zone": "Empty board — the plan's zone in the subline, e.g. 'JST' (ruling 3; no handler)",
  "slip-meta-chips": "Empty board — the owner's 'Set your dates' / 'Who's coming?' chips row (no handler of its own)",
  "slip-empty-board": "Empty board — the owner's empty-plan start: anchor question, draft card, other ways in (no handler of its own)",
  // Slip conformance, Main board (rail; ledger `2026-10-08-slip-main-rail`, ruling 3): the rail
  // dissolves into the plan column, the ⋯ plan menu and the sticky bottom bar. Containers carry no
  // handler of their own; the one new control is "Send feedback", the SAME tap in a dialog.
  "slip-plan-menu": "Main-rail — the ⋯ plan menu: Share, PDF, calendar, Browse services, Send feedback (no handler of its own)",
  "slip-action-feedback": "Main-rail — 'Send feedback' (ruling 3: Feedback → ⋯ menu) opens the SAME post-draft FeedbackTap",
  "slip-bottom-bar": "Main-rail — the sticky bottom bar: Ask AI (secondary) · Finalize (primary) (no handler of its own)",
  "slip-bottom-bar-space": "Main-rail — the spacer that holds the fixed bar's height at the end of the column (no handler)",
  "slip-bar-finish": "Main-rail — the Finish controls in the bar layout (same testids, same mutations; no handler of its own)",
  "slip-plan-panel": "Main-rail — what the rail still says, inside the column: Expert, engagement, plan extras (no handler)",
  "slip-plan-extras": "Main-rail — organize-into-events and the budget, drawn bare (no handler of its own)",
  "slip-trip-pass-offer": "Main-rail — ruling 3: the Trip Pass offered under the optimizer card after the first run (no handler of its own)",
  "slip-days-expand-all": "Main board (rows) — Expand all / Collapse all: opens or closes every day through the same day-open state each day's own toggle writes",
} as const;

/**
 * A control whose HANDLER EXPRESSION a later ruling deliberately changed, with the reason and the
 * value it now carries. The pin's invariant is "a relayout may move a control; it may not re-wire
 * one" — which is about a control quietly acquiring a DIFFERENT destination, not about the same
 * destination being composed by a named function. So a re-point is DECLARED here, exactly as an
 * addition or a removal is, rather than the pin being loosened for every control at once.
 */
const ALLOWED_REPOINTS: Record<string, { to: string[]; reason: string }> = {
  "slip-action-finalize-plan": {
    to: ["onClick:refinalize"],
    reason:
      "R321 S11-1 (ledger `2026-10-05-smoke11-fixes`) — the SAME finalize mutation with the SAME " +
      "chooser rule, named once as `refinalize` so \"Finalize Plan\" and \"Make it final again\" " +
      "share it (§18 rule 1). Its label reads \"Make it final again\" once a final exists.",
  },
  "slip-browse-services": {
    to: ["href:slipBrowseServicesHref(tripId, trip.destination)"],
    reason:
      "lane L18, ledger `2026-09-07-client-pen-scope` — the SAME `/services?tripId=` destination, " +
      "now built by the one named door helper so it can also pass the PLAN's own destination as " +
      "`location`. Before this, `/services` filled that filter from the client pen, which " +
      "followed the browser tab rather than the account (brief §11.2 F4/F7).",
  },
};

const ALLOWED_REMOVALS = {
  "trip-pass-covered-label":
    "Main-rail (ruling 3; ledger `2026-10-08-slip-main-rail`) — \"Included in your Trip Pass\" is no longer " +
    "a label under the card: it is the Optimize button's own state, \"Optimize · included · N runs left\" " +
    "(`optimizeBoardCtaLabel`, from the fee's server-sent `tripPassRuns`). It carried no handler.",
  "slip-rail-trip-pass":
    "Main-rail (ruling 3; ledger `2026-10-08-slip-main-rail`) — the Build card's standing Trip Pass slot. " +
    "The SAME `TripPassCard` is offered under the optimizer card once the plan has had a run " +
    "(`slip-trip-pass-offer`), never as a standing card.",
  "slip-rail":
    "Main-rail (rulings 3 and 7; ledger `2026-10-08-slip-main-rail`) — the rail container itself. The " +
    "boards draw no rail at any width; each of its controls kept one home (the plan panel, the ⋯ plan " +
    "menu, the bottom bar, the optimizer card), pinned by this inventory and by section 1.",
  "slip-action-hire-expert":
    "Main-rail (ruling 3; ledger `2026-10-08-slip-main-rail`) — not removed from the page: the hire " +
    "door is the optimizer card's \"Local expert\" button (`components/plan/OptimizerLead.tsx`, outside " +
    "this inventory's file set), where the Main board draws it, carrying the SAME testid and the SAME " +
    "handler (`openHandoffChooser({})`, R323). The Build card that held it is gone.",
  "button-toggle-slip-contracts":
    "surface step 2 (ledger `2026-10-03-surface-step2-tools-tray`) — the contract board left the rail's " +
    "Plan card for the slip's tools tray: the SAME `VendorContractBoard`, opened by the manifest's " +
    "\"Vendors\" / \"Vendor contracts\" chip (`tool-chip-vendors`, `tool-chip-vendor_contracts`). The " +
    "rail stops mounting logistics components (decision-maker brief, step 2).",
  "slip-expert-note":
    "surface step 1 (ledger `2026-10-03-surface-step1-item-row`) — not removed from the page: the " +
    "note now renders through the ONE `ExpertNote` (`components/plan/ExpertNote.tsx`) under its " +
    "item, with the SAME `slip-expert-note` testid. It left the slip's FILE SET, which is all this " +
    "inventory reads. It carries no handler.",
  "slip-optimize-preview":
    "surface step 4 (ledger `2026-10-03-surface-step4-optimizer-lead`) — the \"Free estimate … /100\" " +
    "line is replaced by `OptimizerLead` (`components/plan/OptimizerLead.tsx`): counted findings from " +
    "the SAME `GET /api/optimization-preview`, never a score (spec §8, R-f). It carried no handler.",
  "slip-optimize-preview-fee":
    "surface step 4 (ledger `2026-10-03-surface-step4-optimizer-lead`) — the fee now rides the Optimize " +
    "CTA itself (\"Optimize · <fee>\", read from `/api/optimization-fee`). It carried no handler.",
  "slip-log-toggle":
    "smoke 9 S9-9 (ledger `2026-10-04-smoke9-addendum`) — the transition-log footer is removed from " +
    "the slip (\"v1 · Oct 3 · (removed item) (you)\"); its expand/collapse toggle went with it. The " +
    "diary stays on the server (`recentTransitions`), unprinted.",
  "slip-transition-log":
    "smoke 9 S9-9 (ledger `2026-10-04-smoke9-addendum`) — the transition-log footer itself; see " +
    "`slip-log-toggle`. It carried no handler of its own.",
  "slip-tracking-ref":
    "4 — the working header prints no slip number and no version. `planVersion` is the " +
    "transition-log ROW COUNT and reads as a released version it is not; the only version a " +
    "traveler can hold is the finalized card's `slip-final-version-chip`, which is untouched.",
} as const;

describe("0 — the relayout lost nothing and re-wired nothing", () => {
  const shipped = inventoryOfFiles([
    join(CLIENT_SRC, VIEW),
    join(CLIENT_SRC, RAIL),
    join(CLIENT_SRC, HEADER_META),
  ]) as Record<string, string[]>;
  const before = SLIP_ACTIONS_MAIN as Record<string, string[]>;

  it("every control on main is still present, or is a ruled removal with its reason", () => {
    for (const id of Object.keys(before)) {
      if (id in ALLOWED_REMOVALS) {
        assert.ok(
          !(id in shipped),
          `${id} is on the ruled-removal list — it must not come back. Reason: ${ALLOWED_REMOVALS[id as keyof typeof ALLOWED_REMOVALS]}`,
        );
        continue;
      }
      assert.ok(shipped[id], `${id} was on main and must still have a home after the relayout`);
    }
  });

  it("no control gained, lost or re-pointed a handler", () => {
    for (const [id, targets] of Object.entries(before)) {
      if (id in ALLOWED_REMOVALS) continue;
      const repoint = ALLOWED_REPOINTS[id];
      if (repoint) {
        assert.deepEqual(
          shipped[id],
          repoint.to,
          `${id} is a DECLARED re-point and must carry exactly its declared target. Reason: ${repoint.reason}`,
        );
        continue;
      }
      assert.deepEqual(
        shipped[id],
        targets,
        `${id}'s handler target changed. A relayout may move a control; it may not re-wire one.`,
      );
    }
  });

  it("every NEW control is one the six scope items named", () => {
    for (const id of Object.keys(shipped)) {
      if (id in before) continue;
      assert.ok(
        id in ALLOWED_ADDITIONS,
        `${id} is a new control this lane did not declare. Nothing but the six scope items changes.`,
      );
    }
    // And the declared additions are really there — a stale allow-list is its own drift.
    for (const id of Object.keys(ALLOWED_ADDITIONS)) {
      assert.ok(shipped[id], `${id} is declared as an addition but is not in the shipped source`);
    }
  });
});

// ── 1 · ONE COLUMN, NO RAIL (Main-rail; rulings 3 and 7, ledger `2026-10-08-slip-main-rail`) ──
//
// SANCTIONED REWRITE (decision-maker, Oct 8, 2026): this section pinned the Sep 6 relayout — a fixed
// 320px rail beside the plan, four cards Build · Plan · Share · Finish. Rulings 3 and 7 replace that
// layout: one centered column at most 680px wide, no rail at any width, the rail's pieces each given
// one home. The pins below hold the NEW homes; every testid the old ones held is still asserted.

describe("1 — one centered column; the rail's pieces each have one home", () => {
  it("the slip is one column at most 680px wide, and the map view keeps its own width", () => {
    assert.match(viewCode, /data-testid="slip-columns"/, "the plan column container is still addressable");
    assert.match(viewCode, /slipView === "map" \? "max-w-6xl" : "max-w-\[680px\]"/, "ruling 7: 680px, map unchanged");
    assert.doesNotMatch(viewCode, /lg:flex-row/, "no second column at lg");
    assert.doesNotMatch(viewCode, /lg:w-80/, "no 320px rail track");
  });

  it("the rail is gone; its pieces are the plan panel, the ⋯ plan menu and the bottom bar", () => {
    assert.doesNotMatch(railCode, /data-testid="slip-rail"/, "no rail container");
    assert.match(railCode, /data-testid="slip-plan-panel"/);
    assert.match(railCode, /data-testid="slip-plan-menu"/);
    assert.match(railCode, /data-testid="slip-bottom-bar"/);
    assert.match(viewCode, /<SlipPlanMenu\b/, "the header mounts the menu");
    assert.match(viewCode, /<SlipBottomBar\b/, "the column ends in the bar");
    // The bar's two actions: Ask AI secondary, Finalize primary — the existing components, bar layout.
    const bar = functionBody(railCode, "export function SlipBottomBar(");
    assert.match(bar, /<AskAiDrawer[^>]*layout="bar"/);
    assert.match(bar, /<FinishCard[^>]*layout="bar"/);
    // Share, PDF, calendar, Browse and feedback are menu entries with their old testids.
    const menu = functionBody(railCode, "export function SlipPlanMenu(");
    for (const id of ["slip-action-share", "slip-action-pdf", "slip-action-calendar", "slip-browse-services", "slip-action-feedback"]) {
      assert.match(menu, new RegExp(`data-testid="${id}"`), `${id} lives in the menu`);
    }
    // Ruling 3: the Coordination card is RULED removed, but Locked Decision 45 (5) puts a done-for-you
    // engagement on its plan's slip — it is KEPT, rendered only with an engagement, pending that ruling.
    assert.match(railCode, /<CoordinationCard\b/);
  });

  it("the Trip Pass is offered under the optimizer card after the first run, never as a standing card", () => {
    assert.equal((railCode.match(/<TripPassCard/g) ?? []).length, 1, "one mount, one purchase rail");
    assert.match(railCode, /data-testid="slip-trip-pass-offer"/);
    assert.match(railCode, /hasRun \? \(/, "gated on the plan having had a run");
    assert.match(railCode, /lastOptimizedAt/, "read from the plan's own lastOptimizedAt");
    const pass = stripComments(readClient("components/plancard/TripPassCard.tsx"));
    const offerId = pass.indexOf('data-testid="trip-pass-card-offer"');
    assert.ok(offerId > 0, "the offer section is still addressable");
    assert.match(pass, /data-testid="trip-pass-price"/, "the price testid is kept");
    assert.match(pass, /data-testid="button-buy-trip-pass"/, "and the buy control's");
    // §14 — the price is still the server's own row, never a literal on this surface.
    assert.match(pass, /status\.priceCents/);
    // Ruling 3: "5 runs", from the server, never "unlimited".
    assert.match(pass, /status\.runsPerTrip/);
    assert.doesNotMatch(pass, /unlimited/);
  });

  it("the viewbar is ONE row: the status counts and the List | Map toggle together", () => {
    assert.match(viewCode, /data-testid="slip-viewbar"/, "the merged row exists");
    // Both halves keep the testids CI reads.
    assert.match(viewCode, /data-testid="slip-status-strip"/);
    assert.match(viewCode, /data-testid="slip-view-toggle"/);
    assert.match(viewCode, /data-testid="button-slip-view-list"/);
    assert.match(viewCode, /data-testid="button-slip-view-map"/);
    assert.match(viewCode, /data-testid="text-slip-map-located"/);
    // They are in ONE container: the strip mount and the toggle both sit inside the viewbar block,
    // which is what "one row" means structurally.
    const bar = viewCode.slice(viewCode.indexOf('data-testid="slip-viewbar"'));
    const barEnd = bar.indexOf('data-testid="slip-map-view"');
    const barBlock = barEnd > 0 ? bar.slice(0, barEnd) : bar;
    assert.match(barBlock, /<SlipStatusStrip activities=/, "the strip is inside the viewbar");
    assert.match(barBlock, /data-testid="slip-view-toggle"/, "and so is the toggle");
    // Step 8b-2 (item 10, ruling 2 — sanctioned edit): Map is always offered; its honesty about
    // located stops is the empty "Your plan" line, which carries the old reason text.
    assert.match(viewCode, /planEmptyReason/);
  });

  /**
   * AN EMPTY PLAN STILL GETS THE ROW (ledger `2026-09-06-role-chips-filter`).
   *
   * The bar was gated on `allActivities.length > 0`, which took the List | Map toggle down with
   * the counts: a fresh plan had no view control at all and the canvas's one row was simply
   * absent. It renders unconditionally now, with "Nothing added yet" where the counts go.
   *
   * §13 IS UNCHANGED IN THE HALF THAT MATTERS: the count SEGMENTS stay zero-omitting.
   * `SlipStatusStrip` still returns null when every count is zero, so the placeholder and the
   * segments can never both draw, and the bar never renders "0 planning · 0 purchased" — four
   * claims about rows that do not exist.
   */
  it("the viewbar renders on an EMPTY plan, with a sentence rather than zeroes", () => {
    const barStart = viewCode.indexOf('data-testid="slip-viewbar"');
    assert.ok(barStart > 0, "the viewbar is still addressable");
    // The bar's own element is not behind an items gate. The old shape was
    // `{allActivities.length > 0 && (<div data-testid="slip-viewbar"`.
    const beforeBar = viewCode.slice(Math.max(0, barStart - 300), barStart);
    assert.doesNotMatch(
      beforeBar,
      /allActivities\.length > 0 && \(\s*<div/,
      "the whole bar must not be gated on the plan already holding rows",
    );
    assert.match(viewCode, /data-testid="slip-viewbar-empty"/, "the placeholder exists");
    assert.match(viewCode, /Nothing added yet/, "in the canvas's own words");
    // The segments' zero-omitting rule is where it always was — in the strip itself.
    const strip = functionBody(viewCode, "function SlipStatusStrip");
    assert.match(strip, /segments\.length === 0\) return null/, "a zero count is still no segment");
  });
});

// ── 2 · D6 ON THE EVENT HEADER ────────────────────────────────────────────────────────────────

describe("2 — D6: the event header asks the PROVIDER question, and reads the row to do it", () => {
  it("chips come from the event's own rolesNeeded, in the server's order", () => {
    const chips = slipEventRoleChips(["florist", "photographer"], "t1");
    assert.deepEqual(
      chips.map((c) => c.key),
      ["florist", "photographer"],
      "the server's order, never re-sorted into a priority this surface invented",
    );
    assert.equal(chips[0].href, `${SERVICES_BROWSE_PATH}?categoryKey=florist&tripId=t1`);
  });

  it("§13 — NULL / absent / empty / blank all render NOTHING, and none is a claim", () => {
    // Locked Decision 31: NULL is NOT SET and is never "this occasion needs nobody"; `[]` was
    // deliberately not made a second empty state, so both are the same silence.
    assert.deepEqual(slipEventRoleChips(null, "t1"), []);
    assert.deepEqual(slipEventRoleChips(undefined, "t1"), []);
    assert.deepEqual(slipEventRoleChips([], "t1"), []);
    assert.deepEqual(slipEventRoleChips(["", "   "], "t1"), []);
    // A duplicate key would draw the same chip twice at the same href — one fact, one chip.
    assert.deepEqual(slipEventRoleChips(["florist", "florist"], "t1").length, 1);
  });

  it("the browse param is the one the marketplace actually reads, not an invented one", () => {
    // `discover.tsx` reads `?categoryKey=` and resolves it against `/api/service-categories`. A
    // link with any other spelling renders a perfectly normal UNFILTERED browse — the failure
    // nobody notices — so the param is a constant and the page's own reader is pinned beside it.
    assert.equal(SERVICES_BROWSE_CATEGORY_PARAM, "categoryKey");
    const discover = readClient("pages/discover.tsx");
    assert.match(
      discover,
      /urlParams\.get\(SERVICES_BROWSE_CATEGORY_PARAM\)/,
      "the browse still reads the param these chips send — through the shared constant",
    );
    // The trip rides too, so Add to plan lands on THIS plan (LD 39's one rail).
    assert.match(discover, /urlParams\.get\("tripId"\)/);
    assert.match(serviceBrowseHrefForRole("florist", "t1"), /tripId=t1/);
    // With no trip in hand nothing is invented — the param is simply absent.
    assert.doesNotMatch(serviceBrowseHrefForRole("florist", null), /tripId/);
  });

  /**
   * ONE SPELLING, ON BOTH ENDS (ledger `2026-09-06-role-chips-filter`, §18 rule 1).
   *
   * The lane before this one named the param a constant on the LINK side only, so the page that
   * READS it spelled `"categoryKey"` out again as a bare literal: two independent strings that
   * happened to agree. QA found the browse rendering unfiltered for a real chip href, and the
   * class of failure is silent by construction — a param the page ignores looks exactly like a
   * category with no supply.
   *
   * The pin is over a DERIVED file set (the two ends of the contract plus the slip's own files),
   * not a count of occurrences: a later lane may add a third surface that links into the browse,
   * and it will be caught the moment it types the literal instead of importing the constant.
   */
  it("§18 rule 1 — the param literal exists in ONE module; both ends import it", () => {
    const DECLARING = "lib/services-browse.ts";
    // Every file in the contract, derived from the roles it plays: the declaring module, the
    // browse that reads the URL, the module that builds the href, and the slip files that draw
    // the chips. No literal count anywhere.
    const CONTRACT_FILES = [DECLARING, "pages/discover.tsx", "lib/slip-event-roles.ts", ...SLIP_FILES];
    // A QUOTED occurrence of the param name — the spelling that makes it a URL param. The bare
    // identifier `categoryKey` is a legitimate OBJECT FIELD on the `/api/service-categories` rows
    // and this pin is deliberately blind to it (stated negative space, §18d).
    const quoted = /["'`]categoryKey["'`]/g;
    for (const rel of CONTRACT_FILES) {
      const body = stripComments(readClient(rel));
      const hits = body.match(quoted) ?? [];
      if (rel === DECLARING) {
        assert.ok(hits.length > 0, `${DECLARING} is the one place the param is spelled`);
      } else {
        assert.equal(
          hits.length,
          0,
          `${rel} spells the browse param itself — import SERVICES_BROWSE_CATEGORY_PARAM from ` +
            `${DECLARING} instead, or the two ends of one contract drift apart silently.`,
        );
      }
    }
    // And both ends really do import it, rather than agreeing by accident.
    assert.match(
      stripComments(readClient("pages/discover.tsx")),
      /import \{[^}]*SERVICES_BROWSE_CATEGORY_PARAM[^}]*\} from "@\/lib\/services-browse"/,
      "the browse imports the constant",
    );
    assert.match(
      stripComments(readClient("lib/slip-event-roles.ts")),
      /from "@\/lib\/services-browse"/,
      "the chip builder reads the same module",
    );
    // The href the chips send and the href the shared builder makes are the same string.
    assert.equal(serviceBrowseHrefForRole("florist", "t1"), servicesBrowseHref("florist", "t1"));
  });

  /**
   * §13 — WHAT THE BROWSE DOES WITH A KEY IT CANNOT RESOLVE, AND WITH ONE IT CAN.
   *
   * Two silent failures, both found by QA on the shipped build: a key the loaded categories do not
   * carry filtered NOTHING and said nothing, and a key OUTSIDE the curated six-chip shortlist
   * filtered the results while the rail still highlighted "All" — the page stating the opposite of
   * what it was showing. Both are source pins because neither is visible to a pure unit: this
   * suite cannot mount the page (its own stated negative space), and the browser proof is the
   * e2e case in `playwright/tests/discover-tabs.spec.ts`.
   */
  it("§13 — an unresolvable key is said out loud, and the applied filter always has a chip", () => {
    const discover = stripComments(readClient("pages/discover.tsx"));
    // The unmatched state is NOT the loading state: it requires categories to have actually
    // arrived. An unanswered fetch is not "no such category".
    assert.match(discover, /const deepLinkUnmatched =[\s\S]{0,160}categories\?\.length/);
    assert.match(discover, /data-testid="text-quick-cat-unmatched"/, "and it renders a line");
    // The chip rail draws the curated shortlist PLUS the applied filter when it is not in it.
    assert.match(discover, /const quickCategories = useMemo/);
    assert.match(discover, /QUICK_CATEGORY_SLUGS/, "the shortlist is named once and read twice");
    assert.match(discover, /aria-pressed=\{selectedCategory === cat\.id\}/, "active is stated");
  });

  it("the surface READS the row and restates no role list of its own", () => {
    assert.match(slipCode, /slipEventRoleChips\(event\.rolesNeeded/, "chips read the event row");
    // The labelling is the ONE shared `roleLabel`, the same one the expert picker's chips use.
    assert.match(slipCode, /roleLabel\(/);
    // THE FAILURE THIS PIN EXISTS FOR: a hardcoded discipline list on the client. Every one of
    // these is a real `service_categories.category_key` that a restated array would name.
    for (const key of ["florist", "photographer", "caterer", "officiant"]) {
      assert.doesNotMatch(
        slipCode,
        new RegExp(`["'\`]${key}["'\`]`),
        `the slip must not name ${key} itself — roles come from the row (LD 31)`,
      );
    }
  });

  it("the hire CONTROL left the event header; the advisor STANDING stayed", () => {
    // D6: the plan-level expert picker has ONE home, the rail's Build card.
    assert.doesNotMatch(slipCode, /slip-event-hire-/, "no per-event hire button remains");
    // R323 (step 7b): the plan-level door is the ONE handoff chooser, hosted once by the view and
    // opened from the rail; the pick-an-expert dialog is retired.
    assert.doesNotMatch(viewCode, /<HireExpertDialog/, "the retired picker is not mounted by the view");
    assert.doesNotMatch(railCode, /<HireExpertDialog/, "nor by the rail");
    assert.match(railCode, /openHandoffChooser\(/, "the rail opens the one door");
    assert.equal((viewCode.match(/<HandoffChooserHost/g) ?? []).length, 1, "the view hosts it once");
    // And the standing text is unchanged, in the same words, from the ONE derivation.
    assert.match(slipCode, /data-testid=\{`slip-event-advisor-\$\{event\.id\}`\}/);
    assert.match(slipCode, /slipAdvisorStandingLine\(/);
  });

  it("the standing sentence is spelled ONCE and both surfaces read it (§18 rule 1)", () => {
    assert.equal(slipAdvisorStandingLine({ status: "pending", first_name: "Aya" }), "Request sent — awaiting Aya");
    assert.equal(
      slipAdvisorStandingLine({ status: "accepted", first_name: "Aya", last_name: "Tanaka" }),
      "Aya Tanaka is advising this plan",
    );
    // §13 — a nameless row keeps the stated generic fallback, never a blank or an invented name.
    assert.equal(slipAdvisorStandingLine({ status: "pending" }), "Request sent — awaiting your expert");
    assert.equal(slipAdvisorStandingLine({ status: "accepted" }), "An expert is advising this plan");
    // No advisor is not a standing: the caller renders nothing rather than a sentence about none.
    assert.equal(slipAdvisorStandingLine(null), null);
    assert.equal(slipAdvisorStandingLine(undefined), null);
    // NO ETA, ever — nothing on the platform knows when an expert will answer.
    for (const line of [
      slipAdvisorStandingLine({ status: "pending", first_name: "Aya" }),
      slipAdvisorStandingLine({ status: "accepted", first_name: "Aya" }),
    ]) {
      assert.doesNotMatch(String(line), /hour|day|soon|within|reply by/i);
    }
    // Both surfaces call the module; neither writes the sentence inline.
    assert.doesNotMatch(slipCode, /is advising this plan["`]/);
    assert.doesNotMatch(slipCode, /Request sent — awaiting \$\{/);
  });
});

// ── 3 · THE EXPERT CARD IN THE RAIL ───────────────────────────────────────────────────────────

describe("3 — the rail names the person on the plan, from the SAME read the Build card uses", () => {
  it("ONE advisor read for the whole rail — not one per card", () => {
    const advisorReads = railCode.match(/expert-advisor/g) ?? [];
    assert.equal(advisorReads.length, 1, "exactly one query key for the advisor row");
    // Main-rail: the ONE read is a hook (`useSlipAdvisor`), shared by the plan panel and nothing else.
    assert.match(railCode, /export function useSlipAdvisor\(/, "resolved once, in one hook");
    assert.match(railCode, /expertState=\{expertState\}/, "and handed to the cards that need it");
  });

  it("the card draws name, standing and — only with a handle — the storefront", () => {
    assert.match(railCode, /data-testid="slip-rail-expert"/);
    assert.match(railCode, /data-testid="slip-rail-expert-name"/);
    assert.match(railCode, /data-testid="slip-rail-expert-standing"/);
    // A `RailRow` carries its testid as a prop, so the pin accepts either spelling — this is about
    // the control existing, not about which chrome renders it.
    assert.match(railCode, /(data-)?[tT]est[iI]d="slip-rail-expert-storefront"/);
    // The photo is the row's own or the person's initials — never a stock portrait (§13).
    assert.match(railCode, /profile_image_url/);
    assert.match(railCode, /<AvatarFallback>/);
  });

  it("§13 / LD 40 — NO handle ⇒ NO link, and never an id address", () => {
    // The ONE builder of a public earner path. With no `id` on this payload its documented id
    // fallback cannot fire, so a handle-less advisor resolves to null — which is the absence the
    // card renders as nothing at all.
    assert.equal(earnerProfilePath({ handle: null }), null);
    assert.equal(earnerProfilePath({ handle: "   " }), null);
    assert.equal(earnerProfilePath({ handle: "Aya" }), "/s/aya");
    // The rail state carries the same answer for the same row.
    const noHandle = slipExpertRailState({ first_name: "Aya", status: "accepted", handle: null });
    assert.equal(noHandle.kind === "message" && noHandle.handle, null);
    // The shipped card guards the row on that null rather than rendering a dead control.
    const card = functionBody(railCode, "function ExpertCard(");
    assert.match(card, /earnerProfilePath\(\{ handle: expertState\.handle \}\)/);
    assert.match(card, /\{storefront && \(/, "the row renders only when a path exists");
    // It never builds a storefront path itself, and never addresses an expert by user id.
    assert.doesNotMatch(card, /`\/s\/\$\{/);
    assert.doesNotMatch(card, /userId|user_id|expertUserId/);
  });

  it("no advisor ⇒ no card; and the Message control lives once, in the Expert card", () => {
    const card = functionBody(railCode, "function ExpertCard(");
    assert.match(card, /if \(expertState\.kind !== "message"\) return null;/);
    assert.equal(slipExpertRailState(null).kind, "hire", "no advisor is the hire state, not a card");
    // Main-rail: the Build card is gone, so the ONE message control is handed INTO the card that
    // portrays the person it messages (the Handoff board's placement).
    assert.match(card, /\{messageControl\}/, "the card renders the one message control it is given");
    assert.equal((railCode.match(/testId="slip-action-message-expert"/g) ?? []).length, 1, "exactly one message control");
  });
});

// ── 4 · THE WORKING HEADER CARRIES NO VERSION ─────────────────────────────────────────────────

describe("4 — a version exists only once a plan is final, and only that surface prints one", () => {
  it("the working header prints neither the slip number nor a version", () => {
    const header = functionBody(viewCode, "function SlipHeader(");
    assert.doesNotMatch(header, /slip-tracking-ref/, "the tracking/version line is gone");
    assert.doesNotMatch(header, /trackingNumber/, "the header reads no tracking number");
    assert.doesNotMatch(header, /planVersion/, "and no plan version");
    assert.doesNotMatch(header, /v\$\{/, "nothing in the header renders a `v<n>`");
    // What the header still says is untouched.
    assert.match(header, /data-testid="slip-header"/);
    assert.match(header, /data-testid="slip-title"/);
    assert.match(header, /data-testid="slip-phase-chip"/);
  });

  it("THE INVARIANT: the only version shown is the FINALIZED card's, from the server's own field", () => {
    // `planVersion` is the transition-log ROW COUNT; `finalVersion` is the server-emitted version
    // of a real snapshot. Both render as `v<n>`, which is exactly why which surface prints which
    // has to be pinned rather than eyeballed.
    const banner = functionBody(viewCode, "function TripCardPrimaryBanner(");
    assert.match(banner, /trip\.finalVersion != null/, "rendered only when a real one exists");
    assert.match(banner, /data-testid="slip-final-version-chip"/);
    assert.match(banner, /v\{trip\.finalVersion\}/);
    // Smoke 9 S9-9: the transition-log footer — the only other `v<n>` on this surface — is gone,
    // so the final chip is the slip's ONE version.
    assert.ok(!/function TransitionLogFooter\(|data-testid="slip-transition-log"|\(removed item\)/.test(viewCode));
  });
});

// ── 5 · THE ITEM ROW'S ASK LINE ───────────────────────────────────────────────────────────────

describe("5 — 'Ask your expert about this', and no count on the slip's mount", () => {
  it("the label is the slip's, held once, and passed to the SHARED component", () => {
    assert.equal(SLIP_ASK_EXPERT_LABEL, "Ask your expert about this");
    assert.match(slipCode, /<ItemComments/, "the existing per-item thread, one more mount");
    assert.match(slipCode, /label=\{SLIP_ASK_EXPERT_LABEL\}/, "with the slip's own words");
    assert.match(slipCode, /hideCount/, "and no count on this mount");
    // The words are not re-typed at the call site — a second copy is the drift §18 rule 1 names.
    assert.doesNotMatch(slipCode, /"Ask your expert about this"/);
  });

  it("it is a PROP on the one component, never a forked thread", () => {
    const comments = stripComments(readClient(COMMENTS));
    assert.match(comments, /label\?: string;/);
    assert.match(comments, /hideCount\?: boolean;/);
    // §13 — hiding a real count never substitutes a fake one: the count still comes from this
    // component's own per-item read, and still renders inside the opened thread.
    assert.match(comments, /comments\.length/, "the real count is still computed from the read");
    assert.match(comments, /No comments yet\./, "and an empty thread still says so");
    // The default is untouched, so the Trip Card and Workstation mounts render as before.
    assert.match(comments, /: "Comment"/);
    for (const rel of ["components/plancard/ActivitiesSection.tsx", "pages/expert/workspace.tsx"]) {
      const src = stripComments(readClient(rel));
      if (!src.includes("<ItemComments")) continue;
      assert.doesNotMatch(
        src.slice(src.indexOf("<ItemComments")),
        /^[\s\S]{0,300}?hideCount/,
        `${rel} keeps the component's own default`,
      );
    }
  });
});

// ── 6 · THE PLAN CARD'S STOPS & TIMEZONE ROW ──────────────────────────────────────────────────

describe("6 — Stops & timezone opens the ONE modal and restates neither line", () => {
  it("the meta COMPOSES the header's two lines and derives nothing new", () => {
    assert.equal(
      slipPlanMetaLine(slipStopsLine("Kyoto", [{ name: "Kyoto" }, { name: "Osaka" }]), slipZoneLine("Asia/Tokyo")),
      "Kyoto → Osaka · Times shown in Asia/Tokyo",
    );
    // §13 — an unset zone carries through as an absence, never as UTC and never as "no timezone".
    assert.equal(slipPlanMetaLine(slipStopsLine("Kyoto", []), slipZoneLine(null)), "Kyoto");
    assert.doesNotMatch(String(slipPlanMetaLine(slipStopsLine("Kyoto", []), slipZoneLine(null))), /UTC/);
    // Nothing at all to say ⇒ null, and the caller then renders the row with no meta.
    assert.equal(slipPlanMetaLine(null, null), null);
  });

  it("ruling 3: Stops & timezone is the HEADER's stops line, a door of the one planning modal (LD 33/34)", () => {
    // Main-rail (sanctioned rewrite): the rail's row is gone; the header's stops line and its
    // owner-only Edit are the one door, and the zone is the header subline and the Travel party sheet.
    assert.doesNotMatch(railCode, /(data-)?[tT]est[iI]d="slip-plan-stops"/, "no second door in the plan panel");
    assert.match(viewCode, /onEditStops=\{\(\) => openPlanModal\(\)\}/, "the header opens the ONE planning modal");
    assert.match(viewCode, /zoneLine=\{zoneLine\}/, "the zone line reaches the tray's Travel party sheet");
    // Neither file writes stops itself — one client writer, one editing surface (LD 34).
    assert.doesNotMatch(railCode, /savePlanStops/);
    assert.doesNotMatch(railCode, /\/destinations/);
    assert.doesNotMatch(railCode, /slipStopsLine\(/);
    assert.doesNotMatch(railCode, /slipZoneLine\(/);
    assert.equal((viewCode.match(/slipStopsLine\(/g) ?? []).length, 1);
    assert.equal((viewCode.match(/slipZoneLine\(/g) ?? []).length, 1);
  });

  /**
   * NEITHER HALF OF A RAIL ROW IS CUT — THE ROW WRAPS (ledger `2026-09-06-role-chips-filter`,
   * completed by `2026-09-06-publish-preflight`).
   *
   * Both halves of a `RailRow` were `truncate` inside a 320px rail, so at a ~1110px viewport the
   * row rendered as "Stops & ti…" — a control whose own name the traveler cannot read. Making the
   * label wrap and the meta shrink fixed the LABEL and left the META cut instead: the Plan card's
   * "Stops & timezone" meta measured scrollWidth 207 against clientWidth 161 even at 1920px, so
   * "Kyoto, Japan · Times shown in Asia/Tokyo" still rendered with an ellipsis. A 320px rail has
   * no line wide enough for both halves, so the ROW wraps: `flex-wrap` on the button, and a meta
   * that does not fit beside its label drops to its own full-width second line.
   *
   * Source pin, because Tailwind geometry is the browser's answer and this suite has no DOM (its
   * own stated negative space).
   */
  it("neither half is truncated — the label wraps and the row wraps", () => {
    const row = functionBody(railCode, "function RailRow");
    assert.doesNotMatch(row, /<span className="truncate">\{label\}/, "the label is not truncated");
    assert.match(row, /whitespace-normal break-words">\{label\}/, "it wraps instead");
    // The Button base is `whitespace-nowrap`; the row must override it or wrapping cannot happen.
    assert.match(row, /const className =[\s\S]{0,200}whitespace-normal/);
    // The row itself wraps, so an over-wide meta gets its own line rather than an ellipsis.
    assert.match(row, /const className =[\s\S]{0,200}flex-wrap/, "the row wraps");
    // And the meta is never ellipsised: no `truncate` anywhere in the row.
    assert.doesNotMatch(row, /truncate/, "the meta is not truncated either");
    assert.match(
      row,
      /ml-auto[\s\S]{0,160}whitespace-normal break-words text-right/,
      "the meta wraps, right-aligned, still pushed right when it fits beside the label",
    );
  });

  it("the stale 'later lane' note is gone, and the anchors row is named for what it opens", () => {
    // The Plan card's own comment used to say S6/S7 were a later lane and that a placeholder row
    // would be a promise (§13). The lane landed, so the note must not survive as a false statement.
    const rail = readClient(RAIL);
    assert.doesNotMatch(rail, /S6\/S7 are a later lane/);
    assert.doesNotMatch(rail, /deliberately ABSENT/);
    // The anchors collapsible mounts `TemporalAnchorManager` with NO `allowedTypes`, so it offers
    // every anchor type — including the `custom` one the planning modal writes the MAIN MOMENT as.
    // The old label named two of a dozen and hid the one an occasion is built around.
    // SURFACE STEP 2 (ledger `2026-10-03-surface-step2-tools-tray`): the "Main moment & schedule
    // check" collapsible is gone — its door is now a tools-tray chip ("The reservation", "The venue",
    // "Run of show", "The show"). What this pin protects is unchanged: the anchors tool mounts
    // `TemporalAnchorManager` UNRESTRICTED, so it still offers the `custom` main-moment type.
    const logistics = readClient(LOGISTICS);
    assert.match(logistics, /<TemporalAnchorManager/);
    assert.doesNotMatch(
      logistics.slice(logistics.indexOf("<TemporalAnchorManager")),
      /^[\s\S]{0,400}?allowedTypes/,
      "the mount is unrestricted — which is why the row is not just flights and hotels",
    );
    assert.doesNotMatch(stripComments(logistics), /Flight, hotel &amp; timing/);
  });
});
