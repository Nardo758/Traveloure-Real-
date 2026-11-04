// LW-1b (ledger `2026-10-15-lw1b-traveler-signup-switch`): the public read of the traveler sign-up switch, so the
// sign-up surfaces can label themselves before anyone submits. Unauthenticated; carries two settings and nothing
// else. The mode is read fail-closed (missing/unreadable ⇒ waitlist). Never cached long: an admin flip shows within
// the flag cache's TTL.
import { Router } from "express";
import { getTravelerSignupMode, getLaunchMarketSlug } from "../services/platform-flags";
import { expertsLiveIn } from "../services/experts-live.service";

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

export default router;
