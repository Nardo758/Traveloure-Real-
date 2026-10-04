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
  /** ISO 3166-1 alpha-2 of each airport, when the provider says (smoke 8 item 4). Absent ⇒ unknown. */
  depCountry?: string | null;
  arrCountry?: string | null;
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
 * Minutes kept free around the anchor (smoke 8 item 4): after landing (immigration, bags, getting
 * into town) and before take-off (getting to the airport, check-in, security). Planning buffers, not
 * travel times. INTERNATIONAL when the flight's far end is outside the plan's country; when that is
 * not known (a manual entry, or a provider that names no country) the international figure is used
 * — a longer buffer never schedules a stop into the immigration queue.
 */
export const FLIGHT_BUFFER_MIN = {
  arrivalAfter: { international: 120, domestic: 60 },
  departureBefore: { international: 150, domestic: 90 },
} as const;

export function flightBuffers(direction: FlightDirection, international: boolean | null): { bufferBefore: number; bufferAfter: number } {
  const intl = international !== false;
  return direction === "arrival"
    ? { bufferBefore: 0, bufferAfter: FLIGHT_BUFFER_MIN.arrivalAfter[intl ? "international" : "domestic"] }
    : { bufferBefore: FLIGHT_BUFFER_MIN.departureBefore[intl ? "international" : "domestic"], bufferAfter: 0 };
}

/**
 * Is this flight international for the plan? The far end — the ORIGIN airport of an arrival, the
 * DESTINATION airport of a departure — against the plan's own country. Null when either is unknown.
 */
export function isInternationalFlight(direction: FlightDirection, f: FlightInfo, planCountry: string | null | undefined): boolean | null {
  const far = (direction === "arrival" ? f.depCountry : f.arrCountry) ?? "";
  const home = planCountry ?? "";
  if (!/^[A-Za-z]{2}$/.test(far) || !/^[A-Za-z]{2}$/.test(home)) return null;
  return far.toUpperCase() !== home.toUpperCase();
}

/**
 * The flight row's line (smoke 8 item 3), written ONCE and stored as the anchor's description:
 * "<flight as entered> · lands <IATA> <HH:MM> · entered by you" / "… · departs <IATA> <HH:MM> · from
 * lookup". The flight is the traveler's own text (trimmed, inner spaces collapsed — leading zeros
 * kept: "JL 061" stays "JL 061"); the time is the stored wall-clock "HH:MM" (leading zero kept).
 * A part nobody gave is omitted, never invented (§13).
 */
export function flightRowLine(input: {
  direction: FlightDirection;
  entered: string | null | undefined;
  airport: string | null | undefined;
  time: string | null | undefined;
  source: "entered" | "lookup";
}): string {
  const flight = (input.entered ?? "").trim().replace(/\s+/g, " ");
  const airport = (input.airport ?? "").trim().toUpperCase();
  const time = /^\d{2}:\d{2}$/.test(input.time ?? "") ? input.time! : "";
  const where = [airport, time].filter(Boolean).join(" ");
  const verb = input.direction === "arrival" ? "lands" : "departs";
  const parts = [flight, where ? `${verb} ${where}` : "", input.source === "entered" ? "entered by you" : "from lookup"].filter(Boolean);
  return parts.join(" · ");
}

/**
 * The body for `POST /api/trips/:tripId/anchors` (the EXISTING route). The anchor's datetime is
 * the local wall-clock at the plan's end of the flight (arrival time for an arrival, departure time
 * for a departure); the description is the row's line (`flightRowLine`). `entered` is the flight as
 * the traveler typed it; `international` is the server's answer from the lookup (null ⇒ unknown).
 */
export function flightAnchorBody(
  direction: FlightDirection,
  f: FlightInfo,
  opts: { entered?: string | null; international?: boolean | null } = {},
): Record<string, unknown> {
  const arriving = direction === "arrival";
  const airport = arriving ? f.arrAirport : f.depAirport;
  const at = arriving ? f.arrAt : f.depAt;
  return {
    anchorType: arriving ? "flight_arrival" : "flight_departure",
    anchorDatetime: `${at}:00`,
    ...flightBuffers(direction, opts.international ?? null),
    location: airport,
    isImmovable: true,
    description: flightRowLine({ direction, entered: opts.entered || f.number, airport, time: at.slice(11, 16), source: "lookup" }),
  };
}

/** "JL 61 · HND → KIX · T2" — the lookup preview in the sheet (not the stored row line). */
export function flightDescription(f: FlightInfo, direction: FlightDirection): string {
  const parts = [f.number, `${f.depAirport} → ${f.arrAirport}`];
  if (f.terminal) parts.push(`${direction === "arrival" ? "arrives" : "departs"} T${String(f.terminal).replace(/^T/i, "")}`);
  return parts.join(" · ");
}

/** The manual path (lookup off or unanswered): the traveler's own time, and the flight as entered. */
export function manualFlightAnchorBody(
  direction: FlightDirection,
  input: { date: string; time: string; flightNumber?: string | null; airport?: string | null },
): Record<string, unknown> {
  const arriving = direction === "arrival";
  return {
    anchorType: arriving ? "flight_arrival" : "flight_departure",
    anchorDatetime: `${input.date}T${input.time}:00`,
    // The far end is not asked on the manual path, so it is unknown ⇒ the international buffer.
    ...flightBuffers(direction, null),
    location: input.airport || null,
    isImmovable: true,
    description: flightRowLine({ direction, entered: input.flightNumber, airport: input.airport, time: input.time, source: "entered" }),
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

/**
 * Smoke 10 S10-1(a) (R-i): the clock time the day is measured against — arrival + its buffer (when
 * the traveler is out of the airport) or departure − its buffer (the cut-off to leave for it). The
 * buffer is the anchor's own stored minutes; absent ⇒ the international figure, the longer one, as
 * everywhere else (`flightBuffers`). Clamped to the day. Null when the flight has no time.
 */
export function flightCutoffTime(direction: FlightDirection, flightTime: string | null | undefined, bufferMinutes: number | null | undefined): string | null {
  const m = /^(\d{2}):(\d{2})/.exec(flightTime ?? "");
  if (!m) return null;
  const at = Number(m[1]) * 60 + Number(m[2]);
  const buf =
    typeof bufferMinutes === "number" && bufferMinutes >= 0
      ? bufferMinutes
      : direction === "arrival"
        ? FLIGHT_BUFFER_MIN.arrivalAfter.international
        : FLIGHT_BUFFER_MIN.departureBefore.international;
  const t = Math.min(23 * 60 + 59, Math.max(0, direction === "arrival" ? at + buf : at - buf));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/**
 * Smoke 9 S9-5, corrected by smoke 10 S10-1(a) — the travel row's amber line: how many of the day's
 * stops sit inside the flight's BUFFER — starting before arrival + buffer, or ending (else starting)
 * after the departure cut-off (departure − buffer). Wall-clock "HH:MM" strings in the plan's own zone
 * (LD 30); a stop with no time is not checked, and the flight's own row is excluded. Null when nothing
 * conflicts or the flight has no time.
 */
export function flightTimeConflictLine(
  direction: FlightDirection,
  flightTime: string | null | undefined,
  stops: ReadonlyArray<{ id: string; startTime?: string | null; endTime?: string | null }>,
  excludeId: string | null = null,
  bufferMinutes: number | null = null,
): string | null {
  const hhmm = (t: string | null | undefined) => (/^\d{2}:\d{2}/.test(t ?? "") ? (t as string).slice(0, 5) : null);
  const at = flightCutoffTime(direction, flightTime, bufferMinutes);
  if (!at) return null;
  const n = stops.filter((st) => {
    if (st.id === excludeId) return false;
    const start = hhmm(st.startTime);
    if (!start) return false;
    if (direction === "arrival") return start < at;
    const end = hhmm(st.endTime) ?? start;
    return end > at || start >= at;
  }).length;
  if (!n) return null;
  const stopsWord = n === 1 ? "1 stop" : `${n} stops`;
  return direction === "arrival"
    ? `${stopsWord} on this day ${n === 1 ? "starts" : "start"} before you're out of the airport`
    : `${stopsWord} on this day ${n === 1 ? "runs" : "run"} past the time to leave for your flight`;
}
