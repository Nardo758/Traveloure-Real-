/**
 * Round 3 follow-ups (ledger `2026-11-05-r3-followups`), R3-15 — migration 440:
 *   M1  each of the six seed descriptions loses "perfect"/"perfectly" (delete and reflow, no new word), matched on
 *       city + place_name + the exact seed text; a second run changes nothing.
 *   M2  a row with other text, a row's why_locals_love_it and a different place are untouched.
 *   M3  the seed sources the boot reads carry no "perfect" in a travel_pulse_hidden_gems title or description.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../db";
import { travelPulseHiddenGems } from "@shared/schema";

const ROOT = resolve(import.meta.dirname, "../..");
const MIGRATION = readFileSync(join(ROOT, "server/migrations/440_r3_perfect_copy.sql"), "utf8");
const PERFECT = /\bperfect(ly)?\b/i;

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb() {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const host = new URL(process.env.DATABASE_URL ?? "postgres://x@invalid/x").hostname.toLowerCase();
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`refusing to write to non-disposable database host ${host}`);
}

/** The six (city, place, old, new) the migration names, read back from its own statements. */
function migrationPairs(): Array<{ city: string; place: string; old: string; next: string }> {
  const out: Array<{ city: string; place: string; old: string; next: string }> = [];
  const re = /SET description = \$n\d+\$([\s\S]*?)\$n\d+\$\s*WHERE city = \$c\d+\$([\s\S]*?)\$c\d+\$\s*AND place_name = \$p\d+\$([\s\S]*?)\$p\d+\$\s*AND description = \$o\d+\$([\s\S]*?)\$o\d+\$;/g;
  for (const m of MIGRATION.matchAll(re)) out.push({ next: m[1], city: m[2], place: m[3], old: m[4] });
  return out;
}

const tag = crypto.randomUUID().slice(0, 8);
const ids: string[] = [];
let controlId = "";

async function runMigration(): Promise<number> {
  const client = await pool.connect();
  try {
    const res = await client.query(MIGRATION);
    const list = Array.isArray(res) ? res : [res];
    return list.reduce((n, r: any) => n + (r.rowCount ?? 0), 0);
  } finally {
    client.release();
  }
}

before(async () => {
  assertDisposableDb();
  for (const p of migrationPairs()) {
    const r = await db.insert(travelPulseHiddenGems).values({ city: p.city, country: "X", placeName: p.place, description: p.old, whyLocalsLoveIt: `keep perfect ${tag}` } as any).returning({ id: travelPulseHiddenGems.id });
    ids.push(r[0].id);
  }
  const c = await db.insert(travelPulseHiddenGems).values({ city: "Rome", country: "Italy", placeName: `Other place ${tag}`, description: "A perfect other place" } as any).returning({ id: travelPulseHiddenGems.id });
  controlId = c[0].id;
});

after(async () => {
  await db.delete(travelPulseHiddenGems).where(inArray(travelPulseHiddenGems.id, [...ids, controlId].filter(Boolean)));
});

describe("R3-15 migration 440", () => {
  it("M1 six descriptions lose the word, no word is added, and a rerun changes nothing", async () => {
    const pairs = migrationPairs();
    assert.equal(pairs.length, 6);
    for (const p of pairs) {
      assert.match(p.old, PERFECT);
      assert.doesNotMatch(p.next, PERFECT);
      const oldWords = p.old.replace(/[,.]/g, " ").split(/\s+/).filter(Boolean);
      for (const w of p.next.replace(/[,.]/g, " ").split(/\s+/).filter(Boolean)) assert.ok(oldWords.includes(w), `no new word: ${w}`);
    }
    const first = await runMigration();
    assert.ok(first >= 6, `at least the six test rows changed (${first})`);
    const rows = await db.select().from(travelPulseHiddenGems).where(inArray(travelPulseHiddenGems.id, ids));
    for (const r of rows) {
      const p = pairs.find((x) => x.place === r.placeName)!;
      assert.equal(r.description, p.next);
      assert.equal(r.whyLocalsLoveIt, `keep perfect ${tag}`, "why_locals_love_it is untouched");
    }
    assert.equal(await runMigration(), 0, "a second run changes nothing");
  });

  it("M2 any other text is left alone", async () => {
    const [c] = await db.select().from(travelPulseHiddenGems).where(eq(travelPulseHiddenGems.id, controlId));
    assert.equal(c.description, "A perfect other place");
  });

  it("M3 the seed sources carry no perfect in a gem title or description", () => {
    const json = JSON.parse(readFileSync(join(ROOT, "server/data/hidden-gems.json"), "utf8")) as Array<{ place_name: string; description: string }>;
    for (const g of json) {
      assert.doesNotMatch(g.place_name, PERFECT, g.place_name);
      assert.doesNotMatch(g.description ?? "", PERFECT, g.place_name);
    }
    const ts = readFileSync(join(ROOT, "server/seeds/popular-cities-content.seed.ts"), "utf8");
    for (const m of ts.matchAll(/^\s*(placeName|description):\s*"([^"]*)"/gm)) assert.doesNotMatch(m[2], PERFECT, m[2]);
  });
});
