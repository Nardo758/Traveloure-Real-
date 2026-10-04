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
 *   POST   /api/trips/:tripId/option-sets/:setId/reopen           §M9 "compare again" (owner/delegate)
 *   POST   /api/trips/:tripId/option-sets/suggest                 §M9 "Suggest places that fit these days"
 *   POST   /api/trips/:tripId/anchor/promote                      M8 "Build my days around this"
 *   POST   /api/trips/:tripId/slip-events                         A4 — E4 `slip_plan_fit_shown` (202)
 *   GET    /api/trips/:tripId/where-to-stay                       smoke 4 item 5 — the post-draft panel
 *   POST   /api/trips/:tripId/where-to-stay                       bind: stay here / own / skip
 *
 * §14: the actor is the session; no body carries an identity, a price or a coordinate the server
 * could read from a source row. §19: every body is a `.strict()` object. LD 40: a set, option or
 * plan that does not exist or is not yours is ONE 404. The rules live in the service.
 */
import { Router } from "express";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { HELP_LEVELS } from "@shared/expert-door";
import { ExpertDoorError, recordExpertDoorEvent } from "../services/expert-door.service";
import { getUserId } from "../utils/auth";
import {
  OptionSetError,
  addOption,
  chooseOption,
  closeOptionSet,
  createOptionSet,
  hotelCacheForPlanCity,
  listOptionSetsWithFit,
  planRole,
  promoteAnchor,
  recordPlanFitShown,
  removeOption,
  reopenOptionSet,
  suggestLodging,
} from "../services/plan-option-sets.service";
import { bindWhereToStay, loadWhereToStay } from "../services/where-to-stay.service";

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

/**
 * A4 — the ONE client event rail (slip-funnel-events §5). A `.strict()` discriminated union of the
 * events a view may report: `slip_plan_fit_shown` (A4) and the expert door's three (below). No value is taken from the client:
 * the fit is recomputed server-side (§E4).
 */
const slipEventBody = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("slip_plan_fit_shown"),
      setId: z.string().min(1).max(64),
      optionId: z.string().min(1).max(64),
      surface: z.enum(["compare_view", "anchor_question"]),
      viewport: z.enum(["narrow", "wide"]),
      viewId: z.string().min(1).max(64),
    })
    .strict(),
  // The expert door (ledger `2026-09-29-expert-door`): the level chosen, the picker shown (its count
  // RECOMPUTED server-side) and the interest recorded when no expert offers the level. The market is
  // the plan's own; the client names only the level.
  ...(["expert_help_level_chosen", "expert_picker_shown"] as const).map((t) =>
    z.object({ type: z.literal(t), level: z.enum(HELP_LEVELS) }).strict(),
  ),
  // R-r (surface step 1): the item-level "Ask a local about this" names the item and may carry the
  // question. Both optional, so the door's own interest row is unchanged.
  z
    .object({
      type: z.literal("expert_interest"),
      level: z.enum(HELP_LEVELS),
      itemId: z.string().min(1).max(64).optional(),
      question: z.string().trim().min(1).max(500).optional(),
    })
    .strict(),
] as any);

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
    // A4: the viewer's standing, SERVER-derived, so the compare view draws only the controls the
    // rails would accept (a render rule grants nothing; each rail still refuses on its own).
    const [canWrite, canChoose] = await Promise.all([
      planRole(req.params.tripId, userId, "write").then(Boolean),
      planRole(req.params.tripId, userId, "choose").then(Boolean),
    ]);
    res.json({ sets: await listOptionSetsWithFit(req.params.tripId), viewer: { canWrite, canChoose } });
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
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80) : "";
    const { city, rows } = await hotelCacheForPlanCity(tripId, { q, limit: 20 });
    res.json({
      city,
      results: rows.map((r) => ({
        id: r.id,
        name: r.name,
        address: r.address,
        city: r.city,
        starRating: r.starRating,
        located: r.latitude != null && r.longitude != null,
      })),
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

router.post("/api/trips/:tripId/option-sets/:setId/reopen", isAuthenticated, async (req: any, res) => {
  if (!emptyBody.safeParse(req.body ?? {}).success) return badBody(res);
  try {
    const set = await reopenOptionSet({ tripId: req.params.tripId, setId: req.params.setId, userId: getUserId(req)! });
    res.json({ set });
  } catch (err) {
    fail(res, err, "reopen");
  }
});

router.post("/api/trips/:tripId/option-sets/suggest", isAuthenticated, async (req: any, res) => {
  if (!emptyBody.safeParse(req.body ?? {}).success) return badBody(res);
  try {
    const set = await suggestLodging({ tripId: req.params.tripId, userId: getUserId(req)! });
    res.status(201).json({ set });
  } catch (err) {
    fail(res, err, "suggest");
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

router.post("/api/trips/:tripId/slip-events", isAuthenticated, async (req: any, res) => {
  const parsed = slipEventBody.safeParse(req.body ?? {});
  if (!parsed.success) return badBody(res);
  try {
    const body = parsed.data as any;
    if (body.type === "slip_plan_fit_shown") {
      const { type: _type, ...event } = body;
      await recordPlanFitShown({ tripId: req.params.tripId, userId: getUserId(req)!, ...event });
    } else {
      await recordExpertDoorEvent({
        tripId: req.params.tripId,
        userId: getUserId(req)!,
        type: body.type,
        level: body.level,
        itemId: body.itemId,
        question: body.question,
      });
    }
    res.status(202).json({ accepted: true });
  } catch (err) {
    if (err instanceof OptionSetError) return fail(res, err, "slip-event");
    if (err instanceof ExpertDoorError) return res.status(err.status).json({ code: err.code, message: err.message });
    // A view that fails to record never fails the view (§15b): logged, answered 202.
    console.error("[option-sets] slip-event write failed:", err);
    res.status(202).json({ accepted: true });
  }
});

/**
 * WHERE TO STAY (smoke test 4, item 5 — ledger `2026-10-02-smoke4-draft-fixes`). The read is the
 * plan's own (read role); not yours and no such plan are ONE 404 (LD 40). The bind is owner/delegate
 * (R129's choose role) and goes through the option-set rail above; its body is a `.strict()`
 * discriminated union naming a row of OUR inventory or the traveler's own words — never a coordinate
 * or a price (§14, §19).
 */
const stayBody = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("stay_here"),
      hotel: z.object({ kind: z.enum(["platform", "hotel_cache", "affiliate"]), id: z.string().min(1).max(64) }).strict(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("own"),
      hotelName: z.string().trim().max(255).nullable().optional(),
      neighborhoodSlug: z.string().trim().min(1).max(100).nullable().optional(),
    })
    .strict(),
  z.object({ kind: z.literal("skip") }).strict(),
  // Smoke 9 S9-2 amendment: a hand-added lodging item becomes the plan's stay (its ⋯ menu).
  z.object({ kind: z.literal("this_item"), itemId: z.string().trim().min(1).max(64) }).strict(),
]);

router.get("/api/trips/:tripId/where-to-stay", isAuthenticated, async (req: any, res) => {
  try {
    const view = await loadWhereToStay(req.params.tripId, getUserId(req));
    if (view.reason === "not_found") return res.status(404).json({ code: "not_found", message: "No such plan" });
    res.json(view);
  } catch (err) {
    fail(res, err, "where-to-stay");
  }
});

router.post("/api/trips/:tripId/where-to-stay", isAuthenticated, async (req: any, res) => {
  const parsed = stayBody.safeParse(req.body ?? {});
  if (!parsed.success) return badBody(res);
  try {
    const out = await bindWhereToStay(req.params.tripId, getUserId(req)!, parsed.data);
    res.status(201).json(out);
  } catch (err) {
    fail(res, err, "where-to-stay bind");
  }
});

export default router;
