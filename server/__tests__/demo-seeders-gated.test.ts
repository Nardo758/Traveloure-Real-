/**
 * demo-seeders-gated.test.ts — ledger `2026-09-19-demo-seeders-gated`,
 * `2026-09-20-admin-test-account-not-in-prod`, `2026-09-20-california-demo-seed-gated`,
 * `2026-09-20-cli-demo-seeders-gated`.
 *
 * `server/seeds/phase-d-kyoto-vendors.seed.ts` inserted nine FICTIONAL businesses
 * (contact fields on the reserved `*.traveloure.test` domain, fabricated phone
 * numbers) as `provider_services` rows with `approvalStatus: "approved"` /
 * `status: "active"` — publicly bookable — and `server/index.ts` called
 * `seedPhaseDKyotoVendors()` unconditionally at boot, production included. A
 * traveler could pay real money to book a business that does not exist: exactly
 * the §13 lie CLAUDE.md's honesty rule forbids. The same sweep found a second,
 * ungated instance of the identical class in `server/seed-expert-services.ts`:
 * `seedMockExperts()` (fictional `@example.com` experts born
 * `localExpertForms.status: "approved"`) and `seedProviderServices()`
 * (fabricated generic listings attached to WHATEVER ROW HAPPENS TO BE `users[0]`
 * in the target database).
 *
 * The fix is ONE predicate, `demoSeedsAllowed()`
 * (server/seeds/lib/demo-seed-gate.ts, itself delegating to the codebase's
 * existing canonical `isProdStrictEnv` — §18 rule 1: one implementation of
 * "what counts as production", never a second copy), applied in TWO layers
 * (§18 "two layers" placement): the server/index.ts call site, and a second,
 * independent refusal inside each seeder itself (so the seeder is safe even
 * when imported and called directly, e.g. `tsx server/seeds/<file>.seed.ts`).
 *
 * WHAT THIS FILE PROVES (no database — pure, static):
 *   G1-G4 — `demoSeedsAllowed()` fixture behavior: refuses a prod-strict boot,
 *           allows dev/test, and honors the SAME ALLOW_TEST_ACCOUNTS=1 CI escape
 *           hatch `isProdStrictEnv` already defines (never a second rule).
 *   D1    — every export server/index.ts imports from a DEMO/FICTIONAL seed
 *           module (derived below, not hand-listed) that IS ALSO CALLED in
 *           server/index.ts is called from inside an `if (demoSeedsAllowed())`
 *           block — proven by parsing server/index.ts, not by re-typing a list
 *           of file names here (a hand-typed list is the derivation-drift shape
 *           §18 rule 1 forbids: it would still be green the day a NEW ungated
 *           demo seeder is added, because nothing would have re-derived it).
 *   D2    — every EXEMPTION from D1 carries a printed, reviewable reason (the
 *           `fee-literal-debt` / `public-user-id-ok` convention: an exemption
 *           that is never re-read becomes a silent baseline).
 *   P1-P6 — self-test of the PARSER itself, against synthetic fixture source
 *           strings, never real files: an ungated demo call MUST fail, a call
 *           gated by `if (!demoSeedsAllowed())` (backwards) MUST also fail, and
 *           a properly gated call — including one nested inside `try {}` the
 *           way every real call site here is — MUST pass. A checker that only
 *           ever sees real, already-fixed files cannot prove it would have
 *           caught the bug; these fixtures are what prove that (§18d).
 *   S1    — phase-d-kyoto-vendors.seed.ts refuses to insert when the gate says
 *           no, even called directly (the second §18 layer), asserted from its
 *           OWN source text (no DB import needed for a static proof).
 *   CR1-2 — ledger `2026-09-20-admin-test-account-not-in-prod`: server/routes/
 *           content.routes.ts's `seedDatabase()` is called from server/routes.ts,
 *           not server/index.ts, so it sits outside D1's scanned file set by
 *           construction (see negative space below). Targeted static pins prove
 *           BOTH of its branches are gated: the "always ensure
 *           admin@traveloure.test" block (now `if (demoSeedsAllowed())`) and the
 *           pre-existing help-guide/`admin@traveloure.com` dummy-user block
 *           (the early-return `if (!demoSeedsAllowed()) return;` guard).
 *   SCF1  — ledger `2026-09-20-california-demo-seed-gated`: `scripts/seed-
 *           california-full.ts` is a hand-run script (never imported by
 *           server/index.ts), so it too sits outside D1's scanned file set by
 *           construction — the exact "manual seed script" gap the negative
 *           space below used to name as unfixed debt. A targeted static pin
 *           proves its own refusal (the same `if (!demoSeedsAllowed())` second
 *           layer S1/S1b prove for the boot-path seeders) runs before its
 *           first `db.execute` call.
 *   CLI1-2 — ledger `2026-09-20-cli-demo-seeders-gated`: the CLI-only demo
 *           seeders under server/seeds/ that `2026-09-19-demo-seeders-gated`
 *           recorded as found-but-not-fixed debt — phase-4-kyoto-fill (fabricated
 *           services on a HARDCODED demo-provider id) and the four-file
 *           `npm run seed:beta` family (16 fictional experts on the REAL
 *           traveloure.com domain, 40+ services, 70+ reviews, 45 bookings,
 *           influencer content). They live in `candidateSeedFiles()`'s file set
 *           but server/index.ts never imports them, so D1 skips them by
 *           construction; CLI1 pins each one's own refusal ahead of its first
 *           data-creating call and CLI2 pins that it uses the SHARED predicate
 *           rather than a second copy — the SCF1 approach (a targeted pin),
 *           never a widening of D1's scope.
 *
 * STATED NEGATIVE SPACE (§18d):
 *   - The DEMO/FICTIONAL file-set derivation (see `candidateSeedFiles` /
 *     `isDemoFictionalExport` below) scans every top-level `.ts` file directly
 *     under `server/seeds/`, plus every top-level `server/seed*.ts` sibling
 *     (which is how `server/seed-expert-services.ts` is reached — one directory
 *     up from `server/seeds/`, but the SAME defect class). A demo/fictional
 *     seeder living in a subdirectory, or under a completely unrelated file
 *     name that names or describes nothing fictional in its own function body,
 *     is invisible to this derivation.
 *   - D1 only checks modules server/index.ts actually IMPORTS AND CALLS. A
 *     demo/fictional seeder that is never wired into the boot path (e.g. a
 *     manual `tsx server/seeds/<file>.seed.ts` / `npm run seed:*` script) is
 *     out of this test's scope — it was never part of the boot-time defect.
 *     `scripts/seed-california-full.ts` was one of these (closed by SCF1), and
 *     the rest of that recorded debt is closed by CLI1/CLI2 over the
 *     `CLI_ONLY_DEMO_SEEDERS` table — each by its own targeted static pin,
 *     never by widening D1's file set (D1 stays scoped to server/seeds/ and
 *     server/seed*.ts, per the bullet above). THAT TABLE IS HAND-MAINTAINED,
 *     and that is this test's sharpest limit: a NEW CLI-only demo seeder is
 *     invisible until somebody adds a row to it. It is hand-maintained on
 *     purpose — a derivation would have to decide "is this file demo content?"
 *     for files no boot path reaches, and `phase-4b-kyoto-city-intelligence
 *     .seed.ts` is the case that shows why a keyword rule would get it wrong:
 *     it seeds REAL editorial Kyoto city content and is deliberately NOT gated
 *     (gating it would block market-launch content, §13 in the other
 *     direction). Adding a seeder here is a human decision; absence from this
 *     table is unchecked, not exonerated.
 *   - The gating parser (`isCallGated`) recognizes exactly the
 *     `if (demoSeedsAllowed())` shape this lane's fix uses (an exact,
 *     trimmed-condition match, walking outward through any number of
 *     intervening non-`if` blocks such as `try {}`). A gate expressed a
 *     different way — a ternary, an early `return`, a different predicate name
 *     — would not be recognized and would read as ungated.
 *
 * Run: npx tsx --test server/__tests__/demo-seeders-gated.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { demoSeedsAllowed } from "../seeds/lib/demo-seed-gate";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const SERVER_DIR = path.join(ROOT, "server");
const SEEDS_DIR = path.join(SERVER_DIR, "seeds");
const INDEX_TS = path.join(SERVER_DIR, "index.ts");
const PHASE_D_FILE = path.join(SEEDS_DIR, "phase-d-kyoto-vendors.seed.ts");
const CONTENT_ROUTES_FILE = path.join(SERVER_DIR, "routes", "content.routes.ts");
const SEED_CALIFORNIA_FULL_FILE = path.join(ROOT, "scripts", "seed-california-full.ts");

/**
 * CLI-only demo seeders (ledger `2026-09-20-cli-demo-seeders-gated`). Each lives
 * under server/seeds/ — so it IS in `candidateSeedFiles()`'s file set — but is
 * never imported by server/index.ts, so D1 (which only checks modules the boot
 * path imports AND calls) skips it by construction. These are the seeders the
 * `2026-09-19-demo-seeders-gated` row recorded as found-but-not-fixed debt.
 * Each entry names the file, the function, and the FIRST DATA-CREATING
 * expression the refusal must precede (a `db.insert(` for the seeders
 * themselves; for the run-beta-seed orchestrator it is its first call into a
 * seeder, which is the write it authorizes) — pinned the way SCF1 pins
 * scripts/seed-california-full.ts, rather than by widening D1's scope.
 */
const CLI_ONLY_DEMO_SEEDERS: ReadonlyArray<{
  file: string;
  fn: string;
  firstWrite: string;
}> = [
  { file: "phase-4-kyoto-fill.seed.ts", fn: "seedPhase4KyotoFill", firstWrite: "db.insert(" },
  { file: "beta-launch-data.ts", fn: "seedBetaData", firstWrite: "db.insert(" },
  { file: "beta-data-extended.ts", fn: "seedExpertServices", firstWrite: "db.insert(" },
  { file: "beta-reviews-bookings.ts", fn: "seedReviewsAndBookings", firstWrite: "db.insert(" },
  { file: "beta-reviews-bookings.ts", fn: "seedInfluencerContent", firstWrite: "db.insert(" },
  { file: "run-beta-seed.ts", fn: "runBetaSeed", firstWrite: "seedBetaData(" },
];

// ─── The predicate under test: name pattern OR content pattern (§13 markers) ──
const NAME_MARKER = /demo|mock|fictional/i;
const CONTENT_MARKER = /traveloure\.test|@example\.com|\bmock\b|\bdemo\b|\bfictional\b/i;

function listTopLevelTsFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".ts"))
    .map((e) => path.join(dir, e.name));
}

/** The FILE SET this predicate scans — see the header's stated negative space. */
function candidateSeedFiles(): string[] {
  return [
    ...listTopLevelTsFiles(SEEDS_DIR),
    ...listTopLevelTsFiles(SERVER_DIR).filter((f) => /^seed/.test(path.basename(f))),
  ];
}

/**
 * Extracts one function's own body text — `async function NAME(...) { ... }`,
 * with or without a leading `export` — by brace-depth counting from its first
 * `{`. Deliberately scopes classification to the FUNCTION'S OWN body rather
 * than the whole file: a module-level data array declared elsewhere in the
 * same file (real curated content sitting beside a genuinely fictional mock
 * array, as in server/seed-expert-services.ts) must not taint an unrelated
 * function's classification, and a module-level string that merely contains
 * the word "fictional" in unrelated prose (found in
 * popular-cities-content.seed.ts, describing a real bar's real drink names)
 * must not either.
 */
function findFunctionBody(source: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:export\\s+)?async\\s+function\\s+${escaped}\\s*\\(`);
  const m = re.exec(source);
  if (!m) return null;

  // Find the parameter list's matching ')' first — several of these seeders declare an
  // inline return type, e.g. `(): Promise<{ vendorsInserted: number; ... }>`, whose OWN
  // `{`/`}` would otherwise be mistaken for the function body by a naive "first brace"
  // scan (found while writing this test: it silently returned the return-type annotation
  // instead of the real body for seedPhaseDKyotoVendors, making S1 pass vacuously). So the
  // body's opening brace is the first `{` reached, after the parameter list closes, while
  // a separate depth counter over `<`, `(`, `[` is at zero — which skips exactly the
  // `Promise<{ ... }>` shape without needing a real type parser.
  const parenStart = source.indexOf("(", m.index);
  if (parenStart === -1) return null;
  let pdepth = 0;
  let afterParams = -1;
  for (let i = parenStart; i < source.length; i++) {
    if (source[i] === "(") pdepth++;
    else if (source[i] === ")") {
      pdepth--;
      if (pdepth === 0) {
        afterParams = i + 1;
        break;
      }
    }
  }
  if (afterParams === -1) return null;

  let typeDepth = 0;
  let braceStart = -1;
  for (let j = afterParams; j < source.length; j++) {
    const ch = source[j];
    if (ch === "<" || ch === "(" || ch === "[") typeDepth++;
    else if (ch === ">" || ch === ")" || ch === "]") typeDepth--;
    else if (ch === "{" && typeDepth === 0) {
      braceStart = j;
      break;
    }
  }
  if (braceStart === -1) return null;

  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(braceStart, i + 1);
    }
  }
  return null;
}

function isDemoFictionalExport(source: string, exportName: string): boolean {
  if (NAME_MARKER.test(exportName)) return true;
  const body = findFunctionBody(source, exportName);
  if (!body) return false;
  return CONTENT_MARKER.test(body);
}

// ─── Parsing server/index.ts's named imports, generically ────────────────────
interface NamedImport {
  names: string[];
  fromPath: string;
}

function parseNamedImports(source: string): NamedImport[] {
  const results: NamedImport[] = [];
  const re = /import\s*\{([^}]+)\}\s*from\s*["'](\.[^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const names = m[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.split(/\s+as\s+/i)[0].trim());
    results.push({ names, fromPath: m[2] });
  }
  return results;
}

function resolveImportPath(fromFile: string, importPath: string): string | null {
  const base = path.resolve(path.dirname(fromFile), importPath);
  const candidates = [base.endsWith(".ts") ? base : `${base}.ts`, path.join(base, "index.ts")];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

// ─── Finding a call site and checking its enclosing `if` (generic, no AST) ───
/**
 * Walks backward from `pos`, brace-depth counting, to find the innermost
 * enclosing `{ ... }` block containing it. Returns the block's opening-brace
 * index, its introducing keyword (e.g. "if", "try", "else", "function" — the
 * identifier token immediately preceding the `{` or its `(...)`), and the
 * parenthesized condition text when one exists. Returns null once no further
 * enclosing block exists (top of file / start of function).
 */
function findInnermostEnclosingBlock(
  source: string,
  pos: number,
): { openBraceIndex: number; keyword: string; condition: string } | null {
  let depth = 0;
  for (let i = pos; i >= 0; i--) {
    const ch = source[i];
    if (ch === "}") {
      depth++;
    } else if (ch === "{") {
      if (depth > 0) {
        depth--;
        continue;
      }
      let j = i - 1;
      while (j >= 0 && /\s/.test(source[j])) j--;
      if (source[j] === ")") {
        let pdepth = 0;
        let k = j;
        for (; k >= 0; k--) {
          if (source[k] === ")") pdepth++;
          else if (source[k] === "(") {
            pdepth--;
            if (pdepth === 0) break;
          }
        }
        const condition = source.slice(k + 1, j);
        let m = k - 1;
        while (m >= 0 && /\s/.test(source[m])) m--;
        let wStart = m;
        while (wStart >= 0 && /[A-Za-z]/.test(source[wStart])) wStart--;
        const keyword = source.slice(wStart + 1, m + 1);
        return { openBraceIndex: i, keyword, condition };
      }
      let wStart = j;
      while (wStart >= 0 && /[A-Za-z]/.test(source[wStart])) wStart--;
      const keyword = source.slice(wStart + 1, j + 1);
      return { openBraceIndex: i, keyword, condition: "" };
    }
  }
  return null;
}

/**
 * True when `pos` sits inside an `if (demoSeedsAllowed()) { ... }` block —
 * walking outward through any number of intervening non-`if` blocks (`try {}`
 * is exactly the shape every real call site in server/index.ts uses: the gate
 * wraps the `try`, not the other way around). An enclosing `if` whose
 * condition is anything other than an EXACT, trimmed `demoSeedsAllowed()` —
 * including the backwards `!demoSeedsAllowed()` — does not count, and neither
 * does running out of enclosing blocks.
 */
function isPositionGated(source: string, pos: number, maxLevels = 8): boolean {
  let searchFrom = pos;
  for (let level = 0; level < maxLevels; level++) {
    const block = findInnermostEnclosingBlock(source, searchFrom);
    if (!block) return false;
    if (block.keyword === "if" && block.condition.trim() === "demoSeedsAllowed()") {
      return true;
    }
    searchFrom = block.openBraceIndex - 1;
  }
  return false;
}

function findCallPositions(source: string, name: string): number[] {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\s*\\(`, "g");
  const positions: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    // Skip the import statement itself: an import never has `(` immediately
    // after the name (named imports have no call syntax), so in practice this
    // regex does not match import lines at all — kept as a defensive check.
    const lineStart = source.lastIndexOf("\n", m.index) + 1;
    const line = source.slice(lineStart, source.indexOf("\n", m.index));
    if (/^\s*import\b/.test(line)) continue;
    // Skip the function's own DECLARATION ("async function NAME(" / "function NAME(") —
    // that is not an invocation. Checked on the text immediately preceding the match,
    // not the whole line, so a declaration and a call never share one classification.
    const before = source.slice(Math.max(0, m.index - 20), m.index);
    if (/\bfunction\s*$/.test(before)) continue;
    positions.push(m.index);
  }
  return positions;
}

// ─── EXEMPTIONS from D1 — each one printed, never silent (§18d) ──────────────
const EXEMPTIONS: Record<string, string> = {
  "seeds/e2e-test-accounts.seed.ts::seedE2EAccounts":
    "already gated by server/index.ts's own dedicated, independently-tested fail-safe " +
    "predicate (`allowTestAccounts`) — richer than a plain skip (its false branch actively " +
    "PURGES test accounts from production rather than merely refusing to add them). Out of " +
    "scope for this lane; not the defect this test guards.",
  "seeds/e2e-test-accounts.seed.ts::purgeE2EAccountsFromProd":
    "the PURGE counterpart, not a seeder — it must run precisely when demoSeedsAllowed() is " +
    "FALSE (production), the opposite gating direction from every other entry here; server/" +
    "index.ts's own `allowTestAccounts` if/else already encodes that.",
  "seed-expert-services.ts::seedProviderServiceListings":
    "no-op since migration 013 removed the ESO workflow columns it used to write (see its own " +
    "body: \"Skipping mock custom services seed…\") — zero DB side effects. The body's lone " +
    "\"mock\" match is a stale comment naming what it no longer does, not fictional data.",
  "seeds/landing-moment-demo.seed.ts::seedLandingMomentDemo":
    "keeps its own, narrower, pre-existing env gate (shouldSeedLandingMomentDemo — NOT " +
    "delegated to demoSeedsAllowed()). An earlier version of this lane DID delegate it, which " +
    "changed the predicate's answer under NODE_ENV=production + ALLOW_TEST_ACCOUNTS=1 — the " +
    "exact boot shape the suite-server-tests CI job uses — from false to true, and broke " +
    "landing-moments.db.test.ts M5 (the demo Kyoto gem got seeded into that job's DB for the " +
    "first time and polluted the test's own fixture query). Reverted; this seeder's own " +
    "internal check is its sole, sufficient, already-correct gate.",
  "seeds/landing-hero-demo.seed.ts::seedLandingHeroDemo":
    "same reasoning and same regression as seedLandingMomentDemo directly above — reverted for " +
    "the identical reason.",
};

function relKey(file: string, exportName: string): string {
  return `${path.relative(SEEDS_DIR, file).startsWith("..") ? path.relative(SERVER_DIR, file) : `seeds/${path.relative(SEEDS_DIR, file)}`}::${exportName}`;
}

// ═══════════════════════════════ G — demoSeedsAllowed() fixtures ═════════════
test("G1: refuses a prod-strict boot (NODE_ENV=production, no escape hatch)", () => {
  assert.equal(demoSeedsAllowed({ NODE_ENV: "production" } as NodeJS.ProcessEnv), false);
});

test("G2: refuses the ENVIRONMENT=PROD belt-and-suspenders signal too", () => {
  assert.equal(demoSeedsAllowed({ ENVIRONMENT: "PROD" } as NodeJS.ProcessEnv), false);
});

test("G3: allows development, plain test runs, and an empty environment", () => {
  assert.equal(demoSeedsAllowed({ NODE_ENV: "development" } as NodeJS.ProcessEnv), true);
  assert.equal(demoSeedsAllowed({ NODE_ENV: "test" } as NodeJS.ProcessEnv), true);
  assert.equal(demoSeedsAllowed({} as NodeJS.ProcessEnv), true);
});

test("G4: honors the SAME ALLOW_TEST_ACCOUNTS=1 CI escape hatch isProdStrictEnv defines — never a second rule", () => {
  assert.equal(
    demoSeedsAllowed({ NODE_ENV: "production", ALLOW_TEST_ACCOUNTS: "1" } as NodeJS.ProcessEnv),
    true,
  );
  assert.equal(
    demoSeedsAllowed({ ENVIRONMENT: "PROD", ALLOW_TEST_ACCOUNTS: "1" } as NodeJS.ProcessEnv),
    true,
  );
});

// ═══════════════════════════ P — self-test of the parser itself (§18d) ═══════
test("P1: an ungated demo call is reported ungated", () => {
  const src = `
async function seedMockThing() { }
export async function runDatabaseSeeding() {
  try {
    await seedMockThing();
  } catch (err) {}
}
`;
  const pos = findCallPositions(src, "seedMockThing")[0];
  assert.ok(pos !== undefined);
  assert.equal(isPositionGated(src, pos), false, "an ungated call must read as ungated");
});

test("P2: a call gated by if (demoSeedsAllowed()) — nested inside try {} — reads as gated", () => {
  const src = `
async function seedMockThing() { }
export async function runDatabaseSeeding() {
  if (demoSeedsAllowed()) {
    try {
      await seedMockThing();
    } catch (err) {}
  } else {
    logger.info("skipped");
  }
}
`;
  const pos = findCallPositions(src, "seedMockThing")[0];
  assert.ok(pos !== undefined);
  assert.equal(isPositionGated(src, pos), true, "the real call-site shape must read as gated");
});

test("P3: a call gated by the BACKWARDS if (!demoSeedsAllowed()) still fails", () => {
  const src = `
async function seedMockThing() { }
export async function runDatabaseSeeding() {
  if (!demoSeedsAllowed()) {
    try {
      await seedMockThing();
    } catch (err) {}
  }
}
`;
  const pos = findCallPositions(src, "seedMockThing")[0];
  assert.ok(pos !== undefined);
  assert.equal(isPositionGated(src, pos), false, "a negated condition must not be mistaken for a gate");
});

test("P4: a call gated by an unrelated predicate fails", () => {
  const src = `
async function seedMockThing() { }
export async function runDatabaseSeeding() {
  if (someOtherFlag) {
    await seedMockThing();
  }
}
`;
  const pos = findCallPositions(src, "seedMockThing")[0];
  assert.ok(pos !== undefined);
  assert.equal(isPositionGated(src, pos), false);
});

test("P5: isDemoFictionalExport separates a real function from a fictional one in the SAME file", () => {
  const src = `
const realCatalog = [{ name: "Itinerary Planning" }];
export async function seedRealCatalog() {
  console.log("Seeding real catalog");
}

const mockPeople = [{ email: "a@example.com" }];
export async function seedMockPeople() {
  console.log("Seeding mock people for testing");
}
`;
  assert.equal(isDemoFictionalExport(src, "seedRealCatalog"), false);
  assert.equal(isDemoFictionalExport(src, "seedMockPeople"), true);
});

test("P6: isDemoFictionalExport ignores module-level prose outside the function's own body", () => {
  const src = `
const venues = [{ note: "cocktails named after fictional aunts" }];
export async function seedVenues() {
  console.log("Seeding venues");
}
`;
  assert.equal(
    isDemoFictionalExport(src, "seedVenues"),
    false,
    "a stray 'fictional' in an unrelated data array must not taint the function's own classification",
  );
});

// ═══════════════════════ D — the real server/index.ts, derived ═══════════════
test("D1: every DEMO/FICTIONAL seeder export server/index.ts imports AND calls is called under demoSeedsAllowed()", () => {
  const indexSource = fs.readFileSync(INDEX_TS, "utf8");
  const imports = parseNamedImports(indexSource);
  const fileCache = new Map<string, string>();
  const violations: string[] = [];
  const checked: string[] = [];

  for (const { names, fromPath } of imports) {
    const resolved = resolveImportPath(INDEX_TS, fromPath);
    if (!resolved) continue;
    // Same file set candidateSeedFiles() lists (§18 rule 1: one derivation) — TOP-LEVEL
    // files only, so server/seeds/lib/* (gate infrastructure, not a seeder — its own
    // exports are literally named "demoSeedsAllowed"/"demoSeedSkipMessage" and would
    // otherwise false-positive on the NAME_MARKER) is deliberately excluded.
    const inScope =
      path.dirname(resolved) === SEEDS_DIR ||
      (path.dirname(resolved) === SERVER_DIR && /^seed/.test(path.basename(resolved)));
    if (!inScope) continue;

    let content = fileCache.get(resolved);
    if (content === undefined) {
      content = fs.readFileSync(resolved, "utf8");
      fileCache.set(resolved, content);
    }

    for (const name of names) {
      if (!isDemoFictionalExport(content, name)) continue;

      const key = relKey(resolved, name);
      const callPositions = findCallPositions(indexSource, name);
      if (callPositions.length === 0) continue; // imported but never called — not this test's concern

      if (EXEMPTIONS[key]) {
        continue; // printed by D2 below
      }

      checked.push(key);
      const anyGated = callPositions.some((pos) => isPositionGated(indexSource, pos));
      if (!anyGated) {
        violations.push(key);
      }
    }
  }

  assert.ok(
    checked.length >= 3,
    `expected to check at least the three known instances (seedMockExperts, seedProviderServices, ` +
      `seedPhaseDKyotoVendors) plus landing-moment/landing-hero; only checked: ${checked.join(", ") || "(none)"}`,
  );

  assert.deepEqual(
    violations,
    [],
    `DEMO/FICTIONAL seeder(s) called in server/index.ts outside demoSeedsAllowed(): ${violations.join(", ")}`,
  );
});

test("D2: every EXEMPTION carries a non-empty, reviewable reason (never a silent allowlist)", () => {
  const entries = Object.entries(EXEMPTIONS);
  assert.ok(entries.length >= 3, "expected the three known exemptions to be present");
  for (const [key, reason] of entries) {
    assert.ok(reason && reason.length > 20, `exemption "${key}" has no stated reason`);
  }
  // Printed on every run, pass or fail — the fee-literal-debt / public-user-id-ok convention.
  for (const [key, reason] of entries) {
    // eslint-disable-next-line no-console
    console.log(`[demo-seed-gate exemption] ${key}: ${reason}`);
  }
});

// ═══════════════════════ S — the seeder's own second layer (static) ══════════
test("S1: phase-d-kyoto-vendors.seed.ts refuses to insert when demoSeedsAllowed() is false (its own second layer)", () => {
  const src = fs.readFileSync(PHASE_D_FILE, "utf8");
  const fnBody = findFunctionBody(src, "seedPhaseDKyotoVendors");
  assert.ok(fnBody, "seedPhaseDKyotoVendors must still be an async function this parser can find");
  const guardIndex = fnBody!.search(/if\s*\(\s*!\s*demoSeedsAllowed\(\)\s*\)/);
  assert.ok(guardIndex >= 0, "seedPhaseDKyotoVendors must refuse on its own when demoSeedsAllowed() is false");
  const insertIndex = fnBody!.indexOf("db.insert(users)");
  assert.ok(insertIndex > 0, "expected a db.insert(users) call in this function");
  assert.ok(
    insertIndex > guardIndex,
    "the refusal must precede every insert in the function — a gate placed after an insert is not a gate",
  );
});

test("S1b: seed-expert-services.ts's two demo functions carry the same second-layer refusal", () => {
  const src = fs.readFileSync(path.join(SERVER_DIR, "seed-expert-services.ts"), "utf8");
  for (const name of ["seedMockExperts", "seedProviderServices"]) {
    const fnBody = findFunctionBody(src, name);
    assert.ok(fnBody, `${name} must still be an async function this parser can find`);
    assert.match(
      fnBody!,
      /if\s*\(\s*!\s*demoSeedsAllowed\(\)\s*\)/,
      `${name} must refuse on its own when demoSeedsAllowed() is false`,
    );
  }
});

test("SCF1: scripts/seed-california-full.ts refuses (demoSeedsAllowed()) before its first db.execute call", () => {
  const src = fs.readFileSync(SEED_CALIFORNIA_FULL_FILE, "utf8");
  assert.match(
    src,
    /import\s*\{\s*demoSeedsAllowed\s*,\s*demoSeedSkipMessage\s*\}\s*from\s*["']\.\.\/server\/seeds\/lib\/demo-seed-gate["']/,
    "seed-california-full.ts must import the shared demo-seed gate, not a second copy of the predicate",
  );
  const fnBody = findFunctionBody(src, "run");
  assert.ok(fnBody, "run must still be an async function this parser can find");
  const guardIndex = fnBody!.search(/if\s*\(\s*!\s*demoSeedsAllowed\(\)\s*\)/);
  assert.ok(guardIndex >= 0, "run() must refuse on its own when demoSeedsAllowed() is false");
  const execIndex = fnBody!.indexOf("db.execute(sql");
  assert.ok(execIndex > 0, "expected a db.execute(sql`...`) call in run()");
  assert.ok(
    execIndex > guardIndex,
    "the refusal must precede every DB write in run() — a gate placed after a write is not a gate",
  );
});

// ═══ CLI — manual-only demo seeders, out of D1's scanned scope (§18d) ════════
test("CLI1: every CLI-only demo seeder refuses (demoSeedsAllowed()) before its first DB write", () => {
  for (const { file, fn, firstWrite } of CLI_ONLY_DEMO_SEEDERS) {
    const src = fs.readFileSync(path.join(SEEDS_DIR, file), "utf8");
    const fnBody = findFunctionBody(src, fn);
    assert.ok(fnBody, `${file}: ${fn} must still be an async function this parser can find`);
    const guardIndex = fnBody!.search(/if\s*\(\s*!\s*demoSeedsAllowed\(\)\s*\)/);
    assert.ok(
      guardIndex >= 0,
      `${file}: ${fn} must refuse on its own when demoSeedsAllowed() is false`,
    );
    const writeIndex = fnBody!.indexOf(firstWrite);
    assert.ok(writeIndex > 0, `${file}: expected a ${firstWrite}…) call in ${fn}`);
    assert.ok(
      writeIndex > guardIndex,
      `${file}: the refusal must precede every DB write in ${fn} — a gate placed after a write is not a gate`,
    );
  }
});

test("CLI2: every CLI-only demo seeder imports the SHARED gate, never a second copy of the predicate", () => {
  const seen = new Set<string>();
  for (const { file } of CLI_ONLY_DEMO_SEEDERS) {
    if (seen.has(file)) continue;
    seen.add(file);
    const src = fs.readFileSync(path.join(SEEDS_DIR, file), "utf8");
    assert.match(
      src,
      /import\s*\{[^}]*demoSeedsAllowed[^}]*\}\s*from\s*["']\.\/lib\/demo-seed-gate["']/,
      `${file} must import demoSeedsAllowed from ./lib/demo-seed-gate (§18 rule 1: one implementation of "what counts as production")`,
    );
    assert.doesNotMatch(
      src,
      /process\.env\.NODE_ENV\s*===\s*["']production["']/,
      `${file} must not carry its own second copy of the production check beside the shared gate`,
    );
  }
});

// ═══ CR — content.routes.ts's seedDatabase(), out of D1's scanned scope (§18d) ═══
//
// seedDatabase() (server/routes/content.routes.ts) is called from server/routes.ts,
// not server/index.ts, and is not a top-level file under server/seeds/ or server/seed*.ts
// — so it is invisible to D1's derivation by construction (stated negative space above).
// Ledger `2026-09-20-admin-test-account-not-in-prod` gated its "always ensure
// admin@traveloure.test" branch; these are the targeted static pins the lane's own spec
// calls for, proving BOTH branches of that one function without widening D1's file set.

test("CR1: seedDatabase's admin@traveloure.test ensure (content.routes.ts) is gated by demoSeedsAllowed()", () => {
  const src = fs.readFileSync(CONTENT_ROUTES_FILE, "utf8");
  const fnBody = findFunctionBody(src, "seedDatabase");
  assert.ok(fnBody, "seedDatabase must still be an async function this parser can find");

  const needle = '"admin@traveloure.test"';
  let searchFrom = 0;
  let occurrences = 0;
  for (;;) {
    const idx = fnBody!.indexOf(needle, searchFrom);
    if (idx === -1) break;
    occurrences++;
    assert.equal(
      isPositionGated(fnBody!, idx),
      true,
      `occurrence of ${needle} at offset ${idx} in seedDatabase must sit inside if (demoSeedsAllowed())`,
    );
    searchFrom = idx + needle.length;
  }
  assert.ok(
    occurrences >= 2,
    `expected at least the getAdminUserByEmail check and the insertUser email field ` +
      `(found ${occurrences})`,
  );
});

test("CR2: seedDatabase's admin@traveloure.com dummy-user insert (content.routes.ts) is gated by the early-return demoSeedsAllowed() guard", () => {
  const src = fs.readFileSync(CONTENT_ROUTES_FILE, "utf8");
  const fnBody = findFunctionBody(src, "seedDatabase");
  assert.ok(fnBody, "seedDatabase must still be an async function this parser can find");

  const guardMatch = /if\s*\(\s*!\s*demoSeedsAllowed\(\)\s*\)\s*\{[^}]*return;[^}]*\}/.exec(fnBody!);
  assert.ok(
    guardMatch,
    "seedDatabase must refuse via an early return when demoSeedsAllowed() is false " +
      "(the help-guide/dummy-user branch's own second layer)",
  );

  const insertIndex = fnBody!.indexOf('email: "admin@traveloure.com"');
  assert.ok(insertIndex > 0, "expected an admin@traveloure.com dummy-user insert in seedDatabase");
  assert.ok(
    insertIndex > guardMatch!.index,
    "the admin@traveloure.com insert must come after the early-return demoSeedsAllowed() guard",
  );
});
