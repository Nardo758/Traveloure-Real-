import { Router } from "express";
import { getUserId } from "../utils/auth";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { db } from "../db";
import { requireAuth } from "../middlewares/requireAuth";
import { isEA } from "../middleware/ea-rbac";
import {
  getUserByEmail,
  insertNotification,
  getEaClientRelationshipByClient, createEaClientRelationship,
  getEaClientRelationshipById, updateEaClientRelationship, deleteEaClientRelationship,
  getEaExecutives, createEaExecutive, getEaExecutiveById, updateEaExecutive, deleteEaExecutive,
  getEaEvents, createEaEvent, getEaEventById, updateEaEvent, deleteEaEvent,
  getEaTravelArrangements, createEaTravelArrangement, getEaTravelArrangementById,
  updateEaTravelArrangement, deleteEaTravelArrangement,
  getEaGifts, createEaGift, getEaGiftById, updateEaGift, deleteEaGift,
  getEaSavedVenues, createEaSavedVenue, getEaSavedVenueById, updateEaSavedVenue, deleteEaSavedVenue,
  getEaCommunications, createEaCommunication, deleteEaCommunication,
  getEaAiTasks, createEaAiTask, getEaAiTaskById, updateEaAiTask, deleteEaAiTask,
} from "../services/experts-query.service";
import {
  users,
  eaClientRelationships,
  insertEaExecutiveSchema,
  insertEaEventSchema,
  insertEaTravelArrangementSchema,
  insertEaGiftSchema,
  insertEaSavedVenueSchema,
  insertEaCommunicationSchema,
  insertEaAiTaskSchema,
} from "@shared/schema";

const router = Router();

// ── EA RBAC: every /api/ea/* route requires executive_assistant or admin role ──
router.use("/api/ea", isEA);

// Email/password sessions only carry `claims.sub` (no top-level `.id`) — every
// handler in this file must resolve the acting EA user the same way.
function getEaUserId(req: any): string {
  return getUserId(req)!;
}

router.get("/api/ea/clients", requireAuth, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const rows = await db
        .select({
          id: eaClientRelationships.id,
          clientUserId: eaClientRelationships.clientUserId,
          clientEmail: eaClientRelationships.clientEmail,
          displayName: eaClientRelationships.displayName,
          notes: eaClientRelationships.notes,
          billingName: eaClientRelationships.billingName,
          billingEmail: eaClientRelationships.billingEmail,
          billingAddress: eaClientRelationships.billingAddress,
          paymentNotes: eaClientRelationships.paymentNotes,
          preferredCurrency: eaClientRelationships.preferredCurrency,
          createdAt: eaClientRelationships.createdAt,
          userFirstName: users.firstName,
          userLastName: users.lastName,
          userEmail: users.email,
          userProfileImageUrl: users.profileImageUrl,
        })
        .from(eaClientRelationships)
        .leftJoin(users, eq(eaClientRelationships.clientUserId, users.id))
        .where(eq(eaClientRelationships.eaUserId, eaUserId))
        .orderBy(desc(eaClientRelationships.createdAt));
      res.json(rows);
    } catch (err) {
      console.error("[EA] getClients error:", err);
      res.status(500).json({ message: "Failed to fetch clients" });
    }
  });

  // POST /api/ea/clients — add a client (by email lookup)

router.post("/api/ea/clients", requireAuth, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const { email, displayName, notes } = z.object({
        email: z.string().email(),
        displayName: z.string().optional(),
        notes: z.string().optional(),
      }).parse(req.body);

      // Look up the user by email
      const foundUser = await getUserByEmail(email);

      // Check not already added
      const existing = await getEaClientRelationshipByClient(eaUserId, foundUser?.id ?? null, email);
      if (existing) {
        return res.status(409).json({ message: "Client already added" });
      }

      const created = await createEaClientRelationship({
        eaUserId,
        clientUserId: foundUser?.id ?? null,
        clientEmail: email,
        displayName: displayName || (foundUser ? `${foundUser.firstName ?? ""} ${foundUser.lastName ?? ""}`.trim() : email),
        notes: notes ?? null,
      });

      res.status(201).json(created);
    } catch (err) {
      console.error("[EA] addClient error:", err);
      res.status(500).json({ message: "Failed to add client" });
    }
  });

  // PATCH /api/ea/clients/:id — update payment info / notes

router.patch("/api/ea/clients/:id", requireAuth, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const { id } = req.params;
      const updates = z.object({
        displayName: z.string().optional(),
        notes: z.string().optional(),
        billingName: z.string().optional(),
        billingEmail: z.string().email().optional(),
        billingAddress: z.string().optional(),
        paymentNotes: z.string().optional(),
        preferredCurrency: z.string().optional(),
      }).parse(req.body);

      const row = await getEaClientRelationshipById(id, eaUserId);
      if (!row) return res.status(404).json({ message: "Client not found" });

      const updated = await updateEaClientRelationship(id, updates);
      res.json(updated);
    } catch (err) {
      console.error("[EA] updateClient error:", err);
      res.status(500).json({ message: "Failed to update client" });
    }
  });

  // DELETE /api/ea/clients/:id — remove client relationship

router.delete("/api/ea/clients/:id", requireAuth, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const { id } = req.params;
      const row = await getEaClientRelationshipById(id, eaUserId);
      if (!row) return res.status(404).json({ message: "Client not found" });
      await deleteEaClientRelationship(id);
      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] deleteClient error:", err);
      res.status(500).json({ message: "Failed to remove client" });
    }
  });

  // POST /api/ea/clients/:id/push — send a notification to the client

router.post("/api/ea/clients/:id/push", requireAuth, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const { id } = req.params;
      const { title, message } = z.object({
        title: z.string().min(1).max(255),
        message: z.string().min(1),
      }).parse(req.body);

      const row = await getEaClientRelationshipById(id, eaUserId);
      if (!row) return res.status(404).json({ message: "Client not found" });
      if (!row.clientUserId) return res.status(400).json({ message: "Client does not have a platform account" });

      await insertNotification({
        userId: row.clientUserId,
        type: "ea_message",
        title,
        message,
        relatedId: eaUserId,
        relatedType: "ea_user",
        data: { fromEaUserId: eaUserId },
      });

      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] pushNotification error:", err);
      res.status(500).json({ message: "Failed to send notification" });
    }
  });

  // ============================================================
  // EA EXECUTIVE MANAGEMENT
  // ============================================================


router.get("/api/ea/executives", requireAuth, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      res.json(await getEaExecutives(eaUserId));
    } catch (err) {
      console.error("[EA] getExecutives error:", err);
      res.status(500).json({ message: "Failed to fetch executives" });
    }
  });


router.post("/api/ea/executives", requireAuth, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const body = insertEaExecutiveSchema.parse({ ...req.body, eaUserId });
      res.status(201).json(await createEaExecutive(body));
    } catch (err) {
      console.error("[EA] createExecutive error:", err);
      res.status(400).json({ message: "Failed to create executive" });
    }
  });


router.patch("/api/ea/executives/:id", requireAuth, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const row = await getEaExecutiveById(req.params.id, eaUserId);
      if (!row) return res.status(404).json({ message: "Executive not found" });
      res.json(await updateEaExecutive(req.params.id, req.body));
    } catch (err) {
      console.error("[EA] updateExecutive error:", err);
      res.status(500).json({ message: "Failed to update executive" });
    }
  });


router.delete("/api/ea/executives/:id", requireAuth, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const row = await getEaExecutiveById(req.params.id, eaUserId);
      if (!row) return res.status(404).json({ message: "Executive not found" });
      await deleteEaExecutive(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] deleteExecutive error:", err);
      res.status(500).json({ message: "Failed to delete executive" });
    }
  });

  // ============================================================
  // EA EVENTS
  // ============================================================


router.get("/api/ea/events", requireAuth, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      res.json(await getEaEvents(eaUserId));
    } catch (err) {
      console.error("[EA] getEvents error:", err);
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });


router.post("/api/ea/events", requireAuth, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      // `date` is a real `timestamp` column (dataType "date"): drizzle-zod's
      // generated schema requires an actual Date instance, but JSON transport
      // only ever carries a string — coerce here rather than relaxing the
      // schema, so an invalid date is still rejected by z.date()'s NaN check.
      const rawDate = req.body?.date;
      const body = insertEaEventSchema.parse({
        ...req.body,
        eaUserId,
        date: rawDate ? new Date(rawDate) : undefined,
      });
      res.status(201).json(await createEaEvent(body));
    } catch (err) {
      console.error("[EA] createEvent error:", err);
      res.status(400).json({ message: "Failed to create event" });
    }
  });


router.patch("/api/ea/events/:id", requireAuth, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const row = await getEaEventById(req.params.id, eaUserId);
      if (!row) return res.status(404).json({ message: "Event not found" });
      res.json(await updateEaEvent(req.params.id, req.body));
    } catch (err) {
      console.error("[EA] updateEvent error:", err);
      res.status(500).json({ message: "Failed to update event" });
    }
  });


router.delete("/api/ea/events/:id", requireAuth, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      await deleteEaEvent(req.params.id, eaUserId);
      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] deleteEvent error:", err);
      res.status(500).json({ message: "Failed to delete event" });
    }
  });

  // ============================================================
  // EA TRAVEL ARRANGEMENTS
  // ============================================================


router.get("/api/ea/travel", requireAuth, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      res.json(await getEaTravelArrangements(eaUserId));
    } catch (err) {
      console.error("[EA] getTravel error:", err);
      res.status(500).json({ message: "Failed to fetch travel arrangements" });
    }
  });


router.post("/api/ea/travel", requireAuth, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const body = insertEaTravelArrangementSchema.parse({ ...req.body, eaUserId });
      res.status(201).json(await createEaTravelArrangement(body));
    } catch (err) {
      console.error("[EA] createTravel error:", err);
      res.status(400).json({ message: "Failed to create travel arrangement" });
    }
  });


router.patch("/api/ea/travel/:id", requireAuth, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const row = await getEaTravelArrangementById(req.params.id, eaUserId);
      if (!row) return res.status(404).json({ message: "Travel arrangement not found" });
      res.json(await updateEaTravelArrangement(req.params.id, req.body));
    } catch (err) {
      console.error("[EA] updateTravel error:", err);
      res.status(500).json({ message: "Failed to update travel arrangement" });
    }
  });


router.delete("/api/ea/travel/:id", requireAuth, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      await deleteEaTravelArrangement(req.params.id, eaUserId);
      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] deleteTravel error:", err);
      res.status(500).json({ message: "Failed to delete travel arrangement" });
    }
  });

  // ============================================================
  // EA GIFTS
  // ============================================================


router.get("/api/ea/gifts", requireAuth, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      res.json(await getEaGifts(eaUserId));
    } catch (err) {
      console.error("[EA] getGifts error:", err);
      res.status(500).json({ message: "Failed to fetch gifts" });
    }
  });


router.post("/api/ea/gifts", requireAuth, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const body = insertEaGiftSchema.parse({ ...req.body, eaUserId });
      res.status(201).json(await createEaGift(body));
    } catch (err) {
      console.error("[EA] createGift error:", err);
      res.status(400).json({ message: "Failed to create gift" });
    }
  });


router.patch("/api/ea/gifts/:id", requireAuth, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const row = await getEaGiftById(req.params.id, eaUserId);
      if (!row) return res.status(404).json({ message: "Gift not found" });
      res.json(await updateEaGift(req.params.id, req.body));
    } catch (err) {
      console.error("[EA] updateGift error:", err);
      res.status(500).json({ message: "Failed to update gift" });
    }
  });


router.delete("/api/ea/gifts/:id", requireAuth, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      await deleteEaGift(req.params.id, eaUserId);
      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] deleteGift error:", err);
      res.status(500).json({ message: "Failed to delete gift" });
    }
  });

  // ============================================================
  // EA SAVED VENUES
  // ============================================================


router.get("/api/ea/venues", requireAuth, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      res.json(await getEaSavedVenues(eaUserId));
    } catch (err) {
      console.error("[EA] getVenues error:", err);
      res.status(500).json({ message: "Failed to fetch venues" });
    }
  });


router.post("/api/ea/venues", requireAuth, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const body = insertEaSavedVenueSchema.parse({ ...req.body, eaUserId });
      res.status(201).json(await createEaSavedVenue(body));
    } catch (err) {
      console.error("[EA] createVenue error:", err);
      res.status(400).json({ message: "Failed to save venue" });
    }
  });


router.patch("/api/ea/venues/:id", requireAuth, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const row = await getEaSavedVenueById(req.params.id, eaUserId);
      if (!row) return res.status(404).json({ message: "Venue not found" });
      res.json(await updateEaSavedVenue(req.params.id, req.body));
    } catch (err) {
      console.error("[EA] updateVenue error:", err);
      res.status(500).json({ message: "Failed to update venue" });
    }
  });


router.delete("/api/ea/venues/:id", requireAuth, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      await deleteEaSavedVenue(req.params.id, eaUserId);
      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] deleteVenue error:", err);
      res.status(500).json({ message: "Failed to delete venue" });
    }
  });

  // ============================================================
  // EA COMMUNICATIONS
  // ============================================================


router.get("/api/ea/communications", requireAuth, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      res.json(await getEaCommunications(eaUserId));
    } catch (err) {
      console.error("[EA] getCommunications error:", err);
      res.status(500).json({ message: "Failed to fetch communications" });
    }
  });


router.post("/api/ea/communications", requireAuth, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const body = insertEaCommunicationSchema.parse({ ...req.body, eaUserId });
      res.status(201).json(await createEaCommunication(body));
    } catch (err) {
      console.error("[EA] createCommunication error:", err);
      res.status(400).json({ message: "Failed to log communication" });
    }
  });


router.delete("/api/ea/communications/:id", requireAuth, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      await deleteEaCommunication(req.params.id, eaUserId);
      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] deleteCommunication error:", err);
      res.status(500).json({ message: "Failed to delete communication" });
    }
  });

  // ============================================================
  // EA AI TASKS
  // ============================================================


router.get("/api/ea/ai-tasks", requireAuth, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const { status } = req.query;
      res.json(await getEaAiTasks(eaUserId, status as string | undefined));
    } catch (err) {
      console.error("[EA] getAiTasks error:", err);
      res.status(500).json({ message: "Failed to fetch AI tasks" });
    }
  });


router.post("/api/ea/ai-tasks", requireAuth, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const body = insertEaAiTaskSchema.parse({ ...req.body, eaUserId });
      res.status(201).json(await createEaAiTask(body));
    } catch (err) {
      console.error("[EA] createAiTask error:", err);
      res.status(400).json({ message: "Failed to create AI task" });
    }
  });


router.patch("/api/ea/ai-tasks/:id", requireAuth, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const row = await getEaAiTaskById(req.params.id, eaUserId);
      if (!row) return res.status(404).json({ message: "AI task not found" });
      const updates: Record<string, any> = { ...req.body };
      if (req.body.status === "approved") updates.approvedAt = new Date();
      if (req.body.status === "rejected") updates.rejectedAt = new Date();
      res.json(await updateEaAiTask(req.params.id, updates));
    } catch (err) {
      console.error("[EA] updateAiTask error:", err);
      res.status(500).json({ message: "Failed to update AI task" });
    }
  });


router.delete("/api/ea/ai-tasks/:id", requireAuth, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      await deleteEaAiTask(req.params.id, eaUserId);
      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] deleteAiTask error:", err);
      res.status(500).json({ message: "Failed to delete AI task" });
    }
  });

  // ============================================================
  // EA PREFERENCES (Profile + Settings pages)
  // ============================================================
  // No schema change: `users.preferences` is an existing generic jsonb column
  // (migration 150). Stored under a dedicated `ea` sub-key so this never collides
  // with the unrelated `.settings` namespace the generic /api/me/preferences
  // endpoint (storefront.routes.ts) reads/writes for traveler-facing Settings.
  // §14: acting user from session only. PATCH is a strict zod allow-list of
  // exactly the fields the Profile/Settings pages render — never raw req.body —
  // and shallow-merges into `preferences.ea` so unrelated jsonb keys survive.

const eaPreferencesPatchSchema = z.object({
  contact: z.object({
    phone: z.string().max(50).optional(),
    jobTitle: z.string().max(150).optional(),
    timezone: z.string().max(100).optional(),
  }).strict().optional(),
  notifications: z.object({
    urgentEventAlerts: z.boolean().optional(),
    aiTaskCompletions: z.boolean().optional(),
    calendarReminders: z.boolean().optional(),
    executiveUpdates: z.boolean().optional(),
    weeklySummaryEmails: z.boolean().optional(),
  }).strict().optional(),
  ai: z.object({
    autoDelegateRoutineTasks: z.boolean().optional(),
    aiDraftCommunications: z.boolean().optional(),
    smartCalendarSuggestions: z.boolean().optional(),
    proactiveTravelRecommendations: z.boolean().optional(),
    giftReminders: z.boolean().optional(),
  }).strict().optional(),
  display: z.object({
    showExecutivePhotos: z.boolean().optional(),
    compactViewMode: z.boolean().optional(),
    showCalendarWeekNumbers: z.boolean().optional(),
    twentyFourHourTime: z.boolean().optional(),
  }).strict().optional(),
  calendar: z.object({
    weekStartsOn: z.enum(["sunday", "monday"]).optional(),
    workingHoursStart: z.number().int().min(0).max(23).optional(),
    workingHoursEnd: z.number().int().min(1).max(24).optional(),
  }).strict().optional(),
}).strict();

router.get("/api/ea/preferences", requireAuth, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const [row] = await db
        .select({ preferences: users.preferences })
        .from(users)
        .where(eq(users.id, eaUserId))
        .limit(1);
      const ea = ((row?.preferences as any) ?? {}).ea ?? {};
      res.json(ea);
    } catch (err) {
      console.error("[EA] getPreferences error:", err);
      res.status(500).json({ message: "Failed to fetch preferences" });
    }
  });


router.patch("/api/ea/preferences", requireAuth, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const parsed = eaPreferencesPatchSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid preferences", errors: parsed.error.flatten() });
      }

      const [row] = await db
        .select({ preferences: users.preferences })
        .from(users)
        .where(eq(users.id, eaUserId))
        .limit(1);
      if (!row) return res.status(404).json({ message: "User not found" });

      const current = (row.preferences as any) ?? {};
      const currentEa = current.ea ?? {};
      const patch = parsed.data;
      const nextEa = {
        ...currentEa,
        ...(patch.contact ? { contact: { ...currentEa.contact, ...patch.contact } } : {}),
        ...(patch.notifications ? { notifications: { ...currentEa.notifications, ...patch.notifications } } : {}),
        ...(patch.ai ? { ai: { ...currentEa.ai, ...patch.ai } } : {}),
        ...(patch.display ? { display: { ...currentEa.display, ...patch.display } } : {}),
        ...(patch.calendar ? { calendar: { ...currentEa.calendar, ...patch.calendar } } : {}),
      };

      await db
        .update(users)
        .set({ preferences: { ...current, ea: nextEa } })
        .where(eq(users.id, eaUserId));

      res.json(nextEa);
    } catch (err) {
      console.error("[EA] updatePreferences error:", err);
      res.status(500).json({ message: "Failed to update preferences" });
    }
  });

export default router;
