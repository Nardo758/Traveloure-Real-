import type { RequestHandler } from "express";
import { getUserId } from "../utils/auth";
import { diagnoseLoadedResendKey } from "../services/resend-diagnostic";

/** Dependencies keep authorization testable without opening a database or sending mail. */
export function resendDiagnosticHandler(deps: {
  isAdmin: (userId: string) => Promise<boolean>;
  buildCommit: () => string | null;
  diagnose?: typeof diagnoseLoadedResendKey;
}): RequestHandler {
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const userId = getUserId(req);
    if (!userId) { res.status(401).json({ message: "Unauthorized" }); return; }
    try {
      if (!await deps.isAdmin(userId)) {
        res.status(403).json({ message: "Admin access required" });
        return;
      }
      const diagnostic = await (deps.diagnose ?? diagnoseLoadedResendKey)(deps.buildCommit());
      res.json(diagnostic);
    } catch {
      res.status(500).json({ message: "Could not run the email key diagnostic" });
    }
  };
}
