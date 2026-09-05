/**
 * `market_slug` IS A MINT INVARIANT, AND THE INTAKE PANEL DOES NOT FABRICATE A PARTY SPLIT.
 * CLAUDE.md Locked Decision 42 (items D12 and D11-interim); ledger
 * `2026-09-05-mint-market-slug-invariant`. Amends Locked Decision 30, which named `timezone` as a
 * mint invariant and left `market_slug` — derived by the same module, from the same destination,
 * at the same moment — an ORM-only stamp.
 *
 * WHY THIS EXISTS. Both facts here are INVISIBLE at runtime. A trip minted with a NULL
 * `market_slug` renders perfectly: nothing 500s, nothing logs, the traveler sees their plan. It is
 * only the market-scoped readers (the demand rollup, market content, launch surfaces) that quietly
 * never see the plan — the failure is an ABSENCE, so no test that exercises the mint would notice.
 * The party split is the same shape from the other direction: `adults: travelers, kids: 0` is a
 * perfectly well-formed answer to a question the panel never asked, and it renders as confidently
 * as a real one.
 *
 *   M1  both raw-SQL mints in `booking.service.ts` name `market_slug` in the INSERT column list
 *       and bind the derived value.
 *   M2  the derivation is the ONE shared `resolveMarketSlug` — imported, called once per mint, and
 *       never re-implemented locally (§18 rule 1). A second slug derivation is how the raw path and
 *       `storage.createTrip` start disagreeing about which market a destination is.
 *   M3  the placeholder destinations these paths can carry are NOT special-cased: no mint site
 *       hardcodes a market slug literal.
 *   M4  EVERY trip-insert site in `server/` still stamps `timezone` (Locked Decision 30 held), and
 *       the set of sites that do NOT yet stamp `market_slug` is exactly the recorded outstanding
 *       list below. A NEW insert site that omits it fails here rather than shipping silently.
 *   I1  `intake-panel.tsx` sends the stated TOTAL and neither half of a split.
 *   I2  `ai-planner-draft-panel.tsx` likewise — its `kids: 0` was unconditional, sent even when the
 *       traveler count itself was unknown.
 *   I3  the server's derivation is untouched and still reachable: `POST /api/trips` derives
 *       `numberOfTravelers` from `adults` ONLY when the body omitted it, so a panel that states the
 *       total loses nothing by not fabricating the halves.
 *
 * NEGATIVE SPACE. This is a SOURCE-TEXT pin: it proves the column is named and the derivation is
 * called, never that the value written is correct for a given destination — `resolveMarketSlug`'s
 * own behaviour is pinned by
 * `server/services/trend-engine/__tests__/market-slug-resolver.test.ts`. It scans `server/` only,
 * so a trip minted from a migration or a raw psql session is outside it.
 *
 * Pure: source-text assertions. No DB, no session, no network.
 * Run: npx tsx --test server/__tests__/mint-market-slug-invariant.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");

const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/**
 * Source text with comments removed. Every NEGATIVE assertion below runs against this: the prose
 * in this file and in the fixed files QUOTES the shapes being ruled out (`adults: travelers`,
 * `kids: 0`), so a comment-blind grep would fail on the explanation of the fix.
 */
const readCode = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n");

const BOOKING = "server/services/booking.service.ts";
const bookingSource = read(BOOKING);

/* ------------------------------------------------------------------ M1 */

describe("M1 — both raw-SQL trip mints name `market_slug`", () => {
  const inserts = bookingSource
    .split("\n")
    .map((line, i) => ({ line, i }))
    .filter(({ line }) => /INSERT\s+INTO\s+trips\b/i.test(line));

  it("there are exactly the two known raw-SQL mints (cart auto-trip + saved-trip conversion)", () => {
    assert.equal(
      inserts.length,
      2,
      "a third raw-SQL trip mint appeared in booking.service.ts — it needs the same invariants",
    );
  });

  it("each INSERT's column list names `market_slug`", () => {
    const lines = bookingSource.split("\n");
    for (const { i } of inserts) {
      // The column list may wrap; the whole statement fits well inside this window.
      const stmt = lines.slice(i, i + 12).join("\n");
      assert.match(
        stmt,
        /market_slug/,
        `the INSERT at ${BOOKING}:${i + 1} does not name market_slug`,
      );
      assert.match(
        stmt,
        /timezone/,
        `the INSERT at ${BOOKING}:${i + 1} does not name timezone (Locked Decision 30)`,
      );
    }
  });

  it("each INSERT binds the derived value, not a literal", () => {
    const lines = bookingSource.split("\n");
    for (const { i } of inserts) {
      const stmt = lines.slice(i, i + 14).join("\n");
      assert.match(
        stmt,
        /\$\{marketSlug\}/,
        `the INSERT at ${BOOKING}:${i + 1} names market_slug but binds no derived value`,
      );
    }
  });
});

/* ------------------------------------------------------------------ M2 */

describe("M2 — ONE derivation, the shared resolver (§18 rule 1)", () => {
  it("booking.service.ts imports resolveMarketSlug from the operating-markets module", () => {
    assert.match(
      bookingSource,
      /import\s*\{[^}]*\bresolveMarketSlug\b[^}]*\}\s*from\s*['"][^'"]*trend-engine\/operating-markets['"]/,
      "resolveMarketSlug must come from the same module storage.createTrip imports it from",
    );
  });

  it("it is called once per raw-SQL mint", () => {
    const calls = bookingSource.match(/resolveMarketSlug\(/g) ?? [];
    assert.equal(calls.length, 2, "expected exactly one resolveMarketSlug call per raw-SQL mint");
  });

  it("storage.createTrip still derives it the same way — the two paths share one resolver", () => {
    const storage = read("server/storage.ts");
    assert.match(storage, /const\s+marketSlug\s*=\s*resolveMarketSlug\(/);
  });

  it("no local slug derivation is hand-rolled beside the shared one", () => {
    // A hand-rolled `destination.toLowerCase().replace(...)` beside the mint is the drift this
    // rules out: it would answer the market question a second way, in a file that already has the
    // real answer three lines up.
    const assignments = readCode(BOOKING)
      .split("\n")
      .filter((l) => /\bmarketSlug\s*=[^=]/.test(l));
    assert.ok(assignments.length > 0, "expected a marketSlug assignment in booking.service.ts");
    for (const line of assignments) {
      assert.match(
        line,
        /=\s*resolveMarketSlug\(/,
        `market_slug is assigned by something other than resolveMarketSlug: ${line.trim()}`,
      );
    }
  });
});

/* ------------------------------------------------------------------ M3 */

describe("M3 — the placeholder destinations are NOT special-cased (§13)", () => {
  it("no mint hardcodes a market slug for a placeholder destination", () => {
    // 'Unknown Destination' / 'My Destination' resolve to NULL through the shared resolver, which
    // is the honest answer: no operating market was stated. Branching on the placeholder to supply
    // a slug would turn "we do not know" into "we say Kyoto".
    for (const placeholder of ["Unknown Destination", "My Destination"]) {
      const idx = bookingSource.indexOf(placeholder);
      if (idx === -1) continue;
      const around = bookingSource.slice(Math.max(0, idx - 400), idx + 400);
      assert.doesNotMatch(
        around,
        /marketSlug\s*=\s*['"]/,
        `${placeholder} is special-cased into a hardcoded market slug`,
      );
    }
  });
});

/* ------------------------------------------------------------------ M4 */

/**
 * Every trip-insert site in `server/`, and what each stamps. The two invariants are read from the
 * SAME window the trip-mint owner guard uses, so the three rules stay describable together.
 */
function tripInsertSites(): Array<{ file: string; line: number; window: string }> {
  const INSERT_RES = [/\.insert\(\s*trips\s*\)/, /INSERT\s+INTO\s+trips\b/i];
  const out: Array<{ file: string; line: number; window: string }> = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "__tests__") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts")) {
        const lines = fs.readFileSync(full, "utf8").split("\n");
        lines.forEach((line, i) => {
          if (!INSERT_RES.some((re) => re.test(line))) return;
          out.push({
            file: path.relative(ROOT, full),
            line: i + 1,
            window: lines.slice(i, Math.min(lines.length, i + 40)).join("\n"),
          });
        });
      }
    }
  };
  walk(path.join(ROOT, "server"));
  return out;
}

/**
 * RECORDED OUTSTANDING — insert sites that stamp `timezone` but not yet `market_slug`. They are
 * NOT exempt on principle: each has a real destination and should stamp it. They are outside THIS
 * lane deliberately (Locked Decision 42 scopes wave 1.2 to the two raw-SQL traveler mints), and
 * they are listed rather than silently tolerated so the debt is loud and a NEW omission is not
 * absorbed into it.
 */
const OUTSTANDING_NO_MARKET_SLUG = [
  // the buyer's ready-made clone — destination is the listing's `market`
  "server/services/ready-made-purchase.service.ts",
  // expert authoring build (build-first) — userId NULL by design, but `destination` is real
  "server/routes/ready-made.routes.ts",
  // expert authoring build (workspace) — same shape, destination is `city`
  "server/routes/expert-workspace.routes.ts",
  // e2e seed account's Kyoto trip — a seeded plan is still a plan
  "server/seeds/e2e-test-accounts.seed.ts",
];

describe("M4 — every mint site, and the recorded outstanding list", () => {
  const sites = tripInsertSites();

  it("there is at least one insert site per known mint path (the scan actually found them)", () => {
    assert.ok(sites.length >= 8, `expected the known mint sites, found ${sites.length}`);
  });

  it("EVERY site still stamps timezone (Locked Decision 30 held)", () => {
    const missing = sites
      .filter((s) => !/timezone/.test(s.window))
      .map((s) => `${s.file}:${s.line}`);
    assert.deepEqual(missing, [], "a trip-insert site stopped stamping the plan's IANA zone");
  });

  it("the sites that do NOT stamp market_slug are exactly the recorded outstanding list", () => {
    const missing = [
      ...new Set(
        sites.filter((s) => !/market_slug|marketSlug/.test(s.window)).map((s) => s.file),
      ),
    ].sort();
    assert.deepEqual(
      missing,
      [...OUTSTANDING_NO_MARKET_SLUG].sort(),
      "a NEW trip-insert site omits market_slug (or a recorded one was fixed — update the list)",
    );
  });

  it("neither booking.service.ts mint is in the outstanding list any more", () => {
    assert.ok(!OUTSTANDING_NO_MARKET_SLUG.includes(BOOKING));
    const bookingSites = sites.filter((s) => s.file === BOOKING);
    assert.equal(bookingSites.length, 2);
    for (const s of bookingSites) {
      assert.match(s.window, /market_slug/, `${s.file}:${s.line} omits market_slug`);
    }
  });
});

/* ------------------------------------------------------------------ I1/I2/I3 */

describe("I1 — the intake panel states a TOTAL and fabricates no split", () => {
  const panel = readCode("client/src/components/intake-panel.tsx");

  it("the create payload no longer sends `kids: 0`", () => {
    assert.doesNotMatch(panel, /kids:\s*0/, "a fabricated `kids: 0` is back in the intake payload");
  });

  it("the create payload no longer sends `adults: travelers`", () => {
    assert.doesNotMatch(
      panel,
      /adults:\s*travelers/,
      "the panel asks for one number; assigning it to `adults` claims a split it never asked for",
    );
  });

  it("the stated total IS still sent — stripping the split must not drop the real answer", () => {
    assert.match(panel, /numberOfTravelers:\s*travelers/);
  });
});

describe("I2 — the AI draft panel likewise", () => {
  const panel = readCode("client/src/components/ai-planner-draft-panel.tsx");

  it("no `kids: 0` — it was UNCONDITIONAL, sent even with the traveler count unknown", () => {
    assert.doesNotMatch(panel, /kids:\s*0/);
  });

  it("no `adults: travelers`", () => {
    assert.doesNotMatch(panel, /adults:\s*travelers/);
  });

  it("the total still rides, and still only when it was stated", () => {
    assert.match(panel, /travelers\s*\?\s*\{\s*numberOfTravelers:\s*travelers\s*\}/);
  });
});

describe("I3 — the server's own derivation is untouched", () => {
  const routes = read("server/routes.ts");

  it("POST /api/trips still derives numberOfTravelers from `adults` only when the body omitted it", () => {
    assert.match(routes, /!numberOfTravelersProvided\s*&&\s*sanitizedInput\.adults\s*!=\s*null/);
    assert.match(routes, /partyTotal\(sanitizedInput\.adults/);
  });
});
