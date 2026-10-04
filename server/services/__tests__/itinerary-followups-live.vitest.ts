import { randomUUID, randomBytes, scryptSync } from "node:crypto";
import { writeFile, readFile } from "node:fs/promises";
import { afterAll, expect, test, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { Resend } from "resend";
import { db, pool } from "../../db";
import {
  users, emailOutbox, itineraryComparisons, itineraryVariants, itineraryVariantItems,
  providerServices, localExpertForms,
} from "@shared/schema";
import { persistGenerationOutcome } from "../itinerary-generation-outcome.service";
import { deliverQueuedEmail } from "../email-outbox.service";
import { ITINERARY_FOLLOWUPS, type ItineraryFollowupKind } from "../itinerary-followup-email";

// Only the URL resolver is overridden: transport, registry, outbox claims and provider are real.
vi.mock("../email.service", async (original) => ({
  ...await original<typeof import("../email.service")>(),
  getAppBaseUrl: () => `https://${process.env.REPLIT_DEV_DOMAIN}`,
}));
if (process.env.RUN_ITINERARY_FOLLOWUP_LIVE_TESTS !== "1" || process.env.NODE_ENV === "production") {
  throw new Error("Live verification requires explicit development-only authorization");
}
const inbox = process.env.ITINERARY_OUTCOME_TEST_EMAIL ?? "";
if (!/^[^\s@<>\[\]]+@[^\s@<>\[\]]+\.[^\s@<>\[\]]+$/.test(inbox) || !process.env.REPLIT_DEV_DOMAIN) {
  throw new Error("Valid approved development inbox and running preview required");
}
afterAll(async () => { await pool.end(); });
const manifestPath = "/tmp/itinerary-part2-live-manifest.json";
const evidencePath = "/tmp/itinerary-part2-live-evidence.json";
type Fixture = { userId: string; providerId: string; expertId: string; itineraryId: string };
type Evidence = {
  loop: number; kind: ItineraryFollowupKind; itineraryId: string; outboxId: number;
  providerId: string; providerEvent: string; checkedAt: string; authenticatedLink: boolean;
  expertBranch: string | null; urgency: boolean; idempotentRepeat: boolean;
};
const evidence: Evidence[] = [];
async function saveEvidence() {
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2), { mode: 0o600 });
}
async function cleanup(f: Fixture) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM email_outbox WHERE metadata->>'travelerId' = ${f.userId}
      OR metadata->>'comparisonId' = ${f.itineraryId}`);
    await tx.delete(users).where(sql`${users.id} IN (${f.userId}, ${f.providerId}, ${f.expertId})`);
  });
}

test("cleanup only explicitly recorded live verification fixtures", async () => {
  if (process.env.CLEANUP_ITINERARY_FOLLOWUP_LIVE_TESTS !== "1") return;
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  expect(manifest.purpose).toBe("itinerary-part2-live-verification");
  await cleanup(manifest.fixture);
});

test("two real provider-delivered loops per follow-up; authenticated destination and actual outbox", async () => {
  if (process.env.CLEANUP_ITINERARY_FOLLOWUP_LIVE_TESTS === "1") return;
  expect(await db.select({ id: users.id }).from(users).where(eq(users.email, inbox))).toHaveLength(0);
  const provider = new Resend(process.env.RESEND_API_KEY);
  for (let loop = 1; loop <= 2; loop++) for (const entry of ITINERARY_FOLLOWUPS) {
    const f: Fixture = { userId: randomUUID(), providerId: randomUUID(), expertId: randomUUID(), itineraryId: randomUUID() };
    const serviceId = randomUUID(), variantId = randomUUID(), password = randomUUID();
    const salt = randomBytes(16).toString("hex");
    const destination = `QA LIVE ${randomUUID().slice(0, 12)}`;
    let keepForBrowser = false;
    try {
      await db.transaction(async (tx) => {
        await tx.insert(users).values([
          { id: f.userId, email: inbox, firstName: "Development Verification", emailVerified: new Date(),
            password: `${salt}:${scryptSync(password, salt, 64).toString("hex")}`,
            preferences: { itineraryMarketing: { enabled: true, timeZone: "UTC", quietStart: "00:00", quietEnd: "00:00" } } },
          { id: f.providerId, email: `${f.providerId}@example.test`, role: "service_provider", firstName: "QA Provider" },
          { id: f.expertId, email: `${f.expertId}@example.test`, role: "local_expert", firstName: "QA Live Expert" },
        ]);
        if (loop === 1) await tx.insert(localExpertForms).values({
          id: randomUUID(), userId: f.expertId, city: destination, firstName: "QA Live Expert",
          displayName: "QA Live Expert", status: "approved", acceptsNewHandoffs: true,
        });
        await tx.insert(providerServices).values({
          id: serviceId, userId: f.providerId, serviceName: "QA ONLY - live follow-up verification",
          status: "active", approvalStatus: "approved", deliveryMethod: "video", price: "99.00",
        });
        const readyAt = new Date(Date.now() - entry.hours * 3_600_000 - 30000);
        const startedAt = new Date(readyAt.getTime() - 1000);
        await tx.insert(itineraryComparisons).values({
          id: f.itineraryId, userId: f.userId, destination, status: "generating",
          createdAt: new Date(startedAt.getTime() - 1000), updatedAt: startedAt,
        });
        expect((await persistGenerationOutcome(tx, {
          comparisonId: f.itineraryId, startedAt, outcome: "ready", now: readyAt,
        })).transitioned).toBe(true);
        await tx.insert(itineraryVariants).values({ id: variantId, comparisonId: f.itineraryId, name: "QA Live Variant" });
        await tx.insert(itineraryVariantItems).values({
          id: randomUUID(), variantId, dayNumber: 1, name: "QA Live Item", providerServiceId: serviceId,
        });
        // All notices are protected from background workers, including Part 1's ready email.
        await tx.execute(sql`UPDATE email_outbox SET retry_after = NOW() + INTERVAL '30 minutes'
          WHERE metadata->>'travelerId' = ${f.userId} OR metadata->>'comparisonId' = ${f.itineraryId}`);
      });
      const [queued] = await db.select().from(emailOutbox).where(sql`
        ${emailOutbox.metadata}->>'travelerId' = ${f.userId} AND ${emailOutbox.emailType} = ${entry.kind}`);
      expect(queued.status).toBe("pending");
      await db.update(emailOutbox).set({ retryAfter: new Date(Date.now() - 1000) }).where(eq(emailOutbox.id, queued.id));
      await deliverQueuedEmail(queued.id);
      const [sent] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, queued.id));
      expect(sent.status, sent.lastError ?? "provider acceptance required").toBe("sent");
      expect(sent.resendId).toBeTruthy();
      const planUrl = sent.textBody!.match(/Revisit your itinerary: (\S+)/)![1];
      expect(new URL(planUrl).host).toBe(process.env.REPLIT_DEV_DOMAIN);
      expect(new URL(planUrl).pathname).toBe(`/itinerary-comparison/${f.itineraryId}`);
      const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
      const login = await fetch(`${base}/api/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: inbox, password }),
      });
      expect(login.status).toBe(200);
      const cookie = login.headers.get("set-cookie")!.split(";")[0];
      const response = await fetch(`${base}/api/itinerary-comparisons/${f.itineraryId}`, { headers: { Cookie: cookie } });
      expect(response.status).toBe(200);
      expect((await response.json()).comparison.id).toBe(f.itineraryId);
      expect((await fetch(planUrl, { headers: { Cookie: cookie } })).status).toBe(200);
      const urgency = sent.textBody!.includes("Prices may change");
      expect(urgency).toBe(entry.hours === 120);
      if (entry.hours === 24) expect(sent.textBody).toContain(loop === 1 ? "QA Live Expert" : "top-rated activity");
      await deliverQueuedEmail(queued.id);
      expect((await db.select().from(emailOutbox).where(eq(emailOutbox.id, queued.id)))[0].attemptCount).toBe(1);
      let lastEvent = "unknown";
      for (let attempt = 0; attempt < 40; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const result = await provider.emails.get(sent.resendId!);
        if (result.error) throw new Error(`Provider receipt lookup failed: ${result.error.name}`);
        lastEvent = result.data!.last_event;
        if (["delivered", "opened", "clicked"].includes(lastEvent)) break;
        if (["bounced", "failed", "suppressed", "complained", "canceled"].includes(lastEvent)) break;
      }
      evidence.push({
        loop, kind: entry.kind, itineraryId: f.itineraryId, outboxId: queued.id, providerId: sent.resendId!,
        providerEvent: lastEvent, checkedAt: new Date().toISOString(), authenticatedLink: true,
        expertBranch: entry.hours === 24 ? loop === 1 ? "approved expert" : "top-rated activity" : null,
        urgency, idempotentRepeat: true,
      });
      await saveEvidence();
      expect(["delivered", "opened", "clicked"], `Recipient-server delivery required, not ${lastEvent}`).toContain(lastEvent);
      console.log(`[live-evidence] ${entry.kind} loop=${loop} provider=${sent.resendId} event=${lastEvent}`);
      if (loop === 2 && entry.hours === 120) {
        await writeFile(manifestPath, JSON.stringify({
          purpose: "itinerary-part2-live-verification", fixture: f, email: inbox, password,
          planUrl, unsubscribeUrl: sent.textBody!.match(/Unsubscribe: (\S+)/)![1], destination,
        }), { mode: 0o600 });
        keepForBrowser = true;
      }
    } finally {
      if (!keepForBrowser) await cleanup(f);
    }
  }
  expect(evidence).toHaveLength(6);
});