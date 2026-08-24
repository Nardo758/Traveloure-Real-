/**
 * Traveler profile — WP-A (docs/briefs/OPTIMIZER_SOURCING_BUILD_SPEC.md).
 *
 * GET/PATCH /api/me/traveler-profile — the traveler-facing surface for the explicit half of
 * `server/services/traveler-profile.service.ts`'s profile. Mirrors `/api/me/preferences`'s
 * (server/routes/storefront.routes.ts) allow-list + shallow-merge posture EXACTLY, scoped to the
 * `travelerProfile` namespace on the SAME `users.preferences` jsonb column (migration 150) —
 * NO new migration.
 *
 * §14: user identity comes from the session (`getUserId(req)`) only, never from the body.
 * §19: the PATCH body schema is built via `.pick()` off a base object (`travelerProfileBaseSchema`)
 * rather than `.omit()` — an allow-list, not a denylist — so a future field added to the base
 * schema is NOT exposed on this route until someone deliberately adds it to the `.pick()` call.
 * This schema is hand-written (not a `createInsertSchema(...)` call over a `shared/schema.ts`
 * table — there is no new table), so it sits outside `scripts/check-omit-schema-ratchet.cjs`'s
 * scan by construction (that guard's own stated NEGATIVE SPACE), and is instead the actual
 * ALLOWLIST shape ruling 46 asks every client-reachable body schema to converge on.
 */
import { Router } from "express";
import { z } from "zod";
import { getUserId } from "../utils/auth";
import { isAuthenticated } from "../replit_integrations/auth";
import {
  BUDGET_BAND_VALUES,
  DIETARY_VALUES,
  MOBILITY_VALUES,
  PACE_VALUES,
  TRANSPORT_PREFERENCE_VALUES,
  getTravelerProfile,
  updateExplicitTravelerProfile,
} from "../services/traveler-profile.service";

const router = Router();

// Base schema names every field the namespace could ever carry; the PATCH route below only ever
// `.pick()`s the subset it actually accepts. Present + valid value → set; present + null → clear;
// absent → leave untouched (the same three-state contract `/api/me/storefront`'s coverImageUrl
// uses in storefront.routes.ts).
const travelerProfileBaseSchema = z.object({
  transportPreference: z.enum(TRANSPORT_PREFERENCE_VALUES).nullable().optional(),
  pace: z.enum(PACE_VALUES).nullable().optional(),
  budgetBand: z.enum(BUDGET_BAND_VALUES).nullable().optional(),
  dietary: z.array(z.enum(DIETARY_VALUES)).max(DIETARY_VALUES.length).nullable().optional(),
  mobility: z.enum(MOBILITY_VALUES).nullable().optional(),
}).strict();

const travelerProfilePatchSchema = travelerProfileBaseSchema.pick({
  transportPreference: true,
  pace: true,
  budgetBand: true,
  dietary: true,
  mobility: true,
});

router.get("/api/me/traveler-profile", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const profile = await getTravelerProfile(userId);
    res.json(profile);
  } catch (err) {
    console.error("[traveler-profile] read error:", err);
    res.status(500).json({ message: "Failed to load traveler profile" });
  }
});

router.patch("/api/me/traveler-profile", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const parsed = travelerProfilePatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid traveler profile", errors: parsed.error.flatten() });
    }

    // The parsed shape already carries the exact tri-state contract
    // `updateExplicitTravelerProfile` expects (present+value / present+null / absent) — passed
    // straight through, never re-interpreted here.
    const updatedExplicit = await updateExplicitTravelerProfile(userId, parsed.data);

    // Return the freshly merged view (explicit + live-derived + effective) so the client never
    // has to make a second GET to see the effect of its own write.
    const profile = await getTravelerProfile(userId);
    res.json({ explicit: updatedExplicit, derived: profile.derived, effective: profile.effective });
  } catch (err) {
    console.error("[traveler-profile] write error:", err);
    res.status(500).json({ message: "Failed to save traveler profile" });
  }
});

export default router;
