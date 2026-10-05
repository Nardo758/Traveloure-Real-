import { randomUUID } from "node:crypto";
import { afterAll, expect, test, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "../../db";
import { emailOutbox, itineraryComparisons, users } from "@shared/schema";
import { persistGenerationOutcome } from "../itinerary-generation-outcome.service";
import { _outboxTestHooks, deliverQueuedEmail } from "../email-outbox.service";

vi.mock("../email.service", async (importOriginal) => ({
  ...await importOriginal<typeof import("../email.service")>(),
  getAppBaseUrl: () => "https://app.example.test",
}));

if (process.env.RUN_GENERATION_OUTCOME_DB_TESTS !== "1") {
  throw new Error("Rollback-only development DB tests require RUN_GENERATION_OUTCOME_DB_TESTS=1");
}

afterAll(async () => {
  delete _outboxTestHooks.sendEmailFn;
  vi.restoreAllMocks();
  await pool.end();
});

class RollbackFixture extends Error {}
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function rollbackOnly(run: (tx: Tx, userId: string) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      const userId = randomUUID();
      await tx.insert(users).values({ id: userId, email: `${userId}@example.test`, firstName: "<Test>" });
      vi.stubEnv("ITINERARY_OUTCOME_TEST_EMAIL", `${userId}@example.test`);
      try {
        await run(tx, userId);
      } finally {
        delete _outboxTestHooks.sendEmailFn;
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
      }
      throw new RollbackFixture();
    });
  } catch (err) {
    if (!(err instanceof RollbackFixture)) throw err;
  }
}

async function comparison(tx: Tx, userId: string, startedAt: Date) {
  const id = randomUUID();
  await tx.insert(itineraryComparisons).values({
    id, userId, destination: "Kyoto", status: "generating", updatedAt: startedAt,
  });
  return id;
}

function routeOutboxToFixture(tx: Tx) {
  // Real SQL/real leases on this transaction's uncommitted rows. Never make fixtures visible
  // to background drains, never send mail, and never change committed production/user rows.
  vi.spyOn(db, "execute").mockImplementation((query: any) => tx.execute(query) as any);
  vi.spyOn(db, "select").mockImplementation((fields?: any) => tx.select(fields) as any);
  vi.spyOn(db, "update").mockImplementation((table: any) => tx.update(table) as any);
}

for (let loop = 1; loop <= 2; loop++) {
  test(`ready DB loop ${loop}: concurrent completion, two same-day itineraries, provider retry and dedupe`, async () => {
    await rollbackOnly(async (tx, userId) => {
      const startedAt = new Date(Date.now() - 10000 - Math.floor(Math.random() * 10000));
      const first = await comparison(tx, userId, startedAt);
      const second = await comparison(tx, userId, startedAt);
      const outcomes = await Promise.all([
        persistGenerationOutcome(tx, { comparisonId: first, startedAt, outcome: "ready" }),
        persistGenerationOutcome(tx, { comparisonId: first, startedAt, outcome: "ready" }),
      ]);
      expect(outcomes.filter((row) => row.transitioned)).toHaveLength(1);
      const completed = outcomes.find((row) => row.transitioned)!;
      const other = await persistGenerationOutcome(tx, { comparisonId: second, startedAt, outcome: "ready" });
      expect(completed.outboxId).not.toBe(other.outboxId);
      const notices = await tx.select().from(emailOutbox)
        .where(sql`${emailOutbox.metadata}->>'comparisonId' IN (${first}, ${second})`);
      expect(notices).toHaveLength(2);
      expect(notices.every((row) => row.emailType === "itinerary_ready")).toBe(true);

      routeOutboxToFixture(tx);
      const keys: string[] = [];
      _outboxTestHooks.sendEmailFn = async (params) => {
        keys.push(params.idempotencyKey!);
        return keys.length === 1 ? { ok: false, error: "simulated transient provider error" } : { ok: true, id: "intercepted-not-real" };
      };
      await deliverQueuedEmail(completed.outboxId!);
      const [failed] = await tx.select().from(emailOutbox).where(eq(emailOutbox.id, completed.outboxId!));
      expect(failed.status).toBe("failed");
      expect(failed.attemptCount).toBe(1);
      expect(failed.retryAfter).not.toBeNull();
      // Make the intercepted row eligible again, then exercise the same claim/send path.
      await tx.update(emailOutbox).set({ status: "pending", retryAfter: null }).where(eq(emailOutbox.id, completed.outboxId!));
      await Promise.all([deliverQueuedEmail(completed.outboxId!), deliverQueuedEmail(completed.outboxId!)]);
      expect(keys).toHaveLength(2);
      expect(keys[0]).toBe(keys[1]);
      const [sent] = await tx.select().from(emailOutbox).where(eq(emailOutbox.id, completed.outboxId!));
      expect(sent.status).toBe("sent");
      expect(sent.attemptCount).toBe(2);

      const nextStart = new Date(Date.now());
      await tx.update(itineraryComparisons).set({ status: "generating", updatedAt: nextStart }).where(eq(itineraryComparisons.id, first));
      const repeated = await persistGenerationOutcome(tx, { comparisonId: first, startedAt: nextStart, outcome: "ready" });
      expect(repeated.transitioned).toBe(true);
      expect(repeated.outboxId).toBeNull(); // per itinerary, not per regeneration
    });
  });

  test(`failed DB loop ${loop}: exact timeout and two variations, late success, error, new attempt`, async () => {
    await rollbackOnly(async (tx, userId) => {
      routeOutboxToFixture(tx);
      const deliveredKeys: string[] = [];
      _outboxTestHooks.sendEmailFn = async (params) => {
        deliveredKeys.push(params.idempotencyKey!);
        expect(params.subject).toBe("We couldn't finish your itinerary");
        return { ok: true, id: "intercepted-failure-not-real" };
      };
      for (const age of [300001, 360000 + Math.floor(Math.random() * 2000), 900000]) {
        const now = new Date();
        const startedAt = new Date(now.getTime() - age);
        const id = await comparison(tx, userId, startedAt);
        const failed = await persistGenerationOutcome(tx, { comparisonId: id, startedAt, outcome: "ready", now });
        expect(failed.outcome).toBe("failed");
        expect(failed.transitioned).toBe(true);
        const duplicate = await persistGenerationOutcome(tx, { comparisonId: id, startedAt, outcome: "failed", now });
        expect(duplicate.transitioned).toBe(false);
        const late = await persistGenerationOutcome(tx, { comparisonId: id, startedAt, outcome: "ready", now: new Date(now.getTime() + 1000) });
        expect(late.transitioned).toBe(false);
        const [row] = await tx.select().from(itineraryComparisons).where(eq(itineraryComparisons.id, id));
        expect(row.status).toBe("failed");
        expect(row.optimizedAt).toBeNull();
        const [mail] = await tx.select().from(emailOutbox).where(eq(emailOutbox.id, failed.outboxId!));
        expect((mail.metadata as any).reason).toBe("timeout");
        const before = deliveredKeys.length;
        await Promise.all([deliverQueuedEmail(failed.outboxId!), deliverQueuedEmail(failed.outboxId!)]);
        expect(deliveredKeys).toHaveLength(before + 1);
      }
      const startedAt = new Date(Date.now() - 1000);
      const id = await comparison(tx, userId, startedAt);
      const error = await persistGenerationOutcome(tx, { comparisonId: id, startedAt, outcome: "failed" });
      const [mail] = await tx.select().from(emailOutbox).where(eq(emailOutbox.id, error.outboxId!));
      expect((mail.metadata as any).reason).toBe("error");
      await deliverQueuedEmail(error.outboxId!);
      expect(deliveredKeys).toHaveLength(4);
      expect(new Set(deliveredKeys).size).toBe(4);
      const newerStart = new Date(Date.now());
      await tx.update(itineraryComparisons).set({ status: "generating", updatedAt: newerStart }).where(eq(itineraryComparisons.id, id));
      expect((await persistGenerationOutcome(tx, { comparisonId: id, startedAt, outcome: "failed" })).transitioned).toBe(false);
      const recovered = await persistGenerationOutcome(tx, { comparisonId: id, startedAt: newerStart, outcome: "ready" });
      expect(recovered.outcome).toBe("ready");
      expect(recovered.outboxId).not.toBeNull();
    });
  });

  test(`refinement loop ${loop}: cancelled ready notice is recoverable, exact case plus two variants`, async () => {
    await rollbackOnly(async (tx, userId) => {
      routeOutboxToFixture(tx);
      let sends = 0;
      _outboxTestHooks.sendEmailFn = async () => { sends++; return { ok: true, id: "intercepted-recovery-not-real" }; };
      for (const destination of ["Kyoto", "<Tokyo & Osaka>", null]) {
        const start = new Date(Date.now() - 1000);
        const id = await comparison(tx, userId, start);
        await tx.update(itineraryComparisons).set({ destination }).where(eq(itineraryComparisons.id, id));
        const original = await persistGenerationOutcome(tx, { comparisonId: id, startedAt: start, outcome: "ready" });
        const nextStart = new Date(Date.now());
        await tx.update(itineraryComparisons).set({ status: "generating", updatedAt: nextStart }).where(eq(itineraryComparisons.id, id));
        await deliverQueuedEmail(original.outboxId!);
        const [cancelled] = await tx.select().from(emailOutbox).where(eq(emailOutbox.id, original.outboxId!));
        expect(cancelled.status).toBe("cancelled");
        const recovered = await persistGenerationOutcome(tx, { comparisonId: id, startedAt: nextStart, outcome: "ready" });
        expect(recovered.outboxId).toBe(original.outboxId);
        await deliverQueuedEmail(recovered.outboxId!);
        await deliverQueuedEmail(recovered.outboxId!);
        expect((await tx.select().from(emailOutbox).where(sql`${emailOutbox.metadata}->>'comparisonId' = ${id}`))).toHaveLength(1);
      }
      expect(sends).toBe(3);
    });
  });
}

test("missing email and deleted/superseded itineraries or accounts never reach sender", async () => {
  await rollbackOnly(async (tx, userId) => {
    const start = new Date(Date.now() - 1000);
    const noEmail = await comparison(tx, userId, start);
    await tx.update(users).set({ email: null }).where(eq(users.id, userId));
    expect((await persistGenerationOutcome(tx, { comparisonId: noEmail, startedAt: start, outcome: "ready" })).outboxId).toBeNull();
    await tx.update(users).set({ email: `${userId}@example.test` }).where(eq(users.id, userId));
    routeOutboxToFixture(tx);
    let sends = 0;
    _outboxTestHooks.sendEmailFn = async () => { sends++; return { ok: true }; };
    for (const kind of ["itinerary", "superseded", "account"]) {
      const id = await comparison(tx, userId, start);
      const result = await persistGenerationOutcome(tx, { comparisonId: id, startedAt: start, outcome: kind === "superseded" ? "failed" : "ready" });
      if (kind === "itinerary") await tx.delete(itineraryComparisons).where(eq(itineraryComparisons.id, id));
      if (kind === "superseded") await tx.update(itineraryComparisons).set({ status: "generating", updatedAt: new Date() }).where(eq(itineraryComparisons.id, id));
      if (kind === "account") await tx.delete(users).where(eq(users.id, userId));
      await deliverQueuedEmail(result.outboxId!);
      const [row] = await tx.select().from(emailOutbox).where(eq(emailOutbox.id, result.outboxId!));
      expect(row.status).toBe("cancelled");
    }
    expect(sends).toBe(0);
  });
});

test("outbox persistence failure rolls back the terminal state", async () => {
  await rollbackOnly(async (tx, userId) => {
    const start = new Date(Date.now() - 1000);
    const id = await comparison(tx, userId, start);
    await tx.execute(sql`SAVEPOINT outcome_atomicity`);
    const insert = vi.spyOn(tx, "insert").mockImplementation(() => { throw new Error("simulated outbox insert failure"); });
    await expect(persistGenerationOutcome(tx, { comparisonId: id, startedAt: start, outcome: "ready" })).rejects.toThrow("simulated outbox insert failure");
    insert.mockRestore();
    await tx.execute(sql`ROLLBACK TO SAVEPOINT outcome_atomicity`);
    const [row] = await tx.select().from(itineraryComparisons).where(eq(itineraryComparisons.id, id));
    expect(row.status).toBe("generating");
    const notices = await tx.select().from(emailOutbox).where(sql`${emailOutbox.metadata}->>'comparisonId' = ${id}`);
    expect(notices).toHaveLength(0);
  });
});