/**
 * LG-1 (decision-maker, Oct 17, 2026 — ledger `2026-10-17-lg1-osm-place-coords`): where a ROUTING coordinate may come
 * from. Under the strict Google-terms reading Leon adopted, Google content is never combined with a non-Google
 * service, so the self-hosted OSRM router is given only coordinates that did not come from Google:
 *
 *   osm       — `osm_place_coords`: an OpenStreetMap point matched once, by batch, to a Google place id
 *               (the one thing kept from Google). ODbL: a table of its own, credited "© OpenStreetMap contributors".
 *   admin     — `admin_place_coords`: a coordinate a Traveloure admin entered from the place's official site.
 *   osm_node  — a ride's boarding or exit pin, seeded from the OSM node the official read names (TC-3, migration 369).
 *   iata      — an airport point from the committed IATA table (`server/data/iata-airports.json`), never Google.
 *
 * Any other point — an item's own row coordinate (NULL coord_source = Google, GC-1), a Places fact — is `google`.
 * Pure; the ONE home of the value set (§18 rule 1).
 */
import { z } from "zod";

export const OPEN_COORD_ORIGINS = ["osm", "admin", "osm_node", "iata"] as const;
export type OpenCoordOrigin = (typeof OPEN_COORD_ORIGINS)[number];
export type CoordOrigin = OpenCoordOrigin | "google";

/** True only for a point the OSRM router may be given. Absent ⇒ false (an untagged point is never trusted). */
export function isOpenCoordOrigin(origin: string | null | undefined): origin is OpenCoordOrigin {
  return origin != null && (OPEN_COORD_ORIGINS as readonly string[]).includes(origin);
}

/** The credit every OSM-derived coordinate carries wherever it is stored or shown. */
export const OSM_COORD_ATTRIBUTION = "© OpenStreetMap contributors";

/** The one way a batch match is recorded (`osm_place_coords.matched_by`). */
export const OSM_COORD_MATCHED_BY_NOMINATIM_BATCH = "nominatim_batch";

/**
 * §19: the admin coordinate body (`PUT /api/admin/place-coords/:placeId`) — a strict allowlist. The source is the
 * place's official site (https); the author is the session, never the body.
 */
export const adminPlaceCoordBodySchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    sourceUrl: z.string().trim().url().max(2000).refine((u) => u.startsWith("https://"), { message: "sourceUrl must be https" }),
    note: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();

