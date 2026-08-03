import { Router } from "express";
import { z } from "zod";
import { sql } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { isAuthenticated } from "../replit_integrations/auth";
import { verifyTripOwnership } from "../utils/trip-ownership";
import { storage } from "../storage";
import { chatStorage } from "../replit_integrations/chat/storage";
import { eventTypeEnum } from "@shared/schema";
import { aiRateLimit } from "../middleware/rateLimiter";
import { trackAICost, calculateAnthropicCost } from "../services/ai-cost-tracker";

/**
 * TripContext server persistence (migration 130, Trip-Strip program P2/E2; re-keyed by
 * migration 161, Trip-Canon Lane 6).
 *
 * The client-side trip context (sessionStorage, formalized by the P1 module) dies
 * with the browser session and never crosses devices. For signed-in users the
 * context is mirrored here so planning survives restarts.
 *
 * Self-scoped: the user id comes from the session ONLY (§14 — never from the body).
 * PUT is a zod allow-list of the TripContext fields with length caps — never raw
 * req.body into the jsonb column. No money path (a draft-planning blob; every
 * charge derives server-side from its own record per §14 regardless of context).
 *
 * Lane 6 (re-key): both routes now accept an optional `?tripId=` query param so context
 * can follow a SPECIFIC trip once the Trip is the canonical planning container, instead of
 * being smeared across every trip a user has open. `tripId` present → ownership-checked
 * (§14: the trip must exist AND belong to the session user — 404 if it doesn't exist, 403
 * if it isn't theirs) and reads/writes the trip-scoped row. `tripId` absent → the exact
 * pre-Lane-6 behavior: the legacy per-user row (back-compat, no client change required).
 */
const router = Router();

function sessionUserId(req: any): string | undefined {
  return (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
}

const tripIdParamSchema = z.string().min(1).max(64);

/**
 * Resolves and authorizes the optional `?tripId=` query param.
 * Returns `{ tripId: undefined }` when absent (legacy per-user row).
 * Returns `{ tripId: string }` when present and owned by `userId`.
 * Returns `{ error: { status, message } }` on a malformed param, a trip that doesn't
 * exist (404), or one that exists but isn't owned by this user (403).
 */
async function resolveTripIdParam(
  req: any,
  userId: string,
): Promise<{ tripId?: string; error?: { status: number; message: string } }> {
  const raw = req.query?.tripId;
  if (raw === undefined) return {};
  const parsed = tripIdParamSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: { status: 400, message: "Invalid tripId" } };
  }
  const tripId = parsed.data;
  const owned = await verifyTripOwnership(tripId, userId);
  if (!owned) {
    // Distinguish "trip doesn't exist" (404) from "exists but isn't yours" (403).
    const trip = await storage.getTrip(tripId);
    if (!trip) return { error: { status: 404, message: "Trip not found" } };
    return { error: { status: 403, message: "Not authorized to access this trip" } };
  }
  return { tripId };
}

const str = (max: number) => z.string().max(max);

// Mirrors client/src/lib/trip-context.ts TripContext. Unknown keys are stripped.
const tripContextSchema = z
  .object({
    experienceSlug: str(120).optional(),
    experienceType: str(120).optional(),
    title: str(255).optional(),
    destination: str(255).optional(),
    city: str(120).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    travelers: z.number().int().min(1).max(500).optional(),
    eventType: str(120).optional(),
    tripId: str(64).optional(),
    userExperienceId: str(64).optional(),
    id: str(64).optional(),
    intent: str(2000).optional(),
    contextFields: z.record(z.unknown()).optional(),
    selectedServices: z
      .array(
        z.object({
          name: str(255).optional(),
          provider: str(255).optional(),
          price: z.number().optional(),
          category: str(120).optional(),
        }),
      )
      .max(100)
      .optional(),
  })
  .strip();

router.get("/api/trip-context", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const resolved = await resolveTripIdParam(req, userId);
    if (resolved.error) return res.status(resolved.error.status).json({ message: resolved.error.message });
    const { tripId } = resolved;
    const rows = tripId
      ? await db.execute(
          sql`SELECT context, updated_at FROM trip_contexts WHERE user_id = ${userId} AND trip_id = ${tripId} LIMIT 1`,
        )
      : await db.execute(
          sql`SELECT context, updated_at FROM trip_contexts WHERE user_id = ${userId} AND trip_id IS NULL LIMIT 1`,
        );
    const row: any = (rows as any).rows?.[0];
    res.json({ context: row?.context ?? {}, updatedAt: row?.updated_at ?? null });
  } catch (err) {
    console.error("[TripContext] GET failed:", err);
    res.status(500).json({ message: "Failed to load trip context" });
  }
});

router.put("/api/trip-context", isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const resolved = await resolveTripIdParam(req, userId);
    if (resolved.error) return res.status(resolved.error.status).json({ message: resolved.error.message });
    const { tripId } = resolved;
    const parsed = tripContextSchema.safeParse(req.body?.context ?? req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid trip context", issues: parsed.error.issues.slice(0, 5) });
    }
    const json = JSON.stringify(parsed.data);
    if (json.length > 32_768) {
      return res.status(413).json({ message: "Trip context too large" });
    }
    // Two branches, not one dynamic ON CONFLICT target: Postgres requires the conflict
    // target to exactly match an existing (partial) unique index, including its predicate
    // (migration 161 — trip_contexts_user_legacy_uidx WHERE trip_id IS NULL vs
    // trip_contexts_user_trip_uidx WHERE trip_id IS NOT NULL).
    if (tripId) {
      await db.execute(sql`
        INSERT INTO trip_contexts (user_id, trip_id, context, updated_at)
        VALUES (${userId}, ${tripId}, ${json}::jsonb, NOW())
        ON CONFLICT (user_id, trip_id) WHERE trip_id IS NOT NULL
        DO UPDATE SET context = ${json}::jsonb, updated_at = NOW()
      `);
    } else {
      await db.execute(sql`
        INSERT INTO trip_contexts (user_id, trip_id, context, updated_at)
        VALUES (${userId}, NULL, ${json}::jsonb, NOW())
        ON CONFLICT (user_id) WHERE trip_id IS NULL
        DO UPDATE SET context = ${json}::jsonb, updated_at = NOW()
      `);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[TripContext] PUT failed:", err);
    res.status(500).json({ message: "Failed to save trip context" });
  }
});

// ── AI-planner draft extraction (Console Realign R-D, Lane E6) ────────────────────────────────
//
// The AI-planner chat (/ai-assistant, server/replit_integrations/chat/routes.ts) is freeform —
// it never writes TripContext and the conversation service has no structured-field extraction
// anywhere in the codebase (ground-truthed: no other AI endpoint parses chat text into trip
// fields). So this is a NEW, minimal, best-effort extraction pass over an existing conversation
// the caller already owns, not a duplicate of something that already exists.
//
// §13 (honest-or-absent): the prompt is strictly conservative — extract ONLY facts the user
// explicitly stated; every field defaults to null; the model is told not to guess/infer/default.
// §14: the conversation is re-fetched server-side via chatStorage.getConversation(id, userId)
// (session user, never trusted from the body) — the client cannot ask this endpoint to read
// someone else's conversation. No API key configured → returns `{}` immediately (no call, no
// error) so the draft panel just stays empty; the chat itself is never blocked by this endpoint.
const extractBodySchema = z.object({
  conversationId: z.coerce.number().int().positive(),
});

const extractedFieldsSchema = z.object({
  destination: z.string().trim().min(1).max(255).nullable(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  travelers: z.number().int().min(1).max(500).nullable(),
  eventType: z.enum(eventTypeEnum).nullable(),
});
export type ExtractedTripFields = z.infer<typeof extractedFieldsSchema>;

const EXTRACTION_SYSTEM_PROMPT = `You extract trip-planning facts from a travel-planning chat transcript. You are strictly conservative.

Rules:
- Extract a field ONLY if the traveler (the "user" role) explicitly stated it in their own words.
- NEVER guess, infer, assume, or fill in a typical/default value. An assistant suggestion the user has not agreed to is NOT established.
- If a field was not clearly and explicitly stated by the user, its value MUST be null.
- "eventType" must be null unless one of these exact values clearly applies: ${eventTypeEnum.join(", ")}.
- "startDate"/"endDate" must be null unless the user gave (or clearly confirmed) an actual calendar date; convert to YYYY-MM-DD. Do not compute a date from a vague phrase like "next month" or "in the summer".
- "travelers" must be null unless the user stated a specific headcount.

Respond with ONLY a JSON object, no other text, in this exact shape:
{"destination": string|null, "startDate": string|null, "endDate": string|null, "travelers": number|null, "eventType": string|null}`;

function parseExtractionJson(raw: string): ExtractedTripFields | null {
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    const validated = extractedFieldsSchema.safeParse(parsed);
    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
}

router.post("/api/trip-context/extract", aiRateLimit, isAuthenticated, async (req, res) => {
  try {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const parsedBody = extractBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({ message: "Invalid request" });
    }
    const { conversationId } = parsedBody.data;

    // §13/§14: never fabricate, never trust a client-supplied transcript — no key means an
    // honest empty result, and the conversation is re-read from the owner's own record.
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.json({ fields: {} });
    }

    const conversation = await chatStorage.getConversation(conversationId, userId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }
    const messages = await chatStorage.getMessagesByConversation(conversationId);
    if (messages.length === 0) {
      return res.json({ fields: {} });
    }

    const transcript = messages
      .map((m) => `${m.role === "user" ? "Traveler" : "Assistant"}: ${m.content}`)
      .join("\n\n")
      .slice(0, 12_000); // best-effort cap; extraction degrades gracefully on very long chats

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 300,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Transcript:\n\n${transcript}` }],
    });

    // Track cost — ai_cost_tracking is documented load-bearing for the admin cost breakdown
    // (CLAUDE.md publish-push trap note); same signature/fields as the chat route's tracker call.
    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    if (inputTokens > 0 || outputTokens > 0) {
      trackAICost({
        sourceType: "trip_context_extract",
        modelUsed: "claude-sonnet-4-5",
        userId,
        costUsd: calculateAnthropicCost(inputTokens, outputTokens),
        tokensIn: inputTokens,
        tokensOut: outputTokens,
      }).catch((err) => console.error("[cost-tracker] trip_context_extract:", err));
    }

    const textBlock = response.content.find((b) => b.type === "text");
    const raw = textBlock && "text" in textBlock ? textBlock.text : "";
    const extracted = raw ? parseExtractionJson(raw) : null;
    if (!extracted) {
      // Unparseable output is a best-effort miss, not an error — honest empty result (§13).
      return res.json({ fields: {} });
    }

    // Strip nulls so the response only carries fields that were actually established.
    const fields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(extracted)) {
      if (value !== null) fields[key] = value;
    }
    res.json({ fields });
  } catch (err) {
    console.error("[TripContext] extract failed:", err);
    // Best-effort: a scoring/extraction failure must never block the chat (§13 pattern).
    res.json({ fields: {} });
  }
});

export default router;
