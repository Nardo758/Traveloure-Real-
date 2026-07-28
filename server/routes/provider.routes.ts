import { Router } from "express";
import { z } from "zod";
import { eq, and, inArray, asc, desc } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { users, providerServices, bundleComponents } from "@shared/schema";
import { isAuthenticated } from "../replit_integrations/auth";

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
 * columns can't be mass-assigned. `payoutFrequency`/`minimumPayoutAmount` are provider
 * preferences, not a charge/transfer amount — no Stripe/earning write happens here.
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
  const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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
      return res.json({
        instantBooking: false,
        autoResponse: true,
        minimumLeadTimeDays: 7,
        targetResponseTimeHours: 2,
        payoutFrequency: "monthly",
        minimumPayoutAmount: "100",
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
    const body = bundleCreateSchema.parse(req.body);
    const components = await validateBundleComponents(userId, body.componentServiceIds, res);
    if (!components) return;

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
          // D1a: born-submitted, server-clamped — approvalStatus is never read from the body.
          approvalStatus: "submitted",
          submittedAt: new Date(),
          status: "active",
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
    const body = bundlePatchSchema.parse(req.body);

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

export default router;
