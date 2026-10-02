import { eq } from "drizzle-orm";
import { db } from "../../db";
import { users } from "../../../shared/models/auth";
import { requestReset, requestVerification, queueWelcome } from "./_core-store";
import { runCoreJourney } from "./_core-worker";

/** Existing exported auth senders stay callable, but cannot bypass journey gates. */
export async function queueLegacyAuthEmail(kind: "welcome" | "verify_email" | "reset_request", email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (!user) throw new Error("Cannot send account email without its account");
  if (kind === "welcome") await db.transaction((tx) => queueWelcome(tx, user.id));
  else if (kind === "verify_email") await requestVerification(user.id, `legacy:${Math.floor(Date.now() / 60000)}`);
  else await requestReset(user.id, `legacy:${Math.floor(Date.now() / 60000)}`);
  await runCoreJourney({ userId: user.id });
}