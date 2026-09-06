/**
 * plancard-origin-exposure — `itinerary_items.origin` becomes READABLE on the plancard, and
 * stays UNWRITABLE everywhere.
 *
 * Ledger `2026-09-06-item-origin-chip`; CLAUDE.md Locked Decision 12 (migration 181, "origin is
 * stamped server-side at create"), Locked Decision 42's addendum, §13, §14/§19, §18 rule 1.
 *
 * WHAT THIS LANE DID. The plancard activity DTO deliberately carried no `origin` — the handler
 * said so where it derives `aiSketch` — so the ratified `ItemRow` artboard's origin chip had
 * nothing to read. This lane exposes the column on the `full` channel and nothing else. The
 * exposure is READ-ONLY: no schema change, no migration, no new write rail.
 *
 * WHY THESE PINS. Every rule here is invisible on happy-path data:
 *
 *  · READ EXPOSURE IS ONE LINE FROM WRITE EXPOSURE. A later lane "completing" the round trip by
 *    adding `origin` to an allowlist would hand the client its own provenance — an item forged as
 *    "from your expert" on a plan no expert has touched. Locked Decision 12 and §14's
 *    server-derivation posture forbid it; nothing in the compiler does. R4–R7 pin the strip on
 *    every rail that exists.
 *  · PRESENT-ONLY-WHEN-SET IS NOT COSMETIC. `origin` is nullable with NO DB CHECK, so a NULL is a
 *    real and common value (every row predating migration 181). A DTO that emitted `origin: null`
 *    — or worse a `?? "traveler"` — would put an authorship claim on rows whose author nothing
 *    recorded, and every screen would look right (§13).
 *  · TWO LABEL TABLES READ IDENTICALLY UNTIL THEY DRIFT. The three chip words live in exactly one
 *    module; a component that spelled its own would pass every test that only checks behaviour.
 *
 * NEGATIVE SPACE, stated: these are PURE and STATIC pins — no DB, no server, no network, no DOM.
 * They read shipped source and assert over it. They cannot prove a rendered chip appears on a
 * screen, and they check the rails that EXIST: a rail added in a file none of the walks below
 * cover is not seen. `scripts/check-money-endpoints.cjs` is the CI-side guard for body-sourced
 * privileged fields and is unaffected by this lane (origin is neither an amount, an identity nor a
 * rate — it is a provenance stamp, and it is stripped, not guarded).
 *
 * Run: npx tsx --test server/__tests__/plancard-origin-exposure.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

/**
 * Source with its PROSE removed.
 *
 * This codebase documents its rulings in the files that implement them, so the exact strings these
 * pins are about — the three chip labels, the words "origin" and "req.body" — appear in the
 * comments EXPLAINING them. A raw-text pin would fail on the explanation rather than on a defect.
 * Stripping comments is what makes each pin about the code.
 *
 * `//` preceded by `:` is left alone so a URL inside a string is never mistaken for a comment.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<!:)\/\/[^\n]*/g, "");
}

/** Every `.ts`/`.tsx` under a root, excluding `node_modules` and `__tests__`. */
function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "__tests__" || entry === "dist") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(full);
    }
  };
  walk(join(ROOT, root));
  return out.map((f) => relative(ROOT, f).split(sep).join("/"));
}

const HELPER = "client/src/lib/item-origin.ts";
const CHIP_LABELS = ["you added", "AI draft", "from your expert"];

describe("R1-R3 — the DTO carries origin, present-only-when-set", () => {
  const shared = read("shared", "trip-plan.ts");
  const assembler = read("server", "services", "trip-plan.service.ts");
  const clientTypes = read("client", "src", "components", "plancard", "plancard-types.tsx");

  it("R1 — `TripPlanActivity` declares `origin` OPTIONAL, and the client contract mirrors it", () => {
    // Optional, not `origin: string | null`. An always-present key would force every consumer to
    // interpret a null, which is the interpretation §13 exists to prevent.
    assert.match(stripComments(shared), /\borigin\?:/, "shared/trip-plan.ts must declare origin?:");
    assert.match(
      stripComments(clientTypes),
      /\borigin\?:/,
      "PlanCardActivity must mirror the optional key",
    );
  });

  it("R2 — the assembler SPREADS it behind a truthiness guard: no key when the column is NULL", () => {
    // The shape that matters. `origin: item.origin ?? null` would compile, would read correctly on
    // any stamped row, and would emit a null authorship claim on every pre-181 item.
    const src = stripComments(assembler);
    assert.match(
      src,
      /\.\.\.\(\(item as any\)\.origin\s*\?\s*\{\s*origin:/,
      "buildActivity must spread origin only when the row carries one",
    );
    assert.doesNotMatch(
      src,
      /\borigin:\s*(?:\(item as any\)\.origin|item\.origin)\s*\?\?/,
      "a `?? null` / `?? default` on origin defeats present-only-when-set",
    );
  });

  it("R3 — no default is ever substituted for a missing origin, on either side", () => {
    for (const [name, src] of [
      ["assembler", assembler],
      ["shared contract", shared],
      ["client contract", clientTypes],
      ["helper", read("client", "src", "lib", "item-origin.ts")],
    ] as const) {
      assert.doesNotMatch(
        stripComments(src),
        /origin\s*(?:\?\?|\|\|)\s*["'](?:ai|traveler|expert)["']/,
        `${name} must not fall back to a fabricated origin`,
      );
    }
  });
});

describe("R4-R7 — origin stays SERVER-STAMPED: read exposure adds no writer", () => {
  const schema = read("shared", "schema.ts");
  const monolith = read("server", "routes.ts");
  const tripsRoutes = read("server", "routes", "trips.routes.ts");

  it("R4 — `insertItineraryItemSchema` still OMITS origin", () => {
    const decl = stripComments(schema).match(
      /export const insertItineraryItemSchema[\s\S]*?;/,
    )?.[0];
    assert.ok(decl, "insertItineraryItemSchema declaration not found");
    assert.match(decl!, /\.omit\(\{[^}]*\borigin:\s*true\b/, "origin must stay in the omit list");
  });

  it("R5 — no pick-based allowlist over `itineraryItems` re-admits origin", () => {
    // §19's own shape: a privileged column is unreachable until someone deliberately NAMES it in a
    // pick. This asserts nobody has. Derived from the file — every pick over the table is checked,
    // so a THIRD allowlist added later is covered without editing this pin.
    const src = stripComments(schema);
    const picks = [...src.matchAll(/createInsertSchema\(itineraryItems\)\s*\n?\s*\.pick\(\{([^}]*)\}/g)];
    assert.ok(picks.length > 0, "expected at least one pick-based allowlist over itineraryItems");
    for (const p of picks) {
      assert.doesNotMatch(p[1], /\borigin\b/, `a pick allowlist names origin: ${p[1].trim()}`);
    }
  });

  it("R6 — the live POST rail STRIPS whatever the client sent and re-derives from the session", () => {
    // The monolith copy registers first and SHADOWS the trips.routes.ts twin (Locked Decision 29),
    // so it is the serving create rail; the twin must stamp too, because which one serves is a
    // registration-order fact and not a guarantee.
    const mono = stripComments(monolith);
    assert.match(mono, /delete\s+itemData\.origin\s*;/, "monolith POST must delete a client origin");
    assert.match(
      mono,
      /itemData\.origin\s*=\s*isAdvisor\s*\?/,
      "monolith POST must re-derive origin from the WRITE-gated advisor flag",
    );
    assert.match(
      stripComments(tripsRoutes),
      /const\s+origin\s*=\s*tripRole\s*===\s*["']expert["']/,
      "the trips.routes.ts create twin must derive origin from the actor's role",
    );
  });

  it("R7 — the canonical PATCH rail strips origin out of its raw destructure", () => {
    // Provenance is stamped at CREATE only. A PATCH that let it through would let a traveler
    // retroactively relabel their own item "from your expert".
    assert.match(
      stripComments(tripsRoutes),
      /origin:\s*_origin\b/,
      "PATCH must destructure origin away before the DB write",
    );
  });

  it("R8 — nothing on the server reads origin off a request body", () => {
    const offenders = [...sourceFiles("server"), ...sourceFiles("shared")].filter((f) =>
      /\breq\.body\.origin\b|\bbody\.origin\b/.test(stripComments(read(...f.split("/")))),
    );
    assert.deepEqual(offenders, [], "origin must never be read from a request body (§14/§19)");
  });
});

describe("R9-R11 — one mapping, one place (§18 rule 1)", () => {
  const sources = [...sourceFiles("client/src"), ...sourceFiles("server"), ...sourceFiles("shared")];

  it("R9 — the three chip labels appear TOGETHER in exactly one module", () => {
    // Derived from the file set, not from a count: any file that carries all three is, by
    // definition, a second label table. Individually the words are ordinary prose ("from your
    // expert" is copy on several surfaces), which is why the pin is the TRIPLE.
    const withAll = sources.filter((f) => {
      const src = stripComments(read(...f.split("/")));
      return CHIP_LABELS.every((l) => src.includes(l));
    });
    assert.deepEqual(withAll, [HELPER]);
  });

  it("R10 — 'you added' — the label that is not ordinary copy — exists only in the helper", () => {
    const withLabel = sources.filter((f) =>
      stripComments(read(...f.split("/"))).includes("you added"),
    );
    assert.deepEqual(withLabel, [HELPER]);
  });

  it("R11 — the surface that draws the chip goes through the helper, not its own switch", () => {
    const pills = read("client", "src", "components", "plancard", "ActivitiesSection.tsx");
    const slip = read("client", "src", "components", "plancard", "SlipView.tsx");
    assert.match(pills, /import\s*\{\s*itemOriginChip\s*\}\s*from\s*["']@\/lib\/item-origin["']/);
    assert.match(stripComments(pills), /export function OriginBadge\(/);
    assert.match(stripComments(slip), /<OriginBadge\s+activity=\{a\}\s*\/>/);
  });
});

describe("R12 — the exposure is the FULL channel only, and nothing else moved", () => {
  const assembler = read("server", "services", "trip-plan.service.ts");
  const plancard = read("server", "routes", "plancard.routes.ts");

  it("R12 — teaser and preview return before any activity is built", () => {
    // The assembler serves three redaction levels including the public share/teaser channels. The
    // origin chip must not reach one: this pin holds the early returns in place, so a later lane
    // that started building activities for the teaser has to face this assertion.
    const src = stripComments(assembler);
    const buildIdx = src.indexOf("const buildActivity");
    assert.ok(buildIdx > 0, "buildActivity not found");
    const before = src.slice(0, buildIdx);
    assert.match(before, /if\s*\(level === "preview"\)/, "preview must early-return above the builder");
    assert.match(before, /if\s*\(level === "teaser"\)/, "teaser must early-return above the builder");
  });

  it("R13 — `aiSketch` stays SERVER-derived: the plan-level answer did not move to the client", () => {
    // The comment this lane rewrote said aiSketch rides the server "because the DTO carries no
    // origin". It now does — and aiSketch still must not be recomputed client-side, because it is
    // a WHOLE-PLAN predicate shared with the eligibility gate (§18 rule 1).
    assert.match(stripComments(plancard), /const aiSketch = await isUntouchedAiDraft\(tripId\)/);
  });

  it("R14 — no migration and no schema change ride this lane", () => {
    // Read exposure only. The column already exists (migration 181); a migration file added under
    // this ledger id would mean the lane grew a schema half nobody ratified.
    const migrations = readdirSync(join(ROOT, "server", "migrations"));
    assert.deepEqual(
      migrations.filter((f) => /origin[-_]chip/i.test(f)),
      [],
      "this lane adds no migration",
    );
  });
});
