/**
 * demo-seeders-gated.test.ts — ledger `2026-09-19-demo-seeders-gated`.
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
 *     out of this test's scope — it was never part of the boot-time defect —
 *     though several of those are recorded, ungated, in the PR/ledger as
 *     found-but-not-fixed debt.
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
