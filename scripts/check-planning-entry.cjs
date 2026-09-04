#!/usr/bin/env node
/**
 * check-planning-entry.cjs — every traveler-facing BROWSE surface offers a way to start a plan.
 *
 * Ledger `2026-09-04-entry-unification`, extending `2026-08-28-single-planning-entry`.
 * Node built-ins only — no npm ci, no DB, no browser.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The repo already proves routes RENDER — app-routes-gate, navbar-links-gate, auth-routes-gate,
 * footer-links-gate. Between them a route that 404s or renders blank fails CI. NONE of them proves
 * a surface offers an ENTRY, and that is exactly how the marketplace gap survived: `/destinations`,
 * `/ready-made`, `/events` and `/services` all rendered perfectly, every link on them resolved, and
 * a traveler standing on any of them still had no way to start a plan. Rendering is not reachability
 * of the next step.
 *
 * WHAT COUNTS AS AN ENTRY (two ruled shapes, deliberately)
 * ───────────────────────────────────────────────────────
 *   1. `PlanEntryCta` — the shared component (ledger `2026-09-04-entry-unification`), which calls
 *      `usePlanning().open(source)`, the globally-mounted chooser.
 *   2. `IntakePanel` opened from the page's own CTA — the page-local intake `/experiences` carries
 *      by ruling `2026-08-28-single-planning-entry` as extended by walkthrough finding F-T1
 *      (2026-08-30). It is a RULED variant, not a violation, and this guard must not force it to be
 *      rewritten into shape 1.
 *
 * IMPORTING `planningRouteForTrip` DOES NOT COUNT and the guard says so explicitly. It is a route
 * helper for an EXISTING trip, not an opener. Two commerce pages import it from the very same
 * module as `usePlanning`, which is what made those surfaces read as wired when they were not — the
 * single most misleading signal in this area, and the reason this predicate names it.
 *
 * NEGATIVE SPACE — what this guard does NOT check (§18d: green means green-within-stated-bounds)
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *   • That the entry is VISIBLE, reachable by keyboard, or placed where a mock says. This is a
 *     static check; placement and visibility are an e2e and a mock audit.
 *   • That the modal opens with the RIGHT `PlanningSource`. A surface passing nothing still passes
 *     here — correctly, since passing nothing is the honest answer when a page holds no context
 *     (§13). Whether it holds context is a review question.
 *   • `/experts` is DELIBERATELY NOT LISTED. Ruling `2026-08-28-single-planning-entry` makes
 *     `/experts?destination=` a DESTINATION of the chooser's ladder ("Plan with a local"), pinned by
 *     `planning-entry.spec.ts`. An entry there would point back at the modal that just sent the
 *     traveler out — a loop, not a fix. Whether a traveler who arrives at /experts COLD (from nav,
 *     with no ladder context) should be offered one is an open product question, recorded in the
 *     ledger row, NOT something this guard should force.
 *   • Supply-recruitment pages are not listed and must not be: `/become-expert`, `/expert/apply`
 *     (travel-experts.tsx) and `/become-provider`, `/provider/new-service` (service-providers.tsx)
 *     recruit providers. A "start a plan" CTA there would be wrong, not missing.
 *     `/start/events` (start-events.tsx) IS listed and is not a counter-example: it is the FORK in
 *     front of those two forms, reached by every "Event Planner" link on the site, and the couple
 *     who follows one arrives there as a TRAVELER. That is exactly why it carries the entry and
 *     the two forms it forks into do not (ledger `2026-09-04-wedding-entry-doors`).
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

/**
 * Traveler-facing browse surfaces that MUST offer a plan entry, with the routes each serves.
 * Adding a new commerce browse surface means adding it here.
 */
const ENTRY_SURFACES = [
  {
    file: "client/src/pages/discover.tsx",
    routes: ["/destinations", "/ready-made", "/events", "/services"],
    why: "the four marketplace surfaces — one component, four routes",
  },
  {
    file: "client/src/pages/experiences.tsx",
    routes: ["/experiences"],
    why: "the experience browse surface; carries the ruled page-local IntakePanel",
  },
  {
    file: "client/src/pages/start-events.tsx",
    routes: ["/start/events"],
    why: "the Event Planner fork — its third door is the HOST, and without an entry a couple is offered only two ways to sell",
  },
];

/** Does this source offer one of the two ruled entry shapes? */
function entryShapes(src) {
  return {
    planEntryCta: /\bPlanEntryCta\b/.test(src) && /<PlanEntryCta\b/.test(src),
    intakePanel: /<IntakePanel\b/.test(src) && /setIntakeOpen\(\s*true\s*\)/.test(src),
    // Not an entry — named so the failure message can call it out.
    routeHelperOnly: /planningRouteForTrip/.test(src),
  };
}

function check(files) {
  const errors = [];
  for (const surface of ENTRY_SURFACES) {
    const src = files[surface.file];
    if (src === undefined) {
      errors.push(`${surface.file} is listed as an entry surface but does not exist. If it moved, update ENTRY_SURFACES.`);
      continue;
    }
    const s = entryShapes(src);
    if (s.planEntryCta || s.intakePanel) continue;
    let msg = `${surface.file} (${surface.routes.join(", ")}) offers NO plan entry — ${surface.why}.`;
    if (s.routeHelperOnly) {
      msg += ` It imports planningRouteForTrip, which is a ROUTE HELPER for an existing trip, NOT an opener — that is not an entry.`;
    }
    msg += ` Render <PlanEntryCta /> from @/components/planning/plan-entry-cta.`;
    errors.push(msg);
  }
  return errors;
}

// ── committed self-test fixtures (§18d) ────────────────────────────────────────────────────────
function selfTest() {
  const withCta = 'import { PlanEntryCta } from "@/components/planning/plan-entry-cta";\n<PlanEntryCta source={undefined} />';
  const withIntake = 'const [o,setIntakeOpen]=useState(false);\n<Button onClick={() => setIntakeOpen(true)} />\n<IntakePanel open={o} />';
  const helperOnly = 'import { planningRouteForTrip } from "@/contexts/PlanningContext";';
  const bare = "export default function Page(){ return <div/>; }";

  // One entry per ENTRY_SURFACES row. A surface added to the list without a fixture here would
  // make EVERY case fail on "does not exist" rather than on its own predicate — which is the
  // fixture set telling the truth, so keep the third argument in step with the list.
  const files = (a, b, c = withCta) => ({
    "client/src/pages/discover.tsx": a,
    "client/src/pages/experiences.tsx": b,
    "client/src/pages/start-events.tsx": c,
  });

  const cases = [
    ["both wired passes", () => check(files(withCta, withIntake)).length === 0],
    ["PlanEntryCta alone satisfies a surface", () => check(files(withCta, withCta)).length === 0],
    ["a bare surface fails", () => check(files(bare, withIntake)).some((e) => e.includes("discover.tsx"))],
    ["planningRouteForTrip alone is NOT an entry", () => check(files(helperOnly, withIntake)).some((e) => e.includes("ROUTE HELPER"))],
    ["a missing file fails loudly", () => check({ "client/src/pages/experiences.tsx": withIntake }).some((e) => e.includes("does not exist"))],
    ["an IntakePanel with no opener is not an entry", () => check(files("<IntakePanel open={o} />", withIntake)).some((e) => e.includes("discover.tsx"))],
    ["the fork page is held to the same bar", () => check(files(withCta, withIntake, bare)).some((e) => e.includes("start-events.tsx"))],
  ];

  let failed = 0;
  for (const [name, fn] of cases) {
    let ok = false;
    try { ok = fn(); } catch { ok = false; }
    console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}`);
    if (!ok) failed++;
  }
  if (failed > 0) {
    console.error(`\nplanning-entry guard SELF-TEST FAILED — ${failed} fixture case(s). Fix the predicate before trusting a green run.`);
    process.exit(1);
  }
  console.log(`\nplanning-entry guard self-test: ${cases.length}/${cases.length} fixture cases pass.`);
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  const files = {};
  for (const s of ENTRY_SURFACES) {
    const p = path.join(ROOT, s.file);
    if (fs.existsSync(p)) files[s.file] = fs.readFileSync(p, "utf8");
  }
  const errors = check(files);
  if (errors.length > 0) {
    console.error("planning-entry guard FAILED:\n");
    for (const e of errors) console.error(`  • ${e}`);
    console.error("\nA browse surface that renders but offers no way to start a plan is a dead end.");
    console.error("See ledger 2026-09-04-entry-unification / 2026-08-28-single-planning-entry.");
    process.exit(1);
  }
  console.log(`planning-entry guard: OK — ${ENTRY_SURFACES.length} browse surfaces each offer a plan entry.`);
}

main();
