/**
 * "GETTING THERE" — a flight is an ANCHOR, not a product (surface spec v1.2 §5, R-j; step 2,
 * ledger `2026-10-03-surface-step2-tools-tray`). PURE.
 *
 * The traveler enters a flight number and a date; the schedule lookup answers the airports and the
 * times; the plan gets a `temporal_anchors` row — `flight_arrival` on day 1, `flight_departure` on
 * the last day — written through the EXISTING anchor route, with buffers. Nothing here is a fare,
 * a booking or a live status: searching and pricing flights stays on Travelpayouts, and live status
 * on travel day is phase 2.
 */

export type FlightDirection = "arrival" | "departure";

/** What a lookup returns — the adapter contract. Times are LOCAL wall-clock at each airport. */
export interface FlightInfo {
  carrier: string | null;
  /** As the carrier publishes it, e.g. "JL 61". */
  number: string;
  depAirport: string;
  arrAirport: string;
  /** "YYYY-MM-DDTHH:MM", local to the departure airport. */
  depAt: string;
  /** "YYYY-MM-DDTHH:MM", local to the arrival airport. */
  arrAt: string;
  terminal?: string | null;
}

/** "jl61", "JL 061", "jl-61" → "JL61". Null when it is not a flight number. */
export function normalizeFlightNumber(raw: string | null | undefined): string | null {
  const t = (raw ?? "").toUpperCase().replace(/[\s-]+/g, "");
  const m = /^([A-Z0-9]{2}[A-Z]?)(\d{1,4})([A-Z]?)$/.exec(t);
  if (!m || !/[A-Z]/.test(m[1])) return null;
  return `${m[1]}${String(Number(m[2]))}${m[3]}`;
}

export function isIsoDate(s: string | null | undefined): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s ?? "") && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

/**
 * Minutes kept free around the anchor: after landing (immigration, bags, getting into town) and
 * before take-off (getting to the airport, check-in, security). Planning buffers, not travel times.
 */
export const FLIGHT_ARRIVAL_BUFFER_AFTER_MIN = 90;
export const FLIGHT_DEPARTURE_BUFFER_BEFORE_MIN = 180;

/**
 * The body for `POST /api/trips/:tripId/anchors` (the EXISTING route). The anchor's datetime is
 * the local wall-clock at the plan's end of the flight (arrival time for an arrival, departure time
 * for a departure); the description names the flight so the plan can say which one it is.
 */
export function flightAnchorBody(direction: FlightDirection, f: FlightInfo): Record<string, unknown> {
  const arriving = direction === "arrival";
  const airport = arriving ? f.arrAirport : f.depAirport;
  return {
    anchorType: arriving ? "flight_arrival" : "flight_departure",
    anchorDatetime: `${arriving ? f.arrAt : f.depAt}:00`,
    bufferBefore: arriving ? 0 : FLIGHT_DEPARTURE_BUFFER_BEFORE_MIN,
    bufferAfter: arriving ? FLIGHT_ARRIVAL_BUFFER_AFTER_MIN : 0,
    location: airport,
    isImmovable: true,
    description: flightDescription(f, direction),
  };
}

/** "JL 61 · HND → KIX · T2". */
export function flightDescription(f: FlightInfo, direction: FlightDirection): string {
  const parts = [f.number, `${f.depAirport} → ${f.arrAirport}`];
  if (f.terminal) parts.push(`${direction === "arrival" ? "arrives" : "departs"} T${String(f.terminal).replace(/^T/i, "")}`);
  return parts.join(" · ");
}

/** The manual path (lookup off or unanswered): the traveler's own time, and the flight number if given. */
export function manualFlightAnchorBody(
  direction: FlightDirection,
  input: { date: string; time: string; flightNumber?: string | null; airport?: string | null },
): Record<string, unknown> {
  const arriving = direction === "arrival";
  const label = [input.flightNumber || null, input.airport || null].filter(Boolean).join(" · ");
  return {
    anchorType: arriving ? "flight_arrival" : "flight_departure",
    anchorDatetime: `${input.date}T${input.time}:00`,
    bufferBefore: arriving ? 0 : FLIGHT_DEPARTURE_BUFFER_BEFORE_MIN,
    bufferAfter: arriving ? FLIGHT_ARRIVAL_BUFFER_AFTER_MIN : 0,
    location: input.airport || null,
    isImmovable: true,
    description: label ? `${label} · entered by you` : "Entered by you",
  };
}

/** "HH:MM" of an anchor's stored datetime, read as the wall-clock it was written as. */
export function anchorWallTime(anchorDatetime: string | Date | null | undefined): string | null {
  const s = anchorDatetime instanceof Date ? anchorDatetime.toISOString() : String(anchorDatetime ?? "");
  const m = /T(\d{2}):(\d{2})/.exec(s);
  return m ? `${m[1]}:${m[2]}` : null;
}

/**
 * Step 2 addendum (ledger `2026-10-03-surface-step2-tools-tray`): a draft that already has an
 * airport/station ARRIVAL on day 1 (or DEPARTURE on the last day) carries the travel row itself —
 * that AI item takes the anchor glyph and "Add your flight", and the placeholder is not drawn, so a
 * day holds one arrival row and one departure row. Read off the item's own title and place, AI rows
 * only (a traveler's or an expert's item is theirs to describe), and only a TRANSPORT HUB word plus
 * a DIRECTION word — "Kyoto Station" alone is a stop, not an arrival.
 */
const TRAVEL_HUB = /\b(airport|station|terminal|shinkansen|train|flight|ferry|port)\b/i;
const ARRIVAL_WORD = /\b(arriv\w*|land(s|ing|ed)?|touch\s*down)\b/i;
const DEPARTURE_WORD = /\b(depart\w*|leav(e|es|ing)|fly\s+(home|out)|flight\s+home|head(ing)?\s+home)\b/i;

export function travelItemKind(item: {
  name?: string | null;
  location?: string | null;
  origin?: string | null;
}): FlightDirection | null {
  if (item.origin !== "ai") return null;
  const text = `${item.name ?? ""} ${item.location ?? ""}`;
  if (!TRAVEL_HUB.test(text)) return null;
  const arriving = ARRIVAL_WORD.test(item.name ?? "");
  const departing = DEPARTURE_WORD.test(item.name ?? "");
  if (arriving === departing) return null;
  return arriving ? "arrival" : "departure";
}

/**
 * The ONE item per direction that absorbs the placeholder: the FIRST matching arrival on day 1 and
 * the LAST matching departure on the last day (items in the day's own order). Null ⇒ none, and the
 * placeholder renders as before.
 */
export function absorbedTravelItemId(
  dayItems: ReadonlyArray<{ id: string; name?: string | null; location?: string | null; origin?: string | null }>,
  direction: FlightDirection,
): string | null {
  const matches = dayItems.filter((a) => travelItemKind(a) === direction);
  if (!matches.length) return null;
  return direction === "arrival" ? matches[0].id : matches[matches.length - 1].id;
}
