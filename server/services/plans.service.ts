import { eq } from "drizzle-orm";
import { db } from "../db";
import { plans, type Plan } from "@shared/schema";

export const PLAN_KEYS = {
  TRIP_PASS: "trip_pass",
  PLUS_ANNUAL: "plus_annual",
  PRO_MONTHLY: "pro_monthly",
} as const;

export type PlanKey = typeof PLAN_KEYS[keyof typeof PLAN_KEYS];

/** Reads an active plan row without inventing a default when configuration is absent. */
export async function readPlan(key: string): Promise<Plan | null> {
  const [row] = await db
    .select()
    .from(plans)
    .where(eq(plans.key, key))
    .limit(1);
  return row ?? null;
}

/** Fails loudly when a plan is missing or inactive. */
export async function requirePlan(key: PlanKey | string): Promise<Plan> {
  const row = await readPlan(key);
  if (!row) throw new Error(`plan unavailable: key=${key}`);
  if (!row.active) throw new Error(`plan inactive: key=${key}`);
  return row;
}