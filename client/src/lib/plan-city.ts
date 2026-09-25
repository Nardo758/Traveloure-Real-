/**
 * WHEN A SELECTED PLAN MEETS A DIFFERENT CITY (ledger `2026-09-25-rc6-bound-plan-city`, audit RC-6).
 *
 * The pen (`client/src/lib/trip-context.ts`) can hold a plan's id beside the destination and dates it
 * displays. Two defects came from writes that changed the displayed city or dates without deciding
 * what happened to that id:
 *   • the plan modal, finished or saved with a new city while a plan was selected, cleared the id and
 *     created nothing — a "YOUR TRIP · Osaka" strip for a plan that did not exist;
 *   • IntakePanel's "Plan with AI" and the AI-assistant extraction MERGED a new city and dates onto the
 *     selected plan's id (the #972 desync class the pen itself warns about).
 *
 * THE RULINGS (decision-maker, Sep 25, 2026):
 *   • the plan modal ASKS — "change this plan's city" or "start a new plan" — and never guesses;
 *   • the AI paths UNBIND on a new city (the pen then describes a new, not-yet-created plan) and, on the
 *     same city, keep the plan and write nothing onto its identity.
 *
 * Pure and leaf-level so the whole decision is unit-proven and every writer reads the SAME answer
 * (§18 rule 1). "Is this the same city?" is `locationsAgree` — the ONE rule the location-mismatch
 * dialog already uses — never a second string comparison.
 */
import { locationsAgree } from "./location-mismatch";

/**
 * Do two destination strings name the same city? Both empty is the same (nothing either way); one
 * empty is not. Otherwise it is the mismatch dialog's own rule, so "Kyoto" and "Kyoto, Japan" agree.
 */
export function sameCity(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = (a ?? "").trim();
  const y = (b ?? "").trim();
  if (x === "" && y === "") return true;
  if (x === "" || y === "") return false;
  if (x.toLowerCase() === y.toLowerCase()) return true;
  return locationsAgree(x, y);
}

/**
 * Must the plan modal ask which the traveler means? Only when a plan is selected AND the traveler has
 * named a city that is not that plan's. An empty answer names no city, so there is nothing to ask.
 */
export function boundPlanCityChanged(input: {
  boundTripId?: string | null;
  liveDestination?: string | null;
  destination?: string | null;
}): boolean {
  if (!input.boundTripId) return false;
  const next = (input.destination ?? "").trim();
  if (next === "") return false;
  return !sameCity(input.liveDestination, next);
}

/** The pen's identity fields, as far as this decision needs them. */
export interface PenIdentity {
  tripId?: string | null;
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

/** The keys an AI path may not write onto a SELECTED plan's identity. */
export const PLAN_IDENTITY_KEYS = ["destination", "startDate", "endDate"] as const;

export type IdentitySafeWrite<P> =
  /** Merge as-is (no plan selected), or merge with the identity keys withheld (same city). */
  | { kind: "merge"; patch: P; withheld: string[] }
  /** A different city: the pen now describes a NEW plan, so the selected plan's id is dropped. */
  | { kind: "switch"; patch: P };

/**
 * How an AI path writes what it heard into the pen.
 *   • No plan selected ⇒ merge everything, exactly as before.
 *   • A plan is selected and a DIFFERENT city was heard ⇒ `switch`: the pen describes a new plan and
 *     the selected plan's id goes (nothing is written onto the wrong plan).
 *   • A plan is selected and the SAME city (or no city) was heard ⇒ merge, but WITHHOLD the city and
 *     the dates: a selected plan's destination and dates live on the plan row, and a pen that says
 *     otherwise is the desync this module exists to stop. Everything else (party, occasion hints…)
 *     still fills in. What was withheld is returned so the surface can say so (§13).
 */
export function identitySafeWrite<P extends Record<string, unknown>>(
  live: PenIdentity,
  patch: P,
): IdentitySafeWrite<P> {
  if (!live.tripId) return { kind: "merge", patch, withheld: [] };
  const heard = typeof patch.destination === "string" ? patch.destination.trim() : "";
  if (heard !== "" && !sameCity(live.destination, heard)) return { kind: "switch", patch };
  const kept: Record<string, unknown> = {};
  const withheld: string[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if ((PLAN_IDENTITY_KEYS as readonly string[]).includes(key)) {
      // The same city is not a change, and neither is a date the pen already holds — only a value
      // that would have DIFFERED from the selected plan's is reported as withheld.
      const stated = value !== undefined && value !== null && value !== "";
      const differs =
        key === "destination"
          ? false
          : stated && String(value).slice(0, 10) !== String(live[key as "startDate" | "endDate"] ?? "").slice(0, 10);
      if (differs) withheld.push(key);
      continue;
    }
    kept[key] = value;
  }
  return { kind: "merge", patch: kept as P, withheld };
}

/** The line the AI planner shows when it withheld something (one spelling, §18 rule 1). */
export const SELECTED_PLAN_KEEPS_ITS_BASICS_NOTE =
  "Your selected plan keeps its own city and dates — change those on the plan itself.";
