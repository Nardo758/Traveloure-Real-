/**
 * Smoke 13 #3 (decision-maker, Oct 6, 2026 — ledger `2026-10-06-smoke13-handoff-money`; R-n amended
 * "routable = verified + payable"). WHO MAY BE ROUTED WORK, stated ONCE (§18 rule 1).
 *
 *   An expert is ROUTABLE only when
 *     · their expert application is APPROVED (`local_expert_forms.status = 'approved'`) — never
 *       the `travel_expert` role alone, AND
 *     · their Stripe Identity check is verified (`local_expert_forms.identity_verification_status`
 *       = 'verified'), AND
 *     · their Stripe Connect account is onboarded (`local_expert_forms.stripe_connect_status`
 *       = 'complete') — a routed expert must be able to be PAID for the work, AND
 *     · they are not SEED-SOURCED (an account a seed file created — `@example.com`, the
 *       `traveloure.test` fixture domain, or a named beta-seed persona).
 *   The platform concierge POOL account (LD 51) is NEVER routed (smoke-13 addendum, decision-maker
 *   Oct 6, 2026): every routing selector — lead routing (`routeLead`), the handoff match and the
 *   expert door's picker — excludes it, and it is reachable ONLY as the fallback path (the 24 h
 *   concierge offer and the pooled booking-concierge hand-off). `isConciergePoolAccount` is the
 *   one test, read by all three.
 *
 * EVERY reader uses this one predicate: lead routing (`routeLead`, hence `matchHandoff`), the expert
 * door's candidates, content matching's recommendations, and the public `/experts` directory
 * (list + counts — so a Pending, unverified or unpayable account never appears there, and
 * "Recommended for Kyoto" can never be the concierge). `SHOW_DEMO_EXPERTS=1` (CI's seeded fixture
 * databases, a demo instance — never production) relaxes the DIRECTORY only, back to every approved
 * expert; it never makes anyone routable and never shows the pool account.
 *
 * Negative space: there is no seed-marker COLUMN, so "seed-sourced" is read off the account's
 * email. `server/__tests__/expert-routability.test.ts` scans every seed file under `server/` and
 * fails when a seeded expert email is not classified seed here — the list cannot drift silently.
 */
import { sql, type SQL } from "drizzle-orm";

/** Email domains only seed files and fixtures use. */
export const SEED_EXPERT_EMAIL_DOMAINS: readonly string[] = ["example.com", "example.org", "traveloure.test"];

/**
 * Beta-seed personas created on the real `traveloure.com` domain (`server/seeds/beta-*.ts`), which
 * a domain rule cannot catch. Lower-case.
 */
export const SEED_EXPERT_EMAILS: readonly string[] = [
  "ahmed.hassan@traveloure.com",
  "alexandre.beaumont@traveloure.com",
  "amelie.dubois@traveloure.com",
  "carlos.rivera@traveloure.com",
  "erik.andersen@traveloure.com",
  "gabriela.santos@traveloure.com",
  "james.wilson@traveloure.com",
  "lucia.mendoza@traveloure.com",
  "made.wirawan@traveloure.com",
  "marco.rossi@traveloure.com",
  "maya.chen@traveloure.com",
  "sarah.mitchell@traveloure.com",
  "sofia.papadopoulos@traveloure.com",
  "victoria.ashford@traveloure.com",
  "yuki.tanaka@traveloure.com",
];

/** Pure. True when the email belongs to a seed-sourced account. A missing email is NOT seed. */
export function isSeedExpertEmail(email: string | null | undefined): boolean {
  const e = String(email ?? "").trim().toLowerCase();
  if (!e.includes("@")) return false;
  const domain = e.slice(e.lastIndexOf("@") + 1);
  return SEED_EXPERT_EMAIL_DOMAINS.includes(domain) || SEED_EXPERT_EMAILS.includes(e);
}

/** `SHOW_DEMO_EXPERTS=1` shows seed-sourced experts on the public directory (demo/staging only). */
export function showDemoExperts(): boolean {
  return process.env.SHOW_DEMO_EXPERTS === "1";
}

/** Pure. The routable rule over the two `local_expert_forms` facts and the account email. */
export function isRoutableExpert(input: {
  applicationStatus: string | null | undefined;
  identityVerificationStatus: string | null | undefined;
  stripeConnectStatus: string | null | undefined;
  email: string | null | undefined;
}): boolean {
  return (
    input.applicationStatus === "approved" &&
    input.identityVerificationStatus === "verified" &&
    input.stripeConnectStatus === "complete" &&
    !isSeedExpertEmail(input.email)
  );
}

/** SQL form of `isSeedExpertEmail` over a users-email expression. */
export function seedEmailSql(emailExpr: SQL): SQL {
  const domains = sql.join(SEED_EXPERT_EMAIL_DOMAINS.map((d) => sql`${d}`), sql`, `);
  const emails = sql.join(SEED_EXPERT_EMAILS.map((m) => sql`${m}`), sql`, `);
  return sql`(lower(split_part(coalesce(${emailExpr}, ''), '@', 2)) IN (${domains}) OR lower(coalesce(${emailExpr}, '')) IN (${emails}))`;
}

/**
 * SQL form of `isRoutableExpert` for the scorer (aliases `lef` = local_expert_forms, `u` = users),
 * with the concierge pool account EXCLUDED (the addendum — it is the fallback, never a match).
 */
export function routableExpertSql(conciergePoolUserId: string | null): SQL {
  const routable = sql`(lef.status = 'approved' AND lef.identity_verification_status = 'verified' AND lef.stripe_connect_status = 'complete' AND NOT ${seedEmailSql(sql`u.email`)})`;
  return conciergePoolUserId ? sql`(u.id <> ${conciergePoolUserId} AND ${routable})` : routable;
}

/**
 * The ONE test every routing selector reads: is this the platform concierge POOL account? It is
 * excluded from lead routing, the handoff match and the expert door, and reached only as the
 * fallback path.
 */
export async function isConciergePoolAccount(userId: string | null | undefined): Promise<boolean> {
  const { isPlatformConciergeUserId } = await import("./platform-concierge.service");
  return isPlatformConciergeUserId(userId);
}

/** The ROUTABLE accounts among `userIds` (one query, the same SQL the scorer uses). */
export async function routableUserIds(userIds: readonly string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const { db } = await import("../db");
  const r = await db.execute(sql`
    SELECT lef.user_id AS id FROM local_expert_forms lef JOIN users u ON u.id = lef.user_id
    WHERE lef.user_id IN (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)}) AND ${await routableExpertFilterSql()}
  `);
  return new Set((r.rows ?? []).map((row: any) => String(row.id)));
}

/**
 * The public directory's gate (`/api/experts`, `/api/experts/counts`): ROUTABLE experts only, and
 * never the pool account. `SHOW_DEMO_EXPERTS=1` relaxes the routable half for a seeded fixture or
 * demo database — the pool account stays out either way. The rows arrive PROJECTED (no email, no
 * verification columns), so the facts are read here, server-side, and never published.
 */
export async function directoryExperts<T extends { id?: unknown }>(experts: readonly T[]): Promise<T[]> {
  const { getPlatformConciergeUserId } = await import("./platform-concierge.service");
  const pool = await getPlatformConciergeUserId();
  const withoutPool = experts.filter((e) => !pool || String(e.id ?? "") !== pool);
  if (showDemoExperts()) return withoutPool;
  const ok = await routableUserIds(withoutPool.map((e) => String(e.id ?? "")).filter(Boolean));
  return withoutPool.filter((e) => ok.has(String(e.id ?? "")));
}

/** The routing filter, resolved: `routableExpertSql` over the CURRENT pool-account id. */
export async function routableExpertFilterSql(): Promise<SQL> {
  const { getPlatformConciergeUserId } = await import("./platform-concierge.service");
  return routableExpertSql(await getPlatformConciergeUserId());
}
