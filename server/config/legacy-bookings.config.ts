/**
 * legacy-bookings.config.ts — the DATED no-new-writes switch for the legacy `bookings` rail
 * (punchlist D-12, ledger `2026-09-15-d12-service-bookings-canonical`).
 *
 * THE RULING. `service_bookings` is the CANONICAL booking rail. The legacy `bookings` rail
 * (`POST /api/bookings/process-cart` → `bookingService.processCart`) does not disappear: from a
 * date the decision-maker sets it stops accepting NEW writes, with the reason stated out loud, and
 * everything that READS it survives — the single-booking GET, `confirm-payment`, `bulk-status`,
 * `POST /api/bookings/refund`, the legacy confirm/cancel paths in `booking.service.ts`, the Stripe
 * webhook's legacy branch, and §17's `scanLegacyRail`. A rail that stops taking new rows is not a
 * rail that forgets the rows it has.
 *
 * WHY A DATE AND NOT A BOOLEAN. The decision-maker's answer is "option A, cutoff date pending —
 * the operator reads production's weekly `bookings` write count first". A boolean would have to be
 * flipped by somebody at the right moment; a date is set once, in advance, and is the same fact in
 * every environment. **THIS LANE SETS NO DATE ANYWHERE** — no `.env`, no workflow, no deploy
 * config — because the date is the decision-maker's to choose. Unset is the shipped state.
 *
 * §13 — THE THREE STATES ARE DIFFERENT FACTS AND NONE IS GUESSED.
 *   • UNSET (absent, or empty/whitespace) = NO CUTOFF HAS BEEN DECIDED ⇒ `null` ⇒ writes are
 *     allowed, exactly as before this module existed. It is NEVER read as "closed now": closing a
 *     live money rail because an env var is missing is the opposite of a safe failure mode.
 *   • A FUTURE date = decided, not yet in force ⇒ writes are allowed until it passes.
 *   • A PAST-OR-NOW date = in force ⇒ the route refuses with a stated reason before any read or
 *     write.
 *
 * MALFORMED IS NOT A THIRD KIND OF "UNSET". A value that was set but cannot be read is an operator
 * error, and degrading it to `null` would silently keep a rail open that somebody believed they had
 * closed. It THROWS, and the throw happens at module load (the expression at the bottom of this
 * file) so it fails the BOOT rather than the first checkout of the day.
 *
 * This module holds no amount, no rate and no fee — it decides WHEN a rail stops taking rows, the
 * `completion-windows.config.ts` / `earnings-hold.config.ts` posture. §8 is untouched by it.
 */

/** The env var the operator sets. ISO date (`YYYY-MM-DD`) or full ISO-8601 instant. */
export const LEGACY_BOOKINGS_CUTOFF_ENV = 'LEGACY_BOOKINGS_NO_NEW_WRITES_FROM';

/** `YYYY-MM-DD`, optionally followed by a time part — the shape check, before `Date` parsing. */
const ISO_DATE_SHAPE = /^\d{4}-\d{2}-\d{2}([T ].*)?$/;

/**
 * The ONE accessor. Returns the instant from which the legacy rail refuses new writes, or `null`
 * when no cutoff has been decided.
 *
 * Parsed on every call rather than memoised, deliberately: there is exactly one authority for this
 * value and a cached copy beside it is the derivation-drift class §18 rule 1 names. The cost is one
 * `Date` parse on a route that takes a Stripe round trip.
 *
 * @throws when the variable is set to something that is not an ISO date — see the header.
 */
export function legacyBookingsNoNewWritesFrom(): Date | null {
  const raw = (process.env[LEGACY_BOOKINGS_CUTOFF_ENV] ?? '').trim();
  if (raw === '') return null;

  if (!ISO_DATE_SHAPE.test(raw)) {
    throw new Error(
      `${LEGACY_BOOKINGS_CUTOFF_ENV}="${raw}" is not an ISO date. ` +
        'Use YYYY-MM-DD (or a full ISO-8601 instant), or leave it unset — an unset value means ' +
        'no cutoff has been decided and the legacy bookings rail keeps accepting writes.',
    );
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(
      `${LEGACY_BOOKINGS_CUTOFF_ENV}="${raw}" is not a real date. ` +
        'Use YYYY-MM-DD (or a full ISO-8601 instant), or leave it unset.',
    );
  }
  return parsed;
}

/**
 * Is the legacy rail closed to NEW writes at `now`? One reading of the accessor, so the route and
 * any later caller cannot disagree about what "closed" means.
 */
export function legacyBookingsClosedToNewWrites(now: Date = new Date()): boolean {
  const cutoff = legacyBookingsNoNewWritesFrom();
  return cutoff !== null && now.getTime() >= cutoff.getTime();
}

/** The `reason` code the refusal carries, and the rail a caller should use instead. */
export const LEGACY_BOOKINGS_CLOSED_REASON = 'legacy_rail_closed';
export const CANONICAL_BOOKING_RAIL = '/api/checkout';

/** The three states the boot line reports. They are DIFFERENT FACTS and none is guessed (§13). */
export type LegacyBookingsCutoffState = "not_set" | "decided_not_in_force" | "in_force";

export interface LegacyBookingsCutoffReport {
  state: LegacyBookingsCutoffState;
  /** The resolved instant as ISO-8601, or `null` when no cutoff has been decided. */
  cutoff: string | null;
  /** The one sentence the boot log prints. */
  message: string;
}

/**
 * Describe the cutoff for the boot log — the ONE place that sentence is written (§18 rule 1).
 *
 * WHY THIS EXISTS. Setting `LEGACY_BOOKINGS_NO_NEW_WRITES_FROM` to a FUTURE date and leaving it
 * unset are behaviourally identical until that date passes: both allow writes, and the only reader
 * is `POST /api/bookings/process-cart`. So an operator who restarted to load a cutoff had no way to
 * confirm it had loaded — the restart could only prove the value was not MALFORMED (a malformed one
 * throws at module load, below). This line closes that gap by stating the resolved value at boot.
 *
 * §13 — AN UNSET VALUE IS NEVER REPORTED AS CLOSED, and the three states read differently on sight.
 * "No cutoff decided" is a finished answer, not a degraded one: closing a live money rail because an
 * env var is absent is the opposite of a safe failure mode, and the log must not imply it happened.
 *
 * It never re-derives what "closed" means — `legacyBookingsClosedToNewWrites` is asked — so the boot
 * line and the route it describes cannot disagree.
 *
 * It cannot throw in practice: the module-load call below has already refused a malformed value, so
 * by the time boot logs, the variable is either absent or well-formed. No try/catch is added here
 * deliberately — one would hide a real failure rather than report it.
 */
export function describeLegacyBookingsCutoff(now: Date = new Date()): LegacyBookingsCutoffReport {
  const cutoff = legacyBookingsNoNewWritesFrom();

  if (cutoff === null) {
    return {
      state: "not_set",
      cutoff: null,
      message:
        `${LEGACY_BOOKINGS_CUTOFF_ENV} is not set — no cutoff has been decided, and the legacy ` +
        `bookings rail accepts new writes. Canonical rail: ${CANONICAL_BOOKING_RAIL}.`,
    };
  }

  const iso = cutoff.toISOString();

  // The ONE definition of "closed", asked rather than restated.
  if (legacyBookingsClosedToNewWrites(now)) {
    return {
      state: "in_force",
      cutoff: iso,
      message:
        `${LEGACY_BOOKINGS_CUTOFF_ENV}=${iso} — in force: the legacy bookings rail refuses new ` +
        `writes with ${LEGACY_BOOKINGS_CLOSED_REASON}. Canonical rail: ${CANONICAL_BOOKING_RAIL}.`,
    };
  }

  return {
    state: "decided_not_in_force",
    cutoff: iso,
    message:
      `${LEGACY_BOOKINGS_CUTOFF_ENV}=${iso} — decided, not yet in force: the legacy bookings rail ` +
      `still accepts new writes until that instant. Canonical rail: ${CANONICAL_BOOKING_RAIL}.`,
  };
}

// Boot-time validation: a malformed cutoff fails the process here, not at the first checkout.
// (An unset or valid value makes this a no-op.)
legacyBookingsNoNewWritesFrom();
