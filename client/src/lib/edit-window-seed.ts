/**
 * edit-window-seed — WHAT THE EDIT WINDOW'S When AND Who STEPS OPEN WITH (Row PS-3, audit D1–D3, D17;
 * ledger `2026-11-02-ps3-edit-window-reads-trip-row`).
 *
 * The plan row is the truth. The browser pen (`trip-context`) is a copy that can lag it — the slip's
 * inline panels wrote the row and not the pen, a new plan's mint never wrote the party into the pen,
 * and switching plans carried the previous plan's party along. So the edit window reads the bound
 * plan's own row, and falls back to the pen only for a value the row does not hold (or when no row
 * could be read: a guest, a plan not yet created, a failed fetch).
 *
 * Rules, each from the brief:
 *  · DATES are seeded from the row only when they were CHOSEN (`dates_confirmed_at` set). A
 *    placeholder window was filled in by a mint, never picked by the traveler, so When opens blank
 *    rather than showing a window nobody chose (LD 30 amended, LD 42 D12).
 *  · THE PARTY is seeded from `trips.adults` / `trips.kids`. A count of zero or less is not an answer.
 *  · D17: a plan that holds only a total (`number_of_travelers`, e.g. an IntakePanel trip) and no
 *    adults opens Who as that total in adults and 0 children — one tap to confirm. Nothing is saved
 *    until the traveler saves.
 *
 * Pure: no React, no storage. The strings it returns are exactly what the form's inputs hold
 * ("" = empty), so the modal sets them as-is.
 */
import { planDatesAreConfirmed, type PlanDatesConfirmedAt } from "@shared/plan-dates";

export interface EditWindowTripRow {
  startDate?: string | null;
  endDate?: string | null;
  datesConfirmedAt?: PlanDatesConfirmedAt;
  adults?: number | null;
  kids?: number | null;
  numberOfTravelers?: number | null;
}

export interface EditWindowPen {
  startDate?: string;
  endDate?: string;
  adults?: number;
  kids?: number;
}

export interface EditWindowSeed {
  startDate: string;
  endDate: string;
  adults: string;
  kids: string;
}

const day = (v: string | null | undefined): string => (typeof v === "string" ? v.split("T")[0] : "");
const count = (v: number | null | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : null;

/** The pen alone — what the window opened with before this row (no plan row could be read). */
export function seedFromPen(pen: EditWindowPen): EditWindowSeed {
  const a = count(pen.adults);
  const k = count(pen.kids);
  return {
    startDate: pen.startDate || "",
    endDate: pen.endDate || "",
    adults: a ? String(a) : "",
    kids: k ? String(k) : "",
  };
}

/** The plan row first; the pen only for a value the row does not hold. */
export function seedFromTripRow(trip: EditWindowTripRow | null | undefined, pen: EditWindowPen): EditWindowSeed {
  if (!trip) return seedFromPen(pen);
  const fromPen = seedFromPen(pen);

  // Dates: a row always holds a window (the columns are NOT NULL), so "the row has no value" means
  // the window was never chosen — and that is blank, not the pen's copy of the same placeholder.
  const confirmed = planDatesAreConfirmed(trip.datesConfirmedAt) && !!day(trip.startDate);
  const startDate = confirmed ? day(trip.startDate) : "";
  const endDate = confirmed ? day(trip.endDate) || day(trip.startDate) : "";

  const adults = count(trip.adults);
  const kids = count(trip.kids);
  const total = count(trip.numberOfTravelers);
  let adultsSeed: string;
  let kidsSeed: string;
  if (adults) {
    adultsSeed = String(adults);
    kidsSeed = kids ? String(kids) : "";
  } else if (total) {
    // D17: one number stated, no composition — open as total adults, 0 children, ready to confirm.
    adultsSeed = String(total);
    kidsSeed = "0";
  } else {
    adultsSeed = fromPen.adults;
    kidsSeed = fromPen.kids;
  }
  return { startDate, endDate, adults: adultsSeed, kids: kidsSeed };
}
