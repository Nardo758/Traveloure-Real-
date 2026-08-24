import type { KmlInput } from "./kml-generator";

export function generateGpx(input: KmlInput): string {
  const waypoints: string[] = [];
  const tracks: string[] = [];

  for (const day of input.days) {
    for (const activity of day.activities) {
      waypoints.push(
        `\n    <wpt lat="${activity.lat}" lon="${activity.lng}">` +
        `\n      <name>Day ${day.dayNumber}: ${activity.name}</name>` +
        `\n      <desc>Day ${day.dayNumber} - ${day.date}${activity.scheduledTime ? " - " + activity.scheduledTime : ""}</desc>` +
        `\n      <type>Activity</type>` +
        `\n    </wpt>`
      );
    }

    if (day.activities.length >= 2) {
      const trackpoints = day.activities
        .map(a => `        <trkpt lat="${a.lat}" lon="${a.lng}"><name>${a.name}</name></trkpt>`)
        .join("\n");

      tracks.push(
        `\n    <trk>` +
        `\n      <name>Day ${day.dayNumber} - ${day.date}</name>` +
        `\n      <trkseg>\n${trackpoints}\n      </trkseg>` +
        `\n    </trk>`
      );
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Traveloure"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${input.tripName} - ${input.destination}</name>
    <desc>Traveloure Itinerary</desc>
    <time>${new Date().toISOString()}</time>
  </metadata>
${waypoints.join("")}
${tracks.join("")}
</gpx>`;
}
