/**
 * The ONE decision about whether a metered external-API call may proceed against its monthly
 * spend ceiling (ledger `2026-09-21-tavily-spend-breaker`).
 *
 * WHY THIS IS A MODULE AND NOT AN `if` AT THE CALL SITE (§18 rule 1). A second copy of "have we
 * spent too much?" is the derivation-drift class: the moment two rails answer it two ways, one
 * provider keeps spending while the other stops, and the cap means neither number. One
 * implementation, as many callers as there are metered providers.
 *
 * IT DECIDES; IT NEVER READS AND NEVER WRITES. This module imports no `db`, no `storage` and no
 * SDK — the month-to-date figure and the ceiling arrive as arguments. It therefore takes no claim
 * of its own, cannot be the thing that is slow, and is provable by a pure CI test with no
 * database (the posture `server/services/optimizer-run-authorization.ts` takes for the optimizer's
 * run gate, Locked Decision 41 (a)).
 *
 * ═══ WHAT A CAP OF `null` MEANS, AND WHY IT IS NOT ZERO (§13) ═══
 *
 * `capUsd: null` is NO CEILING CONFIGURED, and it authorizes the call. It is emphatically NOT a
 * ceiling of $0, which would refuse everything. This matters because the AI half of this lane has
 * no ceiling number at all — only the decision-maker sets one (the same "Leon-only" class as
 * R-T1-c's $150) — so the absent case has to read as "nobody has said" rather than "nobody may
 * spend". A reader is told which of the two it got, by name, and never has to infer it from a 0.
 *
 * ═══ AN UNREADABLE METER AUTHORIZES, LOUDLY (the stated failure posture) ═══
 *
 * `monthToDateUsd: null` means the spend read FAILED — the aggregate threw, the database was
 * unreachable. It authorizes, with `basis: "meter_unavailable"`, and the caller is expected to log
 * that at error level. This is a deliberate fail-OPEN and it is the half of this design most worth
 * disagreeing with, so the reasoning is written down rather than assumed:
 *
 *   · The ceiling exists to stop a SLOW BLEED over a month, not to stop one call. A single call
 *     that slips through costs fractions of a cent (`TAVILY_PRICE_PER_SEARCH_USD`).
 *   · Failing CLOSED converts a transient database blip into a full outage of DMO ingestion,
 *     booking verification and evidence scoring — an availability incident caused by the monitoring
 *     of a cost, which is a worse trade than a few cents.
 *   · The failure is never silent: it is a named basis the caller logs, so "the meter is broken"
 *     and "we are under the cap" can never be confused for each other.
 *
 * If that trade is ever ruled the other way, this is the ONE function to change.
 *
 * ═══ STATED NEGATIVE SPACE (§18d) ═══
 *
 *   · IT IS NOT ATOMIC, AND CANNOT BE. Two concurrent calls can both read a month-to-date figure
 *     under the ceiling and both proceed, so spend can overshoot by roughly the number of calls
 *     in flight. That is a real limit, not an oversight: an external API call is not a database
 *     row, so there is no §15 atomic claim to take against Tavily's ledger, and the overshoot is
 *     bounded by concurrency × per-call price rather than being unbounded.
 *   · IT KNOWS ONLY WHAT IT IS TOLD. A provider whose calls are not metered is invisible to it —
 *     which is exactly why this lane does not gate Anthropic (see the ledger row: 20 sites
 *     construct a client, 12 log nothing, so the meter reads LOW and a ceiling enforced against
 *     it would be a §13 falsehood with money attached).
 *   · IT GOVERNS SPEND, NOT AUTHORIZATION. Being under the ceiling says nothing about whether the
 *     caller was entitled to make the call; that is the route's own gate.
 */

/** Providers this guard can be asked about. One entry per metered external API. */
export type MeteredProvider = "tavily";

export interface SpendAuthorizationInput {
  provider: MeteredProvider;
  /** Month-to-date spend in USD, or `null` when the meter could not be read. */
  monthToDateUsd: number | null;
  /** The ceiling in USD, or `null` when none is configured. */
  capUsd: number | null;
}

export type SpendAuthorization =
  | {
      authorized: true;
      basis: "under_cap" | "no_cap_configured" | "meter_unavailable";
      monthToDateUsd: number | null;
      capUsd: number | null;
    }
  | {
      authorized: false;
      reason: "monthly_cap_reached";
      monthToDateUsd: number;
      capUsd: number;
    };

/**
 * The ONE predicate. Order is deliberate and is part of the ruling: a MISSING CEILING is answered
 * before a missing meter, because "nobody set a limit" is a complete answer that makes the meter
 * irrelevant — reporting `meter_unavailable` for a provider that has no ceiling anyway would name
 * a problem that is not blocking anything.
 */
export function resolveSpendAuthorization(input: SpendAuthorizationInput): SpendAuthorization {
  const { monthToDateUsd, capUsd } = input;

  if (capUsd === null || !Number.isFinite(capUsd)) {
    return { authorized: true, basis: "no_cap_configured", monthToDateUsd, capUsd: null };
  }
  if (monthToDateUsd === null || !Number.isFinite(monthToDateUsd)) {
    return { authorized: true, basis: "meter_unavailable", monthToDateUsd: null, capUsd };
  }
  // AT the ceiling refuses, not just above it: a cap of $150 means $150 is the amount that may be
  // spent, so the call that would take spend past it is the one refused. Spending exactly to the
  // ceiling is permitted; the next call is not.
  if (monthToDateUsd >= capUsd) {
    return { authorized: false, reason: "monthly_cap_reached", monthToDateUsd, capUsd };
  }
  return { authorized: true, basis: "under_cap", monthToDateUsd, capUsd };
}

/** Thrown at a metered call site when the guard refuses. Never swallowed into an empty result. */
export class SpendCapExceededError extends Error {
  readonly provider: MeteredProvider;
  readonly monthToDateUsd: number;
  readonly capUsd: number;

  constructor(provider: MeteredProvider, monthToDateUsd: number, capUsd: number) {
    super(
      `[spend-guard] ${provider} monthly spend cap reached — month-to-date $${monthToDateUsd.toFixed(3)} ` +
        `of $${capUsd.toFixed(2)}. The call was NOT made and nothing was charged. Raise the ceiling in ` +
        `server/config/trailhead.config.ts (decision-maker only) or wait for the next calendar month.`,
    );
    this.name = "SpendCapExceededError";
    this.provider = provider;
    this.monthToDateUsd = monthToDateUsd;
    this.capUsd = capUsd;
  }
}

/** True for the error above — so a caller can tell a refused call from a failed one (§13). */
export function isSpendCapExceeded(err: unknown): err is SpendCapExceededError {
  return err instanceof SpendCapExceededError;
}
