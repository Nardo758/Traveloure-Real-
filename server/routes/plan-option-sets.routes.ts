/**
 * PLAN OPTION SETS — the rails (Track A step A3; ledger `2026-09-29-a3-option-sets`).
 *
 *   GET    /api/trips/:tripId/option-sets                         the plan's comparisons, with options
 *   GET    /api/trips/:tripId/option-sets/search?q=               places to compare, from hotel_cache
 *   POST   /api/trips/:tripId/option-sets                         open a comparison (optionally on an item)
 *   POST   /api/trips/:tripId/option-sets/:setId/options          add a candidate (cap 3 — a 4th is 409)
 *   DELETE /api/trips/:tripId/option-sets/:setId/options/:optionId
 *   POST   /api/trips/:tripId/option-sets/:setId/choose           owner/delegate only (R129)
 *   POST   /api/trips/:tripId/option-sets/:setId/close            keep what the plan has
 *   POST   /api/trips/:tripId/anchor/promote                      M8 "Build my days around this"
 *
 * §14: the actor is the session; no body carries an identity, a price or a coordinate the server
 * could read from a source row. §19: every body is a `.strict()` object. LD 40: a set, option or
 * plan that does not exist or is not yours is ONE 404. The rules live in the service.
 */
import { Router } from "express";
import { z } from "zod";
import { and, eq, ilike, or } from "drizzle-orm";

import { db } from "../db";
import { hotelCache, trips } from "@shared/schema";
import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId } from "../utils/auth";
import {
  OptionSetError,
  addOption,
  chooseOption,
  closeOptionSet,
  createOptionSet,
  listOptionSets,
  planRole,
  promoteAnchor,
  removeOption,
} from "../services/plan-option-sets.service";

const router = Router();

const createBody = z
  .object({
    itineraryItemId: z.string().min(1).max(64).nullable().optional(),
    dayNumber: z.number().int().min(1).max(366).nullable().optional(),
    userExperienceId: z.string().min(1).max(64).nullable().optional(),
    categoryKey: z.string().min(1).max(64).nullable().optional(),
    label: z.string().trim().min(1).max(120).nullable().optional(),
    anchor: z.boolean().optional(),
  })
  .strict();

const addBody = z
  .object({
    source: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("hotel_cache"), hotelCacheId: z.string().min(1).max(64), engine: z.boolean().optional() }).strict(),
      z.object({ kind: z.literal("listing"), providerServiceId: z.string().min(1).max(64) }).strict(),
      z
        .object({
          kind: z.literal("custom"),
          title: z.string().trim().min(1).max(255),
          locationName: z.string().trim().max(255).nullable().optional(),
          lat: z.number().min(-90).max(90).nullable().optional(),
          lng: z.number().min(-180).max(180).nullable().optional(),
        })
        .strict(),
    ]),
    sourceImpressionId: z.string().min(1).max(64).nullable().optional(),
  })
  .strict();

const emptyBody = z.object({}).strict();
const promoteBody = z.object({ itemId: z.string().min(1).max(64) }).strict();

function fail(res: any, err: unknown, what: string) {
  if (err instanceof OptionSetError) {
    return res.status(err.status).json({ code: err.code, message: err.message, ...(err.detail ?? {}) });
  }
  console.error(`[option-sets] ${what} failed:`, err);
  return res.status(500).json({ message: "Something went wrong with this comparison" });
}

function badBody(res: any) {
  return res.status(400).json({ code: "invalid_body", message: "That request isn't one this comparison accepts" });
}

router.get("/api/trips/:tripId/option-sets", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    if (!(await planRole(req.params.tripId, userId, "read"))) return res.status(404).json({ code: "not_found", message: "No such plan" });
    res.json({ sets: await listOptionSets(req.params.tripId) });
  } catch (err) {
    fail(res, err, "list");
  }
});

/**
 * Places to compare, read from `hotel_cache` for the plan's own city (the first segment of
 * `trips.destination`). A row without coordinates is returned with `located: false` so the slip can
 * say so — it is never placed on a map (§13).
 */
router.get("/api/trips/:tripId/option-sets/search", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const { tripId } = req.params;
    if (!(await planRole(tripId, userId, "write"))) return res.status(404).json({ code: "not_found", message: "No such plan" });
    const [trip] = await db.select({ destination: trips.destination }).from(trips).where(eq(trips.id, tripId)).limit(1);
    const city = (trip?.destination ?? "").split(",")[0].trim();
    if (!city) return res.json({ city: null, results: [] });
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80) : "";
    const cityMatch = or(ilike(hotelCache.city, city), ilike(hotelCache.cityCode, city));
    const rows = await db
      .select({
        id: hotelCache.id,
        name: hotelCache.name,
        address: hotelCache.address,
        city: hotelCache.city,
        latitude: hotelCache.latitude,
        longitude: hotelCache.longitude,
        starRating: hotelCache.starRating,
      })
      .from(hotelCache)
      .where(q ? and(cityMatch, ilike(hotelCache.name, `%${q.replace(/[%_\\]/g, (c: string) => `\\${c}`)}%`)) : cityMatch)
      .orderBy(hotelCache.name)
      .limit(20);
    res.json({
      city,
      results: rows.map((r) => ({ ...r, located: r.latitude != null && r.longitude != null })),
    });
  } catch (err) {
    fail(res, err, "search");
  }
});

router.post("/api/trips/:tripId/option-sets", isAuthenticated, async (req: any, res) => {
  const parsed = createBody.safeParse(req.body ?? {});
  if (!parsed.success) return badBody(res);
  try {
    const set = await createOptionSet({ tripId: req.params.tripId, userId: getUserId(req)!, ...parsed.data });
    res.status(201).json({ set });
  } catch (err) {
    fail(res, err, "create");
  }
});

router.post("/api/trips/:tripId/option-sets/:setId/options", isAuthenticated, async (req: any, res) => {
  const parsed = addBody.safeParse(req.body ?? {});
  if (!parsed.success) return badBody(res);
  try {
    const option = await addOption({
      tripId: req.params.tripId,
      setId: req.params.setId,
      userId: getUserId(req)!,
      source: parsed.data.source,
      sourceImpressionId: parsed.data.sourceImpressionId ?? null,
    });
    res.status(201).json({ option });
  } catch (err) {
    fail(res, err, "add");
  }
});

router.delete("/api/trips/:tripId/option-sets/:setId/options/:optionId", isAuthenticated, async (req: any, res) => {
  try {
    await removeOption({ tripId: req.params.tripId, setId: req.params.setId, optionId: req.params.optionId, userId: getUserId(req)! });
    res.json({ removed: true });
  } catch (err) {
    fail(res, err, "remove");
  }
});

router.post("/api/trips/:tripId/option-sets/:setId/choose", isAuthenticated, async (req: any, res) => {
  const parsed = z.object({ optionId: z.string().min(1).max(64) }).strict().safeParse(req.body ?? {});
  if (!parsed.success) return badBody(res);
  try {
    const out = await chooseOption({ tripId: req.params.tripId, setId: req.params.setId, optionId: parsed.data.optionId, userId: getUserId(req)! });
    res.json(out);
  } catch (err) {
    fail(res, err, "choose");
  }
});

router.post("/api/trips/:tripId/option-sets/:setId/close", isAuthenticated, async (req: any, res) => {
  if (!emptyBody.safeParse(req.body ?? {}).success) return badBody(res);
  try {
    const set = await closeOptionSet({ tripId: req.params.tripId, setId: req.params.setId, userId: getUserId(req)! });
    res.json({ set });
  } catch (err) {
    fail(res, err, "close");
  }
});

router.post("/api/trips/:tripId/anchor/promote", isAuthenticated, async (req: any, res) => {
  const parsed = promoteBody.safeParse(req.body ?? {});
  if (!parsed.success) return badBody(res);
  try {
    const out = await promoteAnchor({ tripId: req.params.tripId, itemId: parsed.data.itemId, userId: getUserId(req)! });
    res.json(out);
  } catch (err) {
    fail(res, err, "promote");
  }
});

export default router;
