interface ActivityPoint {
  lat: number;
  lng: number;
  name: string;
  scheduledTime?: string;
}

interface TransportLegPoint {
  legOrder: number;
  fromName: string;
  toName: string;
  recommendedMode: string;
  estimatedDurationMinutes: number;
  estimatedCostUsd?: number | null;
  distanceDisplay: string;
}

export interface KmlInput {
  tripName: string;
  destination: string;
  days: {
    dayNumber: number;
    date: string;
    activities: ActivityPoint[];
    transportLegs: TransportLegPoint[];
  }[];
}

const DAY_COLORS = [
  "ff4444ff",
  "ff44aaff",
  "ff44ffff",
  "ff44ff44",
  "ffff4444",
  "ffff44aa",
  "ffaa44ff",
  "ff88ccff",
  "ffccff88",
  "ffff88cc",
  "ff88ffcc",
  "ffcc88ff",
  "ffffcc88",
  "ff88cccc",
];

/**
 * XML text escaping for the KML/GPX exports (board #1318 audit). Activity names and the trip's
 * destination are traveler text, and some write paths store them unsanitized — unescaped, a name
 * like "Fish & Chips" made the whole file malformed and a `<` could inject markup into the KML
 * description balloon. Escapes the five XML specials, so it is also safe in an attribute.
 */
export function escXml(raw: unknown): string {
  return String(raw ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function generateKml(input: KmlInput): string {
  const allPlacemarks: string[] = [];
  const allRoutes: string[] = [];

  for (const day of input.days) {
    for (const activity of day.activities) {
      allPlacemarks.push(`
        <Placemark>
          <name>Day ${day.dayNumber}: ${escXml(activity.name)}</name>
          <description>${escXml(
            `<b>${escXml(activity.name)}</b><br/>Day ${day.dayNumber} - ${day.date}<br/>` +
              (activity.scheduledTime ? `Time: ${escXml(activity.scheduledTime)}<br/>` : ""),
          )}</description>
          <styleUrl>#day${day.dayNumber}Pin</styleUrl>
          <Point>
            <coordinates>${activity.lng},${activity.lat},0</coordinates>
          </Point>
        </Placemark>`);
    }

    if (day.activities.length >= 2) {
      const coords = day.activities
        .map(a => `${a.lng},${a.lat},0`)
        .join("\n              ");

      allRoutes.push(`
        <Placemark>
          <name>Day ${day.dayNumber} Route</name>
          <description>Day ${day.dayNumber} - ${escXml(day.date)}</description>
          <styleUrl>#day${day.dayNumber}Route</styleUrl>
          <LineString>
            <tessellate>1</tessellate>
            <coordinates>
              ${coords}
            </coordinates>
          </LineString>
        </Placemark>`);
    }
  }

  const styles = input.days.map((day, i) => `
    <Style id="day${day.dayNumber}Pin">
      <IconStyle>
        <color>${DAY_COLORS[i % DAY_COLORS.length]}</color>
        <scale>1.2</scale>
        <Icon><href>http://maps.google.com/mapfiles/kml/paddle/${Math.min(day.dayNumber, 9)}.png</href></Icon>
      </IconStyle>
    </Style>
    <Style id="day${day.dayNumber}Route">
      <LineStyle>
        <color>${DAY_COLORS[i % DAY_COLORS.length]}</color>
        <width>4</width>
      </LineStyle>
    </Style>`).join("\n");

  const folders = input.days.map(day => {
    const dayPlacemarks = allPlacemarks.filter(p => p.includes(`Day ${day.dayNumber}:`));
    const dayRoutes = allRoutes.filter(r => r.includes(`Day ${day.dayNumber} Route`));
    return `
    <Folder>
      <name>Day ${day.dayNumber} - ${escXml(day.date)}</name>
      ${dayPlacemarks.join("")}
      ${dayRoutes.join("")}
    </Folder>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escXml(input.tripName)} - ${escXml(input.destination)}</name>
    <description>Traveloure Itinerary - Generated ${new Date().toISOString().split("T")[0]}</description>

    ${styles}

    ${folders}

  </Document>
</kml>`;
}
