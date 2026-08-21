type IcsComparison = {
  startDate: string | Date;
  title?: string | null;
  destination?: string | null;
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

function floatingDateTime(startDate: string, dayOffset: number, minuteOffset: number): string {
  const base = Date.parse(`${startDate}T00:00:00Z`);
  const timestamp = base + dayOffset * DAY_MS + minuteOffset * 60_000;
  return new Date(timestamp).toISOString().slice(0, 19).replace(/[-:]/g, "");
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
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Traveloure//Travel Itinerary//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcs(comparison.title || comparison.destination || "Traveloure Trip")}`,
  ];

  for (const item of items) {
    const dayOffset = Math.max(0, (item.dayNumber || 1) - 1);
    const startMinutes = parseWallClockMinutes(item.startTime);
    const durationMinutes = item.durationMinutes || item.duration || 60;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${item.id || crypto.randomUUID()}@traveloure.com`,
      `DTSTAMP:${utcStamp(generatedAt)}`,
      `DTSTART:${floatingDateTime(tripStartDate, dayOffset, startMinutes)}`,
      `DTEND:${floatingDateTime(tripStartDate, dayOffset, startMinutes + durationMinutes)}`,
      `SUMMARY:${escapeIcs(item.name)}`,
    );
    if (item.description) lines.push(`DESCRIPTION:${escapeIcs(item.description)}`);
    if (item.location) lines.push(`LOCATION:${escapeIcs(item.location)}`);
    lines.push(`CATEGORIES:${escapeIcs(item.serviceType || "Activity")}`, "END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}