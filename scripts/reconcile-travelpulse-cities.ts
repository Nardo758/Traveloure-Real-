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
 * The operation runs in one serializable transaction. It keeps the row with
 * the highest pulse score, then newest update/creation timestamp, then the
 * lowest id; this deterministic rule is the governance decision for Tokyo/
 * Japan, Sydney/Australia, and any later duplicate group. Media references
 * are moved before duplicate rows are deleted because city_media_cache has
 * ON DELETE CASCADE.
 */
import pg from "pg";

const { Client } = pg;
const apply = process.argv.includes("--apply");
const approved = process.env.TRAVELPULSE_CITY_RECONCILIATION_APPROVED === "true";

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
    array_agg(r.id ORDER BY r.row_rank) FILTER (WHERE r.row_rank > 1) AS duplicate_ids,
    count(cm.id)::int AS media_references
  FROM ranked r
  LEFT JOIN city_media_cache cm ON cm.city_id = r.id
  WHERE r.group_size > 1
  GROUP BY lower(r.city_name), lower(r.country)
  ORDER BY lower(r.city_name), lower(r.country)
`;

async function main(): Promise<void> {
  if (apply && !approved) {
    throw new Error(
      "Refusing to write: pass --apply and set TRAVELPULSE_CITY_RECONCILIATION_APPROVED=true."
    );
  }

  const client = new Client();
  await client.connect();
  try {
    await client.query("BEGIN");
    if (apply) await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
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

    if (!apply) {
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
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[reconcile-travelpulse-cities] Fatal:", error);
  process.exit(1);
});