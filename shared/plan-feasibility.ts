/**
 * FD-3 — THE DAY'S FEASIBILITY LINE (decision-maker rulings, Oct 10, 2026; ledger
 * `2026-10-10-fd3-feasibility`; brief docs/planning/briefs/fd-3-feasibility.md §3d).
 *
 * Honest counts of what was checked on one plan day, from the server's own facts — never a claim the
 * day "works". Ruling 2: a check with nothing stored says "not checked" for that check; never silent,
 * never padded. Counts only; no tier words. ONE author (§18 rule 1): the server computes the counts,
 * every day block renders this line.
 */

export interface DayFeasibility {
  /** Stops on the day (accommodation excluded). */
  stops: number;
  /** Stops whose hours that weekday are known AND whose start time is stated — the check could run. */
  hoursChecked: number;
  /** Stops with a stored official last entry for that date AND a stated start time. */
  lastEntryChecked: number;
  /** Rides on the day by train, subway or bus. */
  rides: number;
  /** Rides with a stored official last departure near their start, for that date. */
  ridesChecked: number;
}

const ofStops = (k: number, n: number) => `${k} of ${n} ${n === 1 ? "stop" : "stops"}`;

/**
 * Pure. "Hours checked for 5 of 6 stops · last entry not checked · last trains not checked". No stops ⇒
 * null (nothing to check). No rides ⇒ no last-train clause (the day takes no train or bus, so there is no
 * question to answer — not an unchecked one).
 */
export function feasibilityLine(d: DayFeasibility | null | undefined): string | null {
  if (!d || !(d.stops > 0)) return null;
  const parts = [
    d.hoursChecked > 0 ? `Hours checked for ${ofStops(d.hoursChecked, d.stops)}` : "Hours not checked",
    d.lastEntryChecked > 0 ? `last entry checked for ${ofStops(d.lastEntryChecked, d.stops)}` : "last entry not checked",
  ];
  if (d.rides > 0) {
    parts.push(d.ridesChecked > 0 ? `last trains checked for ${d.ridesChecked} of ${d.rides} ${d.rides === 1 ? "ride" : "rides"}` : "last trains not checked");
  }
  return parts.join(" · ");
}

/** Leg modes that are a train, subway or bus ride (the rides a last departure governs). */
const RIDE_MODES = new Set(["transit", "train", "rail", "subway", "metro", "tram", "light_rail", "bus"]);

export function isRideMode(mode: string | null | undefined): boolean {
  return !!mode && RIDE_MODES.has(mode.toLowerCase());
}
