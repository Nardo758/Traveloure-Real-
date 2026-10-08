// Manual real-wall-clock checks only; no scheduler or clock substitution.
import fs from "node:fs";
import crypto from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const { loadOwner, saveOwner } = await import(pathToFileURL(resolve("scripts/verification/automation-open-fixtures.mjs")).href);
const { redact } = await import(pathToFileURL(resolve("scripts/verification/automation-baseline-reporter.mjs")).href);
for (const method of ["log", "info", "warn", "error", "debug"] as const) {
  const original = console[method].bind(console);
  console[method] = (...values: any[]) => original(...values.map(v => redact(String(typeof v === "string" ? v : JSON.stringify(v)))));
}
for (const stream of [process.stdout, process.stderr]) {
  const write = stream.write.bind(stream);
  (stream as any).write = (chunk: any, ...args: any[]) => write(
    String(chunk).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[address-redacted]")
      .replace(/([?&]token=)[^&\s"'<>]+/gi, "$1[redacted]"), ...args as []);
}
const owner = loadOwner(), actor = owner.accounts.clock.clock;
const keepAlive = setInterval(() => {}, 1000); // Keep awaited native work alive; not a job scheduler.
if (process.env.NODE_ENV !== "test" || process.env.MESSAGING_VERIFICATION_SCHEMA !== owner.schema) throw new Error("Private test owner only");
const settings = JSON.parse(fs.readFileSync("/tmp/automation-part1-private-qa.json", "utf8"));
process.env.ITINERARY_OUTCOME_TEST_EMAIL = actor.email; // Child only; SDK boundary routes to approved inbox.
const actualFetch = globalThis.fetch, capturePath = `/tmp/automation-clock-mail-${owner.schema}.jsonl`;
globalThis.fetch = async (input: any, init: any) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname !== "api.resend.com") throw new Error("External API forbidden in clock check");
  await new Promise(r => setTimeout(r, 1250));
  if (init?.method?.toUpperCase() === "POST" && url.pathname === "/emails") {
    const payload = JSON.parse(String(init.body)), to = Array.isArray(payload.to) ? payload.to : [payload.to];
    if (to.length !== 1 || to[0] !== actor.email) throw new Error("Only clock fixture alias may send");
    payload.to = [settings.ITINERARY_OUTCOME_TEST_EMAIL];
    const response = await actualFetch(input, { ...init, body: JSON.stringify(payload) });
    const data = await response.clone().json();
    if (response.ok && data.id) fs.appendFileSync(capturePath,
      JSON.stringify({ providerId: data.id, html: payload.html, text: payload.text, acceptedAt: new Date().toISOString() }) + "\n",
      { mode: 0o600 });
    return response;
  }
  if ((init?.method ?? "GET").toUpperCase() === "GET") return actualFetch(input, init);
  throw new Error("Unapproved provider operation");
};
const { db, pool } = await import("../../server/db");
const { eq, sql } = await import("drizzle-orm");
const { emailOutbox, itineraryComparisons } = await import("../../shared/schema");
const { deliverQueuedEmail, enqueueBookingConfirmationEmail, _outboxTestHooks } = await import("../../server/services/email-outbox.service");
const { sweepTimedOutGenerations } = await import("../../server/services/itinerary-generation-outcome.service");
const { GENERATION_TIMEOUT_MS } = await import("../../server/services/itinerary-outcome-email");
const { Resend } = await import("resend");
const resend = new Resend(process.env.RESEND_API_KEY);
try {
  if (!owner.clocks.some((c: any) => c.kind === "dead_retry_ladder")) {
    const scenarioId = crypto.randomUUID(), bookingId = crypto.randomUUID();
    let [row] = await db.select().from(emailOutbox).where(sql`${emailOutbox.toEmail}=${actor.email}
      AND ${emailOutbox.html} LIKE '%PRIVATE QA real-clock ladder%'`);
    if (!row) {
      _outboxTestHooks.sendEmailFn = async () => ({ ok: false, error: "CONTROLLED QA clock retry failure" });
      try { await enqueueBookingConfirmationEmail({ toEmail: actor.email, userName: "Private QA clock",
        bookingId, bookingTitle: "PRIVATE QA real-clock ladder", bookingDate: null, confirmationCode: "QA-CLOCK" }); }
      finally { delete _outboxTestHooks.sendEmailFn; }
      [row] = await db.select().from(emailOutbox).where(sql`${emailOutbox.metadata}->>'bookingId'=${bookingId}`);
    }
    if (!row?.retryAfter || row.status !== "failed") throw new Error("Native first failure/retry was not retained");
    owner.clocks.push({ scenarioId, kind: "dead_retry_ladder", outboxId: row.id, startedAt: row.createdAt!.toISOString(),
      dueAt: row.retryAfter.toISOString(), checkedAt: new Date().toISOString(), status: "WAITING",
      rowStatus: row.status, attemptCount: row.attemptCount, injectedFailure: true,
      invocation: "Manual native retry ladder; future dead/digest not yet proven; no custom scheduler" });
  }
  for (const clock of owner.clocks) {
    clock.checkedAt = new Date().toISOString();
    if (Date.now() < Date.parse(clock.dueAt) || clock.status === "REAL_CLOCK_PASS") continue;
    if (clock.kind === "dead_retry_ladder") {
      _outboxTestHooks.sendEmailFn = async () => ({ ok: false, error: "CONTROLLED QA clock retry failure" });
      try { await deliverQueuedEmail(clock.outboxId); }
      finally { delete _outboxTestHooks.sendEmailFn; }
      const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, clock.outboxId));
      clock.rowStatus = row.status; clock.attemptCount = row.attemptCount;
      clock.status = row.status === "dead" ? "DEAD_OBSERVED_DIGEST_PENDING" : "WAITING";
      if (row.retryAfter) clock.dueAt = row.retryAfter.toISOString();
      continue;
    }
    if (clock.kind === "generation_timeout_sweep") {
      await sweepTimedOutGenerations(new Date(Date.now() - GENERATION_TIMEOUT_MS));
      const [comparison] = await db.select().from(itineraryComparisons).where(eq(itineraryComparisons.id, clock.comparisonId));
      const rows = await db.select().from(emailOutbox).where(sql`${emailOutbox.metadata}->>'comparisonId'=${clock.comparisonId}`);
      const failed = rows.find(r => r.emailType === "itinerary_failed");
      clock.failedOutcomeObserved = comparison?.status === "failed";
      if (!failed) { clock.status = "OPEN"; clock.reason = "No authoritative failed outbox row"; continue; }
      clock.outboxId = failed.id;
    } else if (clock.kind !== "booking_confirmation_retry") {
      // Expiry UI and long marketing scenarios remain genuine WAITING, not an
      // invented pass. Check them through their native journeys when due.
      continue;
    }
    await deliverQueuedEmail(clock.outboxId);
    const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, clock.outboxId));
    clock.rowStatus = row?.status; clock.providerId = row?.resendId;
    if (!row?.resendId || row.status !== "sent") { clock.status = "OPEN"; clock.reason = "Native dispatcher did not send"; continue; }
    for (let attempt = 0; attempt < 8; attempt++) {
      const response = await resend.emails.get(row.resendId);
      clock.providerEvent = response.data?.last_event ?? "receipt_not_confirmed";
      if (["delivered", "opened", "clicked"].includes(clock.providerEvent)) break;
    }
    const before = fs.existsSync(capturePath) ? fs.readFileSync(capturePath, "utf8").trim().split("\n").length : 0;
    await deliverQueuedEmail(clock.outboxId);
    const after = fs.existsSync(capturePath) ? fs.readFileSync(capturePath, "utf8").trim().split("\n").length : 0;
    clock.repeatSentNothing = before === after;
    clock.status = clock.repeatSentNothing && ["delivered", "opened", "clicked"].includes(clock.providerEvent) ?
      "REAL_CLOCK_PASS" : "OPEN";
    clock.scope = "Manual native writer/dispatcher + provider delivery; NOT browser, inbox placement or scheduler proof";
    clock.checkedAt = new Date().toISOString();
  }
  saveOwner(owner);
  fs.writeFileSync("reports/automation-part1-evidence/real-clock-check.json",
    JSON.stringify({ checkedAt: new Date().toISOString(), schema: owner.schema, rows: owner.clocks }, null, 2));
  console.log(JSON.stringify({ actualClock: true, rows: owner.clocks.map((c: any) => ({
    kind: c.kind, status: c.status, dueAt: c.dueAt, outboxId: c.outboxId, providerId: c.providerId,
    providerEvent: c.providerEvent, repeatSentNothing: c.repeatSentNothing })) }));
} finally { await pool.end(); clearInterval(keepAlive); }
