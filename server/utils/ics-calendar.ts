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
  const timeZone = comparison.timezone || null;
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
