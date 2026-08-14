/**
 * POST /api/geocode — three-tier fallback handler (factory).
 *
 * Extracted from content.routes.ts so the exact handler can be imported and
 * tested in isolation. The `geocodeAddress` dependency is injected so tests
 * can simulate a Google Maps miss without module-level mocking.
 *
 * Tier 1: live Google geocode via the supplied geocodeAddress function.
 * Tier 2: admin-curated geocode_fallbacks row via storage.getGeocodeFallback() → fallback:true.
 * Tier 3: honest 404 — never a guessed or fabricated coordinate (§13 posture).
 */
import { z } from "zod";
import type { Request, Response, RequestHandler } from "express";
import { storage } from "../storage";
import { geocodeAddress as defaultGeocodeAddress } from "../utils/geocode";

const geocodeSchema = z.object({
  address: z.string().min(1),
});

export type GeocodeFn = (
  address: string,
) => Promise<{ lat: number; lng: number; formattedAddress: string } | null>;

/**
 * Returns a POST /api/geocode handler that uses the provided geocode function.
 * Pass the default `geocodeAddress` (from ../utils/geocode) for production;
 * pass a stub in tests to simulate a Google miss without real API calls.
 */
export function makeGeocodePostHandler(geocodeAddressFn: GeocodeFn = defaultGeocodeAddress): RequestHandler {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = geocodeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
        return;
      }

      const { address } = parsed.data;

      // Tier 1: live geocode (Google Maps via geocodeAddressFn)
      const result = await geocodeAddressFn(address);
      if (result) {
        res.json(result);
        return;
      }

      // Tier 2: DB-backed fallback (migration 217): admin-curated city-centre
      // coordinates in geocode_fallbacks — curated data, not fabrication, so
      // the §13 posture holds. A miss there too stays an honest 404.
      const dbFallback = await storage.getGeocodeFallback(address);
      if (dbFallback) {
        res.json({ ...dbFallback, fallback: true });
        return;
      }

      // Tier 3: honest 404 — never a guessed coordinate
      res.status(404).json({ message: "Location not found" });
    } catch (error: any) {
      console.error("Geocoding API error:", error);
      res.status(500).json({ message: error.message || "Geocoding failed" });
    }
  };
}
