/**
 * Fix-queue row 94. Popular-cities gems store a discovery_status named by
 * shared/gem-visibility.ts. Migration 410 rewrites the four rows that were
 * stored as trending, and only while they are still trending.
 *
 * The gem table has no slug column. The seeder's identity is city + place_name.
 *
 * Run: npx tsx --test shared/__tests__/discovery-status-seed.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

/** The four popular-cities rows. Identity is the seeder's (city, place_name). */
const ROWS = [
  { city: "Da Nang", placeName: "Hai Van Pass north viewpoint" },
  { city: "Hoi An", placeName: "Banh Mi Madam Khanh" },
  { city: "Hoi An", placeName: "Cam Thanh coconut forest by basket boat" },
  { city: "Ho Chi Minh City", placeName: "The Lunch Lady (Nguyen Thi Thanh)" },
] as const;

function allowedDiscoveryStatuses(visibilitySource: string): Set<string> {
  const named = visibilitySource.match(/discovery_status`\s*\(([^)]+)\)/);
  assert.ok(named, "gem-visibility.ts names the discovery_status set");
  const values = named[1].split("|").map((part) => part.trim()).filter(Boolean);
  assert.ok(values.length > 0, "the discovery_status set is empty");
  return new Set(values);
}

function statusBeside(seed: string, placeName: string): string {
  const at = seed.indexOf(`placeName: "${placeName}"`);
  assert.ok(at >= 0, `seed is missing ${placeName}`);
  const next = seed.indexOf("placeName:", at + "placeName:".length);
  const window = seed.slice(at, next === -1 ? undefined : next);
  const status = window.match(/discoveryStatus:\s*"([^"]+)"/);
  assert.ok(status, `no discoveryStatus beside ${placeName}`);
  return status[1];
}

test("DS1 every popular-cities discoveryStatus is one gem-visibility allows, and the four rows are emerging", () => {
  const allowed = allowedDiscoveryStatuses(read("shared/gem-visibility.ts"));
  assert.equal(allowed.has("trending"), false, "trending is not a discovery_status");
  const seed = read("server/seeds/popular-cities-content.seed.ts");
  const statuses = [...seed.matchAll(/discoveryStatus:\s*"([^"]+)"/g)].map((match) => match[1]);
  assert.ok(statuses.length > ROWS.length, "the seed's rows were not read");
  const invalid = statuses.filter((status) => !allowed.has(status));
  assert.deepEqual(invalid, []);
  for (const row of ROWS) {
    assert.equal(statusBeside(seed, row.placeName), "emerging", row.placeName);
  }
});

test("DS2 migration 410 updates only those four place names, and only while the status is still trending", () => {
  const sql = read("server/migrations/410_discovery_status_emerging.sql");
  const code = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .trim();
  assert.doesNotMatch(code, /\b(ALTER|CREATE|DROP|INSERT|DELETE|TRUNCATE|CHECK|DEFAULT)\b/i);
  const statements = code.split(";").map((statement) => statement.trim()).filter(Boolean);
  assert.equal(statements.length, 1);
  assert.match(statements[0], /^UPDATE\s+travel_pulse_hidden_gems\b/i);
  assert.match(statements[0], /SET\s+discovery_status\s*=\s*'emerging'/i);
  assert.doesNotMatch(statements[0], /SET\s+discovery_status\s*=\s*'trending'/i);
  assert.match(statements[0], /WHERE[\s\S]*discovery_status\s*=\s*'trending'/i);

  const placeNames = [...statements[0].matchAll(/place_name\s*=\s*'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(placeNames.slice().sort(), ROWS.map((row) => row.placeName).slice().sort());
  for (const row of ROWS) {
    assert.match(statements[0], new RegExp(`city\\s*=\\s*'${row.city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'[\\s\\S]*place_name\\s*=\\s*'${row.placeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`));
  }
  const setColumns = statements[0].slice(statements[0].search(/SET/i), statements[0].search(/WHERE/i));
  assert.equal((setColumns.match(/,/g) ?? []).length, 0, "the UPDATE writes one column");
});
