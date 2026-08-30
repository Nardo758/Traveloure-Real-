/**
 * offering-requests.routes.ts — mount: app.use(offeringRequestRoutes)
 *
 * The ratified "Don't see your offering?" flow (mockup §06c, CLAUDE.md provider back-office
 * wave, migration 189). Two endpoints:
 *
 *   POST /api/me/offering-requests   — a signed-in provider/expert files a request for an
 *                                       offering type that isn't in the /earn catalog yet.
 *   GET  /api/admin/offering-requests — the admin categories page's read model: the list
 *                                       (newest first, requester email joined in) PLUS a count
 *                                       of provider_services rows currently sitting in the
 *                                       Custom/Other category (service_categories.category_key
 *                                       = 'custom_other', migration 189 seed) — bundled onto
 *                                       this response rather than a second endpoint since
 *                                       categories.tsx is the only consumer and both numbers
 *                                       come from this same "requested types" section.
 *
 * §14 (money-endpoint posture, applied by analogy even though this isn't a money endpoint):
 * the acting user is ALWAYS taken from the session (getUserId(req)), never from req.body — a
 * crafted `userId` in the body can never attribute a request to someone else. status is
 * server-derived (born 'pending', never accepted from the client).
 *
 * §19 (allowlist shape): the insert schema is insertOfferingTypeRequestSchema
 * (shared/schema.ts), a .pick()-based ALLOWLIST that only exposes requestedName/description —
 * id/userId/status/timestamps are unreachable from the body by construction, not by an omit
 * list someone has to remember to update.
 *
 * Auth:
 *   - POST is under /api/me — isAuthenticated only; any signed-in user may file a request
 *     for themselves (no role gate — a provider or expert both use the same picker).
 *   - GET is under /api/admin/offering-requests. §2: the blanket `requireAdmin`/adminApiGuard
 *     mounted on the /api/admin prefix in server/routes.ts (`app.use("/api/admin", adminApiGuard)`)
 *     is the ONLY auth for this route. No per-endpoint admin check is added here — that
 *     per-endpoint-opt-in pattern is exactly what leaked the fee-config hole §2 exists to close.
 *     This route relies entirely on being mounted at/under that prefix; it must never be mounted
 *     anywhere else.
 */
import { Router } from "express";
import { eq, desc, count } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId } from "../utils/auth";
import { offeringTypeRequests, insertOfferingTypeRequestSchema, users, providerServices, serviceCategories } from "@shared/schema";

const router = Router();

router.post("/api/me/offering-requests", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    // Allowlist parse (§19) — requestedName/description only. userId comes from the
    // session above, never from req.body (§14-by-analogy); status defaults 'pending' at
    // the DB and is never accepted from the client.
    const parsed = insertOfferingTypeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
    }

    const [row] = await db
      .insert(offeringTypeRequests)
      .values({
        userId,
        requestedName: parsed.data.requestedName,
        description: parsed.data.description ?? null,
      })
      .returning();

    res.status(201).json(row);
  } catch (err: any) {
    console.error("POST /api/me/offering-requests error:", err);
    res.status(500).json({ message: err?.message ?? "Failed to submit request" });
  }
});

// Auth: §2 blanket adminApiGuard on the /api/admin prefix — see file header. No per-endpoint
// admin check here by design.
router.get("/api/admin/offering-requests", async (req, res) => {
  try {
    const rows = await db
      .select({
        id: offeringTypeRequests.id,
        userId: offeringTypeRequests.userId,
        requestedName: offeringTypeRequests.requestedName,
        description: offeringTypeRequests.description,
        status: offeringTypeRequests.status,
        createdAt: offeringTypeRequests.createdAt,
        updatedAt: offeringTypeRequests.updatedAt,
        requesterEmail: users.email,
      })
      .from(offeringTypeRequests)
      .leftJoin(users, eq(offeringTypeRequests.userId, users.id))
      .orderBy(desc(offeringTypeRequests.createdAt));

    // provider_services currently parked in Custom/Other (migration 189's
    // category_key='custom_other' seed on the pre-existing "Custom / Other" row) — a check
    // this route can't compute (e.g. the row is missing) is reported as 0, never guessed (§13).
    const customOtherCategoryRows = await db
      .select({ id: serviceCategories.id })
      .from(serviceCategories)
      .where(eq(serviceCategories.categoryKey, "custom_other"));

    let customOtherListingsCount = 0;
    if (customOtherCategoryRows.length > 0) {
      const [{ value }] = await db
        .select({ value: count() })
        .from(providerServices)
        .where(eq(providerServices.categoryId, customOtherCategoryRows[0].id));
      customOtherListingsCount = Number(value ?? 0);
    }

    res.json({ requests: rows, customOtherListingsCount });
  } catch (err: any) {
    console.error("GET /api/admin/offering-requests error:", err);
    res.status(500).json({ message: err?.message ?? "Failed to load offering requests" });
  }
});

export default router;
