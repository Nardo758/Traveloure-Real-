/**
 * EXPERT WORK IS PROTECTED WHERE MONEY IS PROTECTED — CLAUDE.md Locked Decision 42 D3 + D4
 * (decision-maker ratified Sep 5 2026; ledger `2026-09-06-expert-work-protected`).
 *
 * D3: an `itinerary_items` row carrying `expert_note` (ruling 21) or `origin='expert'`
 * (ruling 12) is PAID HUMAN WORK sitting in a row a machine may rewrite. Those rows join the
 * optimizer baseline's PROTECTED set (injected as constraints, never emitted as suggestions,
 * never deleted by apply-to-trip) AND `itineraryItemRebuildDeletable()` spares them. ONE class
 * added to the EXISTING predicates — never a second, parallel "is this expert work?" test.
 *
 * D4: THE OWNER MAY NOT WRITE `itinerary_items.expert_note`. The field is stripped from the
 * owner's item PATCH path (the §19 allowlist shape) and from the live create rail's generic
 * parse; only a §12 WRITE-status advisor (accepted/assigned, never pending) writes it, through
 * the advisor-gated rails that already gate every other item mutation.
 *
 * What these hold:
 *   E1  the ONE row-level predicate — a non-empty note or origin='expert' is expert work;
 *       an absent/blank note on a traveler/ai row is not.
 *   E2  the WHERE-clause form exists in the guard, reads the SAME two columns, and is ANDed
 *       into `itineraryItemRebuildDeletable()` — a regenerate cannot destroy expert work.
 *   E3  BOTH apply-to-trip replace deletes (plancard.routes.ts and storage.ts) AND in the SAME
 *       clause — the "in_planning-only" exemption was no longer sufficient.
 *   E4  the optimizer baseline routes expert-work rows into fixedCommitments (constraints),
 *       through the ONE row-level predicate, and counts them honestly (§13).
 *   E5  D4 PATCH: the trip-scoped PATCH strips `expertNote` for every caller except a
 *       WRITE-status advisor (`tripRole !== "expert"`).
 *   E6  D4 POST: the LIVE create rail strips `expertNote` from the generic parse and re-admits
 *       it only for a WRITE-status advisor — the `suggestedBy`/`origin` shape.
 *   E7  ONE class, no third expression: the predicate's two forms live in exactly their two
 *       modules, and the only server files expressing the class are the ones this lane touched.
 *
 * Pure + static source pins: no DB, no server, no network.
 * Run: npx tsx --test server/__tests__/expert-work-protected.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { itineraryItemIsExpertWork } from "@shared/itinerary-item-expert";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SERVER = join(ROOT, "server");
const guardSrc = readFileSync(join(SERVER, "services", "itinerary-rebuild-guard.ts"), "utf8");
const baselineSrc = readFileSync(join(SERVER, "services", "optimizer-baseline.service.ts"), "utf8");
const plancardSrc = readFileSync(join(SERVER, "routes", "plancard.routes.ts"), "utf8");
const storageSrc = readFileSync(join(SERVER, "storage.ts"), "utf8");
const tripsRoutesSrc = readFileSync(join(SERVER, "routes", "trips.routes.ts"), "utf8");
const routesSrc = readFileSync(join(SERVER, "routes.ts"), "utf8");

/** Every .ts under server/, tests excluded. */
function serverFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      serverFiles(full, out);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

/** The delete statement's text: from the `.delete(itineraryItems)` line down to its `;`. */
function deleteStatements(src: string): string[] {
  const lines = src.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/\.delete\(\s*itineraryItems\s*\)/.test(lines[i])) continue;
    if (lines[i].trimStart().startsWith("//")) continue;
    const parts: string[] = [];
    for (let j = i; j < Math.min(lines.length, i + 12); j++) {
      parts.push(lines[j]);
      if (lines[j].includes(";")) break;
    }
    out.push(parts.join("\n"));
  }
  return out;
}

describe("E1 — the ONE row-level predicate", () => {
  it("a non-empty expert_note is expert work", () => {
    assert.equal(itineraryItemIsExpertWork({ expertNote: "Ask for the courtyard table" }), true);
  });
  it("origin='expert' is expert work even with no note", () => {
    assert.equal(itineraryItemIsExpertWork({ origin: "expert" }), true);
  });
  it("both marks together are expert work", () => {
    assert.equal(itineraryItemIsExpertWork({ expertNote: "x", origin: "expert" }), true);
  });
  it("a traveler row with no note is NOT expert work", () => {
    assert.equal(itineraryItemIsExpertWork({ origin: "traveler", expertNote: null }), false);
  });
  it("an ai row with no note is NOT expert work", () => {
    assert.equal(itineraryItemIsExpertWork({ origin: "ai" }), false);
  });
  it("a blank/whitespace note is the absence of a note (§13)", () => {
    assert.equal(itineraryItemIsExpertWork({ expertNote: "   ", origin: "traveler" }), false);
    assert.equal(itineraryItemIsExpertWork({ expertNote: "", origin: "traveler" }), false);
  });
  it("an absent origin with no note is NOT expert work", () => {
    assert.equal(itineraryItemIsExpertWork({}), false);
  });
});

describe("E2 — the WHERE-clause form, ANDed into the rebuild guard", () => {
  it("the guard defines itineraryItemNotExpertWork over the SAME two columns", () => {
    assert.match(guardSrc, /export function itineraryItemNotExpertWork\(\): SQL/);
    assert.match(guardSrc, /isNull\(itineraryItems\.expertNote\)/);
    assert.match(guardSrc, /ne\(itineraryItems\.origin, "expert"\)/);
  });
  it("itineraryItemRebuildDeletable() ANDs the expert-work clause in", () => {
    const m = guardSrc.match(/export function itineraryItemRebuildDeletable\(\): SQL \{[\s\S]*?\n\}/);
    assert.ok(m, "itineraryItemRebuildDeletable definition not found");
    assert.match(m[0], /itineraryItemNotExpertWork\(\)/);
    // The money protection is untouched — both halves ride the one predicate.
    assert.match(m[0], /notInArray\(itineraryItems\.routingStatus/);
    assert.match(m[0], /isNull\(itineraryItems\.bookingId\)/);
  });
});

describe("E3 — both apply-to-trip replace deletes carry the SAME clause", () => {
  for (const [name, src] of [["plancard.routes.ts", plancardSrc], ["storage.ts", storageSrc]] as const) {
    it(`${name}: every trip-scoped in_planning replace delete ANDs itineraryItemNotExpertWork()`, () => {
      const stmts = deleteStatements(src).filter(
        (s) => s.includes("itineraryItems.tripId") && s.includes('"in_planning"'),
      );
      assert.ok(stmts.length >= 1, `${name}: in_planning replace delete not found`);
      for (const s of stmts) {
        assert.match(s, /itineraryItemNotExpertWork\(\)/, `${name}: replace delete missing the D3 clause:\n${s}`);
      }
    });
  }
});

describe("E4 — the optimizer baseline protects expert work", () => {
  it("expert-work rows join fixedCommitments through the ONE row-level predicate", () => {
    assert.match(baselineSrc, /import \{ itineraryItemIsExpertWork \} from "@shared\/itinerary-item-expert"/);
    const loop = baselineSrc.match(/for \(const \{ item, service \} of rows\) \{[\s\S]*?\n  \}/);
    assert.ok(loop, "read-set loop not found");
    assert.match(loop[0], /itineraryItemIsExpertWork\(item\)/);
    // The expert check feeds the constraint branch, not the optimizable one.
    assert.match(loop[0], /fixedCommitments\.push/);
  });
  it("counts carry an honest expertProtected figure beside purchased (§13)", () => {
    assert.match(baselineSrc, /counts: \{ optimizable: number; purchased: number; expertProtected: number \}/);
    assert.match(baselineSrc, /expertProtected\+\+/);
  });
  it("with_expert routing is STILL never read (the D3 widening changes nothing there)", () => {
    assert.match(baselineSrc, /with_expert` is absent from this list BY CONTRACT/);
    assert.match(baselineSrc, /inArray\(itineraryItems\.routingStatus, \[\.\.\.OPTIMIZABLE_STATUSES, CONSTRAINT_STATUS\]\)/);
  });
});

describe("E5 — D4: the owner PATCH strips expert_note", () => {
  it("the trip-scoped PATCH strips expertNote for every caller except a WRITE-status advisor", () => {
    assert.match(tripsRoutesSrc, /if \(tripRole !== "expert"\) delete \(safeBody as any\)\.expertNote;/);
  });
  it("the strip sits AFTER getTripWriteRole resolution (the advisor gate it keys on)", () => {
    const roleIdx = tripsRoutesSrc.indexOf("getTripWriteRole(tripId, userId)");
    const stripIdx = tripsRoutesSrc.indexOf('if (tripRole !== "expert") delete (safeBody as any).expertNote;');
    assert.ok(roleIdx > -1 && stripIdx > roleIdx, "strip must follow write-role resolution");
  });
  it("the old 'deliberately left in safeBody' rationale is GONE (amended, not contradicted)", () => {
    assert.ok(!tripsRoutesSrc.includes("DELIBERATELY left in `safeBody`"));
  });
});

describe("E6 — D4: the LIVE create rail strips expert_note for non-advisors", () => {
  it("the live POST deletes expertNote from the generic parse", () => {
    assert.match(routesSrc, /delete itemData\.expertNote;/);
  });
  it("only a WRITE-status advisor re-admits it (the suggestedBy/origin shape)", () => {
    assert.match(routesSrc, /if \(isAdvisor && typeof expertNoteFromBody === "string"\) \{\s*itemData\.expertNote = expertNoteFromBody;/);
  });
});

describe("E7 — ONE class, no third expression (D3, §18 rule 1)", () => {
  it("the row-level predicate is imported only by the guard and the baseline service", () => {
    const importers = serverFiles(SERVER).filter((f) =>
      readFileSync(f, "utf8").includes("itineraryItemIsExpertWork"),
    );
    assert.deepEqual(
      importers.map((f) => f.replace(/\\/g, "/").replace(/^.*\//, "")).sort(),
      ["itinerary-rebuild-guard.ts", "optimizer-baseline.service.ts"],
    );
  });
  it("the SQL clause is referenced only by the guard and the two apply-to-trip delete sites", () => {
    const users = serverFiles(SERVER).filter((f) =>
      readFileSync(f, "utf8").includes("itineraryItemNotExpertWork"),
    );
    assert.deepEqual(
      users.map((f) => f.replace(/\\/g, "/").replace(/^.*\//, "")).sort(),
      ["itinerary-rebuild-guard.ts", "plancard.routes.ts", "storage.ts"],
    );
  });
  it("the two forms read the SAME two columns (expertNote, origin) and no third", () => {
    const sharedSrc = readFileSync(join(ROOT, "shared", "itinerary-item-expert.ts"), "utf8");
    assert.match(sharedSrc, /item\.expertNote/);
    assert.match(sharedSrc, /item\.origin === "expert"/);
    assert.match(guardSrc, /itineraryItems\.expertNote/);
    assert.match(guardSrc, /itineraryItems\.origin, "expert"/);
  });
});
