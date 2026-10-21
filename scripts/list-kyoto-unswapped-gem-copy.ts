/**
 * Read-only list of Kyoto gem copy that still matches a banned phrase with no approved swap.
 *
 *   npx tsx scripts/list-kyoto-unswapped-gem-copy.ts --seeds
 *   npx tsx scripts/list-kyoto-unswapped-gem-copy.ts
 *
 * The database mode opens a read-only session and only SELECTs. It does not update or delete.
 * --seeds reads committed seed and fixture files and prints the same shape. It does not invent rows.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { kyotoUnswappedCopyReport, scanKyotoGemSeedSource, type KyotoUnswappedCopyRow } from "../shared/kyoto-gem-copy";

const SEED_FILES = [
  "server/seeds/popular-cities-content.seed.ts",
  "server/seeds/phase-4-kyoto-fill.seed.ts",
  "server/data/hidden-gems.json",
  "playwright/tests/fixtures/discover-location-kyoto.json",
];

function fromSeeds(): KyotoUnswappedCopyRow[] {
  const root = process.cwd();
  const rows: KyotoUnswappedCopyRow[] = [];
  for (const file of SEED_FILES) {
    const source = readFileSync(path.join(root, file), "utf8");
    rows.push(...scanKyotoGemSeedSource(source));
  }
  return rows;
}

async function fromDatabase(): Promise<KyotoUnswappedCopyRow[]> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const result = await client.query<{
      id: string;
      place_name: string;
      description: string | null;
      why_locals_love_it: string | null;
    }>(
      `SELECT id, place_name, description, why_locals_love_it
         FROM travel_pulse_hidden_gems
        WHERE city ILIKE 'kyoto'`,
    );
    await client.query("COMMIT");
    return kyotoUnswappedCopyReport(
      result.rows.map((row) => ({
        id: row.id,
        placeName: row.place_name,
        description: row.description,
        whyLocalsLoveIt: row.why_locals_love_it,
      })),
    );
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const rows = process.argv.includes("--seeds") ? fromSeeds() : await fromDatabase();
  process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
