#!/usr/bin/env node
/**
 * check-doc-band-keys.cjs — a pricing document may not cite a `fee_bands` key that does not exist.
 *
 * Ledger `2026-09-25-doc-band-key-guard`; the defect it exists for is
 * `2026-09-24-pricing-map-row-keys`. Node built-ins only — no npm ci, no DB, so it runs as a
 * fast standalone CI job.
 *
 * WHY THIS EXISTS
 * ───────────────
 * `docs/design/PRICING_AND_FEATURE_MAP.md` is the RATIFIED pricing authority: §3 of the business
 * plan names it as the source for every row key, and four other documents copy from it. On
 * 2026-09-24 an audit of its whole Key column against the resolvers found that it named SIX keys
 * that do not exist anywhere in the tree — `traveler:service_fee_pct`,
 * `traveler:service_fee_cap_cents`, `provider:rails_rate`, `expert:band_*`, `provider:band_*`,
 * `optimizer:run` — plus a pair retired by Locked Decision 51 and still printed as live, and a
 * `plans:` prefix that collided with a real band namespace.
 *
 * Every one of those had been sitting in the authority for weeks, and the copies inherited them,
 * because NOTHING MECHANICAL CHECKED A DOC'S KEY AGAINST THE CODE. That is the §18d shape one
 * layer out: not a guard whose predicate is wrong, but a claim with no predicate at all — the
 * same shape as CLAUDE.md asserting a `.replit` pin for five weeks after it was deleted
 * (`2026-09-22-replit-env-vars-restored`) and the business plan selling a Trip Pass benefit for
 * three days after the code retired it (`2026-09-24-plan-v14-trip-pass-benefits`).
 *
 * THE AUTHORITY is `server/services/fee-band-requirements.ts`, which declares every band key a
 * resolver reads. This guard parses it; it never restates the list (§18 rule 1).
 *
 * THE RULES
 * ─────────
 *   1. In a scanned TEXT doc, every backticked NAMESPACED token (`ns:key`) must be a band key
 *      declared in the authority, or match a documented placeholder (`affiliate:<partner>`).
 *   2. A RETIRED band key may be cited only on a line that says so. `concierge:booking_pct` and
 *      `concierge:booking_cap_cents` are still declared as constants but were retired by
 *      migration 311 (`is_active=false`, read by nothing), so a table printing one as live is
 *      wrong in a way rule 1 cannot see — the key does exist.
 *   3. In EVERY scanned file, including the HTML mocks, a key that a ledger already corrected may
 *      not reappear. This is the regression half, and it is a literal substring test, so it
 *      carries no false-positive risk in CSS-bearing HTML.
 *
 * A line carrying `band-key-ok` is exempt from rules 2 and 3 (the house idiom, beside
 * `fee-literal-ok`, `money-derive-ok`, `public-user-id-ok`). Exemptions are PRINTED on every run,
 * pass or fail, so a filed exemption never becomes a silent baseline (ruling 32's disposition).
 *
 * CANNOT DETECT — the stated negative space (§18d). Green here means green WITHIN THESE BOUNDS:
 *
 *   · **It checks that a cited KEY exists. It never checks that a printed VALUE is right.** The
 *     worst finding of the audit that prompted this guard was the Expert-commission row printing
 *     the PROVIDER tier rates (0.12/0.08/0.06/0.04) where the resolver charges `expert_standard`
 *     0.25 — understating the platform's own take by more than half. THIS GUARD WOULD NOT HAVE
 *     CAUGHT THAT. It would have caught only the wrong key sitting beside it. Checking values
 *     means reading seeded rows, which is a different guard against a different authority.
 *   · **BARE keys are not checked** — only the `ns:key` form. `limited`, `moderate`, `premium`
 *     and `commercial` are ordinary English words, so requiring every backticked lowercase token
 *     to be a band key is unworkable. A doc inventing a bare key is invisible to rule 1.
 *   · **The file list is EXPLICIT.** A pricing document not on it is UNCHECKED, not exonerated.
 *     Adding one is a human decision.
 *   · **HTML mocks get rule 3 only.** They do not use backticks and they are full of CSS
 *     `prop:value` pairs, so rule 1's predicate cannot run there. A NEWLY invented key in a mock
 *     is invisible until someone adds it to CORRECTED_KEYS.
 *   · **It does not read migrations or the database.** A key declared in the authority but never
 *     seeded passes. That is the reachability shape `check-category-reachability.cjs` and
 *     `check-roles-needed-reachability.cjs` own, one table over.
 *   · **`docs/DECISIONS.md` and `CLAUDE.md` are deliberately NOT scanned.** They are the
 *     historical record and legitimately quote wrong and retired keys as wrong.
 */

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const AUTHORITY = "server/services/fee-band-requirements.ts";

/** Docs whose backticked `ns:key` citations are checked (rules 1 + 2 + 3). */
const TEXT_DOCS = [
  "docs/design/PRICING_AND_FEATURE_MAP.md",
  "docs/planning/business-plan-v1.4.md",
  "docs/planning/business-plan-v1.4-model.py",
  "docs/design/CONSOLE_AND_AI_CONCIERGE_BRIEF.md",
];

/** Mocks: rule 3 only — no backticks, and CSS makes rule 1's predicate unusable here. */
const MOCK_DOCS = [
  "docs/design/pricing-surfaces-mock.html",
  "docs/design/landing-earn-mock.html",
  "docs/design/landing-earn-mock-v2.5.html",
];

/** Documented placeholders — a doc naming the SHAPE of a per-partner key, not a key. */
const PLACEHOLDERS = [/^affiliate:<[a-zA-Z]+>$/, /^[a-z_]+:\*$/];

/**
 * Declared but RETIRED (rule 2). The value is the ledger that retired it.
 * A citing line must say "retired" or carry `band-key-ok`.
 */
const RETIRED_KEYS = {
  "concierge:booking_pct": "2026-09-18-concierge-fee-cap-split (migration 311)",
  "concierge:booking_cap_cents": "2026-09-18-concierge-fee-cap-split (migration 311)",
};

/** Corrected by a ledger and never to return (rule 3) → what it should be. */
const CORRECTED_KEYS = {
  "traveler:service_fee_pct": "traveler_service_fee",
  "traveler:service_fee_cap_cents": "traveler_service_fee (the cap is its own max_amount)",
  "provider:rails_rate": "provider_rails",
  "expert:band_": "expert_standard / expert_new (no tiered expert bands exist)",
  "provider:band_": "limited / moderate / commercial / premium",
  "optimizer:run": "the optimization_fees table via getFee() — not a fee_bands key",
  "plans:trip_pass": "plans.trip_pass (a plans TABLE row, not a band)",
  "plans:plus_annual": "plans.plus_annual (a plans TABLE row, not a band)",
  "plans:pro_monthly": "plans.pro_monthly (a plans TABLE row, not a band)",
};

const EXEMPT = "band-key-ok";

/** Parse the authority for every declared band key. Never restates the list (§18 rule 1). */
function declaredKeys(authoritySrc) {
  const keys = new Set();
  for (const m of authoritySrc.matchAll(/export const [A-Z0-9_]+\s*(?::[^=]+)?=\s*"([^"]+)"/g)) {
    keys.add(m[1]);
  }
  const arr = authoritySrc.match(/COMMISSION_CATEGORY_BAND_KEYS\s*=\s*\[([\s\S]*?)\]/);
  if (arr) for (const m of arr[1].matchAll(/"([^"]+)"/g)) keys.add(m[1]);
  return keys;
}

/**
 * @param {string} authoritySrc  contents of the authority file
 * @param {Array<[string,string,'text'|'mock']>} files  [path, contents, kind]
 * @returns {{errors: string[], exemptions: string[]}}
 */
function check(authoritySrc, files) {
  const declared = declaredKeys(authoritySrc);
  const errors = [];
  const exemptions = [];

  if (declared.size === 0) {
    errors.push(`${AUTHORITY}: no band keys parsed — the authority moved or its shape changed. Refusing to pass vacuously.`);
    return { errors, exemptions };
  }

  for (const [file, src, kind] of files) {
    src.split("\n").forEach((line, i) => {
      const at = `${file}:${i + 1}`;
      const exempt = line.includes(EXEMPT);
      if (exempt) exemptions.push(`${at}: ${EXEMPT}`);

      // Rule 3 — corrected keys, literal, every file kind.
      for (const [bad, right] of Object.entries(CORRECTED_KEYS)) {
        if (line.includes(bad) && !exempt) {
          errors.push(`${at}: cites \`${bad}\`, corrected by a ledger. Use ${right}.`);
        }
      }

      if (kind !== "text") return;

      for (const m of line.matchAll(/`([a-z_]+:[a-zA-Z_<>*]+)`/g)) {
        const key = m[1];
        if (PLACEHOLDERS.some((re) => re.test(key))) continue;

        // Rule 1 — must be declared.
        if (!declared.has(key)) {
          if (!Object.keys(CORRECTED_KEYS).some((bad) => key.startsWith(bad)) && !exempt) {
            errors.push(`${at}: cites \`${key}\`, which ${AUTHORITY} does not declare.`);
          }
          continue;
        }

        // Rule 2 — declared, but retired.
        if (RETIRED_KEYS[key] && !/retired/i.test(line) && !exempt) {
          errors.push(`${at}: cites \`${key}\` as live; it was retired by ${RETIRED_KEYS[key]}. Say "retired" on the line, or use the live band.`);
        }
      }
    });
  }
  return { errors, exemptions };
}

// ── committed self-test fixtures (§18d: a predicate change ships with fixtures) ─────────────────
const FIX_AUTHORITY = [
  'export const TRAVELER_SERVICE_FEE_BAND = "traveler_service_fee";',
  'export const CONCIERGE_AI_TASK_BAND = "concierge:ai_task";',
  'export const CONCIERGE_BOOKING_PERCENT_BAND = "concierge:booking_pct";',
  'export const PROVIDER_PRO_BAND_STEP = "provider:pro_band_step";',
  'export const COMMISSION_CATEGORY_BAND_KEYS = [',
  '  "activities",',
  '  "transport",',
  '] as const;',
].join("\n");

const t = (body) => [["doc.md", body, "text"]];
const mock = (body) => [["mock.html", body, "mock"]];

function selfTest() {
  const cases = [
    ["a declared key passes", () => check(FIX_AUTHORITY, t("fee | `concierge:ai_task` | $2.99")).errors.length === 0],
    [
      "an undeclared namespaced key is caught (rule 1)",
      () => check(FIX_AUTHORITY, t("fee | `traveler:made_up_thing` | 7%")).errors.some((e) => e.includes("does not declare")),
    ],
    [
      "a documented placeholder passes (rule 1)",
      () => check(FIX_AUTHORITY, t("per partner | `affiliate:<partner>` | 4-12%")).errors.length === 0,
    ],
    [
      "a wildcard reference passes (rule 1)",
      () => check(FIX_AUTHORITY, t("the `concierge:*` family")).errors.length === 0,
    ],
    [
      "a retired key printed as live is caught (rule 2)",
      () => check(FIX_AUTHORITY, t("| `concierge:booking_pct` | 5% | new |")).errors.some((e) => e.includes("as live")),
    ],
    [
      "a retired key named as retired passes (rule 2)",
      () => check(FIX_AUTHORITY, t("| `concierge:booking_pct` (retired duplicate, kept) | 5% |")).errors.length === 0,
    ],
    [
      "a ledger-corrected key is caught in a TEXT doc (rule 3)",
      () => check(FIX_AUTHORITY, t("| `traveler:service_fee_pct` | 0.07 |")).errors.some((e) => e.includes("corrected by a ledger")),
    ],
    [
      "a ledger-corrected key is caught in an HTML MOCK with no backticks (rule 3)",
      () => check(FIX_AUTHORITY, mock('<div class="k">rows: provider:rails_rate</div>')).errors.some((e) => e.includes("provider_rails")),
    ],
    [
      "CSS in a mock raises nothing (rule 3 is a literal test)",
      () => check(FIX_AUTHORITY, mock('<div style="font:400 10px var(--mono);color:var(--x)">hi</div>')).errors.length === 0,
    ],
    [
      "rule 1 does not run on a mock (no backticks, CSS everywhere)",
      () => check(FIX_AUTHORITY, mock("<div>margin:0 and padding:0</div>")).errors.length === 0,
    ],
    [
      "band-key-ok exempts a line and is REPORTED",
      () => {
        const r = check(FIX_AUTHORITY, t("we used to name `traveler:service_fee_pct` <!-- band-key-ok: quoted as wrong -->"));
        return r.errors.length === 0 && r.exemptions.length === 1;
      },
    ],
    [
      "a bare key is NOT checked — stated negative space",
      () => check(FIX_AUTHORITY, t("| `totally_invented_bare_key` | 9% |")).errors.length === 0,
    ],
    [
      "an authority that parses to nothing FAILS rather than passing vacuously",
      () => check("// the shape changed\n", t("`concierge:ai_task`")).errors.some((e) => e.includes("vacuously")),
    ],
    [
      "the authority's category array is parsed too",
      () => declaredKeys(FIX_AUTHORITY).has("activities") && declaredKeys(FIX_AUTHORITY).has("transport"),
    ],
  ];

  let failed = 0;
  for (const [name, fn] of cases) {
    let ok = false;
    try { ok = fn(); } catch (e) { ok = false; }
    if (!ok) { failed++; console.error(`  ✗ ${name}`); }
  }
  if (failed > 0) {
    console.error(`\ndoc-band-keys guard self-test: ${failed}/${cases.length} fixture case(s) FAILED.`);
    process.exit(1);
  }
  console.log(`doc-band-keys guard self-test: ${cases.length}/${cases.length} fixture cases pass.`);
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();

  const authorityPath = path.join(REPO, AUTHORITY);
  if (!fs.existsSync(authorityPath)) {
    console.error(`doc-band-keys: authority missing at ${AUTHORITY}. Refusing to pass.`);
    process.exit(1);
  }
  const authoritySrc = fs.readFileSync(authorityPath, "utf8");

  const files = [];
  for (const [list, kind] of [[TEXT_DOCS, "text"], [MOCK_DOCS, "mock"]]) {
    for (const rel of list) {
      const p = path.join(REPO, rel);
      if (!fs.existsSync(p)) {
        console.error(`doc-band-keys: scanned file missing: ${rel}. Update the list deliberately.`);
        process.exit(1);
      }
      files.push([rel, fs.readFileSync(p, "utf8"), kind]);
    }
  }

  const { errors, exemptions } = check(authoritySrc, files);

  // Exemptions are printed on every run, pass or fail (ruling 32's disposition).
  if (exemptions.length) {
    console.log(`doc-band-keys: ${exemptions.length} exemption(s) in force:`);
    for (const e of exemptions) console.log(`  · ${e}`);
  }

  if (errors.length) {
    console.error(`\ndoc-band-keys: ${errors.length} problem(s).\n`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    console.error(`\nThe authority is ${AUTHORITY}. A cited key must be declared there.`);
    console.error(`This guard checks KEYS, never printed VALUES — see its CANNOT DETECT block.`);
    process.exit(1);
  }

  console.log(`doc-band-keys OK — ${files.length} file(s), ${declaredKeys(authoritySrc).size} declared band keys.`);
}

main();
