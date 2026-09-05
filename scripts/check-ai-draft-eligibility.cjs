#!/usr/bin/env node
/**
 * check-ai-draft-eligibility.cjs — every free-AI-draft writer consults the ONE eligibility
 * predicate.
 *
 * CLAUDE.md Locked Decision 41 (b); ledger `2026-09-05-draft-only-on-empty`; §18 rule 1
 * ("one implementation, N callers") and §18d (a guard states its negative space and ships with
 * committed `--self-test` fixtures). Node built-ins only — no npm ci, no DB, so it runs as a fast
 * standalone CI job.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The free AI draft writes a plan onto a trip by DELETING what is there and inserting a fresh set
 * (`saveGeneratedItinerarySnapshot`'s rebuild delete; the Claude Regenerate wipe in
 * `server/routes.ts`). Against an EXISTING slip that is a free re-optimize — the product the paid
 * Optimize rail sells — and the traveler's own plan is what it overwrites. The ruling: the free
 * draft runs only on an EMPTY slip.
 *
 * A rule enforced in three handlers is worth nothing if a fourth writer can be added tomorrow.
 * Nothing fails when one is: the new handler simply works, silently doing the thing the ruling
 * forbids, and no log, test or type says so. This is the thing that fails.
 *
 * THE RULE
 * ────────
 *   A non-test file under `server/` that WRITES an AI draft onto a trip — it calls
 *   `saveGeneratedItinerarySnapshot(`, or it performs a rebuild delete via
 *   `itineraryItemRebuildDeletable(` — must, in the SAME file, also call the eligibility
 *   predicate: `resolveAiDraftEligibility(` or `assertAiDraftEligible(`.
 *
 *   The predicate module itself is checked for VACUITY: if `server/services/ai-draft-eligibility.ts`
 *   stops exporting both names, this guard would pass over a tree where the rule is unenforceable,
 *   so that is a failure too.
 *
 *   EXEMPTIONS are explicit, few, and PRINTED ON EVERY RUN — pass or fail (ruling 32's second
 *   disposition, as applied by `check-public-user-id`): a filed exemption must not become a silent
 *   baseline.
 *
 * NEGATIVE SPACE — what this guard does NOT cover (§18d: green means green-within-stated-bounds)
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 *   • It is FILE-SCOPED, not handler-scoped. A module that calls the predicate in one handler and
 *     writes a draft from ANOTHER handler passes. Handler scoping needs a parser; the file scope
 *     is what a text guard can assert honestly.
 *   • It says nothing about ORDER. Calling the predicate AFTER the model call — so a refused
 *     request still burns tokens — passes here. That placement is a review question and is
 *     stated in each call site's comment, not machine-checked.
 *   • It says nothing about the RESPONSE: not the 409, not the `slip_has_items` code, not the
 *     body shape, and not whether the refusal is surfaced to anyone. The route contract is proven
 *     by `server/__tests__/ai-draft-eligibility.test.ts`, not here.
 *   • It says nothing about CORRECTNESS of the predicate — whether "empty" counts the right rows
 *     is the pure test's question.
 *   • It is a TEXT scan over comment-stripped source. A call reached through a variable, a
 *     re-export under another name, a dynamic `import()` bound to a local, or a raw
 *     `DELETE FROM itinerary_items` that never names the rebuild guard is invisible. The raw-SQL
 *     case is the widest hole and is stated deliberately: the rebuild-guard coverage question is
 *     `check-itinerary-rebuild-guard.cjs`'s, and this guard does not duplicate it.
 *   • TEST files are exempt by design — a fixture drives the snapshot rail directly to prove what
 *     it does.
 *   • The PAID rails are out of scope entirely and are not exemptions, because they never match
 *     the predicate: the optimizer (`generateOptimizedItineraries`), apply-to-trip and adopt-stop
 *     insert optimizer-authored items without a rebuild delete and without the snapshot.
 *   • Client code is out of scope; the client cannot write these rows.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SERVER_DIR = path.join(ROOT, "server");

/** The ONE predicate module, and the two names a caller may use. */
const PREDICATE_FILE = "server/services/ai-draft-eligibility.ts";
const PREDICATE_CALLS = ["resolveAiDraftEligibility(", "assertAiDraftEligible("];

/** "This file writes an AI draft onto a trip." */
const DRAFT_WRITE_MARKERS = [
  { name: "snapshot re-apply", token: "saveGeneratedItinerarySnapshot(" },
  { name: "rebuild delete", token: "itineraryItemRebuildDeletable(" },
];

/**
 * Explicit exemptions. Each carries the REASON it is exempt, printed on every run.
 * An exemption is a claim about the call site that a reader can check — not a mute button.
 */
const EXEMPTIONS = {
  "server/services/occasion-drafts.service.ts":
    "Plus occasion-draft scheduler (CLAUDE.md Locked Decision 26). It calls the snapshot with " +
    "`tripId: null` on every run — it MINTS a new plan and never re-applies onto an existing " +
    "one — so the predicate could only ever answer `new_trip`. Exempt because there is no slip " +
    "to be non-empty, not because the rule is waived.",
  "server/services/itinerary-rebuild-guard.ts":
    "The rebuild-guard predicate's own DEFINITION. It names the token because it exports it; it " +
    "writes nothing and touches no trip.",
};

/** Directories never scanned. */
const EXCLUDED_DIR_NAMES = new Set(["__tests__", "node_modules", "migrations"]);

function isTestPath(relPath) {
  return relPath.includes("/__tests__/") || /\.(test|spec)\.tsx?$/.test(relPath);
}

/**
 * Strip comments so a token NAMED in prose is not read as a call. `server/storage.ts` mentions
 * `itineraryItemRebuildDeletable()` twice in `//` comments, which is exactly the false positive
 * this prevents.
 *
 * IT IS DELIBERATELY LINE-BASED AND CONSERVATIVE. The obvious implementation — a global
 * `/\/\*[\s\S]*?\*\//` — was tried first and is WRONG on this codebase: a `*​/` or `/​*`
 * appearing inside a line comment or a regex literal opens or closes a phantom block, and on
 * `server/routes/content.routes.ts` (5,000+ lines) it swallowed the region containing BOTH real
 * `saveGeneratedItinerarySnapshot(` calls — a silent FALSE PASS, which is the one failure mode
 * this guard exists to prevent. So a block comment is recognised only in its JSDoc shape: a line
 * whose first non-space characters are `/*`, through the line that closes it. An inline
 * `/* … *​/` in the middle of a line of code is LEFT ALONE, and a token inside a string literal
 * is left alone too — both are the safe direction, because a false FAILURE is loud and
 * correctable while a false pass is invisible.
 */
function stripComments(text) {
  const out = [];
  let inBlock = false;
  for (const rawLine of text.split("\n")) {
    let line = rawLine;
    if (inBlock) {
      const close = line.indexOf("*/");
      if (close === -1) {
        out.push("");
        continue;
      }
      inBlock = false;
      line = line.slice(close + 2);
    }
    const trimmed = line.trimStart();
    if (trimmed.startsWith("/*")) {
      const close = line.indexOf("*/", line.indexOf("/*") + 2);
      if (close === -1) {
        inBlock = true;
        out.push("");
        continue;
      }
      line = line.slice(close + 2);
    }
    out.push(line.replace(/\/\/.*$/, ""));
  }
  return out.join("\n");
}

/** The predicate, over a map of { relPath: fileText }. Pure, so fixtures can drive it. */
function check(files) {
  const errors = [];
  const exemptionsApplied = [];
  let predicateSeen = false;
  let predicateExportsBoth = false;

  for (const [relPath, rawText] of Object.entries(files)) {
    if (isTestPath(relPath)) continue;
    const text = stripComments(rawText);

    if (relPath === PREDICATE_FILE) {
      predicateSeen = true;
      predicateExportsBoth =
        /export\s+async\s+function\s+resolveAiDraftEligibility\b/.test(text) &&
        /export\s+async\s+function\s+assertAiDraftEligible\b/.test(text);
      continue;
    }

    const writes = DRAFT_WRITE_MARKERS.filter((m) => text.includes(m.token));
    if (writes.length === 0) continue;

    if (Object.prototype.hasOwnProperty.call(EXEMPTIONS, relPath)) {
      exemptionsApplied.push({ relPath, reason: EXEMPTIONS[relPath], kinds: writes.map((w) => w.name) });
      continue;
    }

    const consults = PREDICATE_CALLS.some((call) => text.includes(call));
    if (!consults) {
      errors.push(
        `${relPath} — writes an AI draft onto a trip (${writes.map((w) => w.name).join(", ")}) ` +
          `but never calls the eligibility predicate. The free AI draft runs only on an EMPTY slip: ` +
          `call resolveAiDraftEligibility(tripId) BEFORE the model call and refuse a non-empty slip ` +
          `with the 409, or — if this really is a new-trip-only mint — add it to EXEMPTIONS in ` +
          `scripts/check-ai-draft-eligibility.cjs with the reason.`,
      );
    }
  }

  if (!predicateSeen) {
    errors.push(
      `The predicate module was not scanned at all — ${PREDICATE_FILE} is missing. Refusing to ` +
        `pass: this guard would then be green over a tree where the rule cannot be enforced.`,
    );
  } else if (!predicateExportsBoth) {
    errors.push(
      `${PREDICATE_FILE} no longer exports BOTH resolveAiDraftEligibility and assertAiDraftEligible. ` +
        `Either the predicate moved (update this script in the same change) or the two-layer check ` +
        `lost a layer — both are failures, not a vacuous pass.`,
    );
  }

  return { errors, exemptionsApplied };
}

/** Every `.ts`/`.tsx` under server/, relative to the repo root. */
function collectServerFiles() {
  const out = {};
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (EXCLUDED_DIR_NAMES.has(entry.name)) continue;
        walk(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        out[path.relative(ROOT, full).split(path.sep).join("/")] = fs.readFileSync(full, "utf8");
      }
    }
  };
  walk(SERVER_DIR);
  return out;
}

// ── committed self-test fixtures (§18d: a predicate change ships with fixtures) ─────────────────
const PREDICATE_OK = [
  "export async function resolveAiDraftEligibility(tripId, exec = db) {",
  "  if (!tripId) return { eligible: true, reason: 'new_trip' };",
  "}",
  "export async function assertAiDraftEligible(tripId, exec = db) {",
  "  const v = await resolveAiDraftEligibility(tripId, exec);",
  "}",
].join("\n");

const ROUTE_GATED = [
  'import { resolveAiDraftEligibility } from "../services/ai-draft-eligibility";',
  "const verdict = await resolveAiDraftEligibility(tripId);",
  "if (!verdict.eligible) return res.status(409).json(aiDraftRefusalBody(verdict));",
  "const snapshot = await saveGeneratedItinerarySnapshot({ userId, tripId });",
].join("\n");

const ROUTE_UNGATED = [
  "const snapshot = await saveGeneratedItinerarySnapshot({ userId, tripId });",
].join("\n");

const REBUILD_UNGATED = [
  "await db.delete(itineraryItems).where(and(eq(itineraryItems.tripId, id), itineraryItemRebuildDeletable()));",
].join("\n");

const REBUILD_GATED = [
  "await assertAiDraftEligible(tripId, tx);",
  "await tx.delete(itineraryItems).where(and(eq(itineraryItems.tripId, tripId), itineraryItemRebuildDeletable()));",
].join("\n");

const COMMENT_ONLY_MENTION = [
  "// The one live rebuild-delete site is elsewhere, still carrying itineraryItemRebuildDeletable().",
  "/* saveGeneratedItinerarySnapshot( is named here in prose only. */",
  "export const nothing = 1;",
].join("\n");

const UNRELATED = [
  "export function generateOptimizedItineraries() { /* the PAID rail */ }",
  "await tx.insert(itineraryItems).values({ origin: 'ai' });",
].join("\n");

function selfTest() {
  const base = { [PREDICATE_FILE]: PREDICATE_OK, "server/routes/ok.routes.ts": ROUTE_GATED };

  const cases = [
    ["clean tree passes (predicate present, writer gated)", () => check(base).errors.length === 0],
    [
      "an ungated snapshot caller is caught",
      () =>
        check({ ...base, "server/routes/bad.routes.ts": ROUTE_UNGATED }).errors.some((e) =>
          e.includes("server/routes/bad.routes.ts") && e.includes("snapshot re-apply"),
        ),
    ],
    [
      "an ungated rebuild delete is caught",
      () =>
        check({ ...base, "server/routes/wipe.routes.ts": REBUILD_UNGATED }).errors.some((e) =>
          e.includes("rebuild delete"),
        ),
    ],
    [
      "a rebuild delete gated by assertAiDraftEligible passes",
      () => check({ ...base, "server/services/snap.service.ts": REBUILD_GATED }).errors.length === 0,
    ],
    [
      "a COMMENT-ONLY mention of either token is not a write (the storage.ts false positive)",
      () => check({ ...base, "server/some-other.ts": COMMENT_ONLY_MENTION }).errors.length === 0,
    ],
    [
      "a stray `*/` inside a LINE comment cannot swallow a real writer (the false-pass class)",
      () =>
        check({
          ...base,
          "server/routes/tricky.routes.ts": [
            "// the old regex was /\\{[\\s\\S]*\\}/ — note the */ in this sentence",
            "const snapshot = await saveGeneratedItinerarySnapshot({ userId, tripId });",
          ].join("\n"),
        }).errors.some((e) => e.includes("server/routes/tricky.routes.ts")),
    ],
    [
      "a multi-line JSDoc block naming a token is still not a call",
      () =>
        check({
          ...base,
          "server/notes.ts": [
            "/**",
            " * saveGeneratedItinerarySnapshot( is described here.",
            " * So is itineraryItemRebuildDeletable(.",
            " */",
            "export const nothing = 1;",
          ].join("\n"),
        }).errors.length === 0,
    ],
    [
      "the paid optimizer rail matches nothing and is not an exemption",
      () => check({ ...base, "server/itinerary-optimizer.ts": UNRELATED }).errors.length === 0,
    ],
    [
      "a test file may write a draft ungated",
      () =>
        check({ ...base, "server/__tests__/snapshot.db.test.ts": ROUTE_UNGATED }).errors.length === 0,
    ],
    [
      "a *.test.ts outside __tests__ is exempt too",
      () => check({ ...base, "server/routes/x.test.ts": REBUILD_UNGATED }).errors.length === 0,
    ],
    [
      "an EXEMPT file passes and is REPORTED, never silently allowed",
      () => {
        const r = check({ ...base, "server/services/occasion-drafts.service.ts": ROUTE_UNGATED });
        return (
          r.errors.length === 0 &&
          r.exemptionsApplied.some((x) => x.relPath === "server/services/occasion-drafts.service.ts")
        );
      },
    ],
    [
      "a missing predicate module fails rather than passing over an unenforceable tree",
      () => check({ "server/routes/ok.routes.ts": ROUTE_GATED }).errors.some((e) => e.includes("missing")),
    ],
    [
      "the predicate losing one of its two exports fails loudly, not vacuously",
      () =>
        check({
          [PREDICATE_FILE]: "export async function resolveAiDraftEligibility() {}",
          "server/routes/ok.routes.ts": ROUTE_GATED,
        }).errors.some((e) => e.includes("BOTH")),
    ],
    [
      "the predicate file itself is never flagged as an ungated writer",
      () =>
        !check({
          [PREDICATE_FILE]: PREDICATE_OK + "\n// saveGeneratedItinerarySnapshot(",
          "server/routes/ok.routes.ts": ROUTE_GATED,
        }).errors.some((e) => e.includes(PREDICATE_FILE + " —")),
    ],
  ];

  let failed = 0;
  for (const [name, fn] of cases) {
    let ok = false;
    try {
      ok = fn();
    } catch {
      ok = false;
    }
    console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}`);
    if (!ok) failed++;
  }
  if (failed > 0) {
    console.error(
      `\nai-draft-eligibility guard SELF-TEST FAILED — ${failed} fixture case(s). The predicate is wrong; fix it before trusting a green run.`,
    );
    process.exit(1);
  }
  console.log(`\nai-draft-eligibility guard self-test: ${cases.length}/${cases.length} fixture cases pass.`);
}

function printExemptions(applied) {
  if (applied.length === 0) return;
  console.log("\nEXEMPTIONS APPLIED (printed on every run — filed debt must not become a silent baseline):");
  for (const x of applied) {
    console.log(`  • ${x.relPath} [${x.kinds.join(", ")}]\n      ${x.reason}`);
  }
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();

  if (!fs.existsSync(SERVER_DIR)) {
    console.error("ai-draft-eligibility guard: server/ not found — refusing to pass vacuously.");
    process.exit(1);
  }

  const files = collectServerFiles();
  if (Object.keys(files).length === 0) {
    console.error("ai-draft-eligibility guard: scanned ZERO files — the walker is broken, not the tree.");
    process.exit(1);
  }

  const { errors, exemptionsApplied } = check(files);
  printExemptions(exemptionsApplied);

  if (errors.length > 0) {
    console.error("\nai-draft-eligibility guard FAILED:\n");
    for (const e of errors) console.error(`  • ${e}`);
    console.error(
      "\nThe FREE AI draft runs only on an EMPTY slip; any AI action on a slip that already holds" +
        "\nitems is Optimize and goes through the existing pay gate." +
        "\nSee CLAUDE.md Locked Decision 41 (b) / ledger 2026-09-05-draft-only-on-empty.",
    );
    process.exit(1);
  }
  console.log(
    `\nai-draft-eligibility guard: OK — every AI-draft writer under server/ consults ` +
      `${PREDICATE_FILE} (${Object.keys(files).length} files scanned, ${exemptionsApplied.length} exemption(s)).`,
  );
}

main();
