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
 * "Recommended for Kyoto" can never be the concierge).
 *
 * `SHOW_DEMO_EXPERTS=1` (CI's seeded fixture databases — never production; `/api/health` reports
 * it) relaxes ONLY the seed-domain clause, for EVERY reader alike. Approval, Identity and Connect are
 * never relaxed, and the pool account is never let through.
 *
 * Negative space: there is no seed-marker COLUMN, so "seed-sourced" is read off the account's
 * email. `server/__tests__/expert-routability.test.ts` scans every seed file under `server/` and
 * fails when a seeded expert email is not classified seed here — the list cannot drift silently.
 */
import { sql, type SQL } from "drizzle-orm";

/** Email domains only seed files and fixtures use. */
export const SEED_EXPERT_EMAIL_DOMAINS: readonly string[] = ["example.com", "example.org", "traveloure.test", "traveloure-qa.test"];

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

/** Pure. The routable rule over the `local_expert_forms` facts and the account email. */
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
    (showDemoExperts() || !isSeedExpertEmail(input.email))
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
  const seedClause = showDemoExperts() ? sql`` : sql` AND NOT ${seedEmailSql(sql`u.email`)}`;
  const routable = sql`(lef.status = 'approved' AND lef.identity_verification_status = 'verified' AND lef.stripe_connect_status = 'complete'${seedClause})`;
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
 * The public directory's gate (`/api/experts`, `/api/experts/counts`): the SAME routable predicate
 * every selector reads (so a Pending, unverified or unpayable account, or the pool account, is never
 * listed). The rows arrive PROJECTED (no email, no verification columns), so the facts are read here,
 * server-side, and never published.
 */
export async function directoryExperts<T extends { id?: unknown }>(experts: readonly T[]): Promise<T[]> {
  const ok = await routableUserIds(experts.map((e) => String(e.id ?? "")).filter(Boolean));
  return experts.filter((e) => ok.has(String(e.id ?? "")));
}

/** The routing filter, resolved: `routableExpertSql` over the CURRENT pool-account id. */
export async function routableExpertFilterSql(): Promise<SQL> {
  const { getPlatformConciergeUserId } = await import("./platform-concierge.service");
  return routableExpertSql(await getPlatformConciergeUserId());
}

/**
 * PUBLIC LISTING READERS never show the concierge pool account's listings (decision-maker, Oct 6,
 * 2026 — ledger `2026-10-06-pool-listings-not-public`). The pool account's `booking_concierge`
 * listing is reached ONLY as the fallback path (LD 51 as amended); a Services, Destinations or
 * Browse card for it is the "Booking Concierge · $35 per service · Unknown" row this closes. The
 * same pool test the directory's `routableExpertSql` carries, as a WHERE clause over a listing's
 * owner column. No pool configured ⇒ nothing is excluded. Readers BY ID (detail, checkout, the
 * fallback offer) are deliberately not gated: they are how the fallback is bought.
 */
export async function notConciergePoolListingSql(ownerUserIdColumn: SQL | { getSQL(): SQL }): Promise<SQL> {
  const { getPlatformConciergeUserId } = await import("./platform-concierge.service");
  const poolId = await getPlatformConciergeUserId();
  return poolId ? sql`(${ownerUserIdColumn} IS DISTINCT FROM ${poolId})` : sql`TRUE`;
}

/** The same exclusion over rows already read: drops every row the pool account owns. */
export async function withoutConciergePoolListings<T>(rows: readonly T[], ownerOf: (row: T) => string | null | undefined): Promise<T[]> {
  const { getPlatformConciergeUserId } = await import("./platform-concierge.service");
  const poolId = await getPlatformConciergeUserId();
  return poolId ? rows.filter((r) => ownerOf(r) !== poolId) : [...rows];
}

// ─── B3 (ledger `2026-10-09-b3-expert-routability`; decision-maker rulings 1–4, Oct 9, 2026) ────────

/**
 * A PUBLIC expert account: an APPROVED application and not seed-sourced (the seed clause relaxes
 * under `SHOW_DEMO_EXPERTS=1`, exactly as `isRoutableExpert`'s does). Weaker than routable on
 * purpose (ruling 1/3): an approved expert whose Identity or Connect has LAPSED is still a real
 * person — a real hire stays on the plan, their storefront page stays up — but a seed account or a
 * Pending/rejected application is never shown to a traveler at all.
 */
export function isPublicExpertAccount(input: {
  applicationStatus: string | null | undefined;
  email: string | null | undefined;
}): boolean {
  return input.applicationStatus === "approved" && (showDemoExperts() || !isSeedExpertEmail(input.email));
}

/** SQL form of `isPublicExpertAccount` over a `local_expert_forms.status` and a users-email expression. */
export function publicExpertSql(applicationStatusExpr: SQL, emailExpr: SQL): SQL {
  const seedClause = showDemoExperts() ? sql`` : sql` AND NOT ${seedEmailSql(emailExpr)}`;
  return sql`(${applicationStatusExpr} = 'approved'${seedClause})`;
}

/** Is this ONE account routable (approved + Identity verified + Connect complete + not seed + not the pool)? */
export async function isExpertIdRoutable(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  return (await routableUserIds([userId])).has(userId);
}

/** Refusal raised by the ONE advisor-row author when a NEW advisor would not be routable (ruling 1). */
export class AdvisorNotRoutableError extends Error {
  readonly code = "expert_not_routable";
  readonly status = 409;
  constructor(public readonly expertId: string) {
    super("This expert can't be added to a plan yet — their profile is not approved, verified and payable.");
  }
}
