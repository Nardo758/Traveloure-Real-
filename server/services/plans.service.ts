/**
 * PLANS — Pricing ledger Lane 1 (Task 1669).
 *
 * Minimal typed read accessors for the `plans` table (migration 259). Stripe product creation
 * and entitlement/gating logic are explicitly out of scope for this lane — this file only
 * exposes the rows that migration inserted (trip_pass / plus_annual / pro_monthly).
 */
import { db } from "../db";
import { sql } from "drizzle-orm";

export interface PlanRow {
  key: string;
  name: string;
  priceCents: number;
  interval: string;
  allowances: Record<string, unknown>;
  active: boolean;
  effectiveFrom: string;
}

function toPlanRow(row: Record<string, unknown>): PlanRow {
  return {
    key: String(row.key),
    name: String(row.name),
    priceCents: Number(row.price_cents),
    interval: String(row.interval),
    allowances: (row.allowances as Record<string, unknown>) ?? {},
    active: Boolean(row.active),
    effectiveFrom: String(row.effective_from),
  };
}

/** Read one plan by key. Returns null when absent/inactive — callers decide whether that is fatal. */
export async function getPlan(key: string): Promise<PlanRow | null> {
  const result = await db.execute(sql`
    SELECT key, name, price_cents, interval, allowances, active, effective_from
      FROM plans
     WHERE key = ${key} AND active = true
     LIMIT 1
  `);
  const row = result.rows?.[0] as Record<string, unknown> | undefined;
  return row ? toPlanRow(row) : null;
}

/** All active plans, ordered by price. */
export async function listActivePlans(): Promise<PlanRow[]> {
  const result = await db.execute(sql`
    SELECT key, name, price_cents, interval, allowances, active, effective_from
      FROM plans
     WHERE active = true
     ORDER BY price_cents ASC
  `);
  return (result.rows as Record<string, unknown>[]).map(toPlanRow);
}
