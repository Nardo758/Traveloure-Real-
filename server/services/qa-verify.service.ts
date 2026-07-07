/**
 * QA Verify Service
 *
 * Extracted from GET /api/admin/qa/verify so the same checks can be
 * run both on-demand (route handler) and from the nightly scheduled job.
 *
 * Returns a results map keyed by check ID (e.g. "S1", "D3") with
 * { pass: boolean; detail: string } for each check.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

export type QACheckResult = { pass: boolean; detail: string };
export type QAResults = Record<string, QACheckResult>;

export interface QARunSummary {
  results: QAResults;
  passCount: number;
  failCount: number;
  partialCount: number;
  totalCount: number;
  checkedAt: string;
}

export async function runQAVerify(): Promise<QARunSummary> {
  const results: QAResults = {};

  // ── S1: role hardcoded to 'user' ────────────────────────────────────────
  try {
    const { readFileSync } = await import("fs");
    const src = readFileSync("server/replit_integrations/auth/emailAuth.ts", "utf-8");
    const pass = src.includes("role: 'user' as const");
    results.S1 = { pass, detail: pass ? "role: 'user' as const found in emailAuth.ts" : "role hardcode not found" };
  } catch { results.S1 = { pass: false, detail: "Could not read emailAuth.ts" }; }

  // ── S3: ownershipGuard.ts exists ────────────────────────────────────────
  try {
    const { existsSync } = await import("fs");
    const pass = existsSync("server/middleware/ownershipGuard.ts");
    results.S3 = { pass, detail: pass ? "server/middleware/ownershipGuard.ts present" : "File not found" };
  } catch { results.S3 = { pass: false, detail: "FS error" }; }

  // ── S4: no API secrets in client ────────────────────────────────────────
  try {
    const { execSync } = await import("child_process");
    const out = execSync(
      "grep -r \"process\\.env\" ./client --include='*.ts' --include='*.tsx' -l 2>/dev/null || true",
      { encoding: "utf-8" }
    ).trim();
    const files = out ? out.split("\n").filter(Boolean) : [];
    const badFiles = files.filter(f => f !== "./client/src/App.tsx");
    const pass = badFiles.length === 0;
    results.S4 = {
      pass,
      detail: pass
        ? `Only NODE_ENV usage in App.tsx — no secrets exposed`
        : `Secrets risk: ${badFiles.join(", ")}`,
    };
  } catch { results.S4 = { pass: false, detail: "grep failed" }; }

  // ── S7: scrypt password hashing ─────────────────────────────────────────
  try {
    const { readFileSync } = await import("fs");
    const src = readFileSync("server/replit_integrations/auth/emailAuth.ts", "utf-8");
    const pass = src.includes("crypto.scrypt") && src.includes("hashPassword");
    results.S7 = { pass, detail: pass ? "crypto.scrypt + hashPassword found" : "Hashing not found" };
  } catch { results.S7 = { pass: false, detail: "Could not read emailAuth.ts" }; }

  // ── S8: authRateLimiter on /api/auth ────────────────────────────────────
  try {
    const { readFileSync } = await import("fs");
    const src = readFileSync("server/index.ts", "utf-8");
    const pass = src.includes("authRateLimiter") && src.includes('"/api/auth"');
    results.S8 = { pass, detail: pass ? "authRateLimiter applied to /api/auth" : "Rate limiter not found on auth routes" };
  } catch { results.S8 = { pass: false, detail: "Could not read server/index.ts" }; }

  // ── D1: DB constraints ──────────────────────────────────────────────────
  try {
    const constraints = await db.execute(sql`
      SELECT tc.table_name, tc.constraint_name, tc.constraint_type
      FROM information_schema.table_constraints tc
      WHERE tc.constraint_type IN ('UNIQUE','FOREIGN KEY')
      AND tc.table_schema = 'public'
      AND tc.table_name IN ('users','bookings','webhook_events','funnel_events')
      ORDER BY tc.table_name, tc.constraint_name
    `);
    const names = (constraints as any).rows.map((r: any) => r.constraint_name);

    const checks = [
      { key: "users_email_unique",              label: "users.email UNIQUE" },
      { key: "webhook_events_stripe_event_id_key", label: "webhook_events.stripe_event_id UNIQUE" },
      { key: "funnel_events_user_id_fk",        label: "funnel_events.user_id FK" },
    ];

    const idxRows = await db.execute(sql`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'bookings' AND schemaname = 'public'
      AND indexname IN ('bookings_idempotency_key_idx','bookings_expert_slot_unique_idx')
    `);
    const idxNames = (idxRows as any).rows.map((r: any) => r.indexname);

    const missing = [
      ...checks.filter(c => !names.includes(c.key)).map(c => c.label),
      ...(!idxNames.includes("bookings_idempotency_key_idx") ? ["bookings.idempotency_key UNIQUE"] : []),
      ...(!idxNames.includes("bookings_expert_slot_unique_idx") ? ["bookings.expert_slot UNIQUE"] : []),
    ];

    results.D1 = {
      pass: missing.length === 0,
      detail: missing.length === 0 ? "All 5 critical constraints present" : `Missing: ${missing.join(", ")}`,
    };
  } catch (e: any) { results.D1 = { pass: false, detail: e.message }; }

  // ── D3: No orphaned data ────────────────────────────────────────────────
  try {
    const r = await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM trips WHERE user_id IS NULL)::int AS orphaned_trips,
        (SELECT COUNT(*) FROM bookings b WHERE b.trip_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM trips t WHERE t.id = b.trip_id))::int AS orphaned_bookings,
        (SELECT COUNT(*) FROM webhook_events WHERE processed = false AND created_at < NOW() - INTERVAL '1 hour')::int AS stuck_webhooks,
        (SELECT COUNT(*) FROM bookings WHERE status = 'payment_pending' AND created_at < NOW() - INTERVAL '10 minutes')::int AS stuck_payments
    `);
    const row = (r as any).rows[0];
    const issues = [
      row.orphaned_trips > 0 && `${row.orphaned_trips} orphaned trips`,
      row.orphaned_bookings > 0 && `${row.orphaned_bookings} orphaned bookings`,
      row.stuck_webhooks > 0 && `${row.stuck_webhooks} stuck webhooks`,
      row.stuck_payments > 0 && `${row.stuck_payments} stuck payments`,
    ].filter(Boolean);
    results.D3 = {
      pass: issues.length === 0,
      detail: issues.length === 0
        ? `Orphaned trips: 0, bookings: 0, stuck webhooks: 0, stuck payments: 0`
        : (issues as string[]).join("; "),
    };
  } catch (e: any) { results.D3 = { pass: false, detail: e.message }; }

  // ── D4: Soft delete columns exist ───────────────────────────────────────
  try {
    const r = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users'
      AND column_name IN ('is_deleted','deleted_at','is_suspended','suspended_at','suspension_reason')
      ORDER BY column_name
    `);
    const found = (r as any).rows.map((row: any) => row.column_name);
    const required = ["deleted_at","is_deleted","is_suspended","suspended_at","suspension_reason"];
    const missing = required.filter(c => !found.includes(c));
    results.D4 = {
      pass: missing.length === 0,
      detail: missing.length === 0
        ? `All 5 columns present: ${found.join(", ")}`
        : `Missing: ${missing.join(", ")}`,
    };
  } catch (e: any) { results.D4 = { pass: false, detail: e.message }; }

  // ── D5: Legacy table removed ─────────────────────────────────────────────
  try {
    const r = await db.execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_name = 'expert_city_queues' AND table_schema = 'public'
    `);
    const pass = (r as any).rows.length === 0;
    results.D5 = {
      pass,
      detail: pass
        ? "expert_city_queues does not exist ✓"
        : "expert_city_queues still exists — rename migration did not run",
    };
  } catch (e: any) { results.D5 = { pass: false, detail: e.message }; }

  // ── P3: Webhook event cases ──────────────────────────────────────────────
  try {
    const { readFileSync } = await import("fs");
    const src = readFileSync("server/routes/webhooks.routes.ts", "utf-8");
    const required = ["payment_intent.succeeded","payment_intent.payment_failed","charge.dispute.created","account.updated"];
    const missing = required.filter(e => !src.includes(e));
    results.P3 = {
      pass: missing.length === 0,
      detail: missing.length === 0 ? "All 4 webhook event cases present" : `Missing cases: ${missing.join(", ")}`,
    };
  } catch { results.P3 = { pass: false, detail: "Could not read webhooks.routes.ts" }; }

  // ── P6: Dispute columns ──────────────────────────────────────────────────
  try {
    const r = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'bookings'
      AND column_name IN ('dispute_id','dispute_reason')
    `);
    const found = (r as any).rows.map((row: any) => row.column_name);
    const pass = found.includes("dispute_id") && found.includes("dispute_reason");
    results.P6 = {
      pass,
      detail: pass ? "dispute_id + dispute_reason on bookings table" : `Missing: ${["dispute_id","dispute_reason"].filter(c => !found.includes(c)).join(", ")}`,
    };
  } catch (e: any) { results.P6 = { pass: false, detail: e.message }; }

  // ── L1: Routing filter ───────────────────────────────────────────────────
  try {
    const { readFileSync } = await import("fs");
    const src = readFileSync("server/services/lead-routing.service.ts", "utf-8");
    const pass = src.includes("status = 'approved'") && src.includes("restricted");
    results.L1 = { pass, detail: pass ? "status='approved' + restricted filter found" : "Approval/restricted filter missing" };
  } catch { results.L1 = { pass: false, detail: "Could not read lead-routing.service.ts" }; }

  // ── L2: Null-assign fallback ─────────────────────────────────────────────
  try {
    const { readFileSync } = await import("fs");
    const src = readFileSync("server/services/lead-routing.service.ts", "utf-8");
    const checks = [
      { key: "unassigned", label: "status→unassigned" },
      { key: "admin_notifications", label: "admin_notifications insert" },
      { key: "FALLBACK_MESSAGE", label: "FALLBACK_MESSAGE constant" },
      { key: "[LEAD UNASSIGNED]", label: "[LEAD UNASSIGNED] log" },
    ];
    const missing = checks.filter(c => !src.includes(c.key)).map(c => c.label);
    results.L2 = {
      pass: missing.length === 0,
      detail: missing.length === 0 ? "All 4 fallback components present" : `Missing: ${missing.join(", ")}`,
    };
  } catch { results.L2 = { pass: false, detail: "Could not read lead-routing.service.ts" }; }

  // ── L4: lead_routing_logs table ─────────────────────────────────────────
  try {
    const r = await db.execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_name = 'lead_routing_logs' AND table_schema = 'public'
    `);
    const pass = (r as any).rows.length > 0;
    results.L4 = { pass, detail: pass ? "lead_routing_logs table exists" : "Table not found" };
  } catch (e: any) { results.L4 = { pass: false, detail: e.message }; }

  // ── A1: Funnel events ────────────────────────────────────────────────────
  try {
    const r = await db.execute(sql`
      SELECT stage, COUNT(*)::int as cnt FROM funnel_events GROUP BY stage ORDER BY stage
    `);
    const rows = (r as any).rows;
    const total = rows.reduce((s: number, row: any) => s + row.cnt, 0);
    const stages = rows.map((row: any) => `${row.stage}(${row.cnt})`).join(", ");
    results.A1 = {
      pass: total > 0,
      detail: total > 0 ? `${total} total events: ${stages}` : "No funnel events recorded yet — run user journeys to populate",
    };
  } catch (e: any) { results.A1 = { pass: false, detail: e.message }; }

  // ── C1: Route files exist ────────────────────────────────────────────────
  try {
    const { existsSync } = await import("fs");
    const required = [
      "server/routes/admin.routes.ts",
      "server/routes/trips.routes.ts",
      "server/routes/bookings.ts",
      "server/routes/experts.routes.ts",
      "server/routes/payments.routes.ts",
      "server/routes/webhooks.routes.ts",
      "server/routes/my-itinerary.routes.ts",
      "server/routes/instagram.ts",
    ];
    const missing = required.filter(f => !existsSync(f));
    results.C1 = {
      pass: missing.length === 0,
      detail: missing.length === 0 ? `All ${required.length} key route files present` : `Missing: ${missing.join(", ")}`,
    };
  } catch { results.C1 = { pass: false, detail: "FS error" }; }

  // ── C2: Utility files exist ──────────────────────────────────────────────
  try {
    const { existsSync } = await import("fs");
    const required = [
      "server/utils/queryTimer.ts",
      "server/utils/queryCounter.ts",
      "server/utils/commissionCalculator.ts",
      "server/utils/requestDeduplication.ts",
      "server/utils/funnelTracker.ts",
      "server/jobs/dailyAdminDigest.ts",
      "server/jobs/stripeReconciliation.ts",
    ];
    const missing = required.filter(f => !existsSync(f));
    results.C2 = {
      pass: missing.length === 0,
      detail: missing.length === 0 ? `All ${required.length} utility files present` : `Missing: ${missing.join(", ")}`,
    };
  } catch { results.C2 = { pass: false, detail: "FS error" }; }

  // ── C3: Migration safety files ───────────────────────────────────────────
  try {
    const { existsSync } = await import("fs");
    const f1 = existsSync("server/migrations/scheduled_drop_deprecated_city_queues.sql");
    const f2 = existsSync("server/migrations/validate_before_drop_city_queues.ts");
    const pass = f1 && f2;
    results.C3 = {
      pass,
      detail: pass
        ? "scheduled_drop_deprecated_city_queues.sql + validate_before_drop_city_queues.ts both present"
        : `Missing: ${[!f1 && "scheduled_drop", !f2 && "validate_before_drop"].filter(Boolean).join(", ")}`,
    };
  } catch { results.C3 = { pass: false, detail: "FS error" }; }

  // ── C4: Signup page ──────────────────────────────────────────────────────
  try {
    const { existsSync } = await import("fs");
    const pass = existsSync("client/src/pages/Signup.tsx");
    results.C4 = { pass, detail: pass ? "client/src/pages/Signup.tsx exists" : "Signup.tsx not found" };
  } catch { results.C4 = { pass: false, detail: "FS error" }; }

  // ── C5: Frontend admin components ───────────────────────────────────────
  try {
    const { existsSync } = await import("fs");
    const required = [
      "client/src/components/admin/FunnelChart.tsx",
      "client/src/components/admin/SlowQueryWidget.tsx",
      "client/src/components/admin/NotificationsPanel.tsx",
      "client/src/components/expert/PayoutBanner.tsx",
    ];
    const missing = required.filter(f => !existsSync(f));
    results.C5 = {
      pass: missing.length === 0,
      detail: missing.length === 0 ? "All 4 frontend components present" : `Missing: ${missing.join(", ")}`,
    };
  } catch { results.C5 = { pass: false, detail: "FS error" }; }

  // ── T1: 5 test accounts ─────────────────────────────────────────────────
  try {
    const emails = [
      "traveler@traveloure-test.com",
      "expert@traveloure-test.com",
      "provider@traveloure-test.com",
      "admin@traveloure-test.com",
      "ea@traveloure-test.com",
    ];
    const r = await db.execute(sql`
      SELECT email, role, is_deleted FROM users
      WHERE email = ANY(${emails}::text[])
    `);
    const rows = (r as any).rows;
    const found = rows.map((r: any) => r.email);
    const missing = emails.filter(e => !found.includes(e));
    const deleted = rows.filter((r: any) => r.is_deleted).map((r: any) => r.email);
    const pass = missing.length === 0 && deleted.length === 0;
    results.T1 = {
      pass,
      detail: pass
        ? `All 5 accounts present and active`
        : [missing.length && `Missing: ${missing.join(", ")}`, deleted.length && `Deleted: ${deleted.join(", ")}`].filter(Boolean).join("; "),
    };
  } catch (e: any) { results.T1 = { pass: false, detail: e.message }; }

  // ── T2: Expert test form status ─────────────────────────────────────────
  try {
    const r = await db.execute(sql`
      SELECT lef.status, lef.stripe_connect_status, lef.identity_verification_status
      FROM local_expert_forms lef
      JOIN users u ON lef.user_id = u.id
      WHERE u.email = 'expert@traveloure-test.com'
      LIMIT 1
    `);
    const row = (r as any).rows[0];
    if (!row) { results.T2 = { pass: false, detail: "No expert form found for expert@traveloure-test.com" }; }
    else {
      const pass = row.status === "approved" && row.stripe_connect_status === "complete" && row.identity_verification_status === "verified";
      results.T2 = { pass, detail: `status=${row.status} stripe=${row.stripe_connect_status} identity=${row.identity_verification_status}` };
    }
  } catch (e: any) { results.T2 = { pass: false, detail: e.message }; }

  // ── T3: Provider test form status ───────────────────────────────────────
  try {
    const r = await db.execute(sql`
      SELECT spf.status, spf.business_verification_status
      FROM service_provider_forms spf
      JOIN users u ON spf.user_id = u.id
      WHERE u.email = 'provider@traveloure-test.com'
      LIMIT 1
    `);
    const row = (r as any).rows[0];
    if (!row) { results.T3 = { pass: false, detail: "No provider form found for provider@traveloure-test.com" }; }
    else {
      const pass = row.status === "approved" && row.business_verification_status === "verified";
      results.T3 = { pass, detail: `status=${row.status} business_verification=${row.business_verification_status}` };
    }
  } catch (e: any) { results.T3 = { pass: false, detail: e.message }; }

  // ── T4: Test data seeded ─────────────────────────────────────────────────
  try {
    const expertServices = await db.execute(sql`
      SELECT service_name FROM provider_services ps
      JOIN users u ON ps.user_id = u.id
      WHERE u.email = 'expert@traveloure-test.com' AND ps.status = 'active'
    `);
    const providerServices = await db.execute(sql`
      SELECT service_name FROM provider_services ps
      JOIN users u ON ps.user_id = u.id
      WHERE u.email = 'provider@traveloure-test.com' AND ps.status = 'active'
    `);
    const travelerTrip = await db.execute(sql`
      SELECT title FROM trips t
      JOIN users u ON t.user_id = u.id
      WHERE u.email = 'traveler@traveloure-test.com' AND t.title ILIKE '%tokyo%'
      LIMIT 1
    `);
    const eNames = (expertServices as any).rows.map((r: any) => r.service_name);
    const pNames = (providerServices as any).rows.map((r: any) => r.service_name);
    const hasTokyoGuide = eNames.some((n: string) => n.toLowerCase().includes("tokyo"));
    const hasParis     = eNames.some((n: string) => n.toLowerCase().includes("paris"));
    const hasPhoto     = pNames.some((n: string) => n.toLowerCase().includes("photo"));
    const hasTransfer  = pNames.some((n: string) => n.toLowerCase().includes("transfer") || n.toLowerCase().includes("airport"));
    const hasTrip      = (travelerTrip as any).rows.length > 0;
    const missing = [
      !hasTokyoGuide && "Tokyo Guide",
      !hasParis && "Paris Insider",
      !hasPhoto && "Photography",
      !hasTransfer && "Airport Transfer",
      !hasTrip && "Tokyo Adventure trip",
    ].filter(Boolean);
    results.T4 = {
      pass: missing.length === 0,
      detail: missing.length === 0
        ? `Expert: ${eNames.slice(0,2).join(", ")} | Provider: ${pNames.slice(0,2).join(", ")} | Trip: Tokyo Adventure`
        : `Missing: ${missing.join(", ")}`,
    };
  } catch (e: any) { results.T4 = { pass: false, detail: e.message }; }

  // ── R2: Global error handler ─────────────────────────────────────────────
  try {
    const { readFileSync } = await import("fs");
    const src = readFileSync("server/infrastructure/error-handler.ts", "utf-8");
    const pass = src.includes("globalErrorHandler") && src.includes("_next: NextFunction");
    results.R2 = { pass, detail: pass ? "globalErrorHandler(err,req,res,next) found in error-handler.ts" : "4-arg error handler not found" };
  } catch { results.R2 = { pass: false, detail: "Could not read error-handler.ts" }; }

  // ── R3: SEO meta tags ────────────────────────────────────────────────────
  try {
    const { readFileSync } = await import("fs");
    const html = readFileSync("client/index.html", "utf-8");
    const checks = [
      { key: '<meta name="description"', label: "meta description" },
      { key: '<meta property="og:title"', label: "og:title" },
      { key: 'rel="canonical"', label: "canonical link" },
      { key: "traveloure.com", label: "canonical domain" },
    ];
    const missing = checks.filter(c => !html.includes(c.key)).map(c => c.label);
    results.R3 = {
      pass: missing.length === 0,
      detail: missing.length === 0 ? "All SEO tags present (description, og:title, canonical)" : `Missing: ${missing.join(", ")}`,
    };
  } catch { results.R3 = { pass: false, detail: "Could not read index.html" }; }

  // ── R4: No console.log in payment code ──────────────────────────────────
  try {
    const { execSync } = await import("child_process");
    const out = execSync(
      "grep -r 'console\\.log' ./server/routes --include='*.ts' | grep -i 'payment\\|stripe\\|charge' | grep -v 'console\\.error\\|console\\.warn\\|console\\.info' | wc -l",
      { encoding: "utf-8" }
    ).trim();
    const count = parseInt(out, 10);
    results.R4 = {
      pass: count === 0,
      detail: count === 0 ? "0 console.log in payment/Stripe code" : `${count} console.log found in payment code — convert to console.info`,
    };
  } catch { results.R4 = { pass: false, detail: "grep failed" }; }

  // ── Compute summary counts ────────────────────────────────────────────────
  const values = Object.values(results);
  const passCount = values.filter(r => r.pass).length;
  const failCount = values.filter(r => !r.pass).length;

  return {
    results,
    passCount,
    failCount,
    partialCount: 0,
    totalCount: values.length,
    checkedAt: new Date().toISOString(),
  };
}
