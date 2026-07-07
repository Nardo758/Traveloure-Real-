/**
 * Nightly QA Job
 *
 * Runs all 20 automated QA checks (same set as GET /api/admin/qa/verify),
 * saves a snapshot to qa_run_snapshots, computes a diff against the
 * previous run, and emails all admin users the results.
 *
 * Triggered two ways:
 *   1. Automatically at ~02:00 UTC each night via the scheduler in server/index.ts
 *   2. On-demand via POST /api/admin/qa/run-nightly
 */

import { db } from "../db";
import { qaRunSnapshots, users } from "@shared/schema";
import { eq, desc, ne } from "drizzle-orm";
import { sendEmail } from "../services/email.service";
import { runQAVerify, type QAResults } from "../services/qa-verify.service";

export interface NightlyQAResult {
  snapshotId: string;
  passCount: number;
  failCount: number;
  totalCount: number;
  newFailures: string[];
  newPasses: string[];
  ranAt: string;
}

function buildDiff(
  prev: QAResults,
  curr: QAResults
): { newFailures: string[]; newPasses: string[] } {
  const newFailures: string[] = [];
  const newPasses: string[] = [];

  for (const id of Object.keys(curr)) {
    const prevPass = prev[id]?.pass;
    const currPass = curr[id]?.pass;

    if (prevPass === true && currPass === false) {
      newFailures.push(id);
    } else if (prevPass === false && currPass === true) {
      newPasses.push(id);
    }
  }

  return { newFailures, newPasses };
}

function buildEmailHtml(params: {
  passCount: number;
  failCount: number;
  totalCount: number;
  newFailures: string[];
  newPasses: string[];
  results: QAResults;
  ranAt: string;
  dashboardUrl: string;
  isPreviousRunMissing: boolean;
}): { html: string; text: string } {
  const { passCount, failCount, totalCount, newFailures, newPasses, results, ranAt, dashboardUrl, isPreviousRunMissing } = params;

  const statusEmoji = failCount === 0 ? "✅" : "❌";
  const overallLabel = failCount === 0 ? "ALL PASSING" : `${failCount} FAILING`;

  const failureRows = Object.entries(results)
    .filter(([, r]) => !r.pass)
    .map(([id, r]) => {
      const isNew = newFailures.includes(id);
      return `<tr style="background:${isNew ? "rgba(220,38,38,0.06)" : "transparent"}">
        <td style="padding:4px 8px;font-family:monospace;font-size:12px;color:#DC2626">${id}</td>
        <td style="padding:4px 8px;font-size:12px">${r.detail}</td>
        <td style="padding:4px 8px;font-size:11px;color:${isNew ? "#DC2626" : "#9CA3AF"}">${isNew ? "🆕 NEW" : "persisting"}</td>
      </tr>`;
    })
    .join("");

  const newPassRows = newPasses
    .map(id => `<tr>
      <td style="padding:4px 8px;font-family:monospace;font-size:12px;color:#16A34A">${id}</td>
      <td style="padding:4px 8px;font-size:12px">${results[id]?.detail ?? ""}</td>
    </tr>`)
    .join("");

  const html = `
<div style="font-family:sans-serif;max-width:640px;margin:0 auto;color:#1A1A18">
  <h2 style="margin:0 0 4px">${statusEmoji} Traveloure — Nightly QA Report</h2>
  <p style="color:#7A7A72;font-size:13px;margin:0 0 20px">${new Date(ranAt).toUTCString()}</p>

  <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">
    <div style="padding:12px 20px;background:#F0FDF4;border-radius:8px;border:1px solid #BBF7D0;text-align:center">
      <div style="font-size:24px;font-weight:700;color:#16A34A">${passCount}</div>
      <div style="font-size:11px;color:#16A34A;font-weight:600">PASS</div>
    </div>
    <div style="padding:12px 20px;background:${failCount > 0 ? "#FEF2F2" : "#F9FAFB"};border-radius:8px;border:1px solid ${failCount > 0 ? "#FECACA" : "#E5E7EB"};text-align:center">
      <div style="font-size:24px;font-weight:700;color:${failCount > 0 ? "#DC2626" : "#9CA3AF"}">${failCount}</div>
      <div style="font-size:11px;color:${failCount > 0 ? "#DC2626" : "#9CA3AF"};font-weight:600">FAIL</div>
    </div>
    <div style="padding:12px 20px;background:#F9FAFB;border-radius:8px;border:1px solid #E5E7EB;text-align:center">
      <div style="font-size:24px;font-weight:700;color:#374151">${totalCount}</div>
      <div style="font-size:11px;color:#6B7280;font-weight:600">TOTAL</div>
    </div>
  </div>

  ${isPreviousRunMissing ? `<p style="font-size:12px;color:#9CA3AF;font-style:italic">No previous run found — this is the baseline snapshot.</p>` : ""}

  ${newFailures.length > 0 ? `
  <h3 style="color:#DC2626;font-size:14px;margin:0 0 8px">🆕 New Failures (${newFailures.length}) — These passed last night</h3>
  <table style="border-collapse:collapse;width:100%;margin-bottom:16px;font-size:13px;background:#FEF2F2;border-radius:6px;overflow:hidden">
    <thead><tr style="background:#FEE2E2">
      <th style="padding:6px 8px;text-align:left;font-size:11px">Check</th>
      <th style="padding:6px 8px;text-align:left;font-size:11px">Detail</th>
    </tr></thead>
    <tbody>${newFailures.map(id => `<tr>
      <td style="padding:4px 8px;font-family:monospace;font-size:12px;color:#DC2626">${id}</td>
      <td style="padding:4px 8px;font-size:12px">${results[id]?.detail ?? ""}</td>
    </tr>`).join("")}</tbody>
  </table>
  ` : ""}

  ${newPasses.length > 0 ? `
  <h3 style="color:#16A34A;font-size:14px;margin:0 0 8px">✅ Newly Passing (${newPasses.length}) — These failed last night</h3>
  <table style="border-collapse:collapse;width:100%;margin-bottom:16px;font-size:13px;background:#F0FDF4;border-radius:6px;overflow:hidden">
    <thead><tr style="background:#DCFCE7">
      <th style="padding:6px 8px;text-align:left;font-size:11px">Check</th>
      <th style="padding:6px 8px;text-align:left;font-size:11px">Detail</th>
    </tr></thead>
    <tbody>${newPassRows}</tbody>
  </table>
  ` : ""}

  ${failureRows ? `
  <h3 style="color:#374151;font-size:14px;margin:0 0 8px">All Current Failures</h3>
  <table style="border-collapse:collapse;width:100%;margin-bottom:16px;font-size:13px">
    <thead><tr style="background:#F3F4F6">
      <th style="padding:6px 8px;text-align:left;font-size:11px">Check</th>
      <th style="padding:6px 8px;text-align:left;font-size:11px">Detail</th>
      <th style="padding:6px 8px;text-align:left;font-size:11px">Status</th>
    </tr></thead>
    <tbody>${failureRows}</tbody>
  </table>
  ` : `<p style="color:#16A34A;font-weight:600">🎉 All ${totalCount} checks are passing!</p>`}

  <p style="margin-top:24px">
    <a href="${dashboardUrl}/admin/qa-checklist" style="background:#E85D55;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">
      Open QA Checklist →
    </a>
  </p>
</div>`;

  let text = `TRAVELOURE — Nightly QA Report\n`;
  text += `${new Date(ranAt).toUTCString()}\n`;
  text += `================================\n`;
  text += `${statusEmoji} ${overallLabel} — ${passCount}/${totalCount} passing\n\n`;
  if (isPreviousRunMissing) text += `(No previous run — baseline snapshot created)\n\n`;
  if (newFailures.length > 0) {
    text += `NEW FAILURES (${newFailures.length}):\n`;
    newFailures.forEach(id => { text += `  ✗ [${id}] ${results[id]?.detail}\n`; });
    text += "\n";
  }
  if (newPasses.length > 0) {
    text += `NEWLY PASSING (${newPasses.length}):\n`;
    newPasses.forEach(id => { text += `  ✓ [${id}] ${results[id]?.detail}\n`; });
    text += "\n";
  }
  if (failCount > 0) {
    text += `ALL CURRENT FAILURES:\n`;
    Object.entries(results).filter(([, r]) => !r.pass).forEach(([id, r]) => {
      text += `  ✗ [${id}] ${r.detail}\n`;
    });
    text += "\n";
  }
  text += `View QA checklist: ${dashboardUrl}/admin/qa-checklist`;

  return { html, text };
}

export async function runNightlyQA(triggeredBy: "scheduled" | "manual" = "scheduled"): Promise<NightlyQAResult> {
  const ranAt = new Date().toISOString();
  console.log(`[NightlyQA] Starting run (triggered_by=${triggeredBy})`);

  try {
    // ── 1. Run all checks ───────────────────────────────────────────────────
    const summary = await runQAVerify();

    // ── 2. Fetch the previous snapshot for diffing ──────────────────────────
    const prevRows = await db
      .select()
      .from(qaRunSnapshots)
      .orderBy(desc(qaRunSnapshots.ranAt))
      .limit(1);

    const prevSnapshot = prevRows[0] ?? null;
    const prevResults: QAResults = (prevSnapshot?.results as QAResults) ?? {};
    const isPreviousRunMissing = !prevSnapshot;

    const { newFailures, newPasses } = buildDiff(prevResults, summary.results);

    // ── 3. Save snapshot ─────────────────────────────────────────────────────
    const [inserted] = await db
      .insert(qaRunSnapshots)
      .values({
        ranAt: new Date(),
        triggeredBy,
        results: summary.results as any,
        passCount: summary.passCount,
        failCount: summary.failCount,
        partialCount: 0,
        totalCount: summary.totalCount,
      })
      .returning();

    console.log(
      `[NightlyQA] Snapshot saved — id=${inserted.id} pass=${summary.passCount} fail=${summary.failCount} newFail=${newFailures.length} newPass=${newPasses.length}`
    );

    // ── 4. Collect recipient list: all admin users + ADMIN_EMAIL fallback ────
    const adminRows = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.role, "admin"));

    const recipientSet = new Set<string>(
      adminRows.map(r => r.email).filter(Boolean) as string[]
    );

    const envEmail = process.env.ADMIN_EMAIL;
    if (envEmail) recipientSet.add(envEmail);

    if (recipientSet.size === 0) {
      console.warn("[NightlyQA] No admin recipients found (no admin users in DB and ADMIN_EMAIL not set) — skipping email");
    } else {
      const recipients = Array.from(recipientSet);
      const baseUrl =
        process.env.REPLIT_DOMAINS
          ? `https://${process.env.REPLIT_DOMAINS.split(",")[0].trim()}`
          : "https://traveloure.replit.app";

      const { html, text } = buildEmailHtml({
        passCount: summary.passCount,
        failCount: summary.failCount,
        totalCount: summary.totalCount,
        newFailures,
        newPasses,
        results: summary.results,
        ranAt: summary.checkedAt,
        dashboardUrl: baseUrl,
        isPreviousRunMissing,
      });

      const statusLabel = summary.failCount === 0 ? "✅ ALL PASSING" : `❌ ${summary.failCount} FAILING`;
      const diffLabel = newFailures.length > 0 ? `, ${newFailures.length} new failure(s)` : newPasses.length > 0 ? `, ${newPasses.length} newly fixed` : "";
      const subject = `Traveloure QA — ${statusLabel} (${summary.passCount}/${summary.totalCount})${diffLabel}`;

      // Send to each recipient (Resend supports array but keep per-recipient for audit clarity)
      const sendResults = await Promise.allSettled(
        recipients.map(to => sendEmail({ to, subject, html, text }))
      );

      const sent = sendResults.filter(r => r.status === "fulfilled" && (r as any).value?.ok).length;
      const failed = sendResults.length - sent;
      console.log(`[NightlyQA] Email sent to ${sent}/${recipients.length} admin(s)${failed > 0 ? ` (${failed} failed)` : ""}`);
      sendResults.forEach((r, i) => {
        if (r.status === "rejected") console.error(`[NightlyQA] Email to ${recipients[i]} rejected:`, r.reason);
        else if (!(r as any).value?.ok) console.error(`[NightlyQA] Email to ${recipients[i]} failed:`, (r as any).value?.error);
      });
    }

    return {
      snapshotId: inserted.id,
      passCount: summary.passCount,
      failCount: summary.failCount,
      totalCount: summary.totalCount,
      newFailures,
      newPasses,
      ranAt: summary.checkedAt,
    };
  } catch (err: any) {
    console.error("[NightlyQA] Fatal error:", err);
    throw err;
  }
}
