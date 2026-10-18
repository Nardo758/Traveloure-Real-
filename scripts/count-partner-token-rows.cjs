#!/usr/bin/env node
/**
 * count-partner-token-rows.cjs — PX-1 (ledger `2026-10-18-px1-partner-links`). READ-ONLY.
 *
 * Counts the stored rows that still hold the Travelpayouts API token, plus the stored GetYourGuide
 * product rows the pause now hides. NUMBERS ONLY: it never prints a link, a row id or the token.
 * Rewriting the rows waits for the decision-maker's comment; this script changes nothing.
 *
 * The token is read from the environment (`TRAVELPAYOUTS_TOKEN`, the deployment's own secret) and
 * reaches the database only as a bound query parameter — never in the SQL text, never in output.
 *
 * Run on Replit, read-only:
 *   DATABASE_URL="<read-only production URL>" node scripts/count-partner-token-rows.cjs
 *
 * EXIT CODES. 0 = counted. 2 = no DATABASE_URL, no token configured, or a query failed.
 *
 * NEGATIVE SPACE (§18d): it looks for the token's exact value only. A row holding an older, already
 * rotated token is not found, and it counts only the two tables named below plus the GetYourGuide
 * rows; the vault (24 h TTL) and `transport_booking_options` (scrubbed on read since AF-1) are not counted.
 */
const { Client } = require("pg");

async function main() {
  const url = process.env.DATABASE_URL;
  const token = process.env.TRAVELPAYOUTS_TOKEN;
  if (!url) { console.error("DATABASE_URL is not set"); process.exit(2); }
  if (!token) { console.error("TRAVELPAYOUTS_TOKEN is not set — nothing to look for"); process.exit(2); }
  const like = `%${token.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION READ ONLY");
    const one = async (q) => Number((await client.query(q, [like])).rows[0].n);
    const counts = {
      affiliate_products_affiliate_url: await one(`SELECT count(*) AS n FROM affiliate_products WHERE affiliate_url LIKE $1`),
      affiliate_products_product_url: await one(`SELECT count(*) AS n FROM affiliate_products WHERE product_url LIKE $1`),
      affiliate_products_any_link: await one(`SELECT count(*) AS n FROM affiliate_products WHERE affiliate_url LIKE $1 OR product_url LIKE $1`),
      affiliate_booking_requests_affiliate_url: await one(`SELECT count(*) AS n FROM affiliate_booking_requests WHERE affiliate_url LIKE $1`),
    };
    const gyg = await client.query(`SELECT count(*) AS n FROM affiliate_products ap
      WHERE ap.partner_id IN (SELECT p.id FROM affiliate_partners p
                              WHERE lower(btrim(p.name)) = 'getyourguide' OR p.website_url ILIKE '%getyourguide.com%')
         OR COALESCE(ap.product_url, '') ILIKE '%getyourguide.com%'
         OR COALESCE(ap.affiliate_url, '') ILIKE '%getyourguide.com%'`);
    counts.getyourguide_affiliate_products_hidden = Number(gyg.rows[0].n);
    await client.query("ROLLBACK");
    for (const [k, v] of Object.entries(counts)) console.log(`${k}: ${v}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`count failed: ${err && err.code ? err.code : "error"}`);
  process.exit(2);
});
