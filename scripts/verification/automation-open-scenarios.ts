// Native-writer QA scenarios, confined by the retained schema preload.
import crypto from "node:crypto";
import fs from "node:fs";
import { eq, sql } from "drizzle-orm";
import { db } from "../../server/db";
import * as schema from "../../shared/schema";
import { persistGenerationOutcome } from "../../server/services/itinerary-generation-outcome.service";
import { deliverQueuedEmail, enqueueBookingConfirmationEmail, _outboxTestHooks } from "../../server/services/email-outbox.service";
import { ITINERARY_FOLLOWUPS } from "../../server/services/itinerary-followup-email";

async function withApprovedQaAlias<T>(email: string, fn: () => Promise<T>): Promise<T> {
  // Child-process approval for ONE known fixture alias; the SDK wrapper still
  // delivers only to the two secure monitored inboxes. Never persist this env
  // setting or use it in production. Manual control calls must be serialized.
  if (process.env.NODE_ENV !== "test" || !email.endsWith("@traveloure-qa.test")) throw new Error("QA alias only");
  const previous = process.env.ITINERARY_OUTCOME_TEST_EMAIL;
  process.env.ITINERARY_OUTCOME_TEST_EMAIL = email;
  try { return await fn(); }
  finally {
    if (previous === undefined) delete process.env.ITINERARY_OUTCOME_TEST_EMAIL;
    else process.env.ITINERARY_OUTCOME_TEST_EMAIL = previous;
  }
}
async function api(owner: any, path: string, body?: unknown, cookie?: string) {
  const response = await fetch(`http://127.0.0.1:${owner.port}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0] };
}
async function register(owner: any, account: any, save: (o: any) => void) {
  if (account.userId) return;
  const result = await api(owner, "/api/auth/register", account);
  if (result.status !== 201 || !result.body.user?.id) throw new Error(`Native signup returned ${result.status}`);
  account.userId = result.body.user.id;
  account.cookie = result.cookie;
  save(owner);
}
async function comparisonFixture(account: any, readyAt: Date, kind: string) {
  const comparisonId = crypto.randomUUID(), variantId = crypto.randomUUID();
  const startedAt = new Date(+readyAt - 1000);
  await db.insert(schema.itineraryComparisons).values({ id: comparisonId, userId: account.userId,
    destination: "Kyoto", status: "generating", createdAt: startedAt, updatedAt: startedAt });
  await withApprovedQaAlias(account.email, () => db.transaction(tx => persistGenerationOutcome(tx, { comparisonId, startedAt,
    outcome: kind === "itinerary_failed" ? "failed" : "ready", now: readyAt, deliverImmediately: false })));
  let serviceId: string | null = null;
  if (kind !== "itinerary_failed") {
    const providerId = crypto.randomUUID(); serviceId = crypto.randomUUID();
    await db.insert(schema.users).values({ id: providerId, email: `${providerId}@traveloure-qa.test`,
      firstName: "PRIVATE QA ONLY provider", role: "service_provider" });
    await db.insert(schema.providerServices).values({ id: serviceId, userId: providerId,
      serviceName: "PRIVATE QA ONLY mail test", status: "active", approvalStatus: "approved",
      deliveryMethod: "video", price: "99.00" });
  }
  await db.insert(schema.itineraryVariants).values({ id: variantId, comparisonId, name: "PRIVATE QA ONLY option" });
  await db.insert(schema.itineraryVariantItems).values({ id: crypto.randomUUID(), variantId, dayNumber: 1,
    name: "PRIVATE QA ONLY stop", providerServiceId: serviceId });
  return comparisonId;
}
async function pollDelivered(owner: any, loop: number) {
  const started = Date.now();
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const checked = new Map<string, any>();
  while (Date.now() - started < 110000) {
    const captures = fs.existsSync(owner.mailPath) ? JSON.parse(fs.readFileSync(owner.mailPath, "utf8")) : [];
    const mails = captures.filter((c: any) => c.loop === loop);
    for (const mail of mails) {
      if (checked.get(mail.providerId)?.providerEvent === "delivered") continue;
      await new Promise(r => setTimeout(r, 750));
      const response = await resend.emails.get(mail.providerId);
      const event = response.data?.last_event ?? "receipt_not_confirmed";
      checked.set(mail.providerId, { providerId: mail.providerId, accountKind: mail.accountKind,
        providerEvent: event, checkedAt: new Date().toISOString() });
    }
    if (mails.length >= 22 && mails.every((m: any) => ["delivered", "opened", "clicked"].includes(checked.get(m.providerId)?.providerEvent))) break;
    await new Promise(r => setTimeout(r, 1200));
  }
  return [...checked.values()];
}
export async function prepareLoop(loop: number, owner: any, save: (o: any) => void) {
  if (![1, 2].includes(loop)) throw new Error("Only approved two loops");
  if (owner.preparedLoops.includes(loop)) return { alreadyPrepared: true, loop };
  const scoped = await db.execute(sql`SELECT current_schema() AS name`);
  if (scoped.rows[0]?.name !== owner.schema) throw new Error("No-fallback private schema required");
  const cases: any[] = [], group = owner.accounts[loop];
  for (const [kind, account] of Object.entries(group) as [string, any][]) {
    if (kind === "browser_signup") continue; // Actual browser must submit this one.
    await register(owner, account, save);
    if (kind.startsWith("itinerary_")) {
      await db.update(schema.users).set({ emailVerified: new Date(),
        preferences: { itineraryMarketing: { enabled: true, timeZone: "UTC", quietStart: "20:00", quietEnd: "09:00" } } })
        .where(eq(schema.users.id, account.userId));
      const entry = ITINERARY_FOLLOWUPS.find(e => e.kind === kind);
      // Explicit FAST fixture for browser/content, NOT real-clock certification.
      const readyAt = new Date(Date.now() - (entry?.hours ?? 0) * 3600000 - 30000);
      const comparisonId = await comparisonFixture(account, readyAt, kind);
      account.comparisonId = comparisonId;
      const notices = await db.select().from(schema.emailOutbox).where(sql`
        ${schema.emailOutbox.metadata}->>'comparisonId'=${comparisonId}
        OR ${schema.emailOutbox.metadata}->>'itineraryId'=${comparisonId}`);
      const row = notices.find(r => r.emailType === kind);
      if (!row) throw new Error("Native outcome did not enqueue requested type");
      await db.update(schema.emailOutbox).set({ retryAfter: new Date(Date.now() - 1000) }).where(eq(schema.emailOutbox.id, row.id));
      await withApprovedQaAlias(account.email, () => deliverQueuedEmail(row.id));
      const actual = await db.select().from(schema.emailOutbox).where(eq(schema.emailOutbox.id, row.id));
      const right = await api(owner, `/api/itinerary-comparisons/${comparisonId}`, undefined, account.cookie);
      cases.push({ kind, fixtureId: account.userId, comparisonId, outboxId: row.id,
        status: actual[0]?.status, providerId: actual[0]?.resendId, rightPersonApiStatus: right.status,
        mode: "FAST_ISSUED_BROWSER_LINK" });
    } else if (kind === "password_reset") {
      const response = await api(owner, "/api/auth/forgot-password", { email: account.email });
      cases.push({ kind, fixtureId: account.userId, issuedByNativeRoute: response.status === 200, outboxId: null });
    } else if (kind === "verification") {
      cases.push({ kind, fixtureId: account.userId, issuedByNativeRoute: true, outboxId: null });
    }
    save(owner);
  }
  for (const entry of cases.filter(c => c.comparisonId)) {
    const response = await api(owner, `/api/itinerary-comparisons/${entry.comparisonId}`, undefined, group.wrong.cookie);
    entry.wrongPersonApiStatus = response.status;
    entry.wrongPersonRejected = [401, 403, 404].includes(response.status);
    entry.randomizedScenarioId = crypto.randomUUID();
  }
  const receipts = await pollDelivered(owner, loop);
  const rows = await db.select({ id: schema.emailOutbox.id, emailType: schema.emailOutbox.emailType,
    status: schema.emailOutbox.status, providerId: schema.emailOutbox.resendId }).from(schema.emailOutbox);
  const evidence = { loop, schema: owner.schema, checkedAt: new Date().toISOString(), cases, receipts,
    deliveredRows: rows.filter(r => receipts.some(p => p.providerId === r.providerId)),
    noProductionChanges: true, noPaymentsExecuted: true, browserStillRequired: true,
    authOutboxDefect: "Verification/reset are native direct sends: no outbox row; G10 cannot close under current requirement" };
  fs.mkdirSync("reports/automation-part1-evidence", { recursive: true });
  fs.writeFileSync(`reports/automation-part1-evidence/open-links-loop-${loop}.json`, JSON.stringify(evidence, null, 2));
  owner.preparedLoops.push(loop); save(owner);
  return { loop, cases: cases.length, providerReceipts: receipts.length,
    delivered: receipts.filter(r => ["delivered", "opened", "clicked"].includes(r.providerEvent)).length,
    ownerApiPasses: cases.filter(c => c.rightPersonApiStatus === 200).length,
    wrongPersonApiPasses: cases.filter(c => c.wrongPersonRejected).length };
}

export async function startRealClocks(owner: any, save: (o: any) => void) {
  if (owner.clocks.length) return { alreadyStarted: true, clocks: owner.clocks };
  const account = { email: `${crypto.randomUUID()}@traveloure-qa.test`,
    password: `Qa-${crypto.randomBytes(18).toString("base64url")}`, firstName: "PRIVATE QA real clock",
    lastName: "Automation Only", loop: 0, kind: "clock" };
  owner.accounts.clock = { clock: account }; save(owner);
  await register(owner, account, save);
  await db.update(schema.users).set({ preferences: { itineraryMarketing: { enabled: true, timeZone: "America/New_York",
    quietStart: "20:00", quietEnd: "09:00" } } }).where(eq(schema.users.id, (account as any).userId));
  const start = new Date(); // Actual wall clock. Never subtract/backdate here.
  const comparisonId = await comparisonFixture(account, start, "itinerary_ready");
  const rows = await db.select().from(schema.emailOutbox).where(sql`
    ${schema.emailOutbox.metadata}->>'itineraryId'=${comparisonId}`);
  const clocks: any[] = rows.map(r => ({ scenarioId: crypto.randomUUID(), kind: r.emailType,
    comparisonId, outboxId: r.id, startedAt: start.toISOString(), dueAt: r.retryAfter?.toISOString(),
    checkedAt: new Date().toISOString(), status: "WAITING", rowStatus: r.status,
    timeZone: "America/New_York", invocation: "Manual existing-job check due later; no scheduled-execution proof" }));
  const retryStart = new Date();
  try {
    _outboxTestHooks.sendEmailFn = async () => ({ ok: false, error: "QA controlled outage; no external send" });
    await enqueueBookingConfirmationEmail({ toEmail: account.email, userName: "QA ONLY",
      bookingId: crypto.randomUUID(), bookingTitle: "PRIVATE QA retry", confirmationCode: `QA-${crypto.randomUUID()}` });
  } finally { delete _outboxTestHooks.sendEmailFn; }
  const retryRows = await db.select().from(schema.emailOutbox).where(sql`
    ${schema.emailOutbox.toEmail}=${account.email} AND ${schema.emailOutbox.emailType}='booking_confirmation'`);
  for (const row of retryRows) clocks.push({ scenarioId: crypto.randomUUID(), kind: "booking_confirmation_retry",
    outboxId: row.id, startedAt: retryStart.toISOString(), dueAt: row.retryAfter?.toISOString(),
    checkedAt: new Date().toISOString(), status: "WAITING", rowStatus: row.status, injectedFailure: true,
    invocation: "Manual existing dispatcher recovery; no real payment writer executed" });
  await api(owner, "/api/auth/forgot-password", { email: account.email });
  const verifyTokens = await db.select().from(schema.emailVerificationTokens)
    .where(eq(schema.emailVerificationTokens.userId, (account as any).userId));
  const resetTokens = await db.select().from(schema.passwordResetTokens)
    .where(eq(schema.passwordResetTokens.userId, (account as any).userId));
  for (const [kind, tokens] of [["verification_expiry", verifyTokens], ["reset_expiry", resetTokens]] as const) {
    for (const token of tokens) clocks.push({ scenarioId: crypto.randomUUID(), kind,
      tokenRowId: token.id, startedAt: token.createdAt?.toISOString(), dueAt: token.expiresAt.toISOString(),
      checkedAt: new Date().toISOString(), status: "WAITING", consumed: false,
      invocation: "Native issued token; test expired link only after actual expires_at" });
  }
  const timeoutStart = new Date(), timeoutComparison = crypto.randomUUID();
  await db.insert(schema.itineraryComparisons).values({ id: timeoutComparison, userId: (account as any).userId,
    destination: "Kyoto", status: "generating", createdAt: timeoutStart, updatedAt: timeoutStart });
  clocks.push({ scenarioId: crypto.randomUUID(), kind: "generation_timeout_sweep", comparisonId: timeoutComparison,
    startedAt: timeoutStart.toISOString(), dueAt: new Date(+timeoutStart + 5 * 60000).toISOString(),
    checkedAt: new Date().toISOString(), status: "WAITING",
    invocation: "Native sweeper after actual five-minute staleness; no LLM call or production timer claim" });
  owner.clocks = clocks; save(owner);
  fs.mkdirSync("reports/automation-part1-evidence", { recursive: true });
  fs.writeFileSync("reports/automation-part1-evidence/real-clock-start.json",
    JSON.stringify({ schema: owner.schema, retainedUntil: owner.cleanupDue, rows: clocks }, null, 2));
  return { clocks };
}
export async function startFollowupClock(owner: any, save: (o: any) => void) {
  if (owner.clocks.some((c: any) => c.kind === "itinerary_nudge_2h")) return { alreadyStarted: true };
  const account = owner.accounts.clock?.clock;
  if (!account?.userId) throw new Error("Initial clock actor required");
  const start = new Date();
  const comparisonId = await comparisonFixture(account, start, "itinerary_ready");
  const rows = await db.select().from(schema.emailOutbox).where(sql`
    ${schema.emailOutbox.metadata}->>'itineraryId'=${comparisonId}`);
  if (rows.length !== 3) throw new Error("All three real future rows required");
  owner.clocks.push(...rows.map(r => ({ scenarioId: crypto.randomUUID(), kind: r.emailType, comparisonId,
    outboxId: r.id, startedAt: start.toISOString(), dueAt: r.retryAfter?.toISOString(),
    checkedAt: new Date().toISOString(), status: "WAITING", rowStatus: r.status,
    timeZone: "America/New_York", invocation: "Manual existing-job check due later; no scheduled-execution proof" })));
  save(owner);
  fs.writeFileSync("reports/automation-part1-evidence/real-clock-start.json",
    JSON.stringify({ schema: owner.schema, retainedUntil: owner.cleanupDue, rows: owner.clocks,
      fixtureCorrection: "Initial alias was correctly refused by native development allowlist; only fresh approved-alias rows count as started marketing clocks" }, null, 2));
  return { clocks: owner.clocks };
}
