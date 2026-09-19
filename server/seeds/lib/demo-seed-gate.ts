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
