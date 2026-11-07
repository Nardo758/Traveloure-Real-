/**
 * QW-4 (Leon, Nov 7): the tray is STAGE-AWARE. A tool is drawn only once its question can be answered,
 * and an unmet gate whose fact is a chip on the plan (dates, party) does not hide the chip — it turns the
 * press into that chip. "Hide, never grey" is a waitlist rule about paid actions; a tray that teaches the
 * next step is the point here.
 *
 * Pure: the press a chip makes, from the plan's own facts. No React, no fetch.
 */
import type { ToolKey } from "@shared/group-manifest";

export interface TrayFacts {
  /** The plan's dates were chosen by the traveler (`trips.dates_confirmed_at`). */
  datesConfirmed: boolean;
  /** The traveling party (`trips.number_of_travelers`), null when unstated. */
  travelers: number | null;
  /** Every item on the plan. */
  stops: number;
}

/** What pressing a chip does: open its sheet, open the dates chip, open the party chip, or not draw it. */
export type TrayPress = "sheet" | "dates" | "party" | "hidden";

export function trayPress(key: ToolKey, f: TrayFacts): TrayPress {
  switch (key) {
    // The arrival leg exists before any stop does — it needs the DATES, not content.
    case "getting_there":
    case "where_to_stay":
    case "shared_lodging":
      return f.datesConfirmed ? "sheet" : "dates";
    case "arrivals_split_groups":
      if (!f.datesConfirmed) return "dates";
      return f.travelers !== null && f.travelers >= 2 ? "sheet" : "party";
    case "split_activities":
    case "who_pays_what":
      // Who pays what cannot wait for a priced stop: prices are hidden in waitlist, so that gate would
      // never open. The party is the fact; the chip is one tap away.
      return f.travelers !== null && f.travelers >= 2 ? "sheet" : "party";
    // The tool is how you GIVE things times, so one item is enough.
    case "run_of_show":
    case "timing_check":
      return f.stops >= 1 ? "sheet" : "hidden";
    // Legs need two stops, and a stop is content — not something the slip's chips can add. (Coordinates
    // are not settable on the ordinary create rail, so gating on POINTS would hide a chip on a plan that
    // visibly has two stops; the sheet itself says which gaps have no travel time.)
    case "getting_around":
    case "pace":
      return f.stops >= 2 ? "sheet" : "hidden";
    // Anchor tools and the vendor/guest surfaces answer from the plan itself.
    default:
      return "sheet";
  }
}
