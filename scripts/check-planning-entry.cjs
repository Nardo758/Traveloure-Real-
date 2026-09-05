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
 *   • WHAT A PAGE KNOWS. The second predicate below (D13) checks what a door PASSES; nothing here
 *     can see what the page HOLDS. A surface that quietly stops reading a city and therefore stops
 *     passing one fails; a surface that never read it in the first place was never checked. A
 *     surface ABSENT from REQUIRED_SOURCE_FIELDS is UNCHECKED, not exonerated — adding one is a
 *     human decision, and the list is a floor, not an inventory.
 *   • THAT A PASSED FIELD IS TRUE. This is text over source: `{ city: someVariable }` satisfies the
 *     `city` requirement whatever that variable holds. Locked Decision 42 (D13) puts the honesty
 *     half on the author — a door passes only what it holds, and where a field would have to be
 *     invented it passes NOTHING — and this guard cannot enforce it. That is why two doors here
 *     (the `OPERATING_MARKETS` ticker rail, which names eight cities and no one of them, and the
 *     storefront, whose `earner.location` is a NEIGHBOURHOOD as often as a city) are deliberately
 *     required to pass NO city rather than any city.
 *   • A FIELD PASSED THROUGH AN INDIRECTION. `open(src)` where `src` was built elsewhere in the
 *     file reads as passing nothing. The predicate wants the key literally at a call site.
 *   • That the modal opens with the right VALUES generally. A surface passing nothing where nothing
 *     is required still passes here — correctly, since passing nothing is the honest answer when a
 *     page holds no context (§13). Whether it holds context is a review question.
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
  // Added by ledger `2026-09-05-doors-source-fields` (Locked Decision 42, wave 1.1). Four more
  // traveler-facing surfaces that rendered perfectly and offered no way to start a plan.
  {
    file: "client/src/pages/providers-directory.tsx",
    routes: ["/providers"],
    why: "the provider directory — its only CTAs were supply-side, so a traveler browsing businesses had no next step",
  },
  {
    file: "client/src/pages/storefront.tsx",
    routes: ["/s/:handle"],
    why: "an earner's public storefront — Message and Share were the only actions a visiting traveler had",
  },
  {
    file: "client/src/pages/ready-made-detail.tsx",
    routes: ["/ready-made/:id"],
    why: "a ready-made listing — buying was the only forward move for a traveler who liked the market but not this plan",
  },
  {
    file: "client/src/pages/chat.tsx",
    routes: ["/chat"],
    why: "the messages surface with no thread selected — the commonest first visit, and it offered nothing",
  },
];

// ── D13: WHAT EACH NAMED DOOR MUST PASS ───────────────────────────────────────────────────────
//
// Locked Decision 42 (D13), ledger `2026-09-05-doors-source-fields`. Ruling 33 ruled that doors
// differ in exactly two things — what arrives pre-filled and which step opens first — and shipped
// `resolvePlanSteps` for the second. Nothing decided the FIRST and nothing checked it, so a door
// standing on a page that already knew the answer opened a modal that asked the traveler anyway.
//
// A surface listed here MUST pass the named `PlanningSource` keys at some opener call site in its
// own source. Absence from this list is not a pass mark (see the negative space in the header).
//
// TWO SURFACES ARE LISTED WITH NO REQUIRED CITY ON PURPOSE, and that is the ruling, not a gap:
// D13's second clause says a door passes only what is TRUE, so where a field would have to be
// invented the door passes NOTHING. Both are recorded as `forbid` entries below so the reason is
// checked rather than remembered.
const REQUIRED_SOURCE_FIELDS = [
  {
    file: "client/src/components/CityTickerTape.tsx",
    require: [],
    // The rail names ALL EIGHT OPERATING_MARKETS and no ONE of them. Passing a city here would
    // manufacture a destination the traveler never chose.
    forbid: ["city", "destination"],
    why: "the launch-market ticker rail holds eight cities and no single one (§13)",
  },
  {
    file: "client/src/pages/experience-template.tsx",
    require: ["experienceSlug"],
    why: "the route param IS a seeded experience_types slug — the occasion this page is about",
  },
  {
    file: "client/src/pages/trip-details.tsx",
    require: ["experienceType"],
    why: "the trip row carries trips.experience_type; the door holds the whole row",
  },
  {
    file: "client/src/pages/ready-made-detail.tsx",
    require: ["city"],
    why: "listing.market is the listing's own stated market",
  },
  {
    file: "client/src/pages/chat.tsx",
    require: ["tripId"],
    why: "selectedTripId is the trip the open thread is about — the same value the header badge renders",
  },
  {
    file: "client/src/pages/experiences.tsx",
    require: ["city"],
    // The ruled page-local IntakePanel is this surface's entry shape, so the field arrives as a
    // PROP rather than inside a PlanningSource literal. Same requirement, same key name.
    why: "?destination= is already parsed here and threaded into every card link",
  },
  {
    file: "client/src/pages/storefront.tsx",
    require: [],
    // resolveEarnerLocation prefers the admin-managed NEIGHBOURHOOD assignment and returns
    // "<neighbourhood>, <city>", so earner.location is not reliably a city.
    forbid: ["city", "destination"],
    why: "earner.location is a neighbourhood as often as a city (§13)",
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

/**
 * The names this file calls the ONE opener by, PLUS the two ruled entry components.
 *
 * Doors do not call `usePlanning().open` inline — they destructure it (`const { open: openPlanning }
 * = usePlanning()`), so the alias is per-file and has to be READ rather than assumed. Anything
 * looser (a bare `open(`) would swallow `window.open(` and every unrelated `setOpen(`; anything
 * stricter would miss the aliases the repo actually uses.
 */
function openerTokens(src) {
  const tokens = ["<PlanEntryCta", "<IntakePanel"];
  for (const m of src.matchAll(/const\s*\{\s*open\s*:\s*([A-Za-z_$][\w$]*)\s*\}\s*=\s*usePlanning\(\)/g)) {
    tokens.push(`${m[1]}(`);
  }
  for (const m of src.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*usePlanning\(\)/g)) {
    tokens.push(`${m[1]}.open(`);
  }
  if (/usePlanning\(\)\.open\(/.test(src)) tokens.push("usePlanning().open(");
  return tokens;
}

/**
 * The slices of source that are OPENER CALLS — the only places a `PlanningSource` can be passed.
 *
 * Whole-file matching would be wrong in both directions: `tripId?: string;` in an unrelated type,
 * or `data.tripId ===` in a filter, would satisfy a `tripId` requirement that no door actually
 * passes. So each region runs from the opener token to the close of that call/element, tracked by
 * brace/paren depth — a call ends at its balancing `)`, a JSX element at the first `>` or `/>` that
 * is not inside an expression container.
 */
function sourceRegions(src) {
  const regions = [];
  for (const token of openerTokens(src)) {
    let from = 0;
    for (;;) {
      const at = src.indexOf(token, from);
      if (at === -1) break;
      from = at + token.length;
      const jsx = token.startsWith("<");
      let depth = 0;
      let i = from;
      for (; i < src.length && i < from + 4000; i++) {
        const c = src[i];
        if (c === "{" || (!jsx && c === "(")) depth++;
        else if (c === "}" || (!jsx && c === ")")) {
          if (depth === 0 && !jsx) break;
          depth--;
        } else if (jsx && c === ">" && depth === 0) break;
      }
      regions.push(src.slice(at, i + 1));
    }
  }
  return regions;
}

/**
 * Is `key` passed in any opener region? Three spellings, all real in this repo:
 *   `{ city: x }`  object property   ·  `{ destination }` shorthand  ·  `city={x}` JSX prop
 * (the `/experiences` entry shape is the ruled page-local IntakePanel, so its fields arrive as
 * props — same key name, different punctuation, and refusing that spelling would force the ruled
 * variant to be rewritten, which this guard has always been forbidden to do).
 */
function passesField(regions, key) {
  const re = new RegExp(`\\b${key}\\s*(?::|=|[,}])`);
  return regions.some((r) => re.test(r));
}

function checkSourceFields(files) {
  const errors = [];
  for (const surface of REQUIRED_SOURCE_FIELDS) {
    const src = files[surface.file];
    if (src === undefined) {
      errors.push(`${surface.file} is listed in REQUIRED_SOURCE_FIELDS but does not exist. If it moved, update the list.`);
      continue;
    }
    const regions = sourceRegions(src);
    if (regions.length === 0 && (surface.require ?? []).length > 0) {
      errors.push(`${surface.file} must pass ${surface.require.join(", ")} but has NO opener call at all (Locked Decision 42 D13 — ${surface.why}).`);
      continue;
    }
    for (const key of surface.require ?? []) {
      if (passesField(regions, key)) continue;
      errors.push(
        `${surface.file} does not pass \`${key}\` to the planning opener — ${surface.why}. ` +
        `Locked Decision 42 (D13): a door passes what it HOLDS. Pass it in the PlanningSource, or, if this ` +
        `surface genuinely no longer holds it, change REQUIRED_SOURCE_FIELDS deliberately and say why.`,
      );
    }
    for (const key of surface.forbid ?? []) {
      if (!passesField(regions, key)) continue;
      errors.push(
        `${surface.file} passes \`${key}\` to the planning opener, which this surface is ruled NOT to pass — ${surface.why}. ` +
        `Locked Decision 42 (D13) second clause: a door passes only what is TRUE, and an invented field is worse than an absent one (§13).`,
      );
    }
  }
  return errors;
}

function checkEntryShapes(files) {
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

/**
 * The two predicates run in the SAME guard rather than a sibling script: "does this surface offer a
 * door?" and "does that door pass what it holds?" are two halves of one question, and splitting
 * them would give a surface two places to be listed and one place to be forgotten (§18 rule 1).
 */
function check(files) {
  return [...checkEntryShapes(files), ...checkSourceFields(files)];
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
    // The four surfaces ledger `2026-09-05-doors-source-fields` added. They are held at `withCta`
    // in every case because these fixtures exercise the first three; a surface listed in
    // ENTRY_SURFACES with no entry here would fail every case on "does not exist" instead of on
    // its own predicate, which is the fixture set lying rather than telling the truth.
    "client/src/pages/providers-directory.tsx": withCta,
    "client/src/pages/storefront.tsx": withCta,
    "client/src/pages/ready-made-detail.tsx": withCta,
    "client/src/pages/chat.tsx": withCta,
  });

  // These exercise the ENTRY-SHAPE half only (`checkEntryShapes`), not the composed `check`: the
  // D13 half below has its own fixtures, and a fixture that ran both would report a failure of one
  // predicate as a failure of the other — the exact ambiguity §18d fixtures exist to remove.
  const cases = [
    ["both wired passes", () => checkEntryShapes(files(withCta, withIntake)).length === 0],
    ["PlanEntryCta alone satisfies a surface", () => checkEntryShapes(files(withCta, withCta)).length === 0],
    ["a bare surface fails", () => checkEntryShapes(files(bare, withIntake)).some((e) => e.includes("discover.tsx"))],
    ["planningRouteForTrip alone is NOT an entry", () => checkEntryShapes(files(helperOnly, withIntake)).some((e) => e.includes("ROUTE HELPER"))],
    ["a missing file fails loudly", () => checkEntryShapes({ "client/src/pages/experiences.tsx": withIntake }).some((e) => e.includes("does not exist"))],
    ["an IntakePanel with no opener is not an entry", () => checkEntryShapes(files("<IntakePanel open={o} />", withIntake)).some((e) => e.includes("discover.tsx"))],
    ["the fork page is held to the same bar", () => checkEntryShapes(files(withCta, withIntake, bare)).some((e) => e.includes("start-events.tsx"))],
  ];

  // ── D13 fixtures (ledger `2026-09-05-doors-source-fields`) ─────────────────────────────────
  // The predicate is exercised against the SHAPES this repo actually writes, positive and
  // negative, because a required-field list that silently matches everything reports PASS for its
  // whole life — the `phase2-fee-gate.sh` failure §18d exists for.
  const doorAlias =
    'const { open: openPlanModal } = usePlanning();\n' +
    'onClick={() => openPlanModal({ experienceSlug: slug || undefined, destination: d || undefined })}';
  const doorBare = 'const { open: openPlanModal } = usePlanning();\nonClick={() => openPlanModal()}';
  const doorShorthand = 'const { open: openPlanning } = usePlanning();\nonClick={() => openPlanning({ destination })}';
  const doorProp = 'const { open: o } = usePlanning();\n<IntakePanel open={x} city={destinationParam ?? undefined} />';
  const doorCta = '<PlanEntryCta source={{ city: listing.market }} testId="t" />';
  const doorCtaBare = '<PlanEntryCta variant="outline" testId="t" />';
  const doorCtaConditional = '<PlanEntryCta source={id ? { tripId: id } : undefined} testId="t" />';
  // The decoy: the key appears in the file, in a TYPE and in a filter — but no door passes it.
  const decoy =
    'interface N { data?: { tripId?: string } }\n' +
    'const x = all.filter((n) => n.data?.tripId === shared);\n' +
    doorCtaBare;

  const one = (file, src) => ({ [file]: src });
  // Scoped to the file under test: `checkSourceFields` is given ONE file, so the other listed
  // surfaces correctly report "does not exist" — a real failure mode, exercised by its own case
  // below, and noise in every other one.
  const req = (file, src) => checkSourceFields(one(file, src)).filter((e) => e.startsWith(file));

  const TICKER = "client/src/components/CityTickerTape.tsx";
  const TEMPLATE = "client/src/pages/experience-template.tsx";
  const DETAILS = "client/src/pages/trip-details.tsx";
  const READYMADE = "client/src/pages/ready-made-detail.tsx";
  const CHAT = "client/src/pages/chat.tsx";
  const EXPERIENCES = "client/src/pages/experiences.tsx";
  const STOREFRONT = "client/src/pages/storefront.tsx";

  cases.push(
    ["D13 · a door passing its required key passes", () => req(TEMPLATE, doorAlias).length === 0],
    ["D13 · the SAME door passing nothing FAILS", () => req(TEMPLATE, doorBare).some((e) => e.includes("does not pass `experienceSlug`"))],
    ["D13 · shorthand `{ destination }` counts as passing it", () => passesField(sourceRegions(doorShorthand), "destination")],
    ["D13 · a JSX prop (`city={...}`) counts — the ruled IntakePanel shape", () => req(EXPERIENCES, doorProp).length === 0],
    ["D13 · a PlanEntryCta source literal counts", () => req(READYMADE, doorCta).length === 0],
    ["D13 · a bare PlanEntryCta where a city IS required FAILS", () => req(READYMADE, doorCtaBare).some((e) => e.includes("does not pass `city`"))],
    ["D13 · a conditional source counts", () => req(CHAT, doorCtaConditional).length === 0],
    // The whole reason regions exist rather than a whole-file grep.
    ["D13 · a key in a TYPE or a filter is NOT a door passing it", () => req(CHAT, decoy).some((e) => e.includes("does not pass `tripId`"))],
    // The §13 half: two doors are ruled to pass NO city, and inventing one must fail.
    ["D13 · the ticker passing NO city passes", () => req(TICKER, doorBare).length === 0],
    ["D13 · the ticker passing a city FAILS (§13 — eight markets, no single one)", () => req(TICKER, 'const { open: openPlanning } = usePlanning();\nonClick={() => openPlanning({ city: markets[0].cityName })}').some((e) => e.includes("ruled NOT to pass"))],
    ["D13 · a bare storefront CTA passes", () => req(STOREFRONT, doorCtaBare).length === 0],
    ["D13 · the storefront forwarding earner.location as a city FAILS", () => req(STOREFRONT, '<PlanEntryCta source={{ city: earner.location }} />').some((e) => e.includes("ruled NOT to pass"))],
    ["D13 · a surface with a requirement and NO opener at all fails loudly", () => req(DETAILS, "export default function P(){ return <div/>; }").some((e) => e.includes("NO opener call"))],
    ["D13 · a missing required-field file fails loudly", () => checkSourceFields({}).some((e) => e.includes("REQUIRED_SOURCE_FIELDS"))],
    // `open(` alone must not be the token: window.open and setOpen are not planning doors.
    ["D13 · window.open is not a planning opener", () => sourceRegions('window.open("https://x.example/?city=Kyoto");').length === 0],
  );

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
  // Both lists — an ENTRY_SURFACES row and a REQUIRED_SOURCE_FIELDS row are independent (a door
  // that is not a browse surface, like the ticker rail, appears only in the second).
  for (const s of [...ENTRY_SURFACES, ...REQUIRED_SOURCE_FIELDS]) {
    if (files[s.file] !== undefined) continue;
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
  console.log(
    `planning-entry guard: OK — ${ENTRY_SURFACES.length} browse surfaces each offer a plan entry; ` +
      `${REQUIRED_SOURCE_FIELDS.length} doors pass what they hold (Locked Decision 42 D13).`,
  );
}

main();
