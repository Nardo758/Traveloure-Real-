/**
 * Explicit development QA transport. NEVER imported by application senders.
 * Inbox substitution and provider credentials exist only in this parent.
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { redact } from "./automation-baseline-reporter.mjs";

export const families = ["cart_reminder_1h", "cart_reminder_1d", "cart_reminder_3d", "cart_item_changed"];
const uuid = /^[a-f0-9-]{36}$/;
const namespace = /^automation_msg_[a-f0-9]{16}$/;
const fail = code => { throw new Error(code); };
export function validateInvocation(env, args) {
  // Replit documents REPLIT_DEPLOYMENT as the published-runtime marker.
  // REPLIT_ENVIRONMENT can describe the platform even in a workspace shell.
  if (env.NODE_ENV !== "development" || env.REPLIT_DEPLOYMENT ||
      !env.REPLIT_DEV_DOMAIN || env.ENVIRONMENT === "production") fail("PRODUCTION_OR_UNKNOWN_ENVIRONMENT");
  if (env.COMMERCE_QA_DELIVERY_PROOF !== "1") fail("PROOF_OFF");
  if (!args.includes("--isolated-db") ||
      args.filter(arg => ["--deliver-qa", "--dry-run", "--real-clock-start", "--real-clock-sweep"].includes(arg)).length !== 1 ||
      new Set(args).size !== args.length ||
      args.some(arg => !["--isolated-db", "--deliver-qa", "--dry-run", "--item-copy-only", "--real-clock-start", "--real-clock-sweep"].includes(arg)) ||
      ((args.includes("--real-clock-start") || args.includes("--real-clock-sweep")) && args.includes("--item-copy-only"))) fail("EXPLICIT_PERMISSION_REQUIRED");
  if (!/^[a-f0-9]{32}$/.test(env.MESSAGING_DEV_FINGERPRINT ?? "")) fail("FINGERPRINT_REQUIRED");
}
export function validateEnvelope(request, context) {
  if (!context.armed) fail("TRANSPORT_OFF");
  if (!request || Object.keys(request).sort().join(",") !== "accountId,family,mode,outboxId,runId") fail("UNSUPPORTED_ENVELOPE");
  if (request.runId !== context.runId || !uuid.test(request.accountId ?? "") ||
      !Number.isSafeInteger(request.outboxId) || request.outboxId < 1) fail("IDENTITY_MISMATCH");
  if (!namespace.test(context.schema ?? "")) fail("UNOWNED_SCHEMA");
  const permittedFamilies = context.itemCopyOnly ? ["cart_item_changed"] : families;
  if (!permittedFamilies.includes(request.family) ||
      request.mode !== (request.family === "cart_item_changed" ? "template-only" : "guarded-reminder")) fail("UNSUPPORTED_PROOF");
  if (context.used >= (context.itemCopyOnly ? 1 : 4) || context.seen.has(request.family)) fail("BUDGET_OR_REPLAY");
}
export function validateOwnedRow(row, request) {
  if (!row || row.traveler_id !== request.accountId || row.email_type !== request.family ||
      row.to_email !== row.email || !/^[^@\s]+@traveloure-qa\.test$/i.test(row.email ?? "") ||
      row.is_deleted || row.is_suspended || !row.qa_fixture) fail("NOT_OWNED_QA_ACCOUNT");
  if (request.family === "cart_item_changed") {
    if (row.status !== "pending" || row.last_error !== "must_have_payment_ordering_unknown") fail("ITEM_HOLD_NOT_PRESERVED");
  } else if (row.status !== "processing" || row.preferences?.itineraryMarketing?.enabled !== true) {
    fail("REMINDER_NOT_GUARDED");
  }
}
const escape = value => String(value).replace(/[&<>"']/g, char =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

export function describeRecordedAvailability(item) {
  const integer = value => (typeof value === "number" ||
    (typeof value === "string" && /^\d+$/.test(value))) && Number.isSafeInteger(Number(value));
  if (!item?.slot_id || item.status !== "active" || item.slot_status !== "available" ||
      !integer(item.capacity) || !integer(item.booked_count) || !integer(item.quantity) ||
      Number(item.capacity) < 0 || Number(item.booked_count) < 0 || Number(item.quantity) <= 0) {
    return "availability for your cart quantity could not be verified";
  }
  return Number(item.capacity) - Number(item.booked_count) >= Number(item.quantity)
    ? "the recorded slot had capacity for your cart quantity"
    : "the recorded slot did not have capacity for your cart quantity";
}

export async function main(args = process.argv.slice(2), env = process.env) {
  validateInvocation(env, args);
  if (args.includes("--real-clock-sweep")) {
    const ledger = "reports/real-clock-ledger.md";
    const existing = fs.readFileSync(ledger, "utf8");
    const records = [...existing.matchAll(/```json\n([\s\S]*?)\n```/g)].map(match => JSON.parse(match[1]));
    const artifact = records.find(record => record.runId === "d5dcaccc-abdb-401a-b3ab-1a72d24ec98a");
    if (!artifact || !namespace.test(artifact.schema) || artifact.realTransport !== false ||
        artifact.providerCallsBlocked !== true) fail("APPROVED_RETAINED_SCENARIO_REQUIRED");
    const binding = { ...artifact, token: crypto.randomBytes(32).toString("hex"),
      loop: 1, port: 1, sweepOnly: true };
    let output = "";
    const owner = spawn(process.execPath, [
      "scripts/verification/run-messaging-gate.mjs", "--isolated-db",
      "--qa-proof-channel", "--real-clock-sweep",
      "server/routes/__tests__/commerce-real-clock-sweep.db.test.ts",
    ], { env: { ...env, COMMERCE_QA_PROOF_RUN_ID: JSON.stringify(binding) },
      stdio: ["ignore", "pipe", "pipe", "ipc"] });
    owner.stdout.on("data", bytes => { output += bytes.toString(); });
    owner.stderr.on("data", () => {});
    const code = await new Promise((resolve, reject) => {
      owner.once("error", reject); owner.once("exit", resolve);
    });
    let observation;
    for (const line of output.split("\n")) {
      const match = line.match(/COMMERCE_REAL_CLOCK_SWEEP=(\{.*\})$/);
      if (match) observation = JSON.parse(match[1]);
    }
    if (code !== 0 || observation?.runId !== artifact.runId ||
        observation.providerCallsBlocked !== true) fail("OWNED_NON_SENDING_SWEEP_FAILED");
    fs.writeFileSync(ledger, existing + `\n### Approved overdue non-sending sweep\n\n` +
      "Actual invocation only; no future scheduling, backdating, delivery or next-day certification.\n\n" +
      `\`\`\`json\n${JSON.stringify(observation, null, 2)}\n\`\`\`\n\n` +
      "**WAITING. NEXT-DAY PROVEN: NO. RELEASE HELD.**\n");
    console.log(JSON.stringify(observation));
    return observation;
  }
  if (args.includes("--real-clock-start")) {
    // No Resend import, HTTP handoff server, provider credential or real email.
    if (!env.SIGNUP_QA_TEST_INBOX || !env.ITINERARY_OUTCOME_TEST_EMAIL) fail("APPROVED_DEVELOPMENT_SETTINGS_REQUIRED");
    const runId = crypto.randomUUID();
    const binding = { runId, token: crypto.randomBytes(32).toString("hex"),
      loop: 1, port: 1, startOnly: true };
    let schema, record, output = "";
    const owner = spawn(process.execPath, [
      "scripts/verification/run-messaging-gate.mjs", "--isolated-db",
      "--qa-proof-channel", "--real-clock-start",
      "server/routes/__tests__/commerce-real-clock-start.db.test.ts",
    ], { env: { ...env, COMMERCE_QA_PROOF_RUN_ID: JSON.stringify(binding) },
      stdio: ["ignore", "pipe", "pipe", "ipc"] });
    owner.on("message", message => {
      if (message?.type === "commerce-proof-schema" && message.runId === runId &&
          namespace.test(message.schema)) schema = message.schema;
    });
    owner.stdout.on("data", bytes => { output += bytes.toString(); });
    // Do not echo child error stacks, SQL parameters or any inherited setting.
    owner.stderr.on("data", () => {});
    const code = await new Promise((resolve, reject) => {
      owner.once("error", reject); owner.once("exit", resolve);
    });
    for (const line of output.split("\n")) {
      const match = line.match(/COMMERCE_REAL_CLOCK_START=(\{.*\})$/);
      if (match) record = JSON.parse(match[1]);
    }
    if (code !== 0 || !schema || record?.runId !== runId || !record?.providerCallsBlocked) {
      fs.writeFileSync("reports/automation-part10-evidence/real-clock-start-failure.log", redact(output));
      fail("REAL_CLOCK_START_FAILED");
    }
    const artifact = { ...record, schema, status: "WAITING", realTransport: false,
      inboxSetting: "SIGNUP_QA_TEST_INBOX", productionBlocked: true, releaseCertified: false };
    const ledger = "reports/real-clock-ledger.md";
    const existing = fs.readFileSync(ledger, "utf8");
    const section = `\n## Genuine scenario ${runId}\n\nStatus: **WAITING**. NEXT-DAY PROVEN: **NO**.\n\n` +
      `\`\`\`json\n${JSON.stringify(artifact, null, 2)}\n\`\`\`\n\n` +
      "Retained owned development fixture; no provider initialized, email sent, or job scheduled.\n" +
      "Check live cart/sequence/account/recipient/consent/timezone, readable payment rails and UNKNOWN holds, " +
      "quiet hours, daily cap, actual preceding 1h delivery history and a matching delivered receipt after the real 1d due time. " +
      "The preceding step is NOT fabricated; future delivery needs separate authorization.\n";
    fs.writeFileSync(ledger, existing + section);
    console.log(JSON.stringify(artifact));
    return artifact;
  }
  const dry = args.includes("--dry-run");
  const itemCopyOnly = args.includes("--item-copy-only"), expectedPerLoop = itemCopyOnly ? 1 : 4;
  if (!dry && (![env.SIGNUP_QA_TEST_INBOX, env.ITINERARY_OUTCOME_TEST_EMAIL]
    .every(value => typeof value === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) &&
      !/@(?:.*\.)?(?:resend\.dev|example\.(?:com|org|net))$|\.(?:test|invalid|example)$/i.test(value)) ||
    !env.RESEND_API_KEY || !(env.EMAIL_FROM_NOREPLY || env.EMAIL_FROM))) fail("APPROVED_DEVELOPMENT_SETTINGS_REQUIRED");
  const dir = "reports/automation-part9-evidence";
  fs.mkdirSync(dir, { recursive: true });
  // An uncertain acceptance is never retried by silently generating a new key.
  if (!dry) for (const file of fs.readdirSync(dir).filter(file => /^proof-.*\.json$/.test(file))) {
    const prior = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    if (prior.realTransport && prior.receipts.some(row => ["submit_intent", "uncertain"].includes(row.phase))) {
      fail("UNCERTAIN_PRIOR_PROOF_REQUIRES_RECONCILIATION");
    }
  }
  const runId = crypto.randomUUID(), token = crypto.randomBytes(32).toString("hex");
  const evidence = { runId, realTransport: !dry, itemCopyOnly, authorizedMessageBudget: expectedPerLoop * 2, productionBlocked: true,
    allRailProof: false, itemDispatcherStillBlocked: true, loops: [], receipts: [], rejected: 0 };
  const journal = path.join(dir, `proof-${runId}.json`);
  const save = () => fs.writeFileSync(journal, JSON.stringify(evidence, null, 2), { mode: 0o600 });
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 2 });
  let sdk, active, owner, interrupted = false;
  if (!dry) { const { Resend } = await import("resend"); sdk = new Resend(env.RESEND_API_KEY); }
  const stop = () => {
    interrupted = true;
    if (owner?.pid) owner.kill("SIGTERM");
  };
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
  const server = http.createServer(async (req, res) => {
    const reply = (status, body) => { if (!res.destroyed) {
      res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body));
    } };
    try {
      if (interrupted || req.method !== "POST" || req.url !== "/proof" || req.headers.origin ||
          req.headers.authorization !== `Bearer ${token}`) fail("CHANNEL_REJECTED");
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 4096) fail("OVERSIZED_ENVELOPE");
      }
      const request = JSON.parse(body);
      validateEnvelope(request, { ...active, runId, armed: !!active && !interrupted });
      const s = active.schema;
      const result = await pool.query(`SELECT e.*, u.email, u.is_deleted, u.is_suspended, u.preferences,
        e.metadata->>'travelerId' AS traveler_id,
        (u.preferences->>'commerceQaProofRun')=$3 AS qa_fixture
        FROM "${s}".email_outbox e JOIN "${s}".users u ON u.id=$2
        WHERE e.id=$1`, [request.outboxId, request.accountId, runId]);
      const row = result.rows[0];
      validateOwnedRow(row, request);
      // Revalidate after awaited database I/O: concurrent submissions cannot both reserve.
      validateEnvelope(request, { ...active, runId, armed: !interrupted });
      active.used++; active.seen.add(request.family);
      const receipt = { loop: active.loop, family: request.family, outboxRowId: request.outboxId,
        proofLevel: request.mode, phase: "submit_intent", submittedAt: new Date().toISOString(),
        providerMessageId: null, deliveryStatus: "not_observed" };
      evidence.receipts.push(receipt); save();
      let html = row.html, text = row.text_body ?? "";
      const banner = "DEVELOPMENT QA PROOF — not a real booking or release certification.";
      if (request.family === "cart_item_changed") {
        const catalog = await pool.query(`SELECT p.service_name, p.price::text,
          p.status, c.quantity, c.slot_id, slot.capacity, slot.booked_count,
          slot.status AS slot_status, clock_timestamp() AS checked_at
          FROM "${s}".cart_items c JOIN "${s}".provider_services p ON p.id=c.service_id
          LEFT JOIN "${s}".vendor_availability_slots slot ON slot.id=c.slot_id AND slot.service_id=p.id
          WHERE c.id::text=$1 AND c.user_id=$2`, [row.metadata.cartItemId, request.accountId]);
        if (catalog.rows.length !== 1) fail("MISSING_LIVE_QA_CATALOG");
        const item = catalog.rows[0], checkedAt = new Date(item.checked_at).toISOString();
        const recordedAvailability = describeRecordedAvailability(item);
        if (itemCopyOnly) {
          if (active.loop === 1 && (item.slot_id || Number(item.price) !== 12)) fail("WRONG_COPY_SCENARIO");
          if (active.loop === 2 && (Number(item.price) !== 10 ||
              recordedAvailability !== "the recorded slot did not have capacity for your cart quantity")) fail("WRONG_COPY_SCENARIO");
          receipt.copyScenario = active.loop === 1 ? "price_change_unknown_stock" : "availability_loss";
        }
        const wording = `When we checked at ${checkedAt} UTC, ${item.service_name} was priced at ${item.price} USD and ${recordedAvailability}. Price and availability may change before you book. Review the current details in your cart.`;
        // QA copy only: do not append the unqualified production-template stock claim.
        html = `<p>${escape(wording)}</p>`;
        text = wording;
        receipt.checkedAt = checkedAt; receipt.copyOnly = true; receipt.recordedAvailability = recordedAvailability;
      }
      const destination = request.family === "cart_reminder_1h" || request.family === "cart_reminder_1d"
        ? env.SIGNUP_QA_TEST_INBOX : env.ITINERARY_OUTCOME_TEST_EMAIL;
      const payload = { from: env.EMAIL_FROM_NOREPLY || env.EMAIL_FROM, to: destination,
        subject: `[QA proof: ${request.family}] ${row.subject}`,
        html: `<p>${banner}</p>${html}`, text: `${banner}\n${text}` };
      let resultSend, timeout;
      try {
        resultSend = dry ? { data: { id: `synthetic_${crypto.randomUUID()}` } }
          : await Promise.race([
            sdk.emails.send(payload, { idempotencyKey: `commerce-qa:${runId}:${active.loop}:${request.family}` }),
            new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("PROVIDER_TIMEOUT")), 20_000); }),
          ]);
      } catch {
        receipt.phase = "uncertain"; interrupted = true; save(); fail("UNCERTAIN_ACCEPTANCE_STOP");
      } finally { clearTimeout(timeout); }
      if (resultSend.error || !resultSend.data?.id) {
        receipt.phase = "provider_rejected"; interrupted = true; save(); fail("PROVIDER_REJECTED");
      }
      receipt.providerMessageId = resultSend.data.id; receipt.phase = "accepted"; save();
      reply(200, { ok: true, id: receipt.providerMessageId });
    } catch {
      evidence.rejected++; save(); reply(403, { ok: false, error: "QA_PROOF_REJECTED" });
    }
  });
  server.maxHeadersCount = 16;
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  save();
  try {
    for (let loop = 1; loop <= 2; loop++) {
      if (interrupted) fail("INTERRUPTED");
      active = { loop, schema: null, used: 0, seen: new Set(), itemCopyOnly };
      const binding = { runId, loop, token, port: server.address().port, itemCopyOnly };
      let log = "";
      const exit = await new Promise((resolve, reject) => {
        owner = spawn(process.execPath, ["scripts/verification/run-messaging-gate.mjs",
          "--isolated-db", "--qa-proof-channel", "server/routes/__tests__/commerce-real-delivery-proof.db.test.ts"], {
          env: { ...env, COMMERCE_QA_PROOF_RUN_ID: JSON.stringify(binding) },
          stdio: ["ignore", "pipe", "pipe", "ipc"],
        });
        owner.on("message", message => {
          if (message?.type === "commerce-proof-schema" && message.runId === runId &&
              namespace.test(message.schema)) active.schema = message.schema;
        });
        owner.stdout.on("data", data => { log += data; });
        owner.stderr.on("data", data => { log += data; });
        owner.once("error", reject); owner.once("exit", code => resolve(code ?? 1));
      });
      const clean = exit === 0 && log.includes("ISOLATED_SCHEMA_REMOVED=true") && active.used === expectedPerLoop;
      fs.writeFileSync(path.join(dir, `${runId}-loop-${loop}.log`), redact(log));
      evidence.loops.push({ loop, exit, isolationRemoved: log.includes("ISOLATED_SCHEMA_REMOVED=true"),
        expectedSubmissions: expectedPerLoop, ownedSubmissions: active.used,
        authorizedSubmissionsComplete: active.used === expectedPerLoop, fixtureProofClean: clean }); save();
      active = null;
      if (!clean) fail("FIXTURE_OR_CLEANUP_FAILED");
      if (!dry) {
        const deadline = Date.now() + 120_000;
        while (Date.now() < deadline && evidence.receipts.filter(r => r.loop === loop).some(r => r.deliveryStatus !== "delivered")) {
          for (const receipt of evidence.receipts.filter(r => r.loop === loop && r.deliveryStatus !== "delivered")) {
            try {
              const response = await sdk.emails.get(receipt.providerMessageId);
              if (!response.error && response.data?.id === receipt.providerMessageId &&
                  response.data.last_event === "delivered") {
                receipt.deliveryStatus = "delivered"; receipt.deliveredObservedAt = new Date().toISOString(); save();
              }
            } catch { /* no raw provider error/body logging; cannot certify unknown delivery */ }
            await new Promise(resolve => setTimeout(resolve, 600));
          }
          await new Promise(resolve => setTimeout(resolve, 3_000));
        }
        if (evidence.receipts.filter(r => r.loop === loop).some(r => r.deliveryStatus !== "delivered")) {
          fail("PROVIDER_DELIVERY_EVIDENCE_MISSING");
        }
      } else {
        for (const receipt of evidence.receipts.filter(r => r.loop === loop)) receipt.deliveryStatus = "synthetic_only";
        save();
      }
      console.log(JSON.stringify({ loop, fixtureProofClean: true, delivered: dry ? 0 : expectedPerLoop, realTransport: !dry }));
    }
  } finally {
    active = null; interrupted = true;
    if (owner?.exitCode === null) { owner.kill("SIGTERM"); await new Promise(resolve => owner.once("exit", resolve)); }
    await new Promise(resolve => server.close(resolve));
    await pool.end(); save();
    process.removeListener("SIGTERM", stop); process.removeListener("SIGINT", stop);
    delete env.COMMERCE_QA_DELIVERY_PROOF; delete env.COMMERCE_QA_PROOF_RUN_ID;
  }
  console.log(JSON.stringify({ evidence: journal, loops: 2, realDelivered: dry ? 0 : expectedPerLoop * 2,
    itemProof: "template-only; actual dispatcher still held", releaseCertified: false }));
  return evidence;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(() => { console.error("QA proof stopped; inspect sanitized journal. No release authorization."); process.exitCode = 1; });
}
