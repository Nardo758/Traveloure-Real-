/**
 * PX-1 (ledger `2026-10-18-px1-partner-links`; decision-maker, Oct 17, 2026: "GetYourGuide — pause").
 *
 * ONE switch and ONE hide rule for a paused partner. Today the only paused partner is GetYourGuide,
 * whose search authenticated with the Travelpayouts API token. While paused:
 *   • no GetYourGuide search call is made (the Travelpayouts sync, the live partner search, the deals
 *     feed) — `searchGetYourGuide` answers `[]` before any request;
 *   • the server never returns a GetYourGuide `affiliate_products` row (or its `content_registry`
 *     mirror) on a traveler read path — Browse, the planner, Discover, the redirect, grounding.
 * Rows are NOT deleted or rewritten: they stay in the table, and the switch brings them back.
 *
 * The switch is the same "1" test every operator switch uses: `GETYOURGUIDE_ENABLED=1` un-pauses,
 * anything else (unset included) keeps it paused. Reported by `/api/health` (`HEALTH_FLAG_NAMES`).
 *
 * VD-1 (ledger `2026-10-18-viator-direct-live`; decision-maker, Oct 18, 2026): STORED Viator rows are
 * hidden the same way, with no switch. Viator is shown live only (Basic Access has nothing compliant to
 * store), so no traveler read returns a stored Viator `affiliate_products` row or its registry mirror —
 * planner suggestions included. Rows are kept, never deleted.
 */
import { sql, type SQL } from "drizzle-orm";
import { affiliatePartners, affiliateProducts, contentRegistry } from "@shared/schema";

export const GETYOURGUIDE_ENABLED_ENV = "GETYOURGUIDE_ENABLED";

/** Matches a partner's name or a link's host. Lower-case. */
export const GETYOURGUIDE_PARTNER_NAME = "getyourguide";
export const GETYOURGUIDE_HOST = "getyourguide.com";
export const VIATOR_PARTNER_NAME = "viator";
export const VIATOR_HOST = "viator.com";

export function getYourGuidePaused(env: Record<string, string | undefined> = process.env): boolean {
  return env[GETYOURGUIDE_ENABLED_ENV] !== "1";
}

/** The partners whose stored rows a traveler read never returns, right now. */
export function hiddenStoredPartners(env: Record<string, string | undefined> = process.env): Array<{ name: string; host: string }> {
  const out = [{ name: VIATOR_PARTNER_NAME, host: VIATOR_HOST }];
  if (getYourGuidePaused(env)) out.push({ name: GETYOURGUIDE_PARTNER_NAME, host: GETYOURGUIDE_HOST });
  return out;
}

/** Pure row test (the same rule as the SQL below), for readers that already hold the row. */
export function isPausedPartnerProduct(
  row: { productUrl?: string | null; affiliateUrl?: string | null; partnerName?: string | null; partnerWebsiteUrl?: string | null },
  env: Record<string, string | undefined> = process.env,
): boolean {
  return hiddenStoredPartners(env).some(({ name, host }) => {
    const has = (v: string | null | undefined) => typeof v === "string" && v.toLowerCase().includes(host);
    return (
      (row.partnerName ?? "").trim().toLowerCase() === name ||
      has(row.partnerWebsiteUrl) ||
      has(row.productUrl) ||
      has(row.affiliateUrl)
    );
  });
}

const hiddenPartnerIds = (parts: Array<{ name: string; host: string }>) =>
  sql`(SELECT p.id FROM ${affiliatePartners} p WHERE ${sql.join(
    parts.map(({ name, host }) => sql`lower(btrim(p.name)) = ${name} OR p.website_url ILIKE ${"%" + host + "%"}`),
    sql` OR `,
  )})`;

/**
 * WHERE fragment over `affiliate_products`: true for a row a traveler read may return. Stored Viator rows
 * are always hidden; GetYourGuide's only while paused.
 */
export function affiliateProductNotPausedWhere(env: Record<string, string | undefined> = process.env): SQL {
  const parts = hiddenStoredPartners(env);
  return sql`(${affiliateProducts.partnerId} NOT IN ${hiddenPartnerIds(parts)}
    ${sql.join(
      parts.map(
        ({ host }) => sql`AND COALESCE(${affiliateProducts.productUrl}, '') NOT ILIKE ${"%" + host + "%"}
    AND COALESCE(${affiliateProducts.affiliateUrl}, '') NOT ILIKE ${"%" + host + "%"}`,
      ),
      sql` `,
    )})`;
}

/** WHERE fragment over `content_registry`: drops the `affiliate_product` mirror of a hidden partner's row. */
export function contentRegistryNotPausedWhere(env: Record<string, string | undefined> = process.env): SQL {
  return sql`NOT (${contentRegistry.contentType} = 'affiliate_product'
    AND COALESCE(${contentRegistry.metadata}->>'partnerId', '') IN ${hiddenPartnerIds(hiddenStoredPartners(env))})`;
}
