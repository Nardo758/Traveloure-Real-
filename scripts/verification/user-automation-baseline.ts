/**
 * Part 1 READ-ONLY inspection tool. Not imported by the application.
 * Writes only the approved new report paths; never fires jobs or writers.
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

main().catch(() => {
  console.error("Read-only inventory failed; no raw exception or recipient values printed.");
  process.exitCode = 1;
});
