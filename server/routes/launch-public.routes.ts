// LW-1b (ledger `2026-10-15-lw1b-traveler-signup-switch`): the public read of the traveler sign-up switch, so the
// sign-up surfaces can label themselves before anyone submits. Unauthenticated; carries two settings and nothing
// else. The mode is read fail-closed (missing/unreadable ⇒ waitlist). Never cached long: an admin flip shows within
// the flag cache's TTL.
import { Router } from "express";
import { getTravelerSignupMode, getLaunchMarketSlug } from "../services/platform-flags";

const router = Router();

router.get("/api/public/signup-mode", async (_req, res) => {
  const [mode, launchMarketSlug] = await Promise.all([getTravelerSignupMode(), getLaunchMarketSlug()]);
  res.set("Cache-Control", "no-store");
  // Exactly these two keys (decision-maker, Oct 16, 2026): the mode, and the launch market the client builds the
  // waitlist path from. No derived path is published beside them.
  res.json({ mode, launchMarketSlug });
});

export default router;
