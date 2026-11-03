/**
 * GET /api/traveler-doors (ledger `2026-10-18-traveler-doors-hidden`; moved here from the retired
 * `concierge.routes.ts` by CN-1g, ledger `2026-11-02-cn1g-retire-legacy-concierge-server`).
 *
 * Which switched traveler doors are open. Public, read-only, one boolean; a missing row or a read
 * error answers false (the door stays hidden). The old done-for-you concierge door is retired
 * (CN-1g / CN-1g-UI): its key is no longer in the response.
 */
import { Router } from "express";
import { getPlatformFlag } from "../services/platform-flags";
import { HANDOFF_BOOKING_SETTING } from "@shared/traveler-doors";

const router = Router();

router.get("/api/traveler-doors", async (_req, res) => {
  const handoffBooking = await getPlatformFlag(HANDOFF_BOOKING_SETTING, false);
  res.json({ handoffBooking });
});

export default router;
