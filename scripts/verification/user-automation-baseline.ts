/**
 * Part 1 test/report tool. Never imported by the application.
 * Default mode is read-only inspection. Explicit --live-proof mode uses only
 * the approved disposable development namespace and monitored QA inboxes.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, relative } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  paymentAutomations, bookingAutomations, moderationAutomations,
  messagingAutomations, providerAutomations,
} from "../../server/automations/index";

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = `${directory}/${entry.name}`;
    return entry.isDirectory() ? walk(file) : [file];
  });
}
const nodes = [...paymentAutomations, ...bookingAutomations, ...moderationAutomations,
  ...messagingAutomations, ...providerAutomations];
const root = resolve(".");
const evidence = "reports/automation-part1-evidence";
const checkedAt = new Date().toISOString();
const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const ownerFiles = walk("server/automations").filter(file => /\.ts$/.test(file) && !file.includes("/__tests__/"));
const sources = ownerFiles.map(file => ({ file, source: readFileSync(file, "utf8") }));
const quote = (value: unknown) => String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
const historical = new Set([
  "messaging.plan-delivered-email", "messaging.itinerary-failed-email",
  "messaging.itinerary-nudge-2h", "messaging.itinerary-followup-24h",
  "messaging.itinerary-reengagement-5d", "messaging.auth-welcome-email",
]);

function owner(id: string): { file: string; line: number; hash: string } {
  const candidate = sources.find(entry => entry.source.includes(`"${id}"`) || entry.source.includes(`'${id}'`)) ??
    sources.find(entry => entry.file.endsWith(`/${id.split(".").at(-1)}.ts`));
  if (!candidate) throw new Error(`Unresolved registry owner: ${id}`);
  const line = candidate.source.split("\n").findIndex(row => row.includes(id)) + 1;
  return { file: candidate.file, line: Math.max(line, 1),
    hash: createHash("sha256").update(candidate.source).digest("hex") };
}

async function inventory() {
  const rows = nodes.map(node => ({
    id: node.id, domain: node.domain, trigger: node.trigger, enabled: node.enabled,
    owner: owner(node.id),
    extension: "Part 1: freeze only. Later Part assignment requires its prompt and approved touch list.",
    evidenceStatus: historical.has(node.id) ? "Historically verified; NOT freshly certified" : "Unverified under this brief",
  }));
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error("Duplicate registry IDs");
  const lines = [
    "# Protected automations — Part 1", "", `Inspected: ${checkedAt}. Source head: \`${sha}\`.`,
    "", `**${rows.length} unique nodes.** Enabled is definition metadata, not proof of running or successful delivery.`,
    "No node is freshly certified by this inventory. Historical receipt/test reports are not current certification.",
    "", "| ID | Domain | Trigger | Definition status | Owner | Part permitted to extend | Evidence |",
    "|---|---|---|---|---|---|---|",
    ...rows.map(row => `| ${row.id} | ${row.domain} | ${quote(JSON.stringify(row.trigger))} | ${row.enabled ? "Enabled" : "Disabled"} | ${row.owner.file}:${row.owner.line} | ${row.extension} | ${row.evidenceStatus} |`),
    "", "## Built behavior aliases — not new registry definitions", "",
    "| Requested behavior | Existing node / owner | Fresh certification |",
    "|---|---|---|",
    "| itinerary_ready | messaging.plan-delivered-email; itinerary-generation-outcome.service.ts | Open |",
    "| itinerary_failed | messaging.itinerary-failed-email; itinerary-generation-outcome.service.ts | Open |",
    "| itinerary_nudge_2h | messaging.itinerary-nudge-2h | Open |",
    "| itinerary_followup_24h | messaging.itinerary-followup-24h | Open |",
    "| itinerary_reengagement_5d | messaging.itinerary-reengagement-5d | Open |",
    "| Signup welcome | messaging.auth-welcome-email; signup-welcome-outbox.service.ts | Open |",
    "| Verification | messaging.auth-verification-email; email.service.ts | Open; direct producer, not an outbox claim |",
    "| Password reset | messaging.auth-password-reset-email; email.service.ts | Open; direct producer, not an outbox claim |",
    "| Canonical booking confirmation | booking.service.ts; shared enqueueBookingConfirmationEmail | Open |",
    "| Legacy booking confirmation | stripe-payment.service.ts; shared enqueueBookingConfirmationEmail | Open |",
    "| Activity emails | messaging.activity-email; activity-email.service.ts | Open |",
    "", "## Historical references", "",
    "- reports/itinerary-part2-live-certification.html — HISTORICAL, not certification under the current brief.",
    "- PR #1274 — HISTORICAL implementation/evidence; merged on main.",
    "- PR #1327 — HISTORICAL welcome implementation/delivery proof; merged on main.",
    "", "Owner hashes are recorded in the accompanying JSON for later before/after protection checks.",
  ];
  writeFileSync("reports/protected-automations.md", lines.join("\n") + "\n");
  writeFileSync(`${evidence}/protected-registry.json`, JSON.stringify({ sha, checkedAt, count: rows.length, nodes: rows }, null, 2));
}

function references(file: string, pattern: RegExp) {
  return readFileSync(file, "utf8").split("\n").flatMap((line, index) =>
    pattern.test(line) ? [{ file, line: index + 1 }] : []).slice(0, 12);
}

async function audit() {
  const descriptors = [
    { mechanism: "Eligibility / cancel", scope: "Shared dispatcher, distinct generation/follow-up/welcome business checks; not universal",
      files: ["server/services/email-outbox.service.ts", "server/services/itinerary-followup.service.ts", "server/services/signup-welcome-outbox.service.ts"],
      pattern: /cancel|suppress|eligib|generationNotice|isItineraryFollowup/i },
    { mechanism: "Recipient lock", scope: "Inspect separately: traveler advisory lock and welcome/account locks are not one universal lock",
      files: ["server/services/itinerary-followup.service.ts", "server/services/signup-welcome-outbox.service.ts", "server/services/email-outbox.service.ts"],
      pattern: /advisory|for\s+update|\.for\(|lockFollowup|recipient changed/i },
    { mechanism: "Marketing consent / unsubscribe", scope: "Itinerary lane has its own preference/token checks; activity preference handling is separate",
      files: ["server/services/itinerary-followup.service.ts", "server/services/itinerary-followup-email.ts", "server/services/activity-email.service.ts"],
      pattern: /consent|unsubscribe|preference|enabled/i },
    { mechanism: "Quiet hours / time zone", scope: "Itinerary marketing clock, not proven shared across all marketing families",
      files: ["server/services/itinerary-followup.service.ts", "server/services/itinerary-followup-email.ts"],
      pattern: /clock|quiet|timeZone|nextMarketingWindow/ },
    { mechanism: "Daily cap", scope: "Follow-up query checks sent/processing marketing metadata and local delivery day; priority arbitration across families is unproven",
      files: ["server/services/itinerary-followup.service.ts"],
      pattern: /deliveryCalendarDay|reservations|daily marketing cap|marketing'|marketing"/ },
    { mechanism: "Unique-key dedupe", scope: "Category-specific keys; generic enqueue does not populate the same key for every email",
      files: ["server/services/email-outbox.service.ts", "server/services/itinerary-generation-outcome.service.ts", "server/services/signup-welcome-outbox.service.ts", "shared/schema.ts"],
      pattern: /dedupKey|dedup_key|generationNoticeKey|generation_notice_key|onConflict|emailOutbox.*Index/ },
    { mechanism: "Cancel / skip reasons", scope: "Free-text lastError and per-lane returns; no universal typed reason taxonomy proven",
      files: ["server/services/email-outbox.service.ts", "server/services/itinerary-followup.service.ts", "server/services/signup-welcome-outbox.service.ts"],
      pattern: /lastError:|return "skipped"|return cancel\(/ },
    { mechanism: "Dead-row digest", scope: "Shared outbox summary; mail accepted/delivered and digest scheduler require fresh proof",
      files: ["server/services/email-outbox.service.ts", "server/services/email.service.ts"],
      pattern: /loadDeadEmailSummary|dead-letter|buildDeadEmailDigestSection|sendAdminDigestEmail/ },
  ];
  const rows = descriptors.map(row => ({ mechanism: row.mechanism, scope: row.scope,
    locations: row.files.flatMap(file => references(file, row.pattern)) }));
  writeFileSync(`${evidence}/shared-mechanisms.json`, JSON.stringify({ checkedAt, sha, rows }, null, 2));
}

function directSenders() {
  const families = [
    ["Vendor bulk", "sendEmail", "server/services/vendor-management.service.ts", "6"],
    ["Payment failed", "sendPaymentFailedEmail", "server/services/email.service.ts", "8"],
    ["Expired claim", "sendExpiredClaimEmail", "server/services/email.service.ts", "8"],
    ["Late-success refund notice", "sendLateSuccessRefundEmail", "server/services/email.service.ts", "8"],
    ["Booking cancellation / refund notice", "sendBookingCancellationWithRefundEmail", "server/services/email.service.ts", "8"],
    ["Booking decline notice", "sendBookingDeclineEmail", "server/services/email.service.ts", "8"],
    ["Plan delivered", "sendPlanDeliveredEmail", "server/services/email.service.ts", "8"],
    ["Plan approved", "sendPlanApprovedEmail", "server/services/email.service.ts", "8"],
    ["Plan changes requested", "sendPlanChangesRequestedEmail", "server/services/email.service.ts", "8"],
    ["New plan suggestion", "sendNewSuggestionEmail", "server/services/email.service.ts", "8"],
    ["Unused deprecated booking helper", "sendBookingConfirmationEmail", "server/services/email.service.ts", "8"],
  ];
  const files = walk("server").filter(file => file.endsWith(".ts") &&
    !/\/(__tests__|migrations|automations|seeds)\//.test(file));
  const content = files.map(file => ({ file, lines: readFileSync(file, "utf8").split("\n") }));
  const lines = ["# Commerce direct senders — current read-only inventory", "",
    `Source head: \`${sha}\`. Checked: ${checkedAt}.`,
    "Ten active families plus the unused helper. No sender has been moved.",
    "Part assignments below are proposals for the requested Part 6/8 handoff, not authorization to change a sender.", "",
    "| Family | Helper / transport definition | Current call references | Proposed Part |",
    "|---|---|---|---|"];
  for (const [label, method, definition, part] of families) {
    const definitionRows = content.find(entry => entry.file === definition)!.lines;
    const definitionLine = definitionRows.findIndex(line =>
      method === "sendEmail" ? line.includes("await sendEmail(") : line.includes(`function ${method}(`)) + 1;
    if (!definitionLine) throw new Error(`Missing sender definition: ${method}`);
    const calls = content.filter(entry => entry.file !== definition).flatMap(entry =>
      entry.lines.flatMap((line, index) => line.includes(`${method}(`) ?
        [`${entry.file}:${index + 1}`] : [])).slice(0, 10);
    lines.push(`| ${label} | ${definition}:${definitionLine} | ${method === "sendEmail" ?
      "Vendor transport call; trips.routes.ts owns the batch route" : calls.length ? calls.join("; ") : "No executable direct call found by this scan; bindings must also be inspected"} | ${part} |`);
  }
  lines.push("", "## Scope / protections",
    "- Verification, reset, identity/application messages and admin digests are outside this commerce list; they are still audited in the baseline.",
    "- The outbox's final generic transport is legitimate; do not classify every sendEmail reference as a bypass.",
    "- Canonical and legacy booking confirmations already use enqueueBookingConfirmationEmail. Do not reintroduce or duplicate either rail.",
    "- Keep payment/refund/payout behavior, notification claims and existing status guards unchanged in any future sender work.",
    "- Removing the unused helper requires separate deletion approval; this inventory grants none.",
    "- Historical reference on the preserved branch was rechecked for present function ownership; its old line numbers are not fresh evidence.");
  writeFileSync("reports/commerce-direct-senders.md", lines.join("\n") + "\n");
}

function schedulerInventory() {
  const file = "server/routes/internal.routes.ts";
  const source = readFileSync(file, "utf8").split("\n");
  const start = source.findIndex(line => line.includes("export const JOB_CADENCE"));
  const end = source.findIndex((line, index) => index > start && line.trim() === "];");
  if (start < 0 || end < start) throw new Error("Job roster layout changed");
  const jobs = source.slice(start, end).flatMap((line, index) => {
    const match = line.match(/\{\s*job:\s*"([^"]+)",\s*expectedIntervalSec:\s*([\d *]+),\s*bucket:\s*"([^"]+)"/);
    if (!match) return [];
    return [{ job: match[1], expectedIntervalSec: match[2].split("*").map(Number).reduce((a, b) => a * b, 1),
      bucket: match[3], source: `${file}:${start + index + 1}` }];
  });
  const registeredCron = nodes.filter(node => node.trigger.kind === "cron").map(node => ({
    id: node.id, trigger: node.trigger, owner: owner(node.id),
    evidenceStatus: "Requires source/heartbeat/Actions correlation; definition alone is UNKNOWN",
  }));
  writeFileSync(`${evidence}/scheduler-roster.json`, JSON.stringify({ checkedAt, sha, jobs, registeredCron }, null, 2));
}

function previewIsolation() {
  // No SQL execution. Exact retained DDL implementation is supplied for review.
  const file = "scripts/verification/run-messaging-gate.mjs";
  const source = readFileSync(file, "utf8").split("\n");
  const start = source.findIndex(line => line.includes('CREATE SCHEMA'));
  const end = source.findIndex((line, index) => index > start && line.includes("const isolatedPool"));
  if (start < 0 || end < start) throw new Error("Retained isolation implementation changed");
  writeFileSync(`${evidence}/isolated-test-schema-review.md`, [
    "# Retained temporary test-schema implementation — review only", "",
    "No DDL has been executed by this report generator.",
    "This is test isolation, not a migration or an application-schema alteration.",
    "However it does create/drop temporary tables, so the Part 1 no-schema-change boundary needs explicit clarification before use.",
    "", `Source: ${file}:${start + 1}–${end + 1}`, "", "```javascript",
    ...source.slice(start, end), "```", "",
    "Cleanup is the existing finally block: `DROP SCHEMA <verified nonce schema> CASCADE`.",
    "No public-table writes/copies, no production target, no production credentials, no migration registration.",
  ].join("\n") + "\n");
}

async function main() {
  if (process.argv.includes("--live-proof")) return liveMailerSanities();
  mkdirSync(evidence, { recursive: true });
  await inventory();
  await audit();
  directSenders();
  schedulerInventory();
  previewIsolation();
  // Validate paths only; inbox settings and recipient values are never printed.
  const reporter = await import(pathToFileURL(resolve("scripts/verification/automation-baseline-reporter.mjs")).href);
  const artifacts = ["reports/protected-automations.md", `${evidence}/protected-registry.json`,
    `${evidence}/shared-mechanisms.json`, `${evidence}/isolated-test-schema-review.md`];
  console.log(reporter.redact(JSON.stringify({ checkedAt, sha, count: nodes.length,
    artifacts: artifacts.map(file => relative(root, resolve(file))), runtimeWrites: 0, schemaWrites: 0 })));
}

main().catch(async error => {
  const reporter = await import(pathToFileURL(resolve("scripts/verification/automation-baseline-reporter.mjs")).href);
  console.error(reporter.redact(`Baseline test/report tool failed: ${String(error)}`));
  process.exitCode = 1;
});

async function liveMailerSanities() {
  const namespace = process.env.MESSAGING_VERIFICATION_SCHEMA ?? "";
  if (process.env.NODE_ENV !== "test" || !/^automation_msg_[a-f0-9]{16}$/.test(namespace) ||
      !process.env.AUTOMATION_BASELINE_LIVE_CONFIG) throw new Error("Guarded development fixture owner required");
  const { statSync } = await import("node:fs");
  const privatePath = process.env.AUTOMATION_BASELINE_LIVE_CONFIG;
  if ((statSync(privatePath).mode & 0o077) !== 0) throw new Error("QA config must be private");
  const settings = JSON.parse(readFileSync(privatePath, "utf8"));
  const monitored = settings.ITINERARY_OUTCOME_TEST_EMAIL;
  const welcomeInbox = settings.SIGNUP_QA_TEST_INBOX;
  if (![monitored, welcomeInbox].every(value => typeof value === "string" &&
      /^[^\s@<>\[\]]+@[^\s@<>\[\]]+\.[^\s@<>\[\]]+$/.test(value))) throw new Error("Approved inbox settings required");
  const reporter = await import(pathToFileURL(resolve("scripts/verification/automation-baseline-reporter.mjs")).href);
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    const original = console[method].bind(console);
    console[method] = (...values: unknown[]) => original(...values.map(value => reporter.redact(
      typeof value === "string" ? value : JSON.stringify(value))));
  }
  process.env.ITINERARY_OUTCOME_TEST_EMAIL = monitored;
  process.env.SIGNUP_QA_TEST_INBOX = welcomeInbox;
  // No production path receives this harness or its substitution.
  let recipient = "", destination = monitored, acceptedId: string | null = null;
  const actualFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname === "api.resend.com" && init?.method?.toUpperCase() === "POST" && url.pathname === "/emails") {
      const payload = JSON.parse(String(init.body));
      const targets = Array.isArray(payload.to) ? payload.to : [payload.to];
      if (!recipient || !targets.every((value: string) => value === recipient)) throw new Error("Non-fixture mail recipient refused");
      payload.to = [destination];
      const response = await actualFetch(input, { ...init, body: JSON.stringify(payload) });
      const body = await response.clone().json();
      if (response.ok && typeof body.id === "string") acceptedId = body.id;
      return response;
    }
    return actualFetch(input, init);
  };
  const { randomUUID, randomInt } = await import("node:crypto");
  const { db, pool } = await import("../../server/db");
  const { sql, eq } = await import("drizzle-orm");
  const schema = await import("../../shared/schema");
  const { persistGenerationOutcome } = await import("../../server/services/itinerary-generation-outcome.service");
  const { enqueueSignupWelcome } = await import("../../server/services/signup-welcome-outbox.service");
  const { deliverQueuedEmail, enqueueBookingConfirmationEmail } = await import("../../server/services/email-outbox.service");
  const { sendActivityEmail } = await import("../../server/services/activity-email.service");
  const { sendPasswordResetEmail, sendEmailVerificationEmail } = await import("../../server/services/email.service");
  const { ITINERARY_FOLLOWUPS } = await import("../../server/services/itinerary-followup-email");
  const { Resend } = await import("resend");
  const provider = new Resend(); // Existing provider SDK; reads its configured credential itself.
  const loop = process.env.AUTOMATION_BASELINE_LIVE_LOOP ?? "1";
  const proofPath = `${evidence}/mail-sanities-${loop}-${randomUUID()}.json`;
  const proofs: Record<string, unknown>[] = [];
  const awaitingReceipts: { proof: Record<string, unknown>; index: number; kind: string; startedAt: number }[] = [];
  const kinds = ["itinerary_ready", "itinerary_failed", ...ITINERARY_FOLLOWUPS.map(entry => entry.kind),
    "signup_welcome", "booking_canonical_payload", "booking_legacy_payload", "activity", "verification", "password_reset"];
  try {
    const scoped = await db.execute(sql`SELECT current_schema() AS namespace`);
    if (scoped.rows[0]?.namespace !== namespace) throw new Error("Fixture namespace mismatch");
    // Real-provider idempotency is account-wide, not schema-local. Do not let
    // fresh cloned counters reuse a previously delivered row's provider key.
    const ownership = await db.execute(sql`SELECT s.oid AS sequence_oid
      FROM pg_class s
      JOIN pg_namespace n ON n.oid=s.relnamespace
      JOIN pg_depend d ON d.objid=s.oid AND d.classid='pg_class'::regclass
      JOIN pg_class t ON t.oid=d.refobjid AND t.relnamespace=n.oid
      JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid
      WHERE n.nspname=${namespace} AND t.relname='email_outbox'
        AND a.attname='id' AND s.relkind='S' AND d.deptype IN ('a','i')`);
    const sequenceOid = Number(ownership.rows[0]?.sequence_oid);
    if (ownership.rows.length !== 1 || !Number.isSafeInteger(sequenceOid) ||
        sequenceOid <= 0 || sequenceOid > 0xffff_ffff) throw new Error("Only owned fixture sequences may be initialized");
    await db.execute(sql`SELECT setval(${sequenceOid}::oid::regclass, ${randomInt(1_000_000_000, 2_000_000_000)}, false)`);
    console.log("TAP version 13");
    for (const [index, kind] of kinds.entries()) {
      const caseStartedAt = Date.now();
      acceptedId = null;
      const userId = randomUUID(), comparisonId = randomUUID();
      recipient = kind === "signup_welcome" ? `${randomUUID()}@traveloure-qa.test` : monitored;
      destination = kind === "signup_welcome" ? welcomeInbox : monitored;
      let outboxId: number | null = null;
      let providerFixtureId: string | null = null;
      try {
        await db.insert(schema.users).values({ id: userId, email: recipient, firstName: "QA automation baseline",
          role: kind === "activity" ? "service_provider" : "traveler", emailVerified: new Date(),
          ...(kind === "signup_welcome" ? { termsAcceptedAt: new Date(), privacyAcceptedAt: new Date() } : {}),
          preferences: { itineraryMarketing: { enabled: true, timeZone: "UTC", quietStart: "20:00", quietEnd: "09:00" } } });
        if (kind.startsWith("itinerary_")) {
          const followup = ITINERARY_FOLLOWUPS.find(entry => entry.kind === kind);
          if (followup && (new Date().getUTCHours() < 9 || new Date().getUTCHours() >= 20)) {
            throw new Error("Marketing sanity must wait for the actual 09–20 UTC fixture window");
          }
          const readyAt = new Date(Date.now() - (followup?.hours ?? 0) * 3_600_000 - 30000);
          const startedAt = new Date(readyAt.getTime() - 1000);
          await db.insert(schema.itineraryComparisons).values({ id: comparisonId, userId,
            destination: `QA ONLY ${randomUUID()}`, status: "generating", updatedAt: startedAt, createdAt: startedAt });
          await db.transaction(tx => persistGenerationOutcome(tx, { comparisonId, startedAt,
            outcome: kind === "itinerary_failed" ? "failed" : "ready", now: readyAt, deliverImmediately: false }));
          const variantId = randomUUID();
          let bookableServiceId: string | null = null;
          if (followup) {
            providerFixtureId = randomUUID();
            bookableServiceId = randomUUID();
            await db.insert(schema.users).values({ id: providerFixtureId,
              email: `${providerFixtureId}@traveloure-qa.test`, firstName: "QA ONLY provider", role: "service_provider" });
            await db.insert(schema.providerServices).values({ id: bookableServiceId, userId: providerFixtureId,
              serviceName: "QA ONLY bookable mail fixture", status: "active", approvalStatus: "approved",
              deliveryMethod: "video", price: "99.00" });
          }
          await db.insert(schema.itineraryVariants).values({ id: variantId, comparisonId, name: "QA ONLY variant" });
          await db.insert(schema.itineraryVariantItems).values({ id: randomUUID(), variantId, dayNumber: 1,
            name: "QA ONLY stop", providerServiceId: bookableServiceId });
          const notices = await db.select().from(schema.emailOutbox).where(sql`
            ${schema.emailOutbox.metadata}->>'comparisonId' = ${comparisonId}
            OR ${schema.emailOutbox.metadata}->>'itineraryId' = ${comparisonId}`);
          const row = notices.find(row => row.emailType === kind);
          if (!row) throw new Error("Authoritative writer did not create requested outbox category");
          outboxId = row.id;
          // FAST sanity, not a claim of surviving a real 2h/24h/5d interval.
          await db.update(schema.emailOutbox).set({ retryAfter: new Date(Date.now() - 1000) }).where(eq(schema.emailOutbox.id, row.id));
          await deliverQueuedEmail(row.id);
        } else if (kind === "signup_welcome") {
          outboxId = await db.transaction(tx => enqueueSignupWelcome(tx, userId));
          await deliverQueuedEmail(outboxId);
        } else if (kind.startsWith("booking_")) {
          await enqueueBookingConfirmationEmail({ toEmail: recipient, userName: "QA automation baseline",
            bookingId: randomUUID(), bookingTitle: `QA ONLY ${kind}`, confirmationCode: `QA-${randomUUID()}` });
        } else if (kind === "activity") {
          await sendActivityEmail({ recipientId: userId, kind: "new_message", actorName: "QA ONLY",
            destination: "messages", throttleKey: randomUUID() });
        } else if (kind === "verification") {
          await sendEmailVerificationEmail({ toEmail: recipient, firstName: "QA ONLY",
            verifyUrl: `https://${process.env.REPLIT_DEV_DOMAIN}/verify-email?token=${randomUUID()}`, expiresInHours: 24 });
        } else {
          await sendPasswordResetEmail({ toEmail: recipient, firstName: "QA ONLY",
            resetUrl: `https://${process.env.REPLIT_DEV_DOMAIN}/reset-password?token=${randomUUID()}`, expiresInMinutes: 15 });
        }
        if (kind.startsWith("booking_")) {
          const [row] = await db.select().from(schema.emailOutbox)
            .where(sql`${schema.emailOutbox.toEmail} = ${recipient}
              AND ${schema.emailOutbox.emailType} = 'booking_confirmation'`).limit(1);
          if (!row) throw new Error("Shared booking helper did not create an outbox row");
          outboxId = row.id;
          if (row.status !== "sent") await deliverQueuedEmail(row.id);
        }
        const rows = await db.select().from(schema.emailOutbox).where(eq(schema.emailOutbox.toEmail, recipient));
        const sent = outboxId ? rows.find(row => row.id === outboxId) : rows.find(row => row.resendId === acceptedId);
        if (outboxId && (!sent || sent.status !== "sent")) throw new Error(
          `Authoritative outbox did not report sent: ${sent?.status ?? "missing"}; ${sent?.lastError ?? "no reason recorded"}`);
        outboxId = sent?.id ?? null;
        const providerId = sent?.resendId ?? acceptedId;
        if (!providerId) throw new Error("No genuine provider message identifier");
        const proof: Record<string, unknown> = { loop, kind, namespace, fixtureId: userId, outboxId, providerId,
          providerEvent: "receipt_not_confirmed", checkedAt: new Date().toISOString(),
          durationMs: Date.now() - caseStartedAt, mode: "FAST_MAILER_SANITY",
          scope: kind.startsWith("booking_") ? "Shared helper payload, NOT payment-writer or browser proof" :
            ["verification", "password_reset"].includes(kind) ? "Direct sender; NO authoritative outbox row or valid reset journey claimed" :
            "Existing dispatcher/mailer; NOT browser, inbox placement or real-clock certification" };
        proofs.push(proof);
        awaitingReceipts.push({ proof, index, kind, startedAt: caseStartedAt });
        writeFileSync(proofPath, JSON.stringify(proofs, null, 2));
        // Acceptance is never a PASS. Check the provider's delivered event
        // only after all allowed sends; otherwise waiting per message can
        // exhaust the retained three-minute fixture owner's deadline.
        await new Promise(resolve => setTimeout(resolve, 1200));
      } catch (error) {
        console.log(`not ok ${index + 1} - ${kind} mailer sanity`);
        console.log(`  ---\n  duration_ms: ${Date.now() - caseStartedAt}\n  ...`);
        console.log(`# ${reporter.redact(String(error))}`);
        process.exitCode = 1;
        break; // Never repeatedly send a failing scenario.
      } finally {
        await db.delete(schema.emailOutbox).where(eq(schema.emailOutbox.toEmail, recipient));
        await db.delete(schema.users).where(eq(schema.users.id, userId));
        if (providerFixtureId) await db.delete(schema.users).where(eq(schema.users.id, providerFixtureId));
      }
    }
    const deadline = Date.now() + 105_000;
    const delivered = ["delivered", "opened", "clicked"];
    const terminal = [...delivered, "bounced", "failed", "suppressed", "complained", "canceled"];
    while (Date.now() < deadline && awaitingReceipts.some(({ proof }) => !terminal.includes(String(proof.providerEvent)))) {
      for (const { proof } of awaitingReceipts) {
        if (Date.now() >= deadline) break;
        if (terminal.includes(String(proof.providerEvent))) continue;
        try {
          const response = await provider.emails.get(String(proof.providerId));
          if (response.error) proof.providerLookupError = response.error.name;
          else {
            proof.providerEvent = response.data!.last_event;
            delete proof.providerLookupError;
            proof.checkedAt = new Date().toISOString();
          }
        } catch (error) {
          proof.providerLookupError = error instanceof Error ? error.name : "Unknown lookup error";
        }
        writeFileSync(proofPath, JSON.stringify(proofs, null, 2));
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
    for (const { proof, index, kind, startedAt } of awaitingReceipts) {
      proof.durationMs = Date.now() - startedAt;
      if (delivered.includes(String(proof.providerEvent))) {
        console.log(`ok ${index + 1} - ${kind} provider-delivered mailer sanity`);
      } else {
        console.log(`not ok ${index + 1} - ${kind} provider delivery not confirmed`);
        console.log(`# Provider event: ${reporter.redact(String(proof.providerEvent))}`);
        process.exitCode = 1;
      }
      console.log(`  ---\n  duration_ms: ${proof.durationMs}\n  ...`);
    }
    writeFileSync(proofPath, JSON.stringify(proofs, null, 2));
    if (proofs.length !== kinds.length) process.exitCode = 1;
    console.log(`# Genuine receipt evidence: ${proofPath}`);
  } finally {
    globalThis.fetch = actualFetch;
    await pool.end();
  }
}
