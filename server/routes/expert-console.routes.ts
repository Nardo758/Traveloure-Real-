/**
 * expert-console.routes.ts — MOUNTED home for expert-console endpoints that were dark.
 *
 * Sidebar-audit repair (ratified 2026-07-25): three families lived only in the
 * imported-but-unmounted `experts.routes.ts`, so their live client consumers hit the Vite
 * catch-all (200-HTML — the §9 trap):
 *   • /api/expert/knowledge-nuggets CRUD — Content Studio's library could never save or load
 *   • /api/expert/service-templates — the Services page's template rail rendered nothing
 *   • /api/expert/role (GET + PATCH)  — the Services page's role callout + role switcher
 *
 * Ported VERBATIM per the §9 playbook (port, mount, delete the dark twin — no logic changes),
 * matching the booking-actions.ts precedent for the workspace family. All handlers are
 * session-scoped (§14: acting user from the session, never the body) and were already
 * owner-gated where they mutate.
 */
import { Router } from "express";
import { db } from "../db";
import { storage } from "../storage";
import { isAuthenticated } from "../replit_integrations/auth";
import { desc, asc, eq, or, isNull, sql, and, gte, ne, inArray } from "drizzle-orm";
import { localExpertForms, expertServiceOfferings, coordinationStates, insertLocalKnowledgeNuggetSchema, users, vendorAvailabilitySlots, serviceReviews } from "@shared/schema";
import {
  getLocalKnowledgeNuggets,
  createLocalKnowledgeNugget,
  getLocalKnowledgeNuggetById,
  updateLocalKnowledgeNugget,
  deleteLocalKnowledgeNugget,
} from "../services/experts-query.service";

const router = Router();

const ROLE_LABELS: Record<string, string> = {
  local_expert: "Local Expert",
  travel_expert: "Travel Advisor",
  event_planner: "Event Planner",
  executive_assistant: "Executive Assistant",
};

function sessionUserId(req: any): string {
  return (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
}

// ─── Expert role ─────────────────────────────────────────────────────────────

// GET /api/expert/role — the expert's role type + label + application status.
router.get("/api/expert/role", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    const formRow = await db
      .select({ expertType: localExpertForms.expertType, status: localExpertForms.status })
      .from(localExpertForms)
      .where(eq(localExpertForms.userId, userId))
      .then((r) => r[0]);

    const expertRole = formRow?.expertType ?? null;
    res.json({
      role: expertRole,
      roleLabel: expertRole ? (ROLE_LABELS[expertRole] ?? expertRole) : null,
      applicationStatus: formRow?.status ?? null,
    });
  } catch (err) {
    console.error("Error fetching expert role:", err);
    res.status(500).json({ message: "Failed to fetch expert role" });
  }
});

// PATCH /api/expert/role — approved experts may switch role; Local Expert requires admin review.
router.patch("/api/expert/role", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);

    // Verify caller is an approved expert — non-experts cannot self-promote.
    const form = await storage.getLocalExpertForm(userId);
    if (!form) {
      return res.status(403).json({ message: "No expert application found" });
    }
    if (form.status !== "approved") {
      return res.status(403).json({ message: "Only approved experts can change their role" });
    }

    const { expertType } = req.body;
    const validTypes = ["travel_expert", "local_expert", "event_planner", "executive_assistant"];
    if (!expertType || !validTypes.includes(expertType)) {
      return res.status(400).json({ message: "Invalid expert type" });
    }

    // Local Expert requires specific vetting — only allow if already a local_expert.
    if (expertType === "local_expert" && form.expertType !== "local_expert") {
      return res.status(403).json({
        message:
          "Switching to Local Expert requires admin review. Please contact support to have your application re-evaluated.",
        requiresReview: true,
      });
    }

    await storage.updateLocalExpertFormType(userId, expertType);
    res.json({ success: true, expertType });
  } catch (err) {
    console.error("Error updating expert role:", err);
    res.status(500).json({ message: "Failed to update role" });
  }
});

// ─── ESO service-template catalog (read-only onboarding catalog, §"Service Model") ──────────

router.get("/api/expert/service-templates", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);

    const formRow = await db
      .select({ expertType: localExpertForms.expertType, status: localExpertForms.status })
      .from(localExpertForms)
      .where(eq(localExpertForms.userId, userId))
      .then((r) => r[0]);

    const expertRole = formRow?.expertType ?? null;

    if (!formRow) {
      return res.json({ requiresApplication: true, applicationRejected: false, pendingApproval: false, templates: [] });
    }
    if (formRow.status === "rejected") {
      return res.json({ requiresApplication: false, applicationRejected: true, pendingApproval: false, templates: [] });
    }
    if (formRow.status !== "approved") {
      return res.json({ requiresApplication: false, applicationRejected: false, pendingApproval: true, templates: [] });
    }

    // expertId/isActive columns dropped in migration 013; all ESO rows are platform templates —
    // filter by targetRoles only.
    const rows = await db
      .select()
      .from(expertServiceOfferings)
      .where(
        or(
          isNull(expertServiceOfferings.targetRoles),
          expertRole ? sql`${expertRole} = ANY(${expertServiceOfferings.targetRoles})` : sql`false`,
        ),
      )
      .orderBy(expertServiceOfferings.sortOrder);

    const templates = rows.map((o) => {
      const isRoleSpecific = Array.isArray(o.targetRoles) && o.targetRoles.length > 0;
      return {
        id: o.id,
        title: o.name,
        description: o.description,
        categoryId: null,
        serviceType: null,
        deliveryMethod: null,
        deliveryTimeframe: null,
        suggestedPrice: o.price,
        requirements: null,
        whatIncluded: null,
        isActive: o.isDefault ?? true,
        sortOrder: o.sortOrder,
        createdAt: o.createdAt,
        targetRoles: o.targetRoles ?? [],
        roleBadge: isRoleSpecific && expertRole ? (ROLE_LABELS[expertRole] ?? expertRole) : null,
      };
    });

    res.json({ requiresApplication: false, applicationRejected: false, templates });
  } catch (err) {
    console.error("Error fetching expert service templates:", err);
    res.status(500).json({ message: "Failed to fetch service templates" });
  }
});

// ─── Next availability (Backoffice C1) ──────────────────────────────────────────────────────
//
// `vendor_availability_slots` is the CANONICAL table for concrete, dated bookable slots
// (roadmap ⛭ decision 3 — `provider_availability` is deprecated/dead, never read here).
// One grouped query — MIN(date) over future, not-fully-booked slots, GROUP BY serviceId —
// scoped to the caller's OWN provider_services ids (never trusts ids from the client), so
// this never N+1s regardless of how many offerings the My Offerings table renders.

router.get("/api/me/next-availability", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    const ownServices = await storage.getProviderServicesByStatus(userId);
    const serviceIds = ownServices.map((s) => s.id);

    if (serviceIds.length === 0) {
      return res.json({});
    }

    const todayStr = new Date().toISOString().slice(0, 10);

    const rows = await db
      .select({
        serviceId: vendorAvailabilitySlots.serviceId,
        nextDate: sql<string>`MIN(${vendorAvailabilitySlots.date})`.as("next_date"),
      })
      .from(vendorAvailabilitySlots)
      .where(
        and(
          inArray(vendorAvailabilitySlots.serviceId, serviceIds),
          gte(vendorAvailabilitySlots.date, todayStr),
          ne(vendorAvailabilitySlots.status, "fully_booked"),
          sql`(${vendorAvailabilitySlots.capacity} IS NULL OR ${vendorAvailabilitySlots.bookedCount} < ${vendorAvailabilitySlots.capacity})`,
        ),
      )
      .groupBy(vendorAvailabilitySlots.serviceId);

    const next: Record<string, string> = {};
    for (const row of rows) {
      next[row.serviceId] = row.nextDate;
    }
    res.json(next);
  } catch (err) {
    console.error("[Next Availability] error:", err);
    res.status(500).json({ message: "Failed to fetch next availability" });
  }
});

// ─── Posting opportunities (Wave SH, task SH3) ──────────────────────────────────────────────
//
// Feeds the Share & Promote page's "reasons to post today" strip. §13: every card must be
// backed by a REAL row — no fabricated prompts. Three candidate sources were ground-truthed:
//   • new_review  — service_reviews rows (rating>=4, REV-MOD status='approved') on the caller's
//     OWN approved+active provider_services (the same F2/share-image gate share-images.routes.ts
//     enforces — a submitted/draft/paused listing's share-image 404s, so surfacing it here would
//     be a dead preview, per the SH2 header comment).
//   • open_slots  — vendor_availability_slots grouped rows on the same approved+active services,
//     the C1 next-availability aggregate above extended with a real remaining-capacity sum.
//   • seasonal    — seasonal_opportunities (migration 068) has readers (recommendation.service.ts,
//     content-matching.service.ts) but NO writer/seeder anywhere in the codebase and 0 rows in the
//     dev DB — there is no real data to back a seasonal card. Deliberately OMITTED rather than
//     fabricated; the `kind` union below only carries 'new_review' | 'open_slots' until a real
//     seasonal writer exists.
router.get("/api/me/posting-opportunities", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    const ownServices = await storage.getProviderServicesByStatus(userId);
    // Only offerings that are actually shareable right now (mirrors share-promote.tsx's own
    // picker filter + the share-image F2 gate) — no dead-preview opportunity cards.
    const shareable = ownServices.filter((s) => s.approvalStatus === "approved" && s.status === "active");
    const serviceIds = shareable.map((s) => s.id);
    const nameById = new Map(shareable.map((s) => [s.id, s.serviceName]));

    if (serviceIds.length === 0) {
      return res.json({ opportunities: [] });
    }

    const reviewRows = await db
      .select({
        id: serviceReviews.id,
        rating: serviceReviews.rating,
        reviewText: serviceReviews.reviewText,
        serviceId: serviceReviews.serviceId,
        createdAt: serviceReviews.createdAt,
      })
      .from(serviceReviews)
      .where(
        and(
          inArray(serviceReviews.serviceId, serviceIds),
          gte(serviceReviews.rating, 4),
          eq(serviceReviews.status, "approved"),
        ),
      )
      .orderBy(desc(serviceReviews.createdAt))
      .limit(3);

    const todayStr = new Date().toISOString().slice(0, 10);
    const slotRows = await db
      .select({
        serviceId: vendorAvailabilitySlots.serviceId,
        nextDate: sql<string>`MIN(${vendorAvailabilitySlots.date})`.as("next_date"),
        openSpots: sql<number>`SUM(GREATEST(${vendorAvailabilitySlots.capacity} - ${vendorAvailabilitySlots.bookedCount}, 0))`.as("open_spots"),
      })
      .from(vendorAvailabilitySlots)
      .where(
        and(
          inArray(vendorAvailabilitySlots.serviceId, serviceIds),
          gte(vendorAvailabilitySlots.date, todayStr),
          ne(vendorAvailabilitySlots.status, "fully_booked"),
          sql`(${vendorAvailabilitySlots.capacity} IS NULL OR ${vendorAvailabilitySlots.bookedCount} < ${vendorAvailabilitySlots.capacity})`,
        ),
      )
      .groupBy(vendorAvailabilitySlots.serviceId)
      .orderBy(asc(sql`MIN(${vendorAvailabilitySlots.date})`))
      .limit(3);

    const opportunities = [
      ...reviewRows.map((r) => {
        const text = (r.reviewText ?? "").trim();
        const clamped = text.length > 140 ? `${text.slice(0, 140)}…` : text;
        return {
          kind: "new_review" as const,
          reviewId: r.id,
          rating: r.rating,
          text: clamped,
          serviceId: r.serviceId,
          serviceName: nameById.get(r.serviceId) ?? "your service",
          createdAt: r.createdAt,
        };
      }),
      ...slotRows.map((s) => ({
        kind: "open_slots" as const,
        serviceId: s.serviceId,
        serviceName: nameById.get(s.serviceId) ?? "your service",
        nextDate: s.nextDate,
        openSpots: Number(s.openSpots) || 0,
      })),
    ];

    res.json({ opportunities });
  } catch (err) {
    console.error("[Posting Opportunities] error:", err);
    res.status(500).json({ message: "Failed to fetch posting opportunities" });
  }
});

// ─── Coordination engagements (factory wire A — lane-A intake) ──────────────────────────────
//
// Phase 1c gave admins POST /api/admin/coordination-states/:id/assign-coordinator, which sets
// `assigned_expert_id` — but nothing ever LISTED an expert's engagements, so the assignment
// dead-ended until the expert stumbled onto the trip (verified: no query on assignedExpertId
// existed). This is the expert-side intake: engagements assigned to the session user (§14 —
// never an id from the query string), newest first. Trip-linked engagements carry the tripId
// the client needs to open the workspace's Event Coord tab.

router.get("/api/expert/coordination-engagements", isAuthenticated, async (req, res) => {
  try {
    const expertId = sessionUserId(req);
    const rows = await db
      .select({
        id: coordinationStates.id,
        tripId: coordinationStates.tripId,
        experienceType: coordinationStates.experienceType,
        status: coordinationStates.status,
        destination: coordinationStates.destination,
        dates: coordinationStates.dates,
        feePaymentStatus: coordinationStates.feePaymentStatus,
        createdAt: coordinationStates.createdAt,
      })
      .from(coordinationStates)
      .where(eq(coordinationStates.assignedExpertId, expertId))
      .orderBy(desc(coordinationStates.createdAt));
    res.json({ engagements: rows });
  } catch (err) {
    console.error("[Coordination Engagements] list error:", err);
    res.status(500).json({ message: "Failed to fetch coordination engagements" });
  }
});

// ─── Local-expert knowledge nuggets (Content Studio's library) ──────────────────────────────

// Write access (POST/PATCH/DELETE) is local_expert-or-admin only; reads are expert-level
// (gated by the EXPERT_SELF_SERVICE_PREFIXES isExpert backstop in routes.ts).
async function requireLocalExpertOrAdmin(req: any, res: any, next: any) {
  const userId = sessionUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });
  try {
    const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
    if (!row) return res.status(401).json({ message: "Authentication required" });
    if (row.role !== "local_expert" && row.role !== "admin") {
      return res.status(403).json({ message: "Local Expert access required" });
    }
    next();
  } catch (err) {
    console.error("[Knowledge Nuggets] role check error:", err);
    return res.status(500).json({ message: "Authorization check failed" });
  }
}

router.get("/api/expert/knowledge-nuggets", isAuthenticated, async (req, res) => {
  try {
    const expertId = sessionUserId(req);
    res.json(await getLocalKnowledgeNuggets(expertId));
  } catch (err) {
    console.error("[Knowledge Nuggets] list error:", err);
    res.status(500).json({ message: "Failed to fetch knowledge nuggets" });
  }
});

router.post("/api/expert/knowledge-nuggets", isAuthenticated, requireLocalExpertOrAdmin, async (req, res) => {
  try {
    const expertId = sessionUserId(req);
    const parsed = insertLocalKnowledgeNuggetSchema.safeParse({ ...req.body, expertUserId: expertId });
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten() });
    }
    res.status(201).json(await createLocalKnowledgeNugget(parsed.data));
  } catch (err) {
    console.error("[Knowledge Nuggets] create error:", err);
    res.status(500).json({ message: "Failed to create knowledge nugget" });
  }
});

router.patch("/api/expert/knowledge-nuggets/:id", isAuthenticated, requireLocalExpertOrAdmin, async (req, res) => {
  try {
    const expertId = sessionUserId(req);
    const { id } = req.params;
    const existing = await getLocalKnowledgeNuggetById(id, expertId);
    if (!existing) return res.status(404).json({ message: "Nugget not found" });
    const allowed = ["nuggetType", "city", "linkedPoi", "linkedNeighbourhood", "insight", "targetAudience", "notFor", "seasonality"] as const;
    const updates: Record<string, any> = {};
    for (const key of allowed) {
      if (key in req.body) updates[key] = req.body[key];
    }
    updates.updatedAt = new Date();
    res.json(await updateLocalKnowledgeNugget(id, updates));
  } catch (err) {
    console.error("[Knowledge Nuggets] update error:", err);
    res.status(500).json({ message: "Failed to update knowledge nugget" });
  }
});

router.delete("/api/expert/knowledge-nuggets/:id", isAuthenticated, requireLocalExpertOrAdmin, async (req, res) => {
  try {
    const expertId = sessionUserId(req);
    const { id } = req.params;
    const existing = await getLocalKnowledgeNuggetById(id, expertId);
    if (!existing) return res.status(404).json({ message: "Nugget not found" });
    await deleteLocalKnowledgeNugget(id);
    res.json({ success: true });
  } catch (err) {
    console.error("[Knowledge Nuggets] delete error:", err);
    res.status(500).json({ message: "Failed to delete knowledge nugget" });
  }
});

export default router;
