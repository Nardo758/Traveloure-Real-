// LW-1b (ledger `2026-10-15-lw1b-traveler-signup-switch`): the public read of the traveler sign-up switch, so the
// sign-up surfaces can label themselves before anyone submits. Unauthenticated; carries two settings and nothing
// else. The mode is read fail-closed (missing/unreadable ⇒ waitlist). Never cached long: an admin flip shows within
// the flag cache's TTL.
import { Router } from "express";
import { getTravelerSignupMode, getLaunchMarketSlug } from "../services/platform-flags";
import { expertsLiveIn } from "../services/experts-live.service";
import { expertAvailabilityForMarket } from "../services/expert-hook.service";
import { resolveMarketSlug } from "../services/trend-engine/operating-markets";
import { r3SurfaceFromEnv } from "@shared/r3-surface-flag";

const router = Router();

router.get("/api/public/signup-mode", async (_req, res) => {
  const [mode, launchMarketSlug] = await Promise.all([getTravelerSignupMode(), getLaunchMarketSlug()]);
  // COPY-1 §4k: whether the launch market has an approved, non-test expert — the local-expert lines read it.
  const expertsLive = await expertsLiveIn(launchMarketSlug);
  res.set("Cache-Control", "no-store");
  // These keys (decision-maker, Oct 16, 2026; `expertsLive` added by COPY-1, Nov 3): the mode, the launch market the
  // client builds the waitlist path from, and a boolean. No derived path is published beside them.
  res.json({ mode, launchMarketSlug, expertsLive });
});

/**
 * R3 planning surface switch (Leon, Nov 22 2026), RUNTIME: the server reads its own env (`R3_SURFACE=1`, default off) and
 * tells the client, so staging can turn the surface on without rebuilding a bundle. Public and read-only - it exposes
 * one boolean and no configuration value.
 *
 * S5 (ledger `2026-11-27-s5-r3-surface-flag`): the rule is `r3SurfaceFromEnv` (`shared/r3-surface-flag.ts`), the ONE
 * spelling of "only the exact string 1 is on" - an unset, blank or near-miss value is off. The query string is never read
 * here, so `?surface=r3` alone changes nothing (Leon, Nov 23 2026; the client's own half is
 * `client/src/lib/r3-surface.ts:16-20`).
 */
router.get("/api/public/r3-surface", (_req, res) => {
  res.json({ on: r3SurfaceFromEnv() });
});


/**
 * CAP-2 Phase 3 (dispatch ruling 5; ledger `2026-11-06-cap2-phase3-plan-actions`): the public guest-capabilities read
 * PlanActions renders a browse tile from. Unauthenticated, waitlist-aware, and carries NO price, fee or amount.
 *   save — always true (a placeable save is the card's own answer).
 *   book — open mode only (the same fail-closed switch `/api/public/signup-mode` reads).
 *   hire — open mode AND an approved expert in the named area (`expertAvailabilityForMarket`, the one answer every
 *          expert call-to-action reads). No city, or a city that is no market, ⇒ false: Hire needs an area.
 */
export async function guestCapabilitiesFor(city: string | null | undefined): Promise<{
  mode: "open" | "waitlist";
  actions: { save: true; book: boolean; hire: boolean };
}> {
  const mode = (await getTravelerSignupMode()) === "open" ? "open" : "waitlist";
  const book = mode === "open";
  let hire = false;
  if (book && city) {
    const key = resolveMarketSlug(city);
    if (key) {
      try {
        hire = (await expertAvailabilityForMarket(key)).canAsk;
      } catch {
        hire = false;
      }
    }
  }
  return { mode, actions: { save: true, book, hire } };
}

router.get("/api/public/guest-capabilities", async (req, res) => {
  const city = typeof req.query.city === "string" ? req.query.city.trim().slice(0, 120) : "";
  res.set("Cache-Control", "no-store");
  res.json(await guestCapabilitiesFor(city || null));
});

export default router;
