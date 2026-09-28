/**
 * The ONE reader of the partner registry's domains (ledger `2026-09-28-landing-doors`).
 *
 * Moved verbatim from `blog-posts.service.ts`, where Lane C wrote it for ruling 4 (Locked Decision
 * 57): every `affiliate_partners.website_url` host, APPROVED OR NOT and ACTIVE OR NOT. That breadth is
 * deliberate for a refusal list — a rejected or paused partner is still an affiliate domain, and
 * narrowing it would let a link through that the blog refuses today. Callers: the blog's source
 * admission and draft pipeline, and the `city_events` ticket-link refusal. The host rule itself is
 * `shared/partner-hosts.ts`.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { partnerHostOf } from "@shared/partner-hosts";

export async function loadPartnerHosts(): Promise<string[]> {
  const r = await db.execute(sql`SELECT website_url FROM affiliate_partners WHERE website_url IS NOT NULL`);
  const hosts = new Set<string>();
  for (const row of r.rows as any[]) {
    const h = partnerHostOf(String(row.website_url ?? ""));
    if (h) hosts.add(h);
  }
  return Array.from(hosts);
}
