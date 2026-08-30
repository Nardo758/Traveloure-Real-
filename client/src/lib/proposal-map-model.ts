export interface ProposalMapItem {
  id: string;
  dayNumber: number;
  startTime?: string | null;
  timeSlot?: string | null;
  name: string;
  serviceType?: string | null;
  price?: string | number | null;
  location?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
}

export interface ProposalMapSource {
  id: string;
  name: string;
  items: ProposalMapItem[];
}

export interface LocatedProposalItem extends ProposalMapItem {
  lat: number;
  lng: number;
}

function parseCoordinate(
  value: string | number | null | undefined,
  min: number,
  max: number,
): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

/** Pure §13 boundary: only persisted, valid coordinate pairs become pins. */
export function buildProposalMapModel(items: ProposalMapItem[]): {
  total: number;
  located: LocatedProposalItem[];
} {
  const located: LocatedProposalItem[] = [];
  for (const item of items) {
    const lat = parseCoordinate(item.latitude, -90, 90);
    const lng = parseCoordinate(item.longitude, -180, 180);
    if (lat == null || lng == null) continue;
    located.push({ ...item, lat, lng });
  }
  return { total: items.length, located };
}