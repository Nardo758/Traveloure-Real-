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
  // 1 · the two-column relayout and the merged view bar
  "slip-columns": "1 — the plan column + the fixed rail track",
  "slip-viewbar": "1 — the status counts and the List | Map toggle, merged into one row",
  // 3 · the rail's Expert card
  "slip-rail-expert": "3 — the Expert card itself",
  "slip-rail-expert-name": "3 — the advisor's name",
  "slip-rail-expert-standing": "3 — pending / advising, from the ONE shared sentence",
  "slip-rail-expert-storefront": "3 — /s/<handle>, and ONLY when a handle exists (§13, LD 40)",
  "slip-rail-expert-message-note": "3 — says out loud that Message lives once, in Build",
  // 6 · the Plan card's stops row
  "slip-plan-stops": "6 — Stops & timezone, a DOOR of the ONE planning modal (LD 33/34)",
  // 1 (continued) · ledger `2026-09-06-role-chips-filter`. The merged bar rendered only when the
  // plan already held rows, so a FRESH plan had no view bar and therefore no List | Map toggle at
  // all — the canvas draws that row with "Nothing added yet" beside the toggle. This is the
  // placeholder, not a new action: it carries no handler, and the zero-omitting rule on the count
  // SEGMENTS is untouched (§13 — four zeroes would be four claims about rows that do not exist).
  "slip-viewbar-empty": "1 — the empty plan's placeholder, so the view toggle still renders",
} as const;

const ALLOWED_REMOVALS = {
  "slip-tracking-ref":
    "4 — the working header prints no slip number and no version. `planVersion` is the " +
    "transition-log ROW COUNT and reads as a released version it is not; the only version a " +
    "traveler can hold is the finalized card's `slip-final-version-chip`, which is untouched.",
} as const;

describe("0 — the relayout lost nothing and re-wired nothing", () => {
  const shipped = inventoryOfFiles([
    join(CLIENT_SRC, VIEW),
    join(CLIENT_SRC, RAIL),
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

// ── 1 · RAIL PLACEMENT AND ORDER ──────────────────────────────────────────────────────────────

describe("1 — the rail is a fixed right column, and its cards run Build → Plan → Share → Finish", () => {
  it("mounts beside the day list at lg, stacking above it below lg", () => {
    // The canvas `page()` is a flex row; `rail()` is `width: 320px; flex-shrink: 0`. In Tailwind
    // that is `lg:w-80` + `lg:shrink-0` on the rail's own track, inside a `lg:flex-row` container.
    assert.match(viewCode, /data-testid="slip-columns"/, "the two-column container exists");
    assert.match(viewCode, /lg:flex-row/, "it becomes a row at lg");
    assert.match(viewCode, /lg:w-80/, "the rail track is the canvas's fixed 320px");
    assert.match(viewCode, /lg:shrink-0/, "and it never shrinks — the Trip Pass wrap this fixes");
    // Below lg the rail is FIRST on screen (the artboard's order) while the DOM order is unchanged,
    // so the reading order of the two regions does not flip with the breakpoint.
    assert.match(viewCode, /order-1 lg:order-2/, "the rail draws above the list below lg");
    assert.match(viewCode, /order-2 lg:order-1/, "and the plan column below it");
  });

  it("the rail is ONE column at lg — the canvas's single 320px track", () => {
    assert.match(railCode, /lg:grid-cols-1/, "one card per row inside the rail track");
    assert.match(railCode, /data-testid="slip-rail"/, "the rail itself stays addressable");
  });

  it("the four cards render in the ruling's order, and the module still names that order", () => {
    // The module is the ONE statement of the order (§18 rule 1); this asserts the SHIPPED mounts
    // agree with it rather than restating a list of four names here.
    assert.deepEqual([...SLIP_RAIL_CARDS], ["build", "plan", "share", "finish"]);
    const mountOrder = [...railCode.matchAll(/<(Build|Plan|Share|Finish)Card\b/g)].map((m) =>
      m[1].toLowerCase(),
    );
    assert.deepEqual(
      mountOrder,
      [...SLIP_RAIL_CARDS],
      "the mounts must run in the order the module declares — it was Build · Finish · Plan · Share",
    );
  });

  it("the Trip Pass card keeps its ONE home in Build, and stacks rather than wrapping", () => {
    assert.match(railCode, /data-testid="slip-rail-trip-pass"/, "the testid CI pins is kept");
    assert.equal((railCode.match(/<TripPassCard/g) ?? []).length, 1, "one mount, one purchase rail");
    const pass = stripComments(readClient("components/plancard/TripPassCard.tsx"));
    // The offer section is a COLUMN now: the three-across flex-wrap row is what wrapped the price
    // line a word at a time inside a 320px rail.
    // Sliced to the OFFER section specifically — the active-state section is declared first in the
    // file, and a pin that grabbed it would be about a card that draws no price at all.
    const offerId = pass.indexOf('data-testid="trip-pass-card-offer"');
    assert.ok(offerId > 0, "the offer section is still addressable");
    const offer = pass.slice(pass.lastIndexOf("<section", offerId), pass.indexOf("</section>", offerId));
    assert.match(offer, /flex flex-col/, "the offer stacks rather than wrapping three-across");
    assert.match(pass, /data-testid="trip-pass-price"/, "the price testid is kept");
    assert.match(pass, /data-testid="button-buy-trip-pass"/, "and the buy control's");
    // §14 — the price is still the server's own row, never a literal on this surface.
    assert.match(pass, /status\.priceCents/);
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
    // The map's honest gate is untouched: Map is offered only when a stop is genuinely located.
    assert.match(viewCode, /mapDisabledReason/);
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
    assert.doesNotMatch(viewCode, /<HireExpertDialog/, "the picker is not mounted by the view");
    assert.match(railCode, /<HireExpertDialog/, "it is mounted by the rail, once");
    assert.equal((railCode.match(/<HireExpertDialog/g) ?? []).length, 1);
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
    assert.match(railCode, /const \{ data: advisorData \}/, "resolved at the rail's own level");
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

  it("no advisor ⇒ no card; and the Message control still lives once, in Build", () => {
    const card = functionBody(railCode, "function ExpertCard(");
    assert.match(card, /if \(expertState\.kind !== "message"\) return null;/);
    assert.equal(slipExpertRailState(null).kind, "hire", "no advisor is the hire state, not a card");
    assert.doesNotMatch(card, /slip-action-message-expert/, "the card offers no second message rail");
    assert.match(railCode, /testId="slip-action-message-expert"/, "which still exists, in Build");
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
    // The transition log is the one other `v<n>` on this surface, and it labels a row in a
    // HISTORY — which is what the count is — rather than the plan as a whole.
    const log = functionBody(viewCode, "function TransitionLogFooter(");
    assert.match(log, /planVersion - i/, "the log still numbers its own entries");
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

  it("the row is a DOOR of the one planning modal, never a second stop writer (LD 33/34)", () => {
    assert.match(railCode, /(data-)?[tT]est[iI]d="slip-plan-stops"/);
    assert.match(railCode, /Stops & timezone/);
    assert.match(railCode, /usePlanning\(\)/, "the ONE opener");
    assert.match(railCode, /onClick=\{\(\) => openPlanModal\(\)\}/);
    // Locked Decision 34's one client writer, one editing surface.
    assert.doesNotMatch(railCode, /savePlanStops/);
    assert.doesNotMatch(railCode, /\/destinations/);
    // The lines arrive as props; the rail calls only the composer (§18 rule 1).
    assert.match(railCode, /slipPlanMetaLine\(stopsLine, zoneLine\)/);
    assert.doesNotMatch(railCode, /slipStopsLine\(/);
    assert.doesNotMatch(railCode, /slipZoneLine\(/);
    // And SlipView resolves them ONCE, for the header and the rail both.
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
    const logistics = readClient(LOGISTICS);
    assert.match(logistics, /Main moment &amp; schedule check/);
    assert.doesNotMatch(stripComments(logistics), /Flight, hotel &amp; timing/);
    assert.match(logistics, /<TemporalAnchorManager/);
    assert.doesNotMatch(
      logistics.slice(logistics.indexOf("<TemporalAnchorManager")),
      /^[\s\S]{0,400}?allowedTypes/,
      "the mount is unrestricted — which is why the row is not just flights and hotels",
    );
    // The collapsible's own testid is unchanged: CI and the walkthrough read it.
    assert.match(logistics, /data-testid="button-toggle-slip-anchors"/);
  });
});
