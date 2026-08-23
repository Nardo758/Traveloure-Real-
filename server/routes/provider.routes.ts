import { Router } from "express";
import { getUserId } from "../utils/auth";
import { z } from "zod";
import { eq, and, inArray, asc, desc } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { users, providerServices, bundleComponents } from "@shared/schema";
import { isAuthenticated } from "../replit_integrations/auth";
import { LOCATION_PRECISION_EXACT } from "../utils/service-location";
// Ledger 90 (FP-5, S2): the payout floor is quoted from its single source, never re-typed here.
import { MIN_PAYOUT_DOLLARS } from "../config/payout.config";
import { deriveCityPatch } from "../utils/service-city";
// S10 (Gate G4): the ONE bundle delivery-method derivation, shared with the read path
// (content.routes.ts) so write-time and read-time can never resolve it two different ways.
import { deriveBundleDeliveryMethod as deriveBundleDeliveryMethodFromMethods } from "@shared/bundle-delivery-method";
import { sanitizeStringFields, sanitizeText } from "../utils/text-sanitizer";

/**
 * Provider supply tools — /api/provider/settings (Kyoto-supply activation).
 *
 * The provider settings page (client/src/pages/provider/settings.tsx, routed behind
 * ProtectedRoute requiredRole="provider") was a surface without a backend: it GET/PATCHes
 * /api/provider/settings, but those handlers lived in the imported-but-unmounted
 * experts.routes.ts (dark) — so the page hit the Vite catch-all (200-HTML) instead of real
 * data. This mounts them for real. The dark copies also referenced an undefined
 * `requireProviderRole`, so they would have thrown even if reached; that helper is written
 * here (DB role lookup, mirroring the EA `isEA` guard).
 *
 * NOT money-path: settings are self-scoped by userId (unique per user); PATCH is a zod
 * allow-list of the seven editable fields only (never raw req.body), so ownership/identity
 * columns can't be mass-assigned. No Stripe/earning write happens here.
 *
 * ONE clause updated by ledger 90 (FP-5, S2), because it stopped being true: `minimumPayoutAmount`
 * now BINDS IN A MONEY DECISION — `POST /api/payouts/request` gates on
 * max(MIN_PAYOUT_CENTS, this value). The §14 posture holds and is worth stating: the value is READ
 * server-side from the caller's own settings row, never accepted from the payout request's body,
 * and it can only ever RAISE the bar on the owner's own withdrawal — it can never lower the
 * platform floor, move an amount, or affect any other party. (`payoutFrequency` remains a
 * preference with no consumer; its control was removed by S1 — see settings.tsx.)
 *
 * The /api/provider/earnings* family (also dark) is intentionally NOT mounted here: no client
 * consumer calls it (the earnings page derives from the live /api/provider/bookings), so
 * mounting it would be a backend without a surface. Activate it alongside a real consumer.
 *
 * Bundle CRUD (§17 Product Builder, migration 151): a bundle IS a provider_services row
 * (product_shape='bundle') linked to its components via bundle_components. NOT money-path:
 * `price` here is the listing price the owner sets (same as any service create) — the actual
 * charge is server-derived at /api/checkout from the stored row (§14). Create is server-clamped
 * born-`submitted` (D1a); components must be the session user's own approved+active,
 * non-bundle services (F2: no unapproved service hides inside a sellable bundle).
 */
const router = Router();

/** Resolve the session user's id iff they are a provider (or admin); else 403 and return null. */
async function requireProviderRole(req: any, res: any): Promise<string | null> {
  const userId = getUserId(req)!;
  if (!userId) {
    res.status(401).json({ message: "Authentication required" });
    return null;
  }
  const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  // Role vocabulary ground truth: provider approval writes role "service_provider"
  // (routes.ts, admin approval path), NOT "provider" — same set as PROVIDER_ROLES in
  // middleware/role-rbac.ts. Checking "provider" here locked out every real provider.
  if (!row || (row.role !== "service_provider" && row.role !== "admin")) {
    res.status(403).json({ message: "Provider access required" });
    return null;
  }
  return userId;
}

// The seven provider-editable settings fields (mirrors settings.tsx). Everything else — id,
// userId, updatedAt — is server-owned and never accepted from the client.
const settingsPatchSchema = z
  .object({
    instantBooking: z.boolean(),
    autoResponse: z.boolean(),
    minimumLeadTimeDays: z.number().int().min(0),
    targetResponseTimeHours: z.number().int().min(0),
    payoutFrequency: z.enum(["weekly", "biweekly", "monthly"]),
    minimumPayoutAmount: z.union([z.string(), z.number()]).transform((v) => String(v)),
    notificationsJson: z.record(z.boolean()),
  })
  .partial();

router.get("/api/provider/settings", isAuthenticated, async (req, res) => {
  try {
    const userId = await requireProviderRole(req, res);
    if (!userId) return;
    const settings = await storage.getProviderSettings(userId);
    if (!settings) {
      // Sensible defaults so a first-time provider sees the form populated (no row yet).
      //
      // Ledger 90 (FP-5, S2): `minimumPayoutAmount` defaults to the PLATFORM FLOOR, not the old
      // cosmetic "100". While the control was inert the value was decoration; now that it BINDS
      // (POST /api/payouts/request enforces max(floor, this)), a form pre-filled with 100 would
      // silently impose a $100 threshold on every provider who ever pressed Save without touching
      // the field. The honest starting value is the threshold actually in force for a provider
      // with no preference — the floor itself.
      return res.json({
        instantBooking: false,
        autoResponse: true,
        minimumLeadTimeDays: 7,
        targetResponseTimeHours: 2,
        payoutFrequency: "monthly",
        minimumPayoutAmount: MIN_PAYOUT_DOLLARS.toFixed(2),
        notificationsJson: {
          newBookings: true,
          bookingUpdates: true,
          messages: true,
          reviews: true,
          payouts: true,
          marketing: false,
        },
      });
    }
    res.json(settings);
  } catch (err) {
    console.error("[Provider] getSettings error:", err);
    res.status(500).json({ message: "Failed to get settings" });
  }
});

router.patch("/api/provider/settings", isAuthenticated, async (req, res) => {
  try {
    const userId = await requireProviderRole(req, res);
    if (!userId) return;
    // Allow-list only — never spread raw req.body (ownership/identity columns stay server-owned).
    const safeSettings = settingsPatchSchema.parse(req.body);
    const settings = await storage.upsertProviderSettings(userId, safeSettings);
    res.json(settings);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid settings", errors: err.errors });
    }
    console.error("[Provider] upsertSettings error:", err);
    res.status(500).json({ message: "Failed to save settings" });
  }
});

// ─── Bundles (§17 Product Builder — migration 151) ────────────────────────────

// Listing price: the owner-set price of the bundle listing, like any service create —
// NOT a charge amount (the checkout charge is server-derived from the stored row, §14).
const bundlePriceField = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .refine((v) => Number.isFinite(parseFloat(v)) && parseFloat(v) > 0, {
    message: "price must be a positive number",
  });

// Allow-list only — approvalStatus/userId/earnings columns are never accepted from the
// client (the marketplace Gap-2 lesson; D1a clamps the born state server-side below).
const bundleCreateSchema = z.object({
  serviceName: z.string().trim().min(1).max(255),
  description: z.string().max(10000).optional(),
  price: bundlePriceField,
  componentServiceIds: z.array(z.string().min(1)).min(2),
});

const bundlePatchSchema = z.object({
  serviceName: z.string().trim().min(1).max(255).optional(),
  description: z.string().max(10000).optional(),
  price: bundlePriceField.optional(),
  componentServiceIds: z.array(z.string().min(1)).min(2).optional(),
  status: z.enum(["active", "paused"]).optional(),
});

type ProviderServiceRow = typeof providerServices.$inferSelect;

/**
 * ── FP-1 / B2 (docs/testing/PROVIDER_BATCH_EXERCISE.md, P1) ─────────────────────────────────
 * `provider_services.delivery_method` DEFAULTs to 'pdf' (shared/schema.ts). These Workstation
 * builders never set the column, so every property, room and bundle they created was stored as
 * 'pdf' — and that is NOT internal: the traveler-facing storefront card for a 1912 machiya guest
 * room read "PDF guide", and a bundle mixing an in-person food walk with a video call printed the
 * literal string `pdf`. The same column drives the D8 completion rule and the D2 fundamentals.
 *
 * The two honest values, from the canonical 7 ONLY (CLAUDE.md §3, deliveryMethodEnum):
 *   property / property_room → `in_person`. An accommodation is consumed at the place it is.
 *   bundle                   → DERIVED from its components: the method they all share when they
 *                              agree, otherwise `hybrid` (a genuinely mixed bundle; the canonical
 *                              vocabulary has exactly one word for that).
 * A component set with no methods at all is not derivable, so `null` is returned and the caller
 * leaves the column alone rather than guessing (§13). Migration 208 repairs rows already on disk
 * under the same rules.
 */
const PROPERTY_DELIVERY_METHOD = "in_person";

// Delegates to the shared predicate (shared/bundle-delivery-method.ts) — see the S10 import
// comment above. Kept as a thin row→methods adapter so every call site below is unchanged.
function deriveBundleDeliveryMethod(components: ProviderServiceRow[]): string | null {
  return deriveBundleDeliveryMethodFromMethods(components.map((c) => c.deliveryMethod));
}

function toComponentSummary(rows: ProviderServiceRow[]) {
  // Owner console shape — the owner may see unapproved states of their own services.
  return rows.map((c, i) => ({
    id: c.id,
    serviceName: c.serviceName,
    approvalStatus: c.approvalStatus,
    status: c.status,
    position: i,
  }));
}

/**
 * Validate a bundle's component set, all server-side (§17): ≥2 unique ids; every row
 * exists AND belongs to the session user (owned-or-absent are answered identically —
 * no existence probe on other users' services); approved + active (F2); and not itself
 * a bundle (bundles stay flat — no bundles-of-bundles). Responds 400 and returns null
 * on any failure; returns the rows in the deduped input order on success.
 */
async function validateBundleComponents(
  userId: string,
  componentServiceIds: string[],
  res: any,
): Promise<ProviderServiceRow[] | null> {
  const ids = Array.from(new Set(componentServiceIds));
  if (ids.length < 2) {
    res.status(400).json({ message: "A bundle needs at least 2 distinct component services" });
    return null;
  }
  const rows = await db.select().from(providerServices).where(inArray(providerServices.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const id of ids) {
    const row = byId.get(id);
    if (!row || row.userId !== userId) {
      res.status(400).json({ message: `Component service ${id} not found among your services` });
      return null;
    }
    if (row.approvalStatus !== "approved") {
      // F2: no unapproved service hides inside a sellable bundle.
      res.status(400).json({ message: `"${row.serviceName}" is not approved yet — only approved services can join a bundle` });
      return null;
    }
    if (row.status !== "active") {
      res.status(400).json({ message: `"${row.serviceName}" is not active — only active services can join a bundle` });
      return null;
    }
    if (row.productShape === "bundle") {
      res.status(400).json({ message: `"${row.serviceName}" is itself a bundle — bundles stay flat (no bundles of bundles)` });
      return null;
    }
  }
  return ids.map((id) => byId.get(id)!);
}

router.post("/api/provider/bundles", isAuthenticated, async (req, res) => {
  try {
    // §14: acting user from the session only — never from the body.
    const userId = await requireProviderRole(req, res);
    if (!userId) return;
    const body = sanitizeStringFields(bundleCreateSchema.parse(req.body) as Record<string, unknown>) as ReturnType<typeof bundleCreateSchema.parse>;
    const components = await validateBundleComponents(userId, body.componentServiceIds, res);
    if (!components) return;

    // FP-1 / B2: an honest delivery method, derived from what the bundle actually contains.
    const bundleDeliveryMethod = deriveBundleDeliveryMethod(components);

    // Transaction: the bundle row and its component rows exist together or not at all.
    const bundle = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(providerServices)
        .values({
          userId,
          serviceName: body.serviceName,
          description: body.description ?? null,
          price: body.price,
          productShape: "bundle",
          ...(bundleDeliveryMethod ? { deliveryMethod: bundleDeliveryMethod } : {}),
          // D1a: born-submitted, server-clamped — approvalStatus is never read from the body.
          approvalStatus: "submitted",
          submittedAt: new Date(),
          status: "active",
          createdVia: "bundle", // Creation provenance (2026-08-23).
        })
        .returning();
      await tx.insert(bundleComponents).values(
        components.map((c, i) => ({
          bundleServiceId: created.id,
          componentServiceId: c.id,
          position: i,
        })),
      );
      return created;
    });

    res.status(201).json({ ...bundle, components: toComponentSummary(components) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid bundle", errors: err.errors });
    }
    console.error("[Provider] createBundle error:", err);
    res.status(500).json({ message: "Failed to create bundle" });
  }
});

router.get("/api/provider/bundles", isAuthenticated, async (req, res) => {
  try {
    const userId = await requireProviderRole(req, res);
    if (!userId) return;
    // Owner console — session-scoped, intentionally ungated on approval (F2 owner-read posture).
    const bundles = await db
      .select()
      .from(providerServices)
      .where(and(eq(providerServices.userId, userId), eq(providerServices.productShape, "bundle")))
      .orderBy(desc(providerServices.createdAt));
    if (bundles.length === 0) return res.json([]);

    const componentRows = await db
      .select({
        bundleServiceId: bundleComponents.bundleServiceId,
        position: bundleComponents.position,
        id: providerServices.id,
        serviceName: providerServices.serviceName,
        approvalStatus: providerServices.approvalStatus,
        status: providerServices.status,
      })
      .from(bundleComponents)
      .innerJoin(providerServices, eq(bundleComponents.componentServiceId, providerServices.id))
      .where(inArray(bundleComponents.bundleServiceId, bundles.map((b) => b.id)))
      .orderBy(asc(bundleComponents.position));
    const grouped = new Map<string, typeof componentRows>();
    for (const row of componentRows) {
      const list = grouped.get(row.bundleServiceId) ?? [];
      list.push(row);
      grouped.set(row.bundleServiceId, list);
    }

    res.json(
      bundles.map((b) => ({
        ...b,
        components: (grouped.get(b.id) ?? []).map(({ bundleServiceId: _drop, ...c }) => c),
      })),
    );
  } catch (err) {
    console.error("[Provider] listBundles error:", err);
    res.status(500).json({ message: "Failed to list bundles" });
  }
});

router.patch("/api/provider/bundles/:id", isAuthenticated, async (req, res) => {
  try {
    const userId = await requireProviderRole(req, res);
    if (!userId) return;
    const [existing] = await db
      .select()
      .from(providerServices)
      .where(eq(providerServices.id, req.params.id));
    // 404 for missing, unowned, and non-bundle rows alike (no existence leak — the
    // /api/provider/services/:id delete idiom in routes.ts).
    if (!existing || existing.userId !== userId || existing.productShape !== "bundle") {
      return res.status(404).json({ message: "Bundle not found or not owned by you" });
    }
    const body = sanitizeStringFields(bundlePatchSchema.parse(req.body) as Record<string, unknown>) as ReturnType<typeof bundlePatchSchema.parse>;

    let components: ProviderServiceRow[] | null = null;
    let componentSetChanged = false;
    if (body.componentServiceIds) {
      components = await validateBundleComponents(userId, body.componentServiceIds, res);
      if (!components) return;
      const current = await db
        .select({ componentServiceId: bundleComponents.componentServiceId })
        .from(bundleComponents)
        .where(eq(bundleComponents.bundleServiceId, existing.id));
      const currentSet = new Set(current.map((c) => c.componentServiceId));
      componentSetChanged =
        currentSet.size !== components.length || components.some((c) => !currentSet.has(c.id));
    }

    // A3 material-change rule: price or component-set changes to an APPROVED bundle
    // re-enter the F2 review queue (drop back to 'submitted').
    const priceChanged =
      body.price !== undefined && parseFloat(body.price) !== parseFloat(existing.price ?? "0");
    const reenteredReview =
      existing.approvalStatus === "approved" && (priceChanged || componentSetChanged);

    const updated = await db.transaction(async (tx) => {
      const patch: Record<string, any> = { updatedAt: new Date() };
      if (body.serviceName !== undefined) patch.serviceName = body.serviceName;
      if (body.description !== undefined) patch.description = body.description;
      if (body.price !== undefined) patch.price = body.price;
      if (body.status !== undefined) patch.status = body.status;
      // FP-1 / B2: a changed component set can change what the bundle IS — re-derive the delivery
      // method from the new members so the traveler-facing label never goes stale. Only when the
      // set actually changed, and only when it is derivable at all (§13).
      if (components) {
        const rederived = deriveBundleDeliveryMethod(components);
        if (rederived) patch.deliveryMethod = rederived;
      }
      if (reenteredReview) {
        patch.approvalStatus = "submitted";
        patch.submittedAt = new Date();
      }
      const [row] = await tx
        .update(providerServices)
        .set(patch)
        .where(eq(providerServices.id, existing.id))
        .returning();
      if (components) {
        await tx.delete(bundleComponents).where(eq(bundleComponents.bundleServiceId, existing.id));
        await tx.insert(bundleComponents).values(
          components.map((c, i) => ({
            bundleServiceId: existing.id,
            componentServiceId: c.id,
            position: i,
          })),
        );
      }
      return row;
    });

    let responseComponents;
    if (components) {
      responseComponents = toComponentSummary(components);
    } else {
      const rows = await db
        .select({
          position: bundleComponents.position,
          id: providerServices.id,
          serviceName: providerServices.serviceName,
          approvalStatus: providerServices.approvalStatus,
          status: providerServices.status,
        })
        .from(bundleComponents)
        .innerJoin(providerServices, eq(bundleComponents.componentServiceId, providerServices.id))
        .where(eq(bundleComponents.bundleServiceId, existing.id))
        .orderBy(asc(bundleComponents.position));
      responseComponents = rows;
    }
    res.json({ ...updated, components: responseComponents, reenteredReview });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid bundle update", errors: err.errors });
    }
    console.error("[Provider] updateBundle error:", err);
    res.status(500).json({ message: "Failed to update bundle" });
  }
});

router.delete("/api/provider/bundles/:id", isAuthenticated, async (req, res) => {
  try {
    const userId = await requireProviderRole(req, res);
    if (!userId) return;
    const [existing] = await db
      .select()
      .from(providerServices)
      .where(eq(providerServices.id, req.params.id));
    if (!existing || existing.userId !== userId || existing.productShape !== "bundle") {
      return res.status(404).json({ message: "Bundle not found or not owned by you" });
    }
    // bundle_components.bundle_service_id is ON DELETE CASCADE (migration 151) —
    // deleting the bundle's provider_services row takes its component rows with it.
    await db.delete(providerServices).where(eq(providerServices.id, existing.id));
    res.status(204).send();
  } catch (err) {
    console.error("[Provider] deleteBundle error:", err);
    res.status(500).json({ message: "Failed to delete bundle" });
  }
});

// ─── Properties (§17 Product Builder — PROPERTY rung, migration 153) ──────────────────────
//
// A property IS a provider_services row (product_shape='property', the storefront listing).
// Each room type IS its own provider_services row (product_shape='property_room',
// parent_service_id → the property, ON DELETE RESTRICT — a property can't be deleted while
// rooms exist, the bundle-components posture). Rooms carry their own nightly rate on the
// EXISTING price column + pricing_unit='per_night'; night availability rides the EXISTING
// vendor_availability_slots rail (server/routes/expert-console.routes.ts .../slots + the new
// .../slots/range bulk endpoint below it) — no new tables, no new money machinery. F2/D1a/A3
// apply per-row: a room is its own listing with its own approval lifecycle, same as a bundle
// row is both container and itself approval-tracked.

const roomPriceField = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .refine((v) => Number.isFinite(parseFloat(v)) && parseFloat(v) > 0, {
    message: "price must be a positive number",
  });

// `units` is DESCRIPTIVE capacity metadata only (stored in categoryAttributes — no schema
// column for it), not an enforced limit. The number that actually blocks a double-booking is
// vendor_availability_slots.capacity, set per-night via the .../slots/range endpoint (which
// defaults to this value when the caller omits capacity).
const roomInputSchema = z.object({
  roomName: z.string().trim().min(1).max(255),
  description: z.string().max(2000).optional(),
  price: roomPriceField,
  units: z.number().int().min(1).max(100).optional(),
});

/**
 * L27-P3: the confirmed map point from the property dialog's location picker.
 * `location_precision` is DERIVED here (`'exact'`), never read from the body — and only a
 * point the provider actually confirmed produces it (§13; the shared rule set lives in
 * utils/service-location.ts). Absent ⇒ the coordinate columns stay NULL, which is the
 * honest "no point" state (migration 129 never fabricates a city-centre fallback).
 */
const locationPointSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
});

const propertyCreateSchema = z.object({
  serviceName: z.string().trim().min(1).max(255),
  description: z.string().max(10000).optional(),
  location: z.string().max(255).optional(),
  locationPoint: locationPointSchema.optional(),
  neighborhood: z.string().max(100).optional(),
  categoryId: z.string().optional(),
  serviceImage: z.string().max(2000).optional(),
  galleryImages: z.array(z.string().max(2000)).max(20).optional(),
  rooms: z.array(roomInputSchema).min(1, "A property needs at least one room type"),
});

const propertyPatchSchema = z.object({
  serviceName: z.string().trim().min(1).max(255).optional(),
  description: z.string().max(10000).optional(),
  location: z.string().max(255).optional(),
  neighborhood: z.string().max(100).optional(),
  serviceImage: z.string().max(2000).optional(),
  galleryImages: z.array(z.string().max(2000)).max(20).optional(),
  status: z.enum(["active", "paused"]).optional(),
});

const roomPatchSchema = z.object({
  roomName: z.string().trim().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  price: roomPriceField.optional(),
  units: z.number().int().min(1).max(100).optional(),
  status: z.enum(["active", "paused"]).optional(),
});

type ProviderServiceRow2 = typeof providerServices.$inferSelect;

/**
 * Migration 153: property_room.parent_service_id is ON DELETE RESTRICT — a property cannot be
 * deleted while any room still references it. Postgres surfaces that as FK violation 23503;
 * translate it into an honest 409 naming the rooms, mirroring routes.ts's
 * respondIfServiceInBundle for the identical bundle-RESTRICT case.
 */
async function respondIfPropertyHasRooms(err: any, propertyId: string, res: any): Promise<boolean> {
  const code = err?.code ?? err?.cause?.code;
  if (code !== "23503") return false;
  const rooms = await db
    .select({ serviceName: providerServices.serviceName })
    .from(providerServices)
    .where(eq(providerServices.parentServiceId, propertyId));
  if (rooms.length === 0) return false;
  res.status(409).json({
    message: "This property still has room types — remove them before deleting the property.",
    rooms: rooms.map((r) => r.serviceName),
  });
  return true;
}

router.post("/api/provider/properties", isAuthenticated, async (req, res) => {
  try {
    const userId = await requireProviderRole(req, res);
    if (!userId) return;
    const rawBody = sanitizeStringFields(propertyCreateSchema.parse(req.body) as Record<string, unknown>) as ReturnType<typeof propertyCreateSchema.parse>;
    // Sanitize nested room text too — sanitizeStringFields is shallow, so rooms array needs a map.
    const body = {
      ...rawBody,
      rooms: rawBody.rooms.map((r) => sanitizeStringFields(r as Record<string, unknown>) as typeof r),
    };
    // Only a confirmed point writes coordinates; precision is server-derived (§13).
    const coords = body.locationPoint
      ? {
          latitude: body.locationPoint.lat.toFixed(7),
          longitude: body.locationPoint.lng.toFixed(7),
          locationPrecision: LOCATION_PRECISION_EXACT,
        }
      : {};

    // FP-1 / B4: server-derived city from the neighborhood slug (utils/service-city.ts) — the same
    // ONE rule the listing wizard uses. NULL when the property names no neighborhood, or when the
    // slug is ambiguous; never guessed from the free-text location (§13).
    const cityPatch = await deriveCityPatch(body.neighborhood, {
      neighborhoodPresent: body.neighborhood !== undefined,
    });

    const { property, rooms } = await db.transaction(async (tx) => {
      const [createdProperty] = await tx
        .insert(providerServices)
        .values({
          userId,
          serviceName: body.serviceName,
          description: body.description ?? null,
          ...coords,
          ...(body.location !== undefined ? { location: body.location } : {}),
          ...(body.neighborhood !== undefined ? { neighborhood: body.neighborhood } : {}),
          ...cityPatch,
          ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
          serviceImage: body.serviceImage ?? null,
          galleryImages: body.galleryImages ?? [],
          productShape: "property",
          // FP-1 / B2: an accommodation is place-anchored, not a PDF (see deriveBundleDeliveryMethod).
          deliveryMethod: PROPERTY_DELIVERY_METHOD,
          // D1a: born-submitted, server-clamped — approvalStatus is never read from the body.
          approvalStatus: "submitted",
          submittedAt: new Date(),
          status: "active",
          createdVia: "property", // Creation provenance (2026-08-23).
        })
        .returning();

      // Rooms inherit category/location from the parent property (§17 contract).
      const createdRooms = await tx
        .insert(providerServices)
        .values(
          body.rooms.map((r) => ({
            userId,
            serviceName: r.roomName,
            description: r.description ?? null,
            price: r.price,
            pricingUnit: "per_night" as const,
            productShape: "property_room" as const,
            // FP-1 / B2: a room inherits the property's place-anchored delivery, never the
            // column DEFAULT 'pdf' that had guest rooms labelled "PDF guide" to travelers.
            deliveryMethod: createdProperty.deliveryMethod ?? PROPERTY_DELIVERY_METHOD,
            parentServiceId: createdProperty.id,
            categoryId: createdProperty.categoryId,
            location: createdProperty.location,
            neighborhood: createdProperty.neighborhood,
            // FP-1 / B4: a room sits in its property's city by construction — inherit the DERIVED
            // value rather than re-deriving (or leaving the room out of its own market page).
            city: createdProperty.city,
            // S8 (Gate G2, S8-Q3, ratified absolute inheritance): a room row NEVER writes its own
            // pin — latitude/longitude/locationPrecision are left NULL here (previously copied at
            // creation time, which froze a snapshot that would go stale the moment the property's
            // pin was later corrected via the generic PATCH /api/provider/services route, the
            // exact "two labels, one meaning, one goes stale" class CLAUDE.md already names — SS-4).
            // A room's coordinates are always resolved from its parent at READ TIME instead
            // (`room.latitude ?? parent.latitude`, content.routes.ts GET /api/services/:id) — one
            // source of truth, never a copy. `POST /api/provider/properties/:id/rooms` (adding a
            // room to an existing property) already left these NULL; this makes the create-with-
            // rooms path consistent with it rather than the other way around.
            ...(r.units != null ? { categoryAttributes: { units: r.units } } : {}),
            approvalStatus: "submitted",
            submittedAt: new Date(),
            status: "active",
            createdVia: "property_room", // Creation provenance (2026-08-23).
          })),
        )
        .returning();

      return { property: createdProperty, rooms: createdRooms };
    });

    res.status(201).json({ ...property, rooms });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid property", errors: err.errors });
    }
    console.error("[Provider] createProperty error:", err);
    res.status(500).json({ message: "Failed to create property" });
  }
});

router.get("/api/provider/properties", isAuthenticated, async (req, res) => {
  try {
    const userId = await requireProviderRole(req, res);
    if (!userId) return;
    // Owner console — session-scoped, intentionally ungated on approval (F2 owner-read posture).
    const properties = await db
      .select()
      .from(providerServices)
      .where(and(eq(providerServices.userId, userId), eq(providerServices.productShape, "property")))
      .orderBy(desc(providerServices.createdAt));
    if (properties.length === 0) return res.json([]);

    const rooms = await db
      .select()
      .from(providerServices)
      .where(inArray(providerServices.parentServiceId, properties.map((p) => p.id)))
      .orderBy(asc(providerServices.price));
    const grouped = new Map<string, ProviderServiceRow2[]>();
    for (const r of rooms) {
      const key = r.parentServiceId!;
      const list = grouped.get(key) ?? [];
      list.push(r);
      grouped.set(key, list);
    }

    res.json(properties.map((p) => ({ ...p, rooms: grouped.get(p.id) ?? [] })));
  } catch (err) {
    console.error("[Provider] listProperties error:", err);
    res.status(500).json({ message: "Failed to list properties" });
  }
});

router.patch("/api/provider/properties/:id", isAuthenticated, async (req, res) => {
  try {
    const userId = await requireProviderRole(req, res);
    if (!userId) return;
    const [existing] = await db
      .select()
      .from(providerServices)
      .where(eq(providerServices.id, req.params.id));
    if (!existing || existing.userId !== userId || existing.productShape !== "property") {
      return res.status(404).json({ message: "Property not found or not owned by you" });
    }
    const body = sanitizeStringFields(propertyPatchSchema.parse(req.body) as Record<string, unknown>) as ReturnType<typeof propertyPatchSchema.parse>;
    // Listing-detail fields only — no price lives on the property row itself and room-set
    // changes go through the dedicated room endpoints below (each with its own A3 trigger).
    const patch: Record<string, any> = { updatedAt: new Date() };
    if (body.serviceName !== undefined) patch.serviceName = body.serviceName;
    if (body.description !== undefined) patch.description = body.description;
    if (body.location !== undefined) patch.location = body.location;
    if (body.neighborhood !== undefined) {
      patch.neighborhood = body.neighborhood;
      // FP-1 / B4: the city follows the neighborhood it was derived from — re-derived here, and
      // set to NULL when the new value resolves to nothing (never left pointing at the old city).
      Object.assign(patch, await deriveCityPatch(body.neighborhood, { neighborhoodPresent: true }));
    }
    if (body.serviceImage !== undefined) patch.serviceImage = body.serviceImage;
    if (body.galleryImages !== undefined) patch.galleryImages = body.galleryImages;
    if (body.status !== undefined) patch.status = body.status;

    const [updated] = await db
      .update(providerServices)
      .set(patch)
      .where(eq(providerServices.id, existing.id))
      .returning();
    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid property update", errors: err.errors });
    }
    console.error("[Provider] updateProperty error:", err);
    res.status(500).json({ message: "Failed to update property" });
  }
});

router.delete("/api/provider/properties/:id", isAuthenticated, async (req, res) => {
  try {
    const userId = await requireProviderRole(req, res);
    if (!userId) return;
    const [existing] = await db
      .select()
      .from(providerServices)
      .where(eq(providerServices.id, req.params.id));
    if (!existing || existing.userId !== userId || existing.productShape !== "property") {
      return res.status(404).json({ message: "Property not found or not owned by you" });
    }
    await db.delete(providerServices).where(eq(providerServices.id, existing.id));
    res.status(204).send();
  } catch (err) {
    if (await respondIfPropertyHasRooms(err, req.params.id, res)) return;
    console.error("[Provider] deleteProperty error:", err);
    res.status(500).json({ message: "Failed to delete property" });
  }
});

// ── Rooms (children of a property) ─────────────────────────────────────────────────────────

router.post("/api/provider/properties/:id/rooms", isAuthenticated, async (req, res) => {
  try {
    const userId = await requireProviderRole(req, res);
    if (!userId) return;
    const [property] = await db
      .select()
      .from(providerServices)
      .where(eq(providerServices.id, req.params.id));
    if (!property || property.userId !== userId || property.productShape !== "property") {
      return res.status(404).json({ message: "Property not found or not owned by you" });
    }
    const body = sanitizeStringFields(roomInputSchema.parse(req.body) as Record<string, unknown>) as ReturnType<typeof roomInputSchema.parse>;

    // A3: adding a room type to an APPROVED property changes what the admin vetted (the room
    // roster) — re-enter review, mirroring the bundle component-set-changed rule.
    const propertyReenteredReview = property.approvalStatus === "approved";

    const { room, updatedProperty } = await db.transaction(async (tx) => {
      const [createdRoom] = await tx
        .insert(providerServices)
        .values({
          userId,
          serviceName: body.roomName,
          description: body.description ?? null,
          price: body.price,
          pricingUnit: "per_night" as const,
          productShape: "property_room" as const,
          // FP-1 / B2: same inheritance as the rooms created with the property.
          deliveryMethod: property.deliveryMethod ?? PROPERTY_DELIVERY_METHOD,
          parentServiceId: property.id,
          categoryId: property.categoryId,
          location: property.location,
          neighborhood: property.neighborhood,
          // FP-1 / B4: same inheritance as the rooms created with the property.
          city: property.city,
          ...(body.units != null ? { categoryAttributes: { units: body.units } } : {}),
          // D1a: born-submitted, server-clamped.
          approvalStatus: "submitted",
          submittedAt: new Date(),
          status: "active",
          createdVia: "property_room", // Creation provenance (2026-08-23).
        })
        .returning();

      let updatedPropertyRow = property;
      if (propertyReenteredReview) {
        const [row] = await tx
          .update(providerServices)
          .set({ approvalStatus: "submitted", submittedAt: new Date(), updatedAt: new Date() })
          .where(eq(providerServices.id, property.id))
          .returning();
        updatedPropertyRow = row;
      }
      return { room: createdRoom, updatedProperty: updatedPropertyRow };
    });

    res.status(201).json({ ...room, propertyReenteredReview, property: updatedProperty });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid room", errors: err.errors });
    }
    console.error("[Provider] addRoom error:", err);
    res.status(500).json({ message: "Failed to add room" });
  }
});

router.patch("/api/provider/rooms/:id", isAuthenticated, async (req, res) => {
  try {
    const userId = await requireProviderRole(req, res);
    if (!userId) return;
    const [existing] = await db
      .select()
      .from(providerServices)
      .where(eq(providerServices.id, req.params.id));
    if (!existing || existing.userId !== userId || existing.productShape !== "property_room") {
      return res.status(404).json({ message: "Room not found or not owned by you" });
    }
    const body = sanitizeStringFields(roomPatchSchema.parse(req.body) as Record<string, unknown>) as ReturnType<typeof roomPatchSchema.parse>;

    const patch: Record<string, any> = { updatedAt: new Date() };
    if (body.roomName !== undefined) patch.serviceName = body.roomName;
    if (body.description !== undefined) patch.description = body.description;
    if (body.price !== undefined) patch.price = body.price;
    if (body.units !== undefined) {
      patch.categoryAttributes = { ...(existing.categoryAttributes as any), units: body.units };
    }
    if (body.status !== undefined) patch.status = body.status;

    // A3 material-change rule: a price change on an APPROVED room re-enters review — the room
    // is itself a provider_services row with its own approval lifecycle (D1a per-row).
    const priceChanged =
      body.price !== undefined && parseFloat(body.price) !== parseFloat(existing.price ?? "0");
    const reenteredReview = existing.approvalStatus === "approved" && priceChanged;
    if (reenteredReview) {
      patch.approvalStatus = "submitted";
      patch.submittedAt = new Date();
    }

    const [updated] = await db
      .update(providerServices)
      .set(patch)
      .where(eq(providerServices.id, existing.id))
      .returning();
    res.json({ ...updated, reenteredReview });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid room update", errors: err.errors });
    }
    console.error("[Provider] updateRoom error:", err);
    res.status(500).json({ message: "Failed to update room" });
  }
});

router.delete("/api/provider/rooms/:id", isAuthenticated, async (req, res) => {
  try {
    const userId = await requireProviderRole(req, res);
    if (!userId) return;
    const [existing] = await db
      .select()
      .from(providerServices)
      .where(eq(providerServices.id, req.params.id));
    if (!existing || existing.userId !== userId || existing.productShape !== "property_room") {
      return res.status(404).json({ message: "Room not found or not owned by you" });
    }

    // A3: removing a room type from an APPROVED property is also a room-set change —
    // re-enter the property's review, symmetric with the add-room trigger above.
    let propertyReenteredReview = false;
    await db.transaction(async (tx) => {
      await tx.delete(providerServices).where(eq(providerServices.id, existing.id));
      if (existing.parentServiceId) {
        const [property] = await tx
          .select()
          .from(providerServices)
          .where(eq(providerServices.id, existing.parentServiceId));
        if (property && property.approvalStatus === "approved") {
          propertyReenteredReview = true;
          await tx
            .update(providerServices)
            .set({ approvalStatus: "submitted", submittedAt: new Date(), updatedAt: new Date() })
            .where(eq(providerServices.id, property.id));
        }
      }
    });

    res.json({ success: true, propertyReenteredReview });
  } catch (err) {
    console.error("[Provider] deleteRoom error:", err);
    res.status(500).json({ message: "Failed to delete room" });
  }
});

export default router;
