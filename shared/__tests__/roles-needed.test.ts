/**
 * ROLES NEEDED — every seeded occasion names the roles it hires, and every name resolves.
 * Ledger `2026-09-04-roles-needed`; migration 280; CLAUDE.md Locked Decision 31.
 *
 * WHY THIS EXISTS. `experience_types.roles_needed` is deliberately NULLABLE with **no DB CHECK** —
 * a CHECK over a column production rows can violate fails the Replit deploy push mid-push and
 * offers the destructive "copy dev database over production" option (publish-trap note; migrations
 * 181/195/273/275/276/277/279 precedent). That trade buys publish safety and costs the database's
 * ability to refuse a bad value, so the value set is APP-enforced — and this file is where
 * "app-enforced" stops being a claim.
 *
 * The failure this guards against is specific: a role key with no `service_categories` row behind
 * it renders a hire prompt that resolves to NO PROVIDER — a dead path that looks live. That is the
 * same shape `check-category-reachability.cjs` exists for (ledger `2026-09-04-taxonomy-reconcile`),
 * reached from the other direction, and it has already bitten twice on that side (`custom-other`;
 * the ten `services-*` bundle rows).
 *
 * What these hold:
 *   R1  EVERY row in the seeder's `templates` array states `rolesNeeded`, and it is NON-EMPTY.
 *       NULL in the DB legitimately means "not set" (§13) and the reader omits the prompt — but
 *       the seeder is the one author, so a row IT writes must never be undecided.
 *   R2  every key seeded is a member of `OCCASION_ROLE_KEYS`.
 *   R3  `OCCASION_ROLE_KEYS` is exactly the set migration 034 assigns, MINUS the four `aff_*`
 *       affiliate sources. 034 is the sole authority; this pins the mirror to it, so a category
 *       renamed there without updating the enum fails here rather than at a traveler's screen.
 *   R4  no `aff_*` key is ever named as a role. An occasion never "needs an aff_air_hotel" —
 *       those are affiliate SOURCES, not disciplines anyone hires.
 *   R5  the allowlist schema is pick-based and REFUSES an unknown key (§19), and accepts an
 *       explicit null — the "not set" state the reader depends on.
 *   R6  no duplicate key within one occasion's list. A duplicate would render the same hire
 *       prompt twice and inflate any count taken off the column.
 *
 * Pure unit: no DB, no fetch, no React, and the seed is NEVER executed. The only I/O is reading the
 * seed and migration files as TEXT — the same technique the switches suite uses, and for the same
 * reason: importing the seed module pulls in the DB client, and the point is that the file's own
 * literal is correct, not that the seeder can run.
 *
 * Run: npx tsx --test shared/__tests__/roles-needed.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { OCCASION_ROLE_KEYS, experienceTypeRolesSchema } from "../schema";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEED = path.resolve(HERE, "../../server/seeds/experience-template-tabs.seed.ts");
const AUTHORITY = path.resolve(
  HERE,
  "../../server/migrations/034_phase1_reconcile_service_categories.sql",
);

const seedText = readFileSync(SEED, "utf8");

/** Each template entry's slug paired with the rolesNeeded literal that follows it. */
function seededRoles(): Array<{ slug: string; roles: string[] }> {
  const out: Array<{ slug: string; roles: string[] }> = [];
  const re = /\{ slug: "([a-z-]+)", name: "[^"]*"[\s\S]{0,900}?rolesNeeded: \[([^\]]*)\]/g;
  for (const m of seedText.matchAll(re)) {
    out.push({
      slug: m[1],
      roles: [...m[2].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]),
    });
  }
  return out;
}

/** Every category_key migration 034 assigns — field 8, first item on the tuple's 4th line. */
function authorityKeys(): Set<string> {
  const lines = readFileSync(AUTHORITY, "utf8").split("\n");
  const keys = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s{2}\('/.test(lines[i])) continue;
    const m = (lines[i + 3] ?? "").match(/^\s*'([a-z_]+)'\s*,/);
    if (m) keys.add(m[1]);
  }
  return keys;
}

describe("roles_needed — the seeder's literal", () => {
  it("R1 every occasion states a non-empty rolesNeeded", () => {
    const rows = seededRoles();
    // Guard the parser itself: a regex that silently matches nothing would make every
    // assertion below pass vacuously.
    assert.ok(rows.length >= 27, `parsed only ${rows.length} occasions — parser is broken`);
    for (const { slug, roles } of rows) {
      assert.ok(roles.length > 0, `${slug} states an EMPTY rolesNeeded; the one author never leaves a row undecided`);
    }
  });

  it("R2 every seeded key is a member of OCCASION_ROLE_KEYS", () => {
    const allowed = new Set<string>(OCCASION_ROLE_KEYS);
    for (const { slug, roles } of seededRoles()) {
      for (const r of roles) {
        assert.ok(allowed.has(r), `${slug} names "${r}", which is not an OCCASION_ROLE_KEY`);
      }
    }
  });

  it("R3 OCCASION_ROLE_KEYS is exactly migration 034's keys minus the aff_* sources", () => {
    const authority = authorityKeys();
    assert.ok(authority.size > 0, "parsed ZERO keys from migration 034 — parser is broken");
    const expected = [...authority].filter((k) => !k.startsWith("aff_")).sort();
    assert.deepEqual([...OCCASION_ROLE_KEYS].sort(), expected);
  });

  it("R4 no aff_* affiliate source is ever named as a role", () => {
    for (const { slug, roles } of seededRoles()) {
      for (const r of roles) {
        assert.ok(!r.startsWith("aff_"), `${slug} names affiliate source "${r}" as a hireable role`);
      }
    }
  });

  it("R5 the allowlist schema refuses an unknown key and accepts explicit null", () => {
    assert.ok(experienceTypeRolesSchema.safeParse({ rolesNeeded: ["florist"] }).success);
    assert.ok(!experienceTypeRolesSchema.safeParse({ rolesNeeded: ["wedding_planner"] }).success);
    // NULL is the "not set" state the reader depends on to omit the prompt (§13).
    assert.ok(experienceTypeRolesSchema.safeParse({ rolesNeeded: null }).success);
  });

  it("R6 no occasion lists the same role twice", () => {
    for (const { slug, roles } of seededRoles()) {
      assert.equal(new Set(roles).size, roles.length, `${slug} lists a duplicate role`);
    }
  });
});
