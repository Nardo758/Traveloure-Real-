/**
 * `routing-recheck` config (9b spec v1.0, §6 9b-d; 9b-0 ruling 4). The once-per-plan-day guard reads
 * `routing_recheck_max_per_plan_day` — default from the ONE config table in `shared/leave-by.ts`,
 * env-overridable. A value that is not a positive integer falls back to the default (never 0, which
 * would mean "never re-check" and silently retire the job).
 */
import { LEAVE_BY_CONFIG_DEFAULTS } from "@shared/leave-by";

export function routingRecheckMaxPerPlanDay(): number {
  const raw = Number(process.env.ROUTING_RECHECK_MAX_PER_PLAN_DAY);
  return Number.isInteger(raw) && raw > 0 ? raw : LEAVE_BY_CONFIG_DEFAULTS.routing_recheck_max_per_plan_day;
}
