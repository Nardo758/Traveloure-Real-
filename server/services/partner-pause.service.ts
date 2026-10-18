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
 */
import { sql, type SQL } from "drizzle-orm";
import { affiliatePartners, affiliateProducts, contentRegistry } from "@shared/schema";

export const GETYOURGUIDE_ENABLED_ENV = "GETYOURGUIDE_ENABLED";

/** Matches a partner's name or a link's host. Lower-case. */
export const GETYOURGUIDE_PARTNER_NAME = "getyourguide";
export const GETYOURGUIDE_HOST = "getyourguide.com";

export function getYourGuidePaused(env: Record<string, string | undefined> = process.env): boolean {
  return env[GETYOURGUIDE_ENABLED_ENV] !== "1";
}

/** Pure row test (the same rule as the SQL below), for readers that already hold the row. */
export function isPausedPartnerProduct(
  row: { productUrl?: string | null; affiliateUrl?: string | null; partnerName?: string | null; partnerWebsiteUrl?: string | null },
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (!getYourGuidePaused(env)) return false;
  const has = (v: string | null | undefined) => typeof v === "string" && v.toLowerCase().includes(GETYOURGUIDE_HOST);
  return (
    (row.partnerName ?? "").trim().toLowerCase() === GETYOURGUIDE_PARTNER_NAME ||
    has(row.partnerWebsiteUrl) ||
    has(row.productUrl) ||
    has(row.affiliateUrl)
  );
}

const PAUSED_PARTNER_IDS = sql`(SELECT p.id FROM ${affiliatePartners} p
  WHERE lower(btrim(p.name)) = ${GETYOURGUIDE_PARTNER_NAME} OR p.website_url ILIKE ${"%" + GETYOURGUIDE_HOST + "%"})`;

/**
 * WHERE fragment over `affiliate_products`: true for a row a traveler read may return. `TRUE` when no
 * partner is paused, so un-pausing restores every row with no other change.
 */
export function affiliateProductNotPausedWhere(env: Record<string, string | undefined> = process.env): SQL {
  if (!getYourGuidePaused(env)) return sql`TRUE`;
  return sql`(${affiliateProducts.partnerId} NOT IN ${PAUSED_PARTNER_IDS}
    AND COALESCE(${affiliateProducts.productUrl}, '') NOT ILIKE ${"%" + GETYOURGUIDE_HOST + "%"}
    AND COALESCE(${affiliateProducts.affiliateUrl}, '') NOT ILIKE ${"%" + GETYOURGUIDE_HOST + "%"})`;
}

/** WHERE fragment over `content_registry`: drops the `affiliate_product` mirror of a paused partner's row. */
export function contentRegistryNotPausedWhere(env: Record<string, string | undefined> = process.env): SQL {
  if (!getYourGuidePaused(env)) return sql`TRUE`;
  return sql`NOT (${contentRegistry.contentType} = 'affiliate_product'
    AND COALESCE(${contentRegistry.metadata}->>'partnerId', '') IN ${PAUSED_PARTNER_IDS})`;
}
