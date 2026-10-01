/**
 * WHEN A FRESH FETCH MAY SPEND (content sourcing brief §7; A6 decision 3A; ledger
 * `2026-10-01-a6-tavily-extract`).
 *
 * `mayFetchFresh` is the ONE caller-side predicate (§18 rule 1): a fresh fetch happens only inside a
 * PAID RUN or an EXPERT ACTION. Every other context — above all the free draft — answers null, and
 * a null answer is a budget of 0, which every spending adapter refuses before it makes a call. The
 * free path therefore cannot reach Tavily at all.
 *
 * `resolveFreshFetchBudget` then caps what the basis may spend: what is left of the per-plan cap,
 * the per-day cap and the source's own daily ceiling, read off `api_usage_logs` (the table the
 * Tavily client already writes every call to, now tagged with `purpose: content_facts`). A cap that
 * cannot be read is treated as SPENT (fail closed) — "the meter is broken" never reads as "under".
 *
 * The context is built by a caller that has ALREADY verified it (the expert-action route checks a
 * §12 write-status advisor; a paid run has its own authorization). The predicate decides the basis,
 * it does not re-authorize.
 */
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { freshFetchDayCapCents, freshFetchPlanCapCents } from "../../config/content-facts.config";

export type FreshFetchContext =
  | { kind: "free_draft"; tripId?: string | null }
  | { kind: "paid_run"; tripId: string; runId: string; actorId: string | null }
  | { kind: "expert_action"; tripId: string; expertUserId: string };

export type FreshFetchBasis = "paid_run" | "expert_action";

export function mayFetchFresh(ctx: FreshFetchContext | null | undefined): FreshFetchBasis | null {
  if (!ctx) return null;
  if (ctx.kind === "paid_run" && ctx.tripId && ctx.runId) return "paid_run";
  if (ctx.kind === "expert_action" && ctx.tripId && ctx.expertUserId) return "expert_action";
  return null;
}

/** The tag every content-facts Tavily call carries on `api_usage_logs.metadata.purpose`. */
export const CONTENT_FACTS_USAGE_PURPOSE = "content_facts";

export interface SpentSoFar {
  planCents: number | null;
  dayCents: number | null;
  sourceDayCents: number | null;
}

/** Cents already spent, read off `api_usage_logs` (stored in tenths of a cent). null = unreadable. */
export async function readFreshFetchSpend(tripId: string, sourceId: string): Promise<SpentSoFar> {
  try {
    const r: any = await db.execute(sql`
      SELECT
        COALESCE(SUM(estimated_cost_cents) FILTER (WHERE metadata->>'tripId' = ${tripId}), 0) AS plan_tenths,
        COALESCE(SUM(estimated_cost_cents) FILTER (WHERE created_at >= date_trunc('day', now())), 0) AS day_tenths,
        COALESCE(SUM(estimated_cost_cents) FILTER (WHERE created_at >= date_trunc('day', now())
                                                    AND metadata->>'sourceId' = ${sourceId}), 0) AS source_day_tenths
        FROM api_usage_logs
       WHERE provider = 'tavily' AND metadata->>'purpose' = ${CONTENT_FACTS_USAGE_PURPOSE}`);
    const row = (r.rows ?? r)[0] ?? {};
    return {
      planCents: Number(row.plan_tenths) / 10,
      dayCents: Number(row.day_tenths) / 10,
      sourceDayCents: Number(row.source_day_tenths) / 10,
    };
  } catch (err) {
    console.error("[fresh-fetch] spend meter unreadable:", (err as Error)?.message ?? err);
    return { planCents: null, dayCents: null, sourceDayCents: null };
  }
}

export type FreshFetchBudget =
  | { basis: FreshFetchBasis; budgetCents: number }
  | { basis: null; budgetCents: 0; reason: "not_paid_or_expert" | "plan_cap_reached" | "day_cap_reached" | "source_cap_reached" | "meter_unreadable" };

/** Pure: what a basis may spend, given what is spent. */
export function freshFetchBudget(
  ctx: FreshFetchContext | null | undefined,
  spent: SpentSoFar,
  caps: { planCents: number; dayCents: number; sourceDayCents: number | null } = {
    planCents: freshFetchPlanCapCents(),
    dayCents: freshFetchDayCapCents(),
    sourceDayCents: null,
  },
): FreshFetchBudget {
  const basis = mayFetchFresh(ctx);
  if (!basis) return { basis: null, budgetCents: 0, reason: "not_paid_or_expert" };
  if (spent.planCents == null || spent.dayCents == null || spent.sourceDayCents == null) {
    return { basis: null, budgetCents: 0, reason: "meter_unreadable" };
  }
  const plan = caps.planCents - spent.planCents;
  const day = caps.dayCents - spent.dayCents;
  const source = caps.sourceDayCents == null ? Infinity : caps.sourceDayCents - spent.sourceDayCents;
  if (plan <= 0) return { basis: null, budgetCents: 0, reason: "plan_cap_reached" };
  if (day <= 0) return { basis: null, budgetCents: 0, reason: "day_cap_reached" };
  if (source <= 0) return { basis: null, budgetCents: 0, reason: "source_cap_reached" };
  return { basis, budgetCents: Math.min(plan, day, source) };
}

export async function resolveFreshFetchBudget(
  ctx: FreshFetchContext | null | undefined,
  source: { id: string; costCeilingCentsPerDay: number | null },
): Promise<FreshFetchBudget> {
  // A context with no fresh-fetch basis never reads the meter: nothing about it can spend.
  if (!mayFetchFresh(ctx)) return { basis: null, budgetCents: 0, reason: "not_paid_or_expert" };
  const spent = await readFreshFetchSpend((ctx as { tripId: string }).tripId, source.id);
  return freshFetchBudget(ctx, spent, {
    planCents: freshFetchPlanCapCents(),
    dayCents: freshFetchDayCapCents(),
    sourceDayCents: source.costCeilingCentsPerDay,
  });
}
