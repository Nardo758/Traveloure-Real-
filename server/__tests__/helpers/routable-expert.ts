/**
 * B3 (ledger `2026-10-09-b3-expert-routability`; decision-maker sanction, Oct 9, 2026, group A).
 *
 * The ONE advisor-row author refuses a NEW advisor who is not ROUTABLE (approved application,
 * Identity verified, Connect complete, not seed-sourced — `server/services/expert-routability.ts`).
 * Fixtures that put an expert on a plan to test PERMISSIONS give that expert a routable application
 * through this one helper, so no test restates the predicate's columns.
 *
 * Idempotent: an existing application for the user is set routable; otherwise one is inserted.
 * Safe to import statically: it loads the database only when called.
 * The account's email must not be seed-sourced unless the run sets SHOW_DEMO_EXPERTS=1 (CI does).
 */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";

export async function insertRoutableExpertForm(userId: string): Promise<void> {
  // Imported lazily: several suites set DATABASE_URL and friends before their first `../db` import.
  const { db } = await import("../../db");
  const updated = await db.execute(sql`
    UPDATE local_expert_forms
       SET status = 'approved', identity_verification_status = 'verified', stripe_connect_status = 'complete'
     WHERE user_id = ${userId}
  `);
  if ((updated as any).rowCount > 0) return;
  await db.execute(sql`
    INSERT INTO local_expert_forms (id, user_id, status, identity_verification_status, stripe_connect_status)
    VALUES (${randomUUID()}, ${userId}, 'approved', 'verified', 'complete')
  `);
}
