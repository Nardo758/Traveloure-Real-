/**
 * ONE predicate for "is it safe to write demo/fictional content in this boot?" (§18 rule 1).
 *
 * Delegates to the codebase's existing canonical production-detection predicate,
 * `isProdStrictEnv` (server/utils/stripe-key-policy.ts) — the same one
 * server/middleware/test-only-endpoint.ts's `isTestSeedEnabled` already delegates to
 * (pinned by server/__tests__/test-seed-endpoint-gate.test.ts S4: "production detection
 * must come from the single shared predicate, never a local copy"). This file adds no
 * second implementation of "what counts as production" — it only names the demo-seed
 * question and answers it with that one rule.
 *
 * demoSeedsAllowed() is TRUE everywhere isProdStrictEnv() is FALSE: development, plain
 * test runs, and a prod-strict boot carrying the CI/e2e escape hatch
 * (ALLOW_TEST_ACCOUNTS=1 — the production BUNDLE booted against a throwaway database for
 * CI, which is exactly what that hatch exists for).
 *
 * STATED NEGATIVE SPACE (§18d): this predicate reads environment variables only. It
 * cannot tell a staging database that was copied or restored from production apart from
 * an ordinary staging database — both read as non-production and both would seed demo
 * rows. It also says nothing about AUTHORIZATION; a seeder gated by this predicate still
 * runs with full DB access from whatever process invoked it. And it knows only about the
 * seeders that call it — a demo/fictional seeder added elsewhere that does not import
 * this module is invisible to it (see server/__tests__/demo-seeders-gated.test.ts, which
 * checks the OTHER half: that every demo seeder server/index.ts invokes is invoked under
 * this gate).
 */

import { isProdStrictEnv } from "../../utils/stripe-key-policy";

/**
 * True when demo/fictional seed data may be written — i.e. NOT a prod-strict boot.
 * A seeder that inserts fictional businesses, mock experts, or any other content a
 * traveler could mistake for real must refuse to write unless this returns true
 * (CLAUDE.md §13: a fictional "approved" listing in production is a lie a traveler can
 * pay for).
 */
export function demoSeedsAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return !isProdStrictEnv(env);
}

/**
 * One shared skip-line shape so every gated seeder logs the same way (name + reason),
 * rather than each call site inventing its own wording. Callers still choose their own
 * logger (seed files use console.log today; server/index.ts uses the pino `logger`) —
 * this only fixes the MESSAGE, not the sink.
 */
export function demoSeedSkipMessage(seederName: string): string {
  return `[demo-seed-gate] Skipped ${seederName} — prod-strict environment (CLAUDE.md §13: demo/fictional content must never seed in production)`;
}

/**
 * B3 ruling 2 (ledger `2026-10-09-b3-expert-routability`): the SECOND question, the one
 * `demoSeedsAllowed` states it cannot answer — is the DATABASE itself a development one? A hand-run
 * seed in a dev shell that holds production's `DATABASE_URL` reads as non-production to every
 * env-var predicate. So the demo seeders that write fictional EXPERTS (`seedMockExperts`,
 * `seedProviderServices`, `scripts/seed-california-full.ts`) also refuse unless the URL's host is a
 * development host. FAILS CLOSED (decision-maker, Oct 9, 2026): the default list is `localhost`, a
 * unix socket (`host=/…`) and Replit's workspace database `helium` — nothing else — plus any host
 * named in `DEMO_SEED_DATABASE_HOSTS` (comma-separated; set it in the DEVELOPMENT environment only,
 * never in Deployments). No URL, or one that does not parse ⇒ refused. This is a guard, not a
 * migration: it writes nothing and deletes nothing.
 *
 * STATED NEGATIVE SPACE: a production database reached through a local tunnel on `localhost`
 * reads as development here. The env predicate above still refuses a prod-strict boot.
 */
/** The default development hosts (B3 ruling 2): localhost and Replit's workspace database. A unix socket also passes. */
export const DEMO_SEED_DEFAULT_DATABASE_HOSTS: readonly string[] = ["localhost", "helium"];

export function demoSeedDatabaseAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.DATABASE_URL ?? "").trim();
  if (!raw) return false;
  let host = "";
  try {
    const u = new URL(raw);
    host = (u.searchParams.get("host") || u.hostname || "").toLowerCase();
  } catch {
    return false;
  }
  if (host.startsWith("/")) return true;
  const extra = String(env.DEMO_SEED_DATABASE_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return [...DEMO_SEED_DEFAULT_DATABASE_HOSTS, ...extra].includes(host);
}

/** The skip line for `demoSeedDatabaseAllowed` — same shape as `demoSeedSkipMessage`. */
export function demoSeedDatabaseSkipMessage(seederName: string): string {
  return (
    `[demo-seed-gate] REFUSED ${seederName} — DATABASE_URL's host is not a development database ` +
    `(allowed: localhost, a unix socket, helium). If this IS the development database, add its host ` +
    `to DEMO_SEED_DATABASE_HOSTS (comma-separated) in the DEVELOPMENT environment only — never in ` +
    `Deployments. Demo experts are never seeded into a shared or production database (B3 ruling 2).`
  );
}
