/**
 * ics-calendar.ts — the .ics export for a plan.
 *
 * TIME MODEL (ledger `2026-09-04-plan-mint`, CLAUDE.md entry 30). An item's `startTime` is a
 * WALL-CLOCK string in the PLAN's timezone; it is never converted in storage. This exporter is the
 * one place that has to turn a wall clock into something a calendar client can place on a real
 * instant, and it has exactly two honest ways to do it:
 *
 *   • `timezone` KNOWN  → emit a UTC instant (`…Z`), converted FROM the wall clock in that zone.
 *     Fully RFC 5545 conformant with no VTIMEZONE component to author or keep in sync with the
 *     IANA database — the alternative (`DTSTART;TZID=Asia/Tokyo:…`) requires a VTIMEZONE the spec
 *     says MUST accompany a non-standard TZID, and hand-rolling DST rules per zone is precisely
 *     the kind of derived duplicate that drifts. Every guest, in every zone, then sees the SAME
 *     moment, rendered in their own local time — which is what a calendar is for.
 *
 *   • DATES NOT CONFIRMED → floating as well, for the same reason one derivative over (migration
 *     302, ledger `2026-09-15-d22-dates-confirmed`, punchlist D-22). A pinned instant needs a real
 *     DAY as much as it needs a real zone, and `trips.start_date` is NOT NULL, so a ready-made
 *     clone's `new Date()` placeholder, an authoring build's synthetic anchor and a cart mint's
 *     today-fallback all arrive here looking exactly like a window the traveler picked. Counting
 *     day 1 from one of those and stamping it `…Z` would put a confident instant on a date nobody
 *     chose — a calendar entry is the worst possible place for that, because it then rings. §13:
 *     the export still goes out, with the honest floating times it always had.
 *
 *   • `timezone` ABSENT → keep the pre-existing FLOATING output, byte-for-byte, and say why here.
 *     RFC 5545 floating time renders in each reader's own zone, which IS the long-standing bug
 *     when a zone is known — but with no zone on the plan there is nothing to pin to. UTC would
 *     not be a fallback, it would be a CLAIM that the traveler's 16:00 means 16:00 in London, and
 *     the server's own zone would be an accident of where the process runs. §13: an honestly
 *     floating time beats a confidently wrong instant.
 *
 * WHAT THIS EXPORTER DOES NOT CARRY, STATED SO NOBODY ASSUMES IT DOES (ledger
 * `2026-09-04-event-time-ui`): its `items` are the ITINERARY items of one comparison variant
 * (`GET /api/my-itinerary/:id/calendar` → `getOrderedVariantItemsByVariantId`). A plan's EVENTS —
 * the `user_experiences` rows an item can be linked to (Locked Decision 29), which gained their own
 * `start_time` in migration 282 — are NOT exported here or anywhere else: no route turns an event
 * into a VEVENT today. That lane deliberately did not add one, because an export nobody asked for
 * is a second calendar surface to keep in sync with this one's time model. When one is built, it
 * belongs HERE, in this function's zone decision, and an event with no `start_time` must be a
 * DATE-only (all-day) VEVENT rather than a fabricated midnight (§13).
 */
type IcsComparison = {
  startDate: string | Date;
  title?: string | null;
  destination?: string | null;
  /**
   * The plan's IANA timezone (`trips.timezone`), or null/undefined when the plan does not carry
   * one — see the two branches above. An unusable value (a zone this runtime's ICU data does not
   * know) is treated exactly like absent.
   */
  timezone?: string | null;
  /**
   * `trips.dates_confirmed_at` (migration 302, ledger `2026-09-15-d22-dates-confirmed`) — WHETHER
   * ANYBODY CHOSE THE DAY this export counts from. `false` collapses every event into the FLOATING
   * branch exactly as an absent zone does; see the third bullet in the header above.
   *
   * `undefined` is NOT "no": it means the caller has not been widened to supply the fact, and the
   * exporter then keeps its previous behaviour byte-for-byte rather than silently down-grading
   * every existing export. Both server callers DO supply it.
   */
  datesConfirmed?: boolean;
};

type IcsItem = {
  id?: string | null;
  dayNumber?: number | null;
  startTime?: string | null;
  duration?: number | null;
  durationMinutes?: number | null;
  name: string;
  description?: string | null;
  location?: string | null;
  serviceType?: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDate(value: string | Date): string {
  return new Date(value).toISOString().slice(0, 10);
}

function parseWallClockMinutes(value?: string | null): number {
  const match = value?.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)?/i);
  if (!match) return 9 * 60;
  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  if (match[3]?.toUpperCase() === "PM" && hours < 12) hours += 12;
  if (match[3]?.toUpperCase() === "AM" && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

/**
 * The WALL-CLOCK civil datetime of an item, as milliseconds on a UTC number line. This is not an
 * instant — it is "2034-03-12 09:00" expressed as a number so day/minute arithmetic (and midnight,
 * month and year rollover) is exact. Both branches below start here.
 */
function wallClockMs(startDate: string, dayOffset: number, minuteOffset: number): number {
  return Date.parse(`${startDate}T00:00:00Z`) + dayOffset * DAY_MS + minuteOffset * 60_000;
}

function stampFromMs(ms: number, utcSuffix: boolean): string {
  const s = new Date(ms).toISOString().slice(0, 19).replace(/[-:]/g, "");
  return utcSuffix ? `${s}Z` : s;
}

/**
 * How far `timeZone` is ahead of UTC at the given instant, in ms. Read from the runtime's own IANA
 * data via Intl — no offset table is hardcoded, so DST transitions are the zone's real ones.
 */
function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instantMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const localAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return localAsUtc - instantMs;
}

/**
 * Turn a wall clock in `timeZone` into the real UTC instant, or null when the zone is unusable.
 * Two passes: the first offset guess is taken at the wall clock read as UTC, the second at the
 * candidate instant — which is what makes a time on the far side of a DST transition land on the
 * transition's own offset rather than the previous one.
 */
function zonedWallClockToUtcMs(wallMs: number, timeZone: string): number | null {
  try {
    const firstGuess = wallMs - zoneOffsetMs(wallMs, timeZone);
    return wallMs - zoneOffsetMs(firstGuess, timeZone);
  } catch {
    // An unknown/invalid IANA id: fall back to floating, exactly as an absent zone does. Never
    // substitute UTC — that would be the confident-but-wrong instant this whole module avoids.
    return null;
  }
}

function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcs(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

export function generateIcsContent(
  comparison: IcsComparison,
  items: IcsItem[],
  generatedAt = new Date(),
): string {
  const tripStartDate = isoDate(comparison.startDate);
  // A zone is only usable for PINNING when the day it is applied to is one somebody chose. An
  // explicit `datesConfirmed: false` therefore withdraws the zone from the decision below — the
  // ONE place that decision is made — rather than adding a second branch beside it (§18 rule 1).
  // `undefined` leaves the previous behaviour untouched (see the field's own note).
  const timeZone = comparison.datesConfirmed === false ? null : comparison.timezone || null;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Traveloure//Travel Itinerary//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcs(comparison.title || comparison.destination || "Traveloure Trip")}`,
  ];

  /**
   * ONE decision per event: PINNED when the plan has a usable zone, FLOATING when it does not.
   * `zonedWallClockToUtcMs` returning null (a zone this runtime's ICU data cannot resolve)
   * collapses into the floating branch, so the two states a reader can meet — no zone at all, and
   * an unusable one — produce the same honest output instead of two different guesses.
   *
   * Note where the duration is added in each branch, deliberately:
   *   • PINNED — to the resolved INSTANT, so a 90-minute activity lasts 90 real minutes even when
   *     a DST transition falls inside it (its local end time shifts, which is what actually
   *     happens to people on that day).
   *   • FLOATING — to the wall clock, which is byte-for-byte the pre-existing behaviour. Without a
   *     zone there are no transition rules to apply, so there is nothing to be more correct about.
   */
  const eventStamps = (
    dayOffset: number,
    startMinutes: number,
    durationMinutes: number,
  ): { start: string; end: string } => {
    const wallStart = wallClockMs(tripStartDate, dayOffset, startMinutes);
    if (timeZone) {
      const startInstant = zonedWallClockToUtcMs(wallStart, timeZone);
      if (startInstant !== null) {
        return {
          start: stampFromMs(startInstant, true),
          end: stampFromMs(startInstant + durationMinutes * 60_000, true),
        };
      }
    }
    return {
      start: stampFromMs(wallStart, false),
      end: stampFromMs(wallStart + durationMinutes * 60_000, false),
    };
  };

  for (const item of items) {
    const dayOffset = Math.max(0, (item.dayNumber || 1) - 1);
    const startMinutes = parseWallClockMinutes(item.startTime);
    const durationMinutes = item.durationMinutes || item.duration || 60;
    const { start, end } = eventStamps(dayOffset, startMinutes, durationMinutes);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${item.id || crypto.randomUUID()}@traveloure.com`,
      `DTSTAMP:${utcStamp(generatedAt)}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${escapeIcs(item.name)}`,
    );
    if (item.description) lines.push(`DESCRIPTION:${escapeIcs(item.description)}`);
    if (item.location) lines.push(`LOCATION:${escapeIcs(item.location)}`);
    lines.push(`CATEGORIES:${escapeIcs(item.serviceType || "Activity")}`, "END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

// ─── §8 phone delivery: the per-trip SUBSCRIPTION feed (ledger `2026-10-17-phone-delivery-calendar`) ──────────
//
// D5 (Part C, ratified by Leon Oct 16, 2026): TZID-QUALIFIED events in the plan's time zone. The download above emits
// UTC instants to avoid hand-writing a VTIMEZONE; the feed instead GENERATES one from the runtime's own IANA data
// (the same `zoneOffsetMs` the download uses — no offset table, no hand-rolled DST rule), covering only the trip's
// window, with one observance per real transition inside it. Rules this builder keeps, each a ruling:
//   • a stop with a start time is `DTSTART;TZID=<zone>:<local wall clock>` with its OWN duration as `DURATION`
//     (elapsed time, so it stays right across a DST change); no duration ⇒ no end is claimed;
//   • a stop with no start time is an ALL-DAY event on its day — never a guessed 09:00 (§13);
//   • no usable zone ⇒ floating local times (no TZID, no Z), the same honest fallback as the download;
//   • UID is `<item id>@traveloure.com` (stable across re-finals), SEQUENCE is the final's version (D7);
//   • text is escaped (\ ; , and line breaks) and folded at 75 octets (RFC 5545 §3.1).

export interface TripFeedEvent {
  uid: string;
  sequence: number;
  /** The stop's calendar day, "YYYY-MM-DD". */
  date: string;
  /** "HH:MM" wall clock in the plan's zone, or null for an all-day stop. */
  startTime: string | null;
  durationMinutes: number | null;
  summary: string;
  location?: string | null;
  description?: string | null;
  url?: string | null;
}

export interface TripFeedInput {
  calendarName: string;
  calendarDescription?: string | null;
  timezone: string | null;
  /** When this copy was made (the final's time): DTSTAMP on every event. */
  madeAt: Date;
  events: TripFeedEvent[];
}

/** A strict "HH:MM" (24h) or "h:mm AM/PM" wall clock, as minutes; null when it is not a time (§13 — no 09:00 guess). */
export function parseFeedStartMinutes(value: string | null | undefined): number | null {
  const m = typeof value === "string" ? value.trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i) : null;
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (m[3]) {
    if (hours < 1 || hours > 12) return null;
    if (m[3].toUpperCase() === "PM" && hours < 12) hours += 12;
    if (m[3].toUpperCase() === "AM" && hours === 12) hours = 0;
  }
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function feedEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** RFC 5545 §3.1: lines longer than 75 octets are folded with CRLF + one space, never inside a UTF-8 character. */
function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let chunk = "";
  let size = 0;
  let limit = 75;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, "utf8");
    if (size + n > limit) {
      out.push(chunk);
      chunk = "";
      size = 0;
      limit = 74; // continuation lines start with a space
    }
    chunk += ch;
    size += n;
  }
  out.push(chunk);
  return out.join("\r\n ");
}

function offsetString(ms: number): string {
  const sign = ms < 0 ? "-" : "+";
  const total = Math.round(Math.abs(ms) / 60_000);
  return `${sign}${String(Math.floor(total / 60)).padStart(2, "0")}${String(total % 60).padStart(2, "0")}`;
}

function usableFeedZone(timeZone: string | null): string | null {
  if (!timeZone) return null;
  try {
    zoneOffsetMs(Date.now(), timeZone);
    return timeZone;
  } catch {
    return null;
  }
}

/**
 * The VTIMEZONE for `timeZone` over [fromMs, toMs]: the offset at the start, then one observance per transition found
 * inside the window (hourly scan, then a minute-exact binary search). Every value comes from Intl's IANA data.
 */
/** The zone's offset at an instant, in whole minutes (zoneOffsetMs drops the instant's milliseconds). */
function feedOffsetMs(instantMs: number, timeZone: string): number {
  return Math.round(zoneOffsetMs(instantMs, timeZone) / 60_000) * 60_000;
}

function vtimezone(timeZone: string, fromMs: number, toMs: number): string[] {
  const HOUR = 3_600_000;
  const lines = ["BEGIN:VTIMEZONE", `TZID:${timeZone}`];
  let prevOffset = feedOffsetMs(fromMs, timeZone);
  const observances: { atMs: number; from: number; to: number }[] = [];
  for (let t = fromMs + HOUR; t <= toMs; t += HOUR) {
    const off = feedOffsetMs(t, timeZone);
    if (off !== prevOffset) {
      let lo = t - HOUR;
      let hi = t;
      while (hi - lo > 1_000) {
        const mid = lo + Math.floor((hi - lo) / 2);
        if (feedOffsetMs(mid, timeZone) === prevOffset) lo = mid;
        else hi = mid;
      }
      // IANA transitions fall on a whole minute; the first second of the new offset rounds up to it.
      observances.push({ atMs: Math.ceil(hi / 60_000) * 60_000, from: prevOffset, to: off });
      prevOffset = off;
    }
  }
  const startOffset = feedOffsetMs(fromMs, timeZone);
  const all = [{ atMs: fromMs, from: startOffset, to: startOffset }, ...observances];
  const maxOffset = Math.max(...all.map((o) => o.to));
  for (const o of all) {
    // DTSTART of an observance is the local time at which it begins, read in the offset it begins FROM.
    const kind = o.to === maxOffset && all.some((x) => x.to !== maxOffset) ? "DAYLIGHT" : "STANDARD";
    lines.push(
      `BEGIN:${kind}`,
      `DTSTART:${stampFromMs(o.atMs + o.from, false)}`,
      `TZOFFSETFROM:${offsetString(o.from)}`,
      `TZOFFSETTO:${offsetString(o.to)}`,
      `END:${kind}`,
    );
  }
  lines.push("END:VTIMEZONE");
  return lines;
}

export function generateTripFeedIcs(input: TripFeedInput): string {
  const zone = usableFeedZone(input.timezone);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Traveloure//Trip Card//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${feedEscape(input.calendarName)}`,
  ];
  if (input.calendarDescription) lines.push(`X-WR-CALDESC:${feedEscape(input.calendarDescription)}`);
  if (zone) lines.push(`X-WR-TIMEZONE:${zone}`);

  const dates = input.events.map((e) => e.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  if (zone && dates.length > 0) {
    const from = Date.parse(`${dates[0]}T00:00:00Z`) - 2 * DAY_MS;
    const to = Date.parse(`${dates[dates.length - 1]}T00:00:00Z`) + 3 * DAY_MS;
    lines.push(...vtimezone(zone, from, to));
  }

  const stamp = utcStamp(input.madeAt);
  for (const e of input.events) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) continue;
    const day = e.date.replace(/-/g, "");
    const minutes = parseFeedStartMinutes(e.startTime);
    lines.push("BEGIN:VEVENT", `UID:${e.uid}`, `SEQUENCE:${e.sequence}`, `DTSTAMP:${stamp}`);
    if (minutes === null) {
      const next = new Date(Date.parse(`${e.date}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10).replace(/-/g, "");
      lines.push(`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${next}`);
    } else {
      const wall = stampFromMs(wallClockMs(e.date, 0, minutes), false);
      lines.push(zone ? `DTSTART;TZID=${zone}:${wall}` : `DTSTART:${wall}`);
      if (e.durationMinutes && e.durationMinutes > 0) lines.push(`DURATION:PT${Math.round(e.durationMinutes)}M`);
    }
    lines.push(`SUMMARY:${feedEscape(e.summary)}`);
    if (e.location) lines.push(`LOCATION:${feedEscape(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${feedEscape(e.description)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
