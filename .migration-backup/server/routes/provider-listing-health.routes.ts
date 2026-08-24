import { Router } from "express";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { getUserId } from "../utils/auth";
import { isAuthenticated } from "../replit_integrations/auth";
import { providerServices, serviceCategories, vendorAvailabilitySlots } from "@shared/schema";
import { isClassifiable, isPlaceAnchored, needsScheduling, isArtifactDelivery } from "@shared/service-fundamentals";

/**
 * Provider Listing Health — GET /api/provider/services/health (ratified "Listing Health" layer;
 * method-aware fundamentals per the Aug 10, 2026 ratification, D2 of the fundamentals brief).
 *
 * MOUNTED in server/routes.ts via `app.use(providerListingHealthRoutes)` (~line 902) — deliberately
 * BEFORE the inline `app.get("/api/provider/services/:id", ...)` registration (~line 2075), because
 * Express matches path segments positionally and `:id` would otherwise greedily swallow "health".
 * Keep the mount in that slot when reordering routes.
 *
 * METHOD-AWARE SCORING (D2): a check that does not apply to a service's shape is OMITTED for that
 * service with a reason — never scored as failing (§13). The applicability predicates live in
 * shared/service-fundamentals.ts (ONE definition, shared with demand.routes.ts's hand-synced
 * mirror and the client chips): exact_pin applies only to place-anchored services
 * (in_person/hybrid delivery, or productShape='property'); availability applies only to services
 * needing calendar slots (those plus live call/video sessions). photo, description, pricing and
 * approval are universal. A row that cannot be classified (no deliveryMethod, not a property)
 * keeps the historical all-checks behavior rather than guessing an omission.
 *
 * D3 (docs/briefs/SERVICE_FUNDAMENTALS_DECISIONS.md, landed): `delivery_asset` applies only to
 * artifact-delivery services (`isArtifactDelivery` — pdf only; see that predicate's comment for
 * why `video` is deliberately excluded). Unlike exact_pin/availability, a non-applicable service
 * gets NEITHER a check NOR an `omitted` entry for this key — the check simply does not exist
 * for it (D3's own text: "failing a provider on something the product gives them no way to fix
 * is not honest scoring", and an omission entry would still read as "this could apply to you").
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
        deliveryMethod: providerServices.deliveryMethod,
        productShape: providerServices.productShape,
        serviceFile: providerServices.serviceFile,
        // FP-1 / B10: the two columns the commission-band NOTICE below is derived from. Read-only,
        // and deliberately NOT a rate: the band KEY, never a percentage (§8/§18 — this lane does
        // not touch rate resolution or any amount).
        categoryId: providerServices.categoryId,
        categoryCommissionBandKey: serviceCategories.commissionBandKey,
      })
      .from(providerServices)
      .leftJoin(serviceCategories, eq(serviceCategories.id, providerServices.categoryId))
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
      const serviceOmitted: { key: string; reason: string }[] = [];

      // D2 applicability (shared/service-fundamentals.ts). An unclassifiable row (no
      // deliveryMethod, not a property) keeps the historical all-checks behavior — we can't
      // honestly omit what we can't classify (§13).
      const shape = { deliveryMethod: s.deliveryMethod, productShape: s.productShape };
      const classifiable = isClassifiable(shape);
      const placeAnchored = classifiable ? isPlaceAnchored(shape) : true;
      const scheduled = classifiable ? needsScheduling(shape) : true;

      // photo: serviceImage present OR galleryImages non-empty.
      const gallery = Array.isArray(s.galleryImages) ? s.galleryImages : [];
      const hasPhoto = !!(s.serviceImage && s.serviceImage.trim().length > 0) || gallery.length > 0;
      checks.push({
        key: "photo",
        ok: hasPhoto,
        ...(hasPhoto ? {} : { detail: "no photo uploaded" }),
      });

      // exact_pin: latitude+longitude present AND locationPrecision='exact'. Place-anchored
      // services only — a PDF guide has no meeting point to pin (D2).
      if (placeAnchored) {
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
      } else {
        serviceOmitted.push({
          key: "exact_pin",
          reason: `not a place-anchored service (${s.deliveryMethod} delivery)`,
        });
      }

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
      // Scheduled services only (in-person/hybrid/property + live call/video sessions) — an
      // artifact or async listing needs no calendar (D2). The query-failure omission stays
      // top-level (it affects every scheduled service at once); the method omission is
      // per-service.
      if (scheduled) {
        if (availabilityComputable) {
          const count = slotCounts.get(s.id) ?? 0;
          const availOk = count > 0;
          checks.push({
            key: "availability",
            ok: availOk,
            ...(availOk ? {} : { detail: "no upcoming availability" }),
          });
        }
      } else {
        serviceOmitted.push({
          key: "availability",
          reason: `no calendar needed for ${s.deliveryMethod} delivery`,
        });
      }

      // delivery_asset (D3): applies only to artifact-delivery services (pdf). No omission
      // entry for the rest — the check simply doesn't exist for a call/in-person/etc. listing.
      if (isArtifactDelivery(shape)) {
        const hasFile = !!(s.serviceFile && s.serviceFile.trim().length > 0);
        checks.push({
          key: "delivery_asset",
          ok: hasFile,
          ...(hasFile ? {} : { detail: "no deliverable file uploaded" }),
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

      // ── FP-1 / B10 (docs/testing/PROVIDER_BATCH_EXERCISE.md, P1) ──────────────────────────
      // VISIBILITY ONLY. Five of twelve listings in a real catalog (a property, both its rooms and
      // both bundles) carry categoryId = NULL, so service_categories.commission_band_key is
      // unresolvable and the resolver falls through to the configured platform default — a band
      // named for a different actor. Nothing here changes any rate, any amount or any resolution
      // order (§8/§18 — the fee lanes own that); it makes an owner able to SEE that their listing
      // resolves no category band, which nothing surfaced anywhere.
      //
      // Deliberately a NOTICE, not a scored check: the property and bundle builders currently ask
      // for no category at all, and D3's own rule is that failing a provider on something the
      // product gives them no way to fix is not honest scoring. It renders beside the meter and
      // never moves the numerator or the denominator.
      const bandResolved = !!s.categoryId && !!s.categoryCommissionBandKey;
      const notices = bandResolved
        ? []
        : [
            {
              key: "commission_band_default",
              detail: s.categoryId
                ? "this listing's category has no commission band set — the platform default band applies"
                : "no category on this listing — the platform default commission band applies",
            },
          ];

      const passed = checks.filter((c) => c.ok).length;
      return {
        serviceId: s.id,
        deliveryMethod: s.deliveryMethod,
        productShape: s.productShape,
        checks,
        // FP-1 / B10: advisory notes — visible, never scored (see above).
        notices,
        // D2: the denominator is the APPLICABLE check count — an omitted check never dilutes
        // or pads the score.
        score: { passed, total: checks.length },
        omitted: serviceOmitted,
      };
    });

    res.json({ services, omitted });
  } catch (err: any) {
    res.status(500).json({ message: err?.message ?? "Failed to compute listing health" });
  }
});

export default router;
