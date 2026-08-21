/**
 * Reconcile duplicate TravelPulse city rows before restoring the normalized
 * city/country unique index.
 *
 * Safe default: audit only. A write requires both --apply and the explicit
 * TRAVELPULSE_CITY_RECONCILIATION_APPROVED=true environment flag.
 *
 * Run against production through the approved data-operation workflow:
 *   DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/reconcile-travelpulse-cities.ts
 *   DATABASE_URL="$PROD_DATABASE_URL" \
 *     TRAVELPULSE_CITY_RECONCILIATION_APPROVED=true \
 *     npx tsx scripts/reconcile-travelpulse-cities.ts --apply
 *
 * Run the disposable-DB integration check:
 *   npx tsx scripts/reconcile-travelpulse-cities.ts --self-test
 *
 * The operation runs in one serializable transaction. It keeps the row with
 * the highest pulse score, then newest update/creation timestamp, then the
 * lowest id; this deterministic rule is the governance decision for Tokyo/
 * Japan, Sydney/Australia, and any later duplicate group. Media references
 * are moved before duplicate rows are deleted because city_media_cache has
 * ON DELETE CASCADE.
 */
import pg from "pg";
import crypto from "node:crypto";

const { Client } = pg;
const apply = process.argv.includes("--apply");
const selfTest = process.argv.includes("--self-test");
const approved = process.env.TRAVELPULSE_CITY_RECONCILIATION_APPROVED === "true";
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);

type DuplicateGroup = {
  city_name: string;
  country: string;
  canonical_id: string;
  duplicate_ids: string[];
  media_references: number;
};

const duplicateQuery = `
  WITH ranked AS (
    SELECT
      id,
      city_name,
      country,
      row_number() OVER (
        PARTITION BY lower(city_name), lower(country)
        ORDER BY pulse_score DESC NULLS LAST,
                 last_updated DESC NULLS LAST,
                 created_at DESC NULLS LAST,
                 id ASC
      ) AS row_rank,
      count(*) OVER (PARTITION BY lower(city_name), lower(country)) AS group_size
    FROM travel_pulse_cities
  )
  SELECT
    (array_agg(r.city_name ORDER BY r.row_rank))[1] AS city_name,
    (array_agg(r.country ORDER BY r.row_rank))[1] AS country,
    min(r.id) FILTER (WHERE r.row_rank = 1) AS canonical_id,
     array_agg(DISTINCT r.id) FILTER (WHERE r.row_rank > 1) AS duplicate_ids,
     count(DISTINCT cm.id)::int AS media_references
  FROM ranked r
  LEFT JOIN city_media_cache cm ON cm.city_id = r.id
  WHERE r.group_size > 1
  GROUP BY lower(r.city_name), lower(r.country)
  ORDER BY lower(r.city_name), lower(r.country)
`;

async function reconcile(client: pg.Client, shouldApply: boolean): Promise<void> {
  await client.query("BEGIN");
  if (shouldApply) await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
  try {
    const result = await client.query<DuplicateGroup>(duplicateQuery);

    if (result.rows.length === 0) {
      console.log("No duplicate normalized city/country groups found.");
      await client.query("ROLLBACK");
      return;
    }

    for (const group of result.rows) {
      console.log(
        `${group.city_name}/${group.country}: canonical=${group.canonical_id}, ` +
        `duplicates=${group.duplicate_ids.join(",")}, media=${group.media_references}`
      );
    }

    if (!shouldApply) {
      console.log(`Audit only: ${result.rows.length} group(s) require reconciliation.`);
      await client.query("ROLLBACK");
      return;
    }

    for (const group of result.rows) {
      await client.query(
        `UPDATE city_media_cache SET city_id = $1 WHERE city_id = ANY($2::varchar[])`,
        [group.canonical_id, group.duplicate_ids]
      );
      await client.query(
        `DELETE FROM travel_pulse_cities WHERE id = ANY($1::varchar[])`,
        [group.duplicate_ids]
      );
    }
    await client.query("COMMIT");
    console.log(`Reconciled ${result.rows.length} duplicate group(s); related media preserved.`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function assertDisposableDatabase(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  if (host === null || !DISPOSABLE_HOSTS.has(host)) {
    throw new Error(
      `[reconcile-travelpulse-cities] REFUSING self-test: DATABASE_URL host ` +
        `'${host ?? "<none>"}' is not a recognized disposable database. ` +
        `Use a loopback database or opt in deliberately with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

async function runSelfTest(): Promise<void> {
  await assertDisposableDatabase();
  const run = crypto.randomUUID().slice(0, 8);
  const canonicalId = `tp-self-${run}-canonical`;
  const duplicateId = `tp-self-${run}-duplicate`;
  const mediaIds = [`tp-self-${run}-media-1`, `tp-self-${run}-media-2`];
  const client = new Client();
  await client.connect();
  let hadIndex = false;
  try {
    const indexResult = await client.query<{ index_name: string | null }>(
      `SELECT to_regclass('public.travel_pulse_cities_city_country_unique') AS index_name`,
    );
    hadIndex = indexResult.rows[0]?.index_name !== null;
    await client.query("DROP INDEX IF EXISTS travel_pulse_cities_city_country_unique");
    await client.query(
      `INSERT INTO travel_pulse_cities (id, city_name, country, pulse_score)
       VALUES ($1, 'Tokyo', 'Japan', 95), ($2, 'tokyo', 'japan', 10)`,
      [canonicalId, duplicateId],
    );
    await client.query(
      `INSERT INTO city_media_cache (id, city_id, city_name, country, source, media_type, url)
       VALUES ($1, $3, 'Tokyo', 'Japan', 'pexels', 'photo', 'https://example.test/tokyo-1'),
              ($2, $4, 'tokyo', 'japan', 'pexels', 'photo', 'https://example.test/tokyo-2')`,
      [mediaIds[0], mediaIds[1], canonicalId, duplicateId],
    );

    await reconcile(client, true);

    const cities = await client.query<{ id: string }>(
      `SELECT id FROM travel_pulse_cities
       WHERE lower(city_name) = 'tokyo' AND lower(country) = 'japan'`,
    );
    if (cities.rows.length !== 1 || cities.rows[0].id !== canonicalId) {
      throw new Error("Self-test failed: canonical Tokyo/Japan city row was not preserved.");
    }
    const media = await client.query<{ city_id: string }>(
      `SELECT city_id FROM city_media_cache WHERE id = ANY($1::varchar[]) ORDER BY id`,
      [mediaIds],
    );
    if (media.rows.length !== mediaIds.length || media.rows.some((row) => row.city_id !== canonicalId)) {
      throw new Error("Self-test failed: city_media_cache references were not fully repointed.");
    }
    await client.query(
      `CREATE UNIQUE INDEX travelpulse_city_reconciliation_self_test_unique
       ON travel_pulse_cities (lower(city_name), lower(country))`,
    );
    console.log("Self-test passed: city merge preserves media and normalized uniqueness.");
    await client.query("DROP INDEX travelpulse_city_reconciliation_self_test_unique");
  } finally {
    await client.query("DROP INDEX IF EXISTS travelpulse_city_reconciliation_self_test_unique").catch(() => undefined);
    await client.query("DELETE FROM city_media_cache WHERE id = ANY($1::varchar[])", [mediaIds]).catch(() => undefined);
    await client.query("DELETE FROM travel_pulse_cities WHERE id = ANY($1::varchar[])", [[canonicalId, duplicateId]]).catch(() => undefined);
    if (hadIndex) {
      await client.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS travel_pulse_cities_city_country_unique
         ON travel_pulse_cities (lower(city_name), lower(country))`,
      );
    }
    await client.end();
  }
}

async function main(): Promise<void> {
  if (selfTest && (apply || approved)) {
    throw new Error("Use --self-test by itself; it manages its disposable fixtures and transaction approval.");
  }
  if (selfTest) {
    await runSelfTest();
    return;
  }
  if (apply && !approved) {
    throw new Error(
      "Refusing to write: pass --apply and set TRAVELPULSE_CITY_RECONCILIATION_APPROVED=true."
    );
  }

  const client = new Client();
  await client.connect();
  try {
    await reconcile(client, apply);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[reconcile-travelpulse-cities] Fatal:", error);
  process.exit(1);
});