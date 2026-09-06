/**
 * THE SLIP'S ACTION RAIL IS FOUR CARDS, AND EVERY RAIL KEPT A HOME.
 * Ledger `2026-09-05-slip-rail-regroup` (LD 42 build-order row 1.5, ratified).
 *
 * WHY THIS EXISTS. A regrouping fails silently in exactly two directions and neither throws.
 *  · A control can be LOST — moved out of one card and never into another. Nothing breaks; the
 *    rail it served (a PDF, a calendar, an expert) simply stops being reachable, and the only
 *    signal is a traveler who cannot find it. So every `slip-action-*` testid that existed on
 *    `main` is pinned as either PRESENT or on an explicit REMOVED list carrying its reason, and
 *    there is no third answer.
 *  · A control can be DUPLICATED — the old home left standing beside the new one. That also works,
 *    right up to the day the two disagree; it is the drift class §18 rule 1 names, and it is what
 *    the rail regroup existed to fix (two ways to the Trip Card, two expert pickers, a bulk
 *    checkout button doing what Finalize's own chooser does). So the removals are pinned by
 *    ABSENCE in the shipped code, with comments stripped first — the explanation of a deletion
 *    must not satisfy a grep for the thing deleted.
 *
 * What these hold:
 *   R1  the ONE AI action is chosen by item count alone: 0 ⇒ Draft, ≥1 ⇒ Optimize (LD 41 (b)).
 *   R2  the Draft's disabled reason is about the plan's missing facts, never about the rule R1
 *       already states — one statement, one place.
 *   R3  the expert row has THREE states and they are three different facts: no advisor, an
 *       advisor with a public handle, an advisor with none (§13 — a sentence, not a dead button).
 *   R4  the share URL is the TOKEN link `/trips/shared/:token`, never `/itinerary/:id` (S10).
 *   R5  "Go to checkout (N)" counts staged-not-booked rows, and zero is zero.
 *   S1  every `slip-action-*` testid on main is present, or removed with a reason.
 *   S2  the four cards exist, each carrying the rows the ruling names.
 *   S3  the removals are really gone from the CODE: no bulk-checkout button, no pre-final
 *       "Preview Trip Card", no second expert picker on the slip.
 *   S4  Share posts to the EXISTING owner-gated share rail and builds its URL through the ONE
 *       `slipShareUrl`; the broken `/itinerary/${trip.id}` string is gone from both files.
 *   S5  the calendar is a second CALLER of the ONE `generateIcsContent`, not a second exporter,
 *       and it hands over the plan's own `trips.timezone`.
 *   S6  `TripExportButton` — the dead export component — is still gone.
 *   S7  the older advisor route is NOT deleted by this lane; only the slip's mount of it is.
 *   S8  Trip Pass moved into the rail and is still exactly one purchase rail.
 *   S9  the "private plan" chip is still gated on the hidden-visibility switch, the status strip
 *       still counts the ONE routing taxonomy and no origins, and the List | Map toggle stays.
 *
 * Pure unit: no DOM, no DB, no fetch — the S-pins read the shipped source as text.
 * Run: npx tsx --test client/src/lib/__tests__/slip-rail.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SLIP_EXPERT_NO_HANDLE_NOTE,
  SLIP_RAIL_CARDS,
  countCheckoutReadyItems,
  slipAdvisorName,
  slipBuildAiAction,
  slipCalendarPath,
  slipDraftDisabledReason,
  slipExpertRailState,
  slipPdfPath,
  slipShareUrl,
} from "../slip-rail";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIENT_SRC = join(HERE, "..", "..");
const ROOT = join(HERE, "..", "..", "..", "..");
const readClient = (rel: string) => readFileSync(join(CLIENT_SRC, rel), "utf8");
const readRoot = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/**
 * Strip comments before an ABSENCE grep. Every removal this lane made is EXPLAINED in a comment
 * where it used to be — that is how the next reader learns why the control is not there — so a
 * naive `includes()` would be satisfied by the explanation and never see the control come back.
 * The pin has to read the CODE, so the prose is removed first.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const codeClient = (rel: string) => stripComments(readClient(rel));
const codeRoot = (rel: string) => stripComments(readRoot(rel));

const RAIL = "components/plancard/SlipRail.tsx";
const VIEW = "components/plancard/SlipView.tsx";
const PAGE = "pages/slip-view.tsx";

/**
 * THE `slip-action-*` TESTIDS THAT EXISTED ON `main` BEFORE THIS LANE, and where each one went.
 * This is the ledger's own "every rail keeps a home or is explicitly removed" rule, written down
 * where a regression can trip over it. Two answers only: `"kept"` or a REASON string.
 */
const MAIN_SLIP_ACTION_TESTIDS: Record<string, "kept" | string> = {
  "slip-action-share": "kept",
  "slip-action-pdf": "kept",
  "slip-action-optimize": "kept",
  "slip-action-optimize-wrap": "kept",
  "slip-action-finalize-plan": "kept",
  "slip-action-reopen": "kept",
  "slip-action-view-trip-card": "kept",
  // ── REMOVED, with the ruling's reason ──────────────────────────────────────────────────────
  "slip-action-add-all-checkout":
    "REMOVED — folded into Finalize. FinalizeBookingModal's 'I book them myself' branch already " +
    "runs runBulkRouteToCheckout over the same rows; a second button doing the same bulk write " +
    "beside it is the drift class §18 rule 1 names. The helper stays, as Finalize's.",
  "slip-action-trip-card":
    "REMOVED from the pre-final rail — before a snapshot exists /trip/:id has nothing of its own " +
    "to render and bounces back to the slip, so the control promised a surface that did not " +
    "exist (§13). View as Trip card lives ONLY in the Finish card's finalized state.",
};

/** The rows the ruling names for each card, as the testids the shipped rail must carry. */
const CARD_ROWS: Record<string, string[]> = {
  build: [
    "slip-browse-services",
    "slip-action-draft-ai",
    "slip-action-optimize",
    "slip-action-hire-expert",
    "slip-action-message-expert",
    "slip-rail-trip-pass",
  ],
  plan: ["button-toggle-slip-contracts", "slip-plan-budget"],
  share: ["slip-action-share", "slip-action-pdf", "slip-action-calendar"],
  finish: [
    "slip-action-finalize-plan",
    "slip-action-go-to-checkout",
    "slip-action-reopen",
    "slip-action-view-trip-card",
  ],
};

describe("slip rail — the ONE AI action, and its honest absences", () => {
  it("R1 Draft on an empty plan, Optimize on a plan with any row (LD 41 (b))", () => {
    assert.equal(slipBuildAiAction(0), "draft");
    assert.equal(slipBuildAiAction(1), "optimize");
    assert.equal(slipBuildAiAction(9), "optimize");
    // A negative count cannot happen, but the answer must still be the empty-plan one rather
    // than an exception, and a count we could not compute must never offer a free rebuild.
    assert.equal(slipBuildAiAction(-1), "draft");
    assert.equal(slipBuildAiAction(Number.NaN), "optimize");
  });

  it("R2 the Draft's disabled reason names the missing FACT, never the empty-slip rule", () => {
    assert.equal(
      slipDraftDisabledReason({ destination: "Kyoto", startDate: "2026-10-02", endDate: "2026-10-04" }),
      null,
    );
    assert.match(
      String(slipDraftDisabledReason({ destination: null, startDate: "2026-10-02", endDate: "2026-10-04" })),
      /no destination/i,
    );
    assert.match(
      String(slipDraftDisabledReason({ destination: "Kyoto", startDate: null, endDate: null })),
      /no dates/i,
    );
    // §18 rule 1: the empty-slip rule is stated ONCE, by slipBuildAiAction. If it were restated
    // here the two could drift and a traveler would meet two different explanations.
    for (const reason of [
      slipDraftDisabledReason({ destination: null, startDate: null, endDate: null }),
      slipDraftDisabledReason({ destination: "Kyoto", startDate: null, endDate: null }),
    ]) {
      assert.doesNotMatch(String(reason), /already has items|empty plan|optimize/i);
    }
  });

  it("R3 the expert row has three states, and a handle-less advisor gets a sentence", () => {
    assert.deepEqual(slipExpertRailState(null), { kind: "hire" });
    assert.deepEqual(slipExpertRailState(undefined), { kind: "hire" });

    const messaged = slipExpertRailState({
      status: "accepted",
      first_name: "Aya",
      last_name: "Tanaka",
      handle: "aya",
    });
    assert.deepEqual(messaged, { kind: "message", name: "Aya Tanaka", handle: "aya", pending: false });

    // A PENDING advisor is still an advisor — the picker is not re-offered, and the standing is
    // reported. LD 12 stops them WRITING; it does not stop the traveler writing to them.
    const pending = slipExpertRailState({
      status: "pending",
      first_name: "Aya",
      last_name: null,
      handle: "aya",
    });
    assert.equal(pending.kind, "message");
    assert.equal(pending.kind === "message" && pending.pending, true);

    // No handle ⇒ no address exists (LD 40: a users.id is not an address), so the rail says so.
    const noHandle = slipExpertRailState({ status: "accepted", first_name: "Aya", handle: null });
    assert.equal(noHandle.kind, "no_handle");
    assert.equal(noHandle.kind === "no_handle" && noHandle.name, "Aya");
    // Whitespace is not a handle.
    assert.equal(slipExpertRailState({ status: "accepted", handle: "   " }).kind, "no_handle");
    assert.match(SLIP_EXPERT_NO_HANDLE_NOTE, /public profile/i);

    // §13: a nameless advisor row is never given a fabricated name.
    assert.equal(slipAdvisorName({ first_name: null, last_name: null }), null);
    assert.equal(slipAdvisorName(null), null);
  });

  it("R4 the share URL is the TOKEN link, and carries no trip id (S10)", () => {
    const url = slipShareUrl("https://traveloure.test", "abc123");
    assert.equal(url, "https://traveloure.test/trips/shared/abc123");
    assert.doesNotMatch(url, /\/itinerary\//);
    // The token IS the address — an internal id in this URL would put back the thing the token
    // exists to replace.
    assert.doesNotMatch(url, /trip-[0-9a-f]/);
    assert.equal(slipShareUrl("https://x.test", "a/b"), "https://x.test/trips/shared/a%2Fb");
    assert.equal(slipCalendarPath("t1"), "/api/trips/t1/calendar");
    assert.equal(slipPdfPath("t1"), "/api/trips/t1/pdf");
  });

  it("R5 Go to checkout counts staged-not-booked rows, and zero is zero", () => {
    assert.equal(countCheckoutReadyItems([]), 0);
    assert.equal(
      countCheckoutReadyItems([
        { routingStatus: "ready_for_checkout" },
        { routingStatus: "ready_for_checkout", booking: { id: "b1" } },
        { routingStatus: "in_planning" },
        { routingStatus: "with_expert" },
        { routingStatus: "purchased" },
        { routingStatus: null },
      ]),
      1,
    );
  });
});

describe("slip rail — four cards, and every rail kept a home", () => {
  it("S1 every slip-action-* testid on main is present, or removed with a reason", () => {
    const rail = readClient(RAIL);
    const view = readClient(VIEW);
    const shipped = new Set(
      [...rail.matchAll(/testId="(slip-action-[a-z-]+)"/g)].map((m) => m[1]),
    );
    for (const m of rail.matchAll(/data-testid="(slip-action-[a-z-]+)"/g)) shipped.add(m[1]);
    for (const m of view.matchAll(/data-testid="(slip-action-[a-z-]+)"/g)) shipped.add(m[1]);

    for (const [testid, disposition] of Object.entries(MAIN_SLIP_ACTION_TESTIDS)) {
      if (disposition === "kept") {
        assert.ok(shipped.has(testid), `${testid} was on main and must still have a home`);
      } else {
        assert.ok(
          !shipped.has(testid),
          `${testid} is on the removed list — it must not come back. Reason: ${disposition}`,
        );
        assert.match(disposition, /^REMOVED\b/, `${testid} must carry its removal reason`);
      }
    }

    // A control this lane ADDED is fine; a control that appears with no entry either way is what
    // the table exists to catch, so new ones must be added to it deliberately.
    const ADDED = new Set([
      "slip-action-draft-ai",
      "slip-action-hire-expert",
      "slip-action-message-expert",
      "slip-action-calendar",
      "slip-action-go-to-checkout",
    ]);
    for (const testid of shipped) {
      assert.ok(
        MAIN_SLIP_ACTION_TESTIDS[testid] === "kept" || ADDED.has(testid),
        `${testid} is neither an accounted-for main testid nor a declared addition`,
      );
    }
  });

  it("S2 the four cards exist, each carrying the rows the ruling names", () => {
    const rail = readClient(RAIL);
    assert.deepEqual([...SLIP_RAIL_CARDS], ["build", "plan", "share", "finish"]);
    for (const card of SLIP_RAIL_CARDS) {
      assert.ok(
        rail.includes(`card="${card}"`),
        `the ${card} card must be rendered by the rail`,
      );
      for (const row of CARD_ROWS[card]) {
        assert.ok(
          rail.includes(`"${row}"`),
          `the ${card} card is missing its ${row} row`,
        );
      }
    }
    // The rail is a card grid, not the flat button row it replaces.
    assert.ok(rail.includes('data-testid="slip-rail"'), "the rail itself is addressable");
    // The Plan card mounts the logistics collapsibles and the contract board — one more mount
    // each, never a re-implementation.
    assert.ok(rail.includes("<SlipLogisticsSection"), "guests/party/anchors/organize are re-mounted");
    assert.ok(rail.includes("<VendorContractBoard"), "the contract board gets its one mount");
    assert.ok(rail.includes("<TripPassCard"), "Trip Pass is the existing card, moved");
    // STOPS & TIMEZONE are a later lane and must not be drawn as a placeholder (§13).
    assert.ok(
      !stripComments(rail).includes("Stops &amp; timezone") &&
        !stripComments(rail).includes("Stops & timezone"),
      "S6/S7 are a later lane — no placeholder row promises them",
    );
  });

  it("S3 the removals are gone from the CODE, not just explained in a comment", () => {
    const rail = codeClient(RAIL);
    const view = codeClient(VIEW);
    for (const src of [rail, view]) {
      assert.ok(!src.includes("slip-action-add-all-checkout"), "the bulk-checkout button is gone");
      assert.ok(!src.includes("slip-action-trip-card"), "the pre-final Preview Trip Card is gone");
      assert.ok(!src.includes("Add all to checkout"), "and so is its label");
    }
    // The flat action row this rail replaces is gone from SlipView entirely.
    assert.ok(!view.includes("function SlipActions"), "the flat SlipActions row is gone");
    assert.ok(!view.includes('data-testid="slip-actions"'), "and so is its container testid");
    // ONE PICKER (D7): the slip no longer mounts the older AssignExpertSlot.
    assert.ok(!view.includes("AssignExpertSlot"), "the second expert picker is not mounted here");
    assert.ok(!view.includes("button-find-expert"), "nor its CTA");
    assert.ok(rail.includes("<HireExpertDialog"), "the pick-based picker is the one that stays");
    // The bulk-route helper survives — it is Finalize's.
    const modal = codeClient("components/plancard/FinalizeBookingModal.tsx");
    assert.ok(
      modal.includes("runBulkRouteToCheckout"),
      "Finalize still owns the bulk route the removed button duplicated",
    );
  });

  it("S4 Share posts to the existing rail and builds the token URL through one helper", () => {
    const rail = codeClient(RAIL);
    const view = codeClient(VIEW);
    assert.ok(rail.includes("slipShareUrl("), "the URL is built by the ONE helper");
    assert.ok(
      rail.includes("`/api/trips/${tripId}/share`"),
      "and the token comes from the existing owner-gated share rail",
    );
    // THE BUG: the old link. It must be gone from both files, and there must be no fallback to it.
    for (const src of [rail, view]) {
      assert.ok(
        !src.includes("/itinerary/${trip.id}") && !src.includes("/itinerary/${tripId}"),
        "the id link no recipient could open is gone, with no fallback",
      );
    }
    // Under a hidden-visibility occasion the whole Share card is absent (LD 28).
    assert.ok(rail.includes("occasionHidden"), "the hidden-occasion gate is read");
  });

  it("S5 the calendar is a second CALLER of the one .ics generator, and honours trips.timezone", () => {
    const trips = codeRoot("server/routes/trips.routes.ts");
    assert.ok(
      trips.includes('router.get("/api/trips/:tripId/calendar"'),
      "the trip-keyed calendar route exists",
    );
    assert.ok(trips.includes("generateIcsContent("), "it calls the shared generator");
    assert.ok(
      trips.includes("resolveTripTimezone(trip.destination)"),
      "and falls back to the SAME server-side zone derivation, never UTC (§13, LD 30)",
    );
    assert.ok(
      /timezone:\s*planTimezone/.test(trips),
      "the plan's own zone is what the generator is handed",
    );
    assert.ok(
      trips.includes("getTripRole(tripId, userId)"),
      "gated like the PDF beside it — the plancard read's own tier",
    );

    // ONE GENERATOR (§18 rule 1). Its definition plus exactly two callers; a third exporter is
    // how two calendar surfaces start disagreeing about the same wall clock.
    const CALLERS = [
      "server/utils/ics-calendar.ts",
      "server/routes/my-itinerary.routes.ts",
      "server/routes/trips.routes.ts",
    ];
    for (const rel of CALLERS) {
      assert.ok(readRoot(rel).includes("generateIcsContent"), `${rel} references the generator`);
    }
    // The generator itself is untouched by this lane: its floating-time branch is the §13 answer
    // for a plan with no zone, and this route relies on it rather than substituting one.
    const ics = readRoot("server/utils/ics-calendar.ts");
    assert.ok(ics.includes("const timeZone = comparison.timezone || null;"));
  });

  it("S6 TripExportButton is still gone and nothing imports it", () => {
    assert.equal(
      existsSync(join(CLIENT_SRC, "components/itinerary/TripExportButton.tsx")),
      false,
      "the zero-importer export component must not come back — the calendar has a real route now",
    );
  });

  it("S7 only the slip's MOUNT of the older advisor route was retired, not the route", () => {
    // The ruling is explicit: retire the duplicate picker on this surface, do NOT delete the
    // older server route in this lane — it has callers elsewhere.
    const server = codeRoot("server/routes/booking-actions.ts");
    assert.ok(
      server.includes("'/trips/:id/expert-advisor'"),
      "the older advisor route survives this lane",
    );
    // The owner-gated advisor READ now carries the expert's public handle (LD 40) so the rail can
    // offer Message without ever holding a user id.
    const svc = codeRoot("server/services/booking-actions.service.ts");
    assert.ok(svc.includes("u.handle"), "the advisor read carries the public address");
    assert.ok(!svc.includes("u.id as expert_user_id"), "and still no user id for the client");
  });

  it("S9 the private-plan chip and the status strip are gated exactly as they were", () => {
    const view = codeClient(VIEW);
    // The ruling asks this be VERIFIED, not changed: the "private plan" badge must never render
    // unconditionally — it is the positive signal for the SAME `isHidden` the Share card's and the
    // guest surface's absences read, so the badge and the behaviour cannot disagree (§18 rule 1).
    // §13 keeps its own direction: an unresolved occasion or a NULL column is NOT hidden, so an
    // undecided plan is never labelled private.
    assert.match(
      view,
      /\{isHidden && \(\s*<span[\s\S]{0,400}?data-testid="slip-private-badge"/,
      "the private-plan chip renders only under the hidden-visibility gate",
    );
    // The status strip keeps the ONE routing taxonomy and counts no origins. Scoped to the strip's
    // own function body on purpose: `origin` is a legitimate word elsewhere on this surface (an
    // item row's provenance chip is a per-ROW fact), and what must not happen is a SECOND
    // population summed into a line that reads as the routing taxonomy.
    assert.ok(view.includes('data-testid="slip-status-strip"'), "the strip stays on the slip");
    // Sliced to the function's own body — from its declaration to the next top-level `}` — so a
    // neighbour moving does not silently widen or empty this pin.
    const stripStart = view.indexOf("function SlipStatusStrip");
    assert.ok(stripStart >= 0, "SlipStatusStrip is still the slip's one status line");
    const stripEnd = view.indexOf("\n}", stripStart);
    assert.ok(stripEnd > stripStart, "found the end of the strip's own body");
    const strip = view.slice(stripStart, stripEnd);
    assert.ok(strip.length > 100, "found the strip's own body");
    for (const status of ["in_planning", "with_expert", "ready_for_checkout", "purchased"]) {
      assert.ok(strip.includes(`status: "${status}"`), `the strip still counts ${status}`);
    }
    assert.ok(!strip.includes("origin"), "no origin counts were added to the strip");
    assert.ok(!strip.includes("aiSketch"), "and the sketch line is the header's, not the strip's");
    // The List | Map toggle keeps its place above the day list, with the map's honest gating.
    assert.ok(view.includes('data-testid="slip-view-toggle"'), "the toggle stays");
    assert.ok(view.includes("mapDisabledReason"), "and the map is still offered only when located");
  });

  it("S8 Trip Pass moved into the rail and is still ONE purchase rail", () => {
    const page = codeClient(PAGE);
    assert.ok(!page.includes("TripPassCard"), "the page no longer mounts it");
    assert.ok(page.includes("<ConciergeCard"), "Concierge stays where it is, self-gating");
    const rail = codeClient(RAIL);
    assert.equal(
      (rail.match(/<TripPassCard/g) ?? []).length,
      1,
      "exactly one mount — never a second purchase rail",
    );
  });
});
