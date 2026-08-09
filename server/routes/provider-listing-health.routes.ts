import { Router } from "express";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { getUserId } from "../utils/auth";
import { isAuthenticated } from "../replit_integrations/auth";
import { providerServices, vendorAvailabilitySlots } from "@shared/schema";

/**
 * Provider Listing Health — GET /api/provider/services/health (ratified "Listing Health" layer).
 *
 * INTENDED MOUNT (integrator wires this into server/routes.ts — this file does NOT self-mount):
 *   import providerListingHealthRoutes from "./routes/provider-listing-health.routes";
 *   ...
 *   app.use(providerListingHealthRoutes);
 * (same import/app.use shape as providerRoutes in provider.routes.ts).
 *
 * ROUTE-ORDER WARNING (verified against the running dev server, not just read from source):
 * server/routes.ts registers `app.get("/api/provider/services/:id", isAuthenticated, ...)` inline
 * (~line 2075). Express matches path segments positionally, so an unauthenticated OR authenticated
 * request to GET /api/provider/services/health is swallowed by that `:id` route (id="health") if it
 * is registered FIRST — confirmed live: hitting the path today already returns this route's 401
 * JSON body, not the 200-HTML dead-route fallback, because :id greedily matches "health". The mount
 * line above MUST land BEFORE that inline route registers — i.e. alongside `app.use(providerRoutes)`
 * (~line 882, well before line 2075), the same slot provider.routes.ts uses — or GET .../health will
 * always 404 as "service not found" post-mount instead of reaching this handler.
 *
 * Until mounted in that slot, every path below falls through to the pre-existing `:id` route's auth
 * check (401 unauthenticated) or 404 (authenticated) — NOT the Vite catch-all — because of the
 * collision above; the unmounted-router guard will correctly flag this file as pending-mount
 * regardless. That is expected for this change, not a defect.
 *
 * CONTEXT (CLAUDE.md audit finding): ~97% of provider listings ride the approximate
 * neighborhood-centroid location backfill (locationPrecision='neighborhood_centroid') and zero
 * carry a provider-confirmed exact pin, because nothing surfaced it. This endpoint computes a
 * deterministic per-service completeness score so the Catalog (client/src/pages/provider/services.tsx)
 * can render a photo/pin/health signal per card.
 *
 * §13 (deterministic, honest): every check here is a real-field predicate, never a guess. A check
 * that genuinely cannot be computed (e.g. the availability grouped-count query throws) is reported
 * ONCE at the trip level in `omitted` and EXCLUDED from every service's score denominator — never
 * silently scored as failing, never silently dropped without a trace.
 *
 * §18 (never expose revenueShareRate): the service query below is an explicit column list, not
 * `select()` — revenueShareRate is never selected, let alone returned.
 *
 * Ownership: same session-provider pattern as GET /api/provider/services in server/routes.ts —
 * isAuthenticated + getUserId(req), rows scoped to `providerServices.userId = caller`. No role
 * gate beyond auth+ownership (mirrors the existing endpoint this augments — AvailabilitySection's
 * comment notes this surface is deliberately role-agnostic between provider and expert).
 */
const router = Router();

const DESCRIPTION_MIN_LENGTH = 80;

interface HealthCheck {
  key: string;
  ok: boolean;
  detail?: string;
}

router.get("/api/provider/services/health", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;

    // Explicit column list (§18): revenueShareRate is never selected here.
    const rows = await db
      .select({
        id: providerServices.id,
        description: providerServices.description,
        price: providerServices.price,
        approvalStatus: providerServices.approvalStatus,
        serviceImage: providerServices.serviceImage,
        galleryImages: providerServices.galleryImages,
        latitude: providerServices.latitude,
        longitude: providerServices.longitude,
        locationPrecision: providerServices.locationPrecision,
      })
      .from(providerServices)
      .where(eq(providerServices.userId, userId));

    const omitted: { key: string; reason: string }[] = [];

    // One grouped count query for ALL the caller's services — no N+1 (per spec).
    const slotCounts = new Map<string, number>();
    let availabilityComputable = true;
    if (rows.length > 0) {
      try {
        const todayStr = new Date().toISOString().slice(0, 10);
        const serviceIds = rows.map((r) => r.id);
        const counts = await db
          .select({
            serviceId: vendorAvailabilitySlots.serviceId,
            cnt: sql<number>`count(*)`,
          })
          .from(vendorAvailabilitySlots)
          .where(
            and(
              inArray(vendorAvailabilitySlots.serviceId, serviceIds),
              gte(vendorAvailabilitySlots.date, todayStr),
            ),
          )
          .groupBy(vendorAvailabilitySlots.serviceId);
        for (const c of counts) slotCounts.set(c.serviceId, Number(c.cnt));
      } catch (err) {
        // §13: a check that can't be computed is omitted with a reason, never guessed as pass/fail.
        availabilityComputable = false;
        omitted.push({
          key: "availability",
          reason: "vendor_availability_slots query failed — excluded from every service's score",
        });
      }
    }

    const services = rows.map((s) => {
      const checks: HealthCheck[] = [];

      // photo: serviceImage present OR galleryImages non-empty.
      const gallery = Array.isArray(s.galleryImages) ? s.galleryImages : [];
      const hasPhoto = !!(s.serviceImage && s.serviceImage.trim().length > 0) || gallery.length > 0;
      checks.push({
        key: "photo",
        ok: hasPhoto,
        ...(hasPhoto ? {} : { detail: "no photo uploaded" }),
      });

      // exact_pin: latitude+longitude present AND locationPrecision='exact'.
      const hasCoords = s.latitude != null && s.longitude != null;
      const isExact = hasCoords && s.locationPrecision === "exact";
      checks.push({
        key: "exact_pin",
        ok: isExact,
        ...(isExact
          ? {}
          : {
              detail: hasCoords
                ? "approximate area (neighborhood-level)"
                : "no location at all",
            }),
      });

      // description: trimmed length >= 80 chars.
      const descLen = (s.description ?? "").trim().length;
      const descOk = descLen >= DESCRIPTION_MIN_LENGTH;
      checks.push({
        key: "description",
        ok: descOk,
        ...(descOk
          ? {}
          : { detail: `only ${descLen} characters (need at least ${DESCRIPTION_MIN_LENGTH})` }),
      });

      // pricing: price present and > 0. No rate/fee math — presence only (§8 n/a, §18: stays away
      // from revenueShareRate entirely).
      const priceNum = s.price == null ? NaN : Number(s.price);
      const priceOk = Number.isFinite(priceNum) && priceNum > 0;
      checks.push({
        key: "pricing",
        ok: priceOk,
        ...(priceOk
          ? {}
          : { detail: s.price == null ? "no price set" : "price is $0" }),
      });

      // availability: at least 1 future vendor_availability_slots row for the service.
      if (availabilityComputable) {
        const count = slotCounts.get(s.id) ?? 0;
        const availOk = count > 0;
        checks.push({
          key: "availability",
          ok: availOk,
          ...(availOk ? {} : { detail: "no upcoming availability" }),
        });
      }

      // approval: approvalStatus='approved'. Honest detail — 'submitted' reads as "in review".
      const approvalOk = s.approvalStatus === "approved";
      checks.push({
        key: "approval",
        ok: approvalOk,
        ...(approvalOk
          ? {}
          : {
              detail: s.approvalStatus === "submitted" ? "in review" : s.approvalStatus ?? "unknown",
            }),
      });

      const passed = checks.filter((c) => c.ok).length;
      return {
        serviceId: s.id,
        checks,
        score: { passed, total: checks.length },
      };
    });

    res.json({ services, omitted });
  } catch (err: any) {
    res.status(500).json({ message: err?.message ?? "Failed to compute listing health" });
  }
});

export default router;
