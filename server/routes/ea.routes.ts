import { Router } from "express";
import { getUserId } from "../utils/auth";
import { sanitizeStringFields, sanitizeText } from "../utils/text-sanitizer";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { db } from "../db";
import { updateUserPreferences } from "../services/user-preferences-writer";
import { isAuthenticated } from "../replit_integrations/auth";
import { isEA } from "../middleware/ea-rbac";
import {
  getUserByEmail,
  insertNotification,
  getEaClientRelationshipByEmail, createEaClientRelationship,
  listPendingEaInvitationsForEmail, listAcceptedEaLinksForUser,
  acceptEaInvitation, declineEaInvitation, revokeEaLink,
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

router.get("/api/ea/clients", isAuthenticated, async (req, res) => {
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

router.post("/api/ea/clients", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const { email, displayName, notes } = z.object({
        email: z.string().email(),
        displayName: z.string().optional(),
        notes: z.string().optional(),
      }).parse(req.body);

      // CONSENT (board task #502, ledger `2026-09-23-phase1-security`). Adding a client is an
      // INVITATION addressed to an email. It links no account and reads nothing from one: the name
      // shown is the one the EA typed, and whether the email belongs to an account is never
      // revealed (the response is identical either way). The person links their account by
      // accepting from their own session (`POST /api/me/ea-invitations/:id/accept`); until then the
      // EA cannot see their profile or push to them.
      const existing = await getEaClientRelationshipByEmail(eaUserId, email);
      if (existing) {
        return res.status(409).json({ message: "Client already added" });
      }

      const created = await createEaClientRelationship({
        eaUserId,
        clientUserId: null,
        clientEmail: email,
        // Only a name the EA typed. Never the email: a stored email would outrank the person's own
        // account name once they accept (ledger `2026-09-23-ea-accepted-client-name`).
        displayName: displayName?.trim() ? (sanitizeText(displayName.trim()) as string) : null,
        notes: sanitizeText(notes ?? null),
      });

      // Tell the invitee, if they have an account — an in-app notice they can act on. Best-effort,
      // and invisible to the EA: nothing in the response depends on whether this happened.
      try {
        const invitee = await getUserByEmail(email);
        if (invitee && invitee.id !== eaUserId) {
          await insertNotification({
            userId: invitee.id,
            type: "ea_invitation",
            title: "An executive assistant invited you",
            message: "Someone would like to manage travel for you as your executive assistant. Review the invitation on your profile page.",
            relatedId: created.id,
            relatedType: "ea_invitation",
            data: { link: "/profile" },
          });
        }
      } catch (notifyErr) {
        console.warn("[EA] invitation notice failed (non-fatal):", notifyErr);
      }

      res.status(201).json(created);
    } catch (err) {
      console.error("[EA] addClient error:", err);
      res.status(500).json({ message: "Failed to add client" });
    }
  });

  // PATCH /api/ea/clients/:id — update payment info / notes

router.patch("/api/ea/clients/:id", isAuthenticated, async (req, res) => {
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

      const updated = await updateEaClientRelationship(id, sanitizeStringFields(updates));
      res.json(updated);
    } catch (err) {
      console.error("[EA] updateClient error:", err);
      res.status(500).json({ message: "Failed to update client" });
    }
  });

  // DELETE /api/ea/clients/:id — remove client relationship

router.delete("/api/ea/clients/:id", isAuthenticated, async (req, res) => {
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

router.post("/api/ea/clients/:id/push", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const { id } = req.params;
      const raw = z.object({
        title: z.string().min(1).max(255),
        message: z.string().min(1),
      }).parse(req.body);
      const title = sanitizeText(raw.title) as string;
      const message = sanitizeText(raw.message) as string;

      const row = await getEaClientRelationshipById(id, eaUserId);
      if (!row) return res.status(404).json({ message: "Client not found" });
      if (!row.clientUserId) return res.status(409).json({ message: "This client has not accepted your invitation yet" });

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


router.get("/api/ea/executives", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      res.json(await getEaExecutives(eaUserId));
    } catch (err) {
      console.error("[EA] getExecutives error:", err);
      res.status(500).json({ message: "Failed to fetch executives" });
    }
  });


router.post("/api/ea/executives", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const body = sanitizeStringFields(insertEaExecutiveSchema.parse({ ...req.body, eaUserId }));
      res.status(201).json(await createEaExecutive(body));
    } catch (err) {
      console.error("[EA] createExecutive error:", err);
      res.status(400).json({ message: "Failed to create executive" });
    }
  });


router.patch("/api/ea/executives/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const row = await getEaExecutiveById(req.params.id, eaUserId);
      if (!row) return res.status(404).json({ message: "Executive not found" });
      res.json(await updateEaExecutive(req.params.id, sanitizeStringFields(req.body)));
    } catch (err) {
      console.error("[EA] updateExecutive error:", err);
      res.status(500).json({ message: "Failed to update executive" });
    }
  });


router.delete("/api/ea/executives/:id", isAuthenticated, async (req, res) => {
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


router.get("/api/ea/events", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      res.json(await getEaEvents(eaUserId));
    } catch (err) {
      console.error("[EA] getEvents error:", err);
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });


router.post("/api/ea/events", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      // `date` is a real `timestamp` column (dataType "date"): drizzle-zod's
      // generated schema requires an actual Date instance, but JSON transport
      // only ever carries a string — coerce here rather than relaxing the
      // schema, so an invalid date is still rejected by z.date()'s NaN check.
      const rawDate = req.body?.date;
      const body = sanitizeStringFields(insertEaEventSchema.parse({
        ...req.body,
        eaUserId,
        date: rawDate ? new Date(rawDate) : undefined,
      }));
      res.status(201).json(await createEaEvent(body));
    } catch (err) {
      console.error("[EA] createEvent error:", err);
      res.status(400).json({ message: "Failed to create event" });
    }
  });


router.patch("/api/ea/events/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const row = await getEaEventById(req.params.id, eaUserId);
      if (!row) return res.status(404).json({ message: "Event not found" });
      res.json(await updateEaEvent(req.params.id, sanitizeStringFields(req.body)));
    } catch (err) {
      console.error("[EA] updateEvent error:", err);
      res.status(500).json({ message: "Failed to update event" });
    }
  });


router.delete("/api/ea/events/:id", isAuthenticated, async (req, res) => {
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


// §19 PATCH allowlists (Phase 3 batch 2). `.pick()` names what an EA may change; zod strips the rest.
const eaTravelPatchSchema = insertEaTravelArrangementSchema
  .pick({ executiveId: true, executiveName: true, title: true, destination: true, startDate: true, endDate: true, status: true, segments: true, notes: true })
  .partial();
const eaAiTaskPatchSchema = insertEaAiTaskSchema
  .pick({ type: true, executiveName: true, task: true, status: true, confidence: true, draft: true, options: true })
  .partial();

router.get("/api/ea/travel", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      res.json(await getEaTravelArrangements(eaUserId));
    } catch (err) {
      console.error("[EA] getTravel error:", err);
      res.status(500).json({ message: "Failed to fetch travel arrangements" });
    }
  });


router.post("/api/ea/travel", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const body = sanitizeStringFields(insertEaTravelArrangementSchema.parse({ ...req.body, eaUserId }));
      res.status(201).json(await createEaTravelArrangement(body));
    } catch (err) {
      console.error("[EA] createTravel error:", err);
      res.status(400).json({ message: "Failed to create travel arrangement" });
    }
  });


router.patch("/api/ea/travel/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const row = await getEaTravelArrangementById(req.params.id, eaUserId);
      if (!row) return res.status(404).json({ message: "Travel arrangement not found" });
      // §19 (Phase 3 batch 2): an ALLOWLIST. The raw body was spread into the update, so a PATCH
      // could move the row to another EA (`eaUserId`) or rewrite its timestamps. Unknown keys are
      // stripped; the owner stays the session's EA.
      const patch = eaTravelPatchSchema.parse(req.body ?? {});
      res.json(await updateEaTravelArrangement(req.params.id, sanitizeStringFields(patch)));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid update", errors: err.errors });
      console.error("[EA] updateTravel error:", err);
      res.status(500).json({ message: "Failed to update travel arrangement" });
    }
  });


router.delete("/api/ea/travel/:id", isAuthenticated, async (req, res) => {
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


router.get("/api/ea/gifts", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      res.json(await getEaGifts(eaUserId));
    } catch (err) {
      console.error("[EA] getGifts error:", err);
      res.status(500).json({ message: "Failed to fetch gifts" });
    }
  });


router.post("/api/ea/gifts", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const body = sanitizeStringFields(insertEaGiftSchema.parse({ ...req.body, eaUserId }));
      res.status(201).json(await createEaGift(body));
    } catch (err) {
      console.error("[EA] createGift error:", err);
      res.status(400).json({ message: "Failed to create gift" });
    }
  });


router.patch("/api/ea/gifts/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const row = await getEaGiftById(req.params.id, eaUserId);
      if (!row) return res.status(404).json({ message: "Gift not found" });
      res.json(await updateEaGift(req.params.id, sanitizeStringFields(req.body)));
    } catch (err) {
      console.error("[EA] updateGift error:", err);
      res.status(500).json({ message: "Failed to update gift" });
    }
  });


router.delete("/api/ea/gifts/:id", isAuthenticated, async (req, res) => {
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


router.get("/api/ea/venues", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      res.json(await getEaSavedVenues(eaUserId));
    } catch (err) {
      console.error("[EA] getVenues error:", err);
      res.status(500).json({ message: "Failed to fetch venues" });
    }
  });


router.post("/api/ea/venues", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const body = sanitizeStringFields(insertEaSavedVenueSchema.parse({ ...req.body, eaUserId }));
      res.status(201).json(await createEaSavedVenue(body));
    } catch (err) {
      console.error("[EA] createVenue error:", err);
      res.status(400).json({ message: "Failed to save venue" });
    }
  });


router.patch("/api/ea/venues/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const row = await getEaSavedVenueById(req.params.id, eaUserId);
      if (!row) return res.status(404).json({ message: "Venue not found" });
      res.json(await updateEaSavedVenue(req.params.id, sanitizeStringFields(req.body)));
    } catch (err) {
      console.error("[EA] updateVenue error:", err);
      res.status(500).json({ message: "Failed to update venue" });
    }
  });


router.delete("/api/ea/venues/:id", isAuthenticated, async (req, res) => {
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


router.get("/api/ea/communications", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      res.json(await getEaCommunications(eaUserId));
    } catch (err) {
      console.error("[EA] getCommunications error:", err);
      res.status(500).json({ message: "Failed to fetch communications" });
    }
  });


router.post("/api/ea/communications", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const body = sanitizeStringFields(insertEaCommunicationSchema.parse({ ...req.body, eaUserId }));
      res.status(201).json(await createEaCommunication(body));
    } catch (err) {
      console.error("[EA] createCommunication error:", err);
      res.status(400).json({ message: "Failed to log communication" });
    }
  });


router.delete("/api/ea/communications/:id", isAuthenticated, async (req, res) => {
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


router.get("/api/ea/ai-tasks", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const { status } = req.query;
      res.json(await getEaAiTasks(eaUserId, status as string | undefined));
    } catch (err) {
      console.error("[EA] getAiTasks error:", err);
      res.status(500).json({ message: "Failed to fetch AI tasks" });
    }
  });


router.post("/api/ea/ai-tasks", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const body = sanitizeStringFields(insertEaAiTaskSchema.parse({ ...req.body, eaUserId }));
      res.status(201).json(await createEaAiTask(body));
    } catch (err) {
      console.error("[EA] createAiTask error:", err);
      res.status(400).json({ message: "Failed to create AI task" });
    }
  });


router.patch("/api/ea/ai-tasks/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const row = await getEaAiTaskById(req.params.id, eaUserId);
      if (!row) return res.status(404).json({ message: "AI task not found" });
      // §19 (Phase 3 batch 2): an ALLOWLIST — the raw body was spread into the update, so
      // `eaUserId`, `approvedAt` and `rejectedAt` were client-settable. The two stamps are the
      // server's, from the status this request sets.
      const patch = eaAiTaskPatchSchema.parse(req.body ?? {});
      const updates: Record<string, any> = sanitizeStringFields({ ...patch });
      if (patch.status === "approved") updates.approvedAt = new Date();
      if (patch.status === "rejected") updates.rejectedAt = new Date();
      res.json(await updateEaAiTask(req.params.id, updates));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid update", errors: err.errors });
      console.error("[EA] updateAiTask error:", err);
      res.status(500).json({ message: "Failed to update AI task" });
    }
  });


router.delete("/api/ea/ai-tasks/:id", isAuthenticated, async (req, res) => {
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

router.get("/api/ea/preferences", isAuthenticated, async (req, res) => {
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


router.patch("/api/ea/preferences", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = getEaUserId(req);
      const parsed = eaPreferencesPatchSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid preferences", errors: parsed.error.flatten() });
      }

      const patch = parsed.data;
      // The ONE locked writer (`user-preferences-writer.ts`): the merge runs on the value read
      // under the row lock, so a concurrent save to another preferences key is never overwritten.
      const nextEa = await updateUserPreferences(eaUserId, (current) => {
        const currentEa = current.ea ?? {};
        const merged = {
          ...currentEa,
          ...(patch.contact ? { contact: { ...currentEa.contact, ...patch.contact } } : {}),
          ...(patch.notifications ? { notifications: { ...currentEa.notifications, ...patch.notifications } } : {}),
          ...(patch.ai ? { ai: { ...currentEa.ai, ...patch.ai } } : {}),
          ...(patch.display ? { display: { ...currentEa.display, ...patch.display } } : {}),
          ...(patch.calendar ? { calendar: { ...currentEa.calendar, ...patch.calendar } } : {}),
        };
        return { preferences: { ...current, ea: merged }, result: merged };
      });
      if (!nextEa) return res.status(404).json({ message: "User not found" });

      res.json(nextEa);
    } catch (err) {
      console.error("[EA] updatePreferences error:", err);
      res.status(500).json({ message: "Failed to update preferences" });
    }
  });

// ============================================================
// THE CLIENT'S SIDE OF AN EA LINK (board task #502, ledger `2026-09-23-phase1-security`)
// Deliberately NOT under /api/ea: the person being invited is not an EA. §14: the account and its
// email come from the SESSION, never from the body; each write is an atomic conditional in storage.
// ============================================================

async function sessionAccount(req: any): Promise<{ id: string; email: string } | null> {
  const userId = getUserId(req);
  if (!userId) return null;
  const [me] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return me?.email ? { id: me.id, email: me.email } : null;
}

router.get("/api/me/ea-invitations", isAuthenticated, async (req, res) => {
  try {
    const me = await sessionAccount(req);
    if (!me) return res.json({ pending: [], accepted: [] });
    const [pending, accepted] = await Promise.all([
      listPendingEaInvitationsForEmail(me.email),
      listAcceptedEaLinksForUser(me.id),
    ]);
    res.json({ pending, accepted });
  } catch (err) {
    console.error("[EA] list invitations error:", err);
    res.status(500).json({ message: "Failed to load invitations" });
  }
});

router.post("/api/me/ea-invitations/:id/accept", isAuthenticated, async (req, res) => {
  try {
    const me = await sessionAccount(req);
    if (!me || !(await acceptEaInvitation(req.params.id, me.id, me.email))) {
      return res.status(404).json({ message: "Invitation not found" });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[EA] accept invitation error:", err);
    res.status(500).json({ message: "Failed to accept invitation" });
  }
});

router.post("/api/me/ea-invitations/:id/decline", isAuthenticated, async (req, res) => {
  try {
    const me = await sessionAccount(req);
    if (!me || !(await declineEaInvitation(req.params.id, me.email))) {
      return res.status(404).json({ message: "Invitation not found" });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[EA] decline invitation error:", err);
    res.status(500).json({ message: "Failed to decline invitation" });
  }
});

router.delete("/api/me/ea-links/:id", isAuthenticated, async (req, res) => {
  try {
    const me = await sessionAccount(req);
    if (!me || !(await revokeEaLink(req.params.id, me.id))) {
      return res.status(404).json({ message: "Link not found" });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[EA] revoke link error:", err);
    res.status(500).json({ message: "Failed to remove assistant" });
  }
});

export default router;
