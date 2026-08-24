/**
 * BOOKING-ELIGIBILITY GATES — the D7 pre-charge consumers (DECISIONS.md ruling 62/64 capture,
 * ruling 83 wiring; CLAUDE.md §13/§14/§15).
 *
 * Migration 195 captured 11 logistics fields on `provider_services`; this module is the SERVER-SIDE
 * reader for the THREE booking-ELIGIBILITY fields: it validates a booking request against a listing's
 * own constraints BEFORE any slot is claimed or anything is charged (the B1 `pickup_out_of_range`
 * placement — right before the C3 atomic slot claim in `payments.routes.ts`).
 *
 * THE THREE GATES (this lane; the rest of the D7 set is a deferred follow-up — see the brief):
 *   1. PARTY SIZE       — party_size_min / party_size_max: the booking's party count must be in
 *                         [min, max]. Refuse `party_size_out_of_range`.
 *   2. START WINDOW     — earliest_start_time / latest_start_time / service_timezone: the requested
 *                         start's time-of-day must fall within [earliest, latest], interpreted in the
 *                         listing's timezone. Refuse `outside_start_window`.
 *   3. LEAD TIME        — lead_time_hours: the requested start must be at least lead_time_hours in the
 *                         future (vs now). Refuse `insufficient_lead_time`.
 *
 * THE LOAD-BEARING RULES (why this reads the way it does):
 *   §13 — NULL = NO constraint. An unset listing field means "the provider never specified," so that
 *         gate does not apply — we NEVER invent a default bound. Likewise an ABSENT booking input
 *         (no party count / no requested start) skips the gate that needs it: we do not fabricate the
 *         traveler's inputs to have something to gate on.
 *   §14 — this is pure VALIDATION, not money: it reads the listing's own catalog config + the booking
 *         line's own inputs. No amount / rate / identity is derived from the client request here, so
 *         the money-endpoints guard is unaffected. But it MUST run before the claim (that is the point).
 *
 * TIMEZONE HONESTY (§13). earliest/latest are "HH:MM" wall-clock in `service_timezone` (an IANA id).
 * The requested start is an absolute instant (`cart_items.scheduled_date`, which for a slot booking is
 * server-derived from the slot's date + start_time). When `service_timezone` is SET, the instant's
 * time-of-day is read in THAT zone (Intl, below) and compared to the window. When it is UNSET, the
 * fallback is the instant's UTC wall-clock (STATED — never a silent local/UTC assumption that would
 * misgate a listing that never chose a zone). The lead-time gate compares absolute instants and needs
 * no timezone at all.
 *
 * NOTE the ONE non-NULL default in the D7 set: `provider_services.lead_time_hours` carries a schema
 * DEFAULT of 24 (unlike the other, NULL-default fields), so the lead-time gate applies to any listing
 * whose column holds a positive value — that is the field's REAL stored value, not a bound this code
 * invents. A NULL or non-positive lead_time_hours still means "no lead-time constraint."
 */

export type EligibilityReason =
  | "party_size_out_of_range"
  | "outside_start_window"
  | "insufficient_lead_time";

export interface EligibilityResult {
  eligible: boolean;
  reason?: EligibilityReason;
  detail?: string;
}

/** The listing's D7 eligibility config — a subset of the `provider_services` row. */
export interface ServiceEligibilityConfig {
  partySizeMin?: number | null;
  partySizeMax?: number | null;
  earliestStartTime?: string | null; // "HH:MM" wall-clock in serviceTimezone
  latestStartTime?: string | null; // "HH:MM"
  serviceTimezone?: string | null; // IANA id, e.g. "Asia/Tokyo"
  leadTimeHours?: number | null;
}

/** The booking line's own inputs — the traveler's confirmed party count + requested start. */
export interface BookingEligibilityInput {
  partySize?: number | null; // cart_items.party_size — null ⇒ not given (§13, no gate)
  scheduledDate?: Date | string | null; // cart_items.scheduled_date (slot-derived or client) — null ⇒ not given
}

const ok: EligibilityResult = { eligible: true };

/** A finite number or null (NaN/undefined/non-numeric ⇒ null "not set"). */
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** A real Date or null (invalid/absent ⇒ null "no requested start"). */
function toDate(v: Date | string | null | undefined): Date | null {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "HH:MM" → minutes since midnight, or null if malformed. */
function parseHhmm(v: string | null | undefined): number | null {
  if (typeof v !== "string") return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(v.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * The requested start's time-of-day, in minutes since midnight, interpreted in `timezone` when set,
 * else in UTC (the stated fallback). Returns null if the zone id is unusable (never guess — omit the
 * start-window gate rather than misgate).
 */
export function timeOfDayMinutes(instant: Date, timezone: string | null | undefined): number | null {
  if (timezone && timezone.trim().length > 0) {
    try {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(instant);
      const hh = Number(parts.find((p) => p.type === "hour")?.value);
      const mm = Number(parts.find((p) => p.type === "minute")?.value);
      if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
      // Intl can render "24" for midnight in some engines; normalize to 0.
      return (hh % 24) * 60 + mm;
    } catch {
      return null; // unknown IANA id ⇒ do not gate (§13)
    }
  }
  // Fallback (STATED): no timezone on the listing ⇒ read the instant's UTC wall-clock.
  return instant.getUTCHours() * 60 + instant.getUTCMinutes();
}

/**
 * Resolve whether a single booking line is ELIGIBLE against its listing's D7 constraints. Pure and
 * server-derived: pass the listing config + the line's own inputs. Returns the FIRST refusal (party →
 * start window → lead time) or `{ eligible: true }`. Never throws.
 */
export function resolveBookingEligibility(
  service: ServiceEligibilityConfig,
  input: BookingEligibilityInput,
  now: Date = new Date(),
): EligibilityResult {
  // ── 1. PARTY SIZE ────────────────────────────────────────────────────────────────────────────
  const partySize = num(input.partySize);
  if (partySize !== null) {
    const min = num(service.partySizeMin);
    const max = num(service.partySizeMax);
    if (min !== null && partySize < min) {
      return {
        eligible: false,
        reason: "party_size_out_of_range",
        detail: `This service takes a minimum of ${min} — your party of ${partySize} is below it.`,
      };
    }
    if (max !== null && partySize > max) {
      return {
        eligible: false,
        reason: "party_size_out_of_range",
        detail: `This service takes up to ${max} — your party of ${partySize} exceeds it.`,
      };
    }
  }

  const start = toDate(input.scheduledDate);

  // ── 2. START WINDOW ──────────────────────────────────────────────────────────────────────────
  if (start !== null) {
    const earliest = parseHhmm(service.earliestStartTime);
    const latest = parseHhmm(service.latestStartTime);
    if (earliest !== null || latest !== null) {
      const tod = timeOfDayMinutes(start, service.serviceTimezone);
      if (tod !== null) {
        if (earliest !== null && tod < earliest) {
          return {
            eligible: false,
            reason: "outside_start_window",
            detail: `This service starts no earlier than ${service.earliestStartTime}${service.serviceTimezone ? ` (${service.serviceTimezone})` : ""}.`,
          };
        }
        if (latest !== null && tod > latest) {
          return {
            eligible: false,
            reason: "outside_start_window",
            detail: `This service starts no later than ${service.latestStartTime}${service.serviceTimezone ? ` (${service.serviceTimezone})` : ""}.`,
          };
        }
      }
    }
  }

  // ── 3. LEAD TIME ─────────────────────────────────────────────────────────────────────────────
  if (start !== null) {
    const lead = num(service.leadTimeHours);
    if (lead !== null && lead > 0) {
      const requiredMs = lead * 3_600_000;
      if (start.getTime() - now.getTime() < requiredMs) {
        return {
          eligible: false,
          reason: "insufficient_lead_time",
          detail: `This service needs at least ${lead}h notice — your requested start is too soon.`,
        };
      }
    }
  }

  return ok;
}
