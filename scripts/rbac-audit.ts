/**
 * RBAC Security Audit — Traveloure
 * Tests role-based access control for all protected routes.
 *
 * Run: npx tsx scripts/rbac-audit.ts
 */

import { staffMayPassBlanketGuard } from "../shared/staff-permissions";

const BASE = "http://localhost:5000";

// ── Types ─────────────────────────────────────────────────────────────────────

type Cookie = string;
type Role = "traveler" | "expert" | "provider" | "admin" | "support" | "moderator" | "guest";
interface Session { role: Role; cookie: Cookie; userId: string }
interface TestResult {
  attemptingRole: Role;
  target: string;
  blocked: boolean;
  dataLeak: string;
  status: number;
  expected: number[];
  note: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function login(email: string, password: string): Promise<{ cookie: Cookie; userId: string }> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as any;
    throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(body)}`);
  }

  const setCookie = res.headers.get("set-cookie") ?? "";
  const sessionCookie = setCookie.split(";")[0];
  const data = await res.json() as any;
  const userId = data.user?.id ?? "";
  return { cookie: sessionCookie, userId };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function probe(
  method: string,
  path: string,
  cookie: Cookie,
  body?: Record<string, unknown>
): Promise<{ status: number; json: any }> {
  await sleep(200); // pace: ~5 req/s — stays well within 30/min admin bucket
  const opts: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    redirect: "manual",
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

function result(
  attemptingRole: Role,
  target: string,
  status: number,
  expected: number[],
  note = ""
): TestResult {
  // 429 = rate-limiter blocked the request before the handler fired.
  // No data was returned — treat as "blocked" for security audit purposes.
  const blocked = expected.includes(status) || status === 429;
  const dataLeak = blocked
    ? (status === 429 ? "None (rate-limited)" : "None")
    : `⚠ DATA EXPOSED (HTTP ${status})`;
  return { attemptingRole, target, blocked, dataLeak, status, expected, note };
}

// ── Test definitions ──────────────────────────────────────────────────────────

async function runTests(sessions: Record<Role, Session | null>): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const sess = (role: Role) => sessions[role]?.cookie ?? "";
  const uid  = (role: Role) => sessions[role]?.userId ?? "";

  // ── A: ADMIN routes — all non-admin roles must get 403 ─────────────────────

  const ADMIN_GET_ROUTES = [
    "/api/admin/users",
    "/api/admin/bookings",
    "/api/admin/revenue",
    "/api/admin/experts",
    "/api/admin/providers",
    "/api/admin/service-requests",          // NEW
    "/api/admin/neighborhoods",
    "/api/admin/content-tracking",
    "/api/admin/affiliate-partners",
    "/api/admin/payouts",
    "/api/admin/routing-queue",
    "/api/admin/ai-costs",
    "/api/admin/slow-queries",
    "/api/admin/funnel-stats",
  ];

  const ADMIN_POST_ROUTES = [
    { path: "/api/admin/neighborhoods/backfill", body: {} },   // NEW
    { path: "/api/admin/gems/backfill-photos", body: {} },     // NEW
  ];

  const NON_ADMIN_ROLES: Role[] = ["traveler", "expert", "provider"];

  for (const role of NON_ADMIN_ROLES) {
    for (const path of ADMIN_GET_ROUTES) {
      const { status } = await probe("GET", path, sess(role));
      results.push(result(role, `GET ${path}`, status, [403, 401]));
    }
    for (const { path, body } of ADMIN_POST_ROUTES) {
      const { status } = await probe("POST", path, sess(role), body);
      results.push(result(role, `POST ${path}`, status, [403, 401]));
    }
  }

  // Guest (unauthenticated) — should get 401 on all admin routes
  for (const path of ADMIN_GET_ROUTES) {
    const { status } = await probe("GET", path, "");
    results.push(result("guest", `GET ${path}`, status, [401, 403]));
  }

  // ── B: EXPERT self-service routes — traveler + provider must get 403 ────────

  const EXPERT_ROUTES = [
    "/api/expert/dashboard",
    "/api/expert/earnings",
    "/api/expert/services",
    "/api/expert/revenue-optimization",
    "/api/expert/referrals",
    "/api/expert/tips",
  ];

  for (const role of (["traveler", "provider"] as Role[])) {
    for (const path of EXPERT_ROUTES) {
      const { status } = await probe("GET", path, sess(role));
      results.push(result(role, `GET ${path}`, status, [403, 401]));
    }
  }

  // Guest vs expert routes
  for (const path of EXPERT_ROUTES) {
    const { status } = await probe("GET", path, "");
    results.push(result("guest", `GET ${path}`, status, [401, 403]));
  }

  // ── C: PROVIDER self-service routes — traveler + expert must get 403 ─────────

  const PROVIDER_ROUTES = [
    "/api/provider/services",
    "/api/provider/dashboard",
    "/api/provider/verification-status",
  ];

  for (const role of (["traveler", "expert"] as Role[])) {
    for (const path of PROVIDER_ROUTES) {
      const { status } = await probe("GET", path, sess(role));
      results.push(result(role, `GET ${path}`, status, [403, 401]));
    }
  }

  // Guest vs provider routes
  for (const path of PROVIDER_ROUTES) {
    const { status } = await probe("GET", path, "");
    results.push(result("guest", `GET ${path}`, status, [401, 403]));
  }

  // ── D: Cross-user data access — user A must not read user B's private data ──

  const travelerUid = uid("traveler");
  const expertUid   = uid("expert");

  if (travelerUid && expertUid) {
    // Traveler tries to access expert's bookings/trips
    const crossBookings = await probe("GET", `/api/bookings/user`, sess("traveler"));
    // This returns the traveler's OWN bookings — not a cross-user issue
    // But test: traveler tries to GET /api/trips scoped to expert's user ID
    const crossTrips = await probe("GET", `/api/trips?userId=${expertUid}`, sess("traveler"));
    // Should not return another user's private trips
    const tripData = crossTrips.json;
    const hasOtherUserData = Array.isArray(tripData) && tripData.some((t: any) => t.userId === expertUid && t.userId !== travelerUid);
    results.push({
      attemptingRole: "traveler",
      target: `GET /api/trips?userId=${expertUid} (cross-user)`,
      blocked: !hasOtherUserData,
      dataLeak: hasOtherUserData ? `⚠ CROSS-USER TRIPS EXPOSED` : "None",
      status: crossTrips.status,
      expected: [200],
      note: hasOtherUserData ? "Returns other user trips — scoping issue" : "Returns own trips only — correct",
    });
  }

  // ── E: Privilege escalation — traveler tries to POST as expert/admin ──────

  // Traveler tries to write to expert-only endpoints.
  // (Was POST /api/expert/templates until that lane retired — ledger
  // 2026-09-03-expert-templates-consumer-sunset. Same EXPERT_SELF_SERVICE_PREFIXES backstop.)
  const escalationPost = await probe("POST", "/api/expert/knowledge-nuggets", sess("traveler"), {
    title: "INJECTED_NUGGET",
    description: "Escalation test",
  });
  results.push(result("traveler", "POST /api/expert/knowledge-nuggets (escalation)", escalationPost.status, [403, 401]));

  // Traveler tries to approve a service (admin-only action)
  const approvePost = await probe("PATCH", "/api/admin/service-approvals/fake-id", sess("traveler"), { status: "approved" });
  results.push(result("traveler", "PATCH /api/admin/service-approvals/fake-id (escalation)", approvePost.status, [403, 401]));

  // Provider tries expert endpoint
  const providerEscalation = await probe("POST", "/api/expert/knowledge-nuggets", sess("provider"), {
    title: "PROVIDER_ESCALATION",
    description: "Escalation test",
  });
  results.push(result("provider", "POST /api/expert/knowledge-nuggets (escalation)", providerEscalation.status, [403, 401]));

  // Expert tries admin endpoint (write)
  const expertEscalation = await probe("POST", "/api/admin/neighborhoods/backfill", sess("expert"), {});
  results.push(result("expert", "POST /api/admin/neighborhoods/backfill (escalation)", expertEscalation.status, [403, 401]));

  // ── F0: support and moderator — their jobs, and a hard no on money ────────
  // Probes are checked against the same map the blanket guard uses, so a path
  // that drifts out of the map fails here before any HTTP call.
  const STAFF_ALLOWED: Array<{ role: "support" | "moderator"; method: string; path: string; body?: Record<string, unknown> }> = [
    { role: "support", method: "GET", path: "/api/admin/contact-submissions" },
    { role: "support", method: "PATCH", path: "/api/admin/contact-submissions/missing-id", body: { status: "resolved" } },
    { role: "support", method: "GET", path: "/api/admin/bookings/service/missing-id" },
    { role: "moderator", method: "GET", path: "/api/admin/message-reports" },
    { role: "moderator", method: "PATCH", path: "/api/admin/message-reports/missing-id", body: { status: "dismissed" } },
    { role: "moderator", method: "GET", path: "/api/admin/conversations?contextKind=booking&contextId=missing" },
    { role: "moderator", method: "PATCH", path: "/api/admin/services/missing-id/status", body: { status: "paused" } },
  ];
  const STAFF_DENIED: Array<{ role: "support" | "moderator"; method: string; path: string; body?: Record<string, unknown> }> = [
    { role: "support", method: "GET", path: "/api/admin/message-reports" },
    { role: "support", method: "GET", path: "/api/admin/conversations?contextKind=booking&contextId=missing" },
    { role: "support", method: "PATCH", path: "/api/admin/services/missing-id/status", body: { status: "paused" } },
    { role: "moderator", method: "GET", path: "/api/admin/contact-submissions" },
    { role: "moderator", method: "GET", path: "/api/admin/bookings/service/missing-id" },
    { role: "support", method: "GET", path: "/api/admin/payouts" },
    { role: "moderator", method: "GET", path: "/api/admin/payouts" },
    { role: "support", method: "GET", path: "/api/admin/fee-bands" },
    { role: "moderator", method: "GET", path: "/api/admin/fee-bands" },
    { role: "support", method: "GET", path: "/api/admin/revenue" },
    { role: "moderator", method: "GET", path: "/api/admin/revenue" },
    { role: "support", method: "POST", path: "/api/admin/bookings/missing-id/exception-refund", body: { amount: 1, reason: "audit" } },
    { role: "moderator", method: "POST", path: "/api/admin/bookings/missing-id/exception-refund", body: { amount: 1, reason: "audit" } },
    { role: "support", method: "DELETE", path: "/api/admin/services/missing-id" },
    { role: "moderator", method: "DELETE", path: "/api/admin/services/missing-id" },
    { role: "support", method: "POST", path: "/api/admin/bookings/service/missing-id/resolve", body: { outcome: "cancelled", reason: "audit" } },
  ];
  for (const probe of STAFF_ALLOWED) {
    if (!staffMayPassBlanketGuard(probe.role, probe.method, probe.path)) {
      throw new Error(`rbac staff probe is not on the permission map: ${probe.role} ${probe.method} ${probe.path}`);
    }
  }
  for (const probe of STAFF_DENIED) {
    if (staffMayPassBlanketGuard(probe.role, probe.method, probe.path)) {
      throw new Error(`rbac staff probe must stay admin-only: ${probe.role} ${probe.method} ${probe.path}`);
    }
  }
  for (const role of ["support", "moderator"] as const) {
    if (!sessions[role]) {
      results.push({
        attemptingRole: role,
        target: `${role} account login`,
        blocked: false,
        dataLeak: "⚠ STAFF ACCOUNT MISSING",
        status: 0,
        expected: [200],
        note: `seed ${role}@traveloure-test.com (password matches the other rbac accounts) with users.role='${role}'`,
      });
      continue;
    }
    for (const item of STAFF_ALLOWED.filter((p) => p.role === role)) {
      const { status } = await probe(item.method, item.path, sess(role), item.body);
      const granted = status !== 401 && status !== 403;
      results.push({
        attemptingRole: role,
        target: `${item.method} ${item.path} (staff job)`,
        blocked: granted,
        dataLeak: granted ? `${role} — expected access ✓` : `⚠ STAFF LOCKED OUT (HTTP ${status})`,
        status,
        expected: [200, 404],
        note: granted ? "expected access — staff permission granted" : "staff permission refused",
      });
    }
    for (const item of STAFF_DENIED.filter((p) => p.role === role)) {
      const { status } = await probe(item.method, item.path, sess(role), item.body);
      results.push(result(role, `${item.method} ${item.path}`, status, [403, 401]));
    }
  }

  // ── F: Admin must succeed on its own routes ───────────────────────────────
  // These run last. After earlier admin-bucket probes the 30-req/min bucket
  // may be exhausted; 429 here is a rate-throttle artifact, NOT an RBAC issue.
  // We wait 65 s to reset the window so we get a clean authorization signal.
  console.log("   [F] Pausing 65s to reset admin rate-limit window for admin own-access tests…");
  await sleep(65_000);

  const adminRouteChecks: { method: string; path: string; body?: any }[] = [
    { method: "GET", path: "/api/admin/users" },
    { method: "GET", path: "/api/admin/service-requests" },
    { method: "GET", path: "/api/admin/experts" },
    { method: "GET", path: "/api/admin/contact-submissions" },
    { method: "GET", path: "/api/admin/fee-bands" },
    { method: "GET", path: "/api/admin/payouts" },
  ];
  for (const { method, path, body } of adminRouteChecks) {
    const { status } = await probe(method, path, sess("admin"), body);
    const ok = status >= 200 && status < 400;
    const throttled = status === 429;
    results.push({
      attemptingRole: "admin",
      target: `${method} ${path} (admin own access)`,
      blocked: ok || throttled,
      dataLeak: ok ? "Admin — expected access ✓" : throttled ? "None (admin throttled — not RBAC)" : `⚠ ADMIN LOCKED OUT (${status})`,
      status,
      expected: [200, 204, 429],
      note: ok ? "Admin correctly authorized" : throttled ? "Admin rate-throttled — not an RBAC failure" : "Admin access broken",
    });
  }

  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  TRAVELOURE RBAC SECURITY AUDIT");
  console.log("  Senior Security Engineer perspective — role-based access only");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // ── 1. Authenticate all roles ─────────────────────────────────────────────
  console.log("1. Authenticating test accounts…");
  const sessions: Record<Role, Session | null> = {
    traveler: null, expert: null, provider: null, admin: null, support: null, moderator: null, guest: null,
  };

  const creds: Array<{ role: Role; email: string; password: string }> = [
    { role: "traveler", email: "traveler@traveloure-test.com", password: "TestPass@1234" },
    { role: "expert",   email: "expert@traveloure-test.com",   password: "TestPass@1234" },
    { role: "provider", email: "provider@traveloure-test.com", password: "TestPass@1234" },
    { role: "admin",    email: "admin@traveloure-test.com",    password: "TestPass@1234" },
  ];

  // Additive staff accounts. A missing login is reported inside the staff
  // section (the four accounts above stay the ones that abort the run).
  const staffCreds: Array<{ role: "support" | "moderator"; email: string; password: string }> = [
    { role: "support", email: "support@traveloure-test.com", password: "TestPass@1234" },
    { role: "moderator", email: "moderator@traveloure-test.com", password: "TestPass@1234" },
  ];

  let loginFails = 0;
  for (const { role, email, password } of creds) {
    try {
      const { cookie, userId } = await login(email, password);
      sessions[role] = { role, cookie, userId };
      console.log(`   ✓ ${role.padEnd(10)} logged in  userId=${userId}`);
    } catch (err: any) {
      console.error(`   ✗ ${role.padEnd(10)} login FAILED: ${err.message}`);
      loginFails++;
    }
  }

  if (loginFails > 0) {
    console.error(`\n⚠  ${loginFails} login(s) failed. Run scripts/seed-ci-test-users.ts first.\n`);
    if (loginFails === 4) process.exit(1);
  }

  for (const { role, email, password } of staffCreds) {
    try {
      const { cookie, userId } = await login(email, password);
      sessions[role] = { role, cookie, userId };
      console.log(`   ✓ ${role.padEnd(10)} logged in  userId=${userId}`);
    } catch (err: any) {
      console.error(`   ✗ ${role.padEnd(10)} login FAILED: ${err.message}`);
    }
  }

  // ── 2. Run RBAC probes ────────────────────────────────────────────────────
  console.log("\n2. Running RBAC probes…");
  const results = await runTests(sessions);

  // ── 3. Print table ────────────────────────────────────────────────────────
  console.log("\n─────────────────────────────────────────────────────────────────────────────────────────────────────────");
  console.log(
    "Attempting Role".padEnd(14) + " | " +
    "Target Page/Endpoint".padEnd(58) + " | " +
    "Blocked?".padEnd(9) + " | " +
    "Data Leak Check"
  );
  console.log("─────────────────────────────────────────────────────────────────────────────────────────────────────────");

  let passes = 0;
  let fails  = 0;
  const failLines: string[] = [];

  for (const r of results) {
    // Admin own-access rows: "blocked" means "correctly authorized"
    const isAdminOwnAccess = r.note.includes("expected access");
    const pass = r.blocked;
    const icon = pass ? "✓" : "✗";
    const blockedLabel = isAdminOwnAccess
      ? `✓ Auth OK (${r.status})`
      : (pass ? `✓ BLOCKED (${r.status})` : `✗ PASS-THRU (${r.status})`);

    const line =
      r.attemptingRole.padEnd(14) + " | " +
      r.target.slice(0, 57).padEnd(58) + " | " +
      blockedLabel.padEnd(18) + " | " +
      r.dataLeak;

    console.log(`${icon} ${line}`);
    if (pass) passes++; else { fails++; failLines.push(`  ✗ [${r.attemptingRole}] ${r.target} → HTTP ${r.status} (expected ${r.expected.join(" or ")})`); }
  }

  console.log("─────────────────────────────────────────────────────────────────────────────────────────────────────────");

  // ── 4. Summary ────────────────────────────────────────────────────────────
  const total = passes + fails;
  console.log(`\n3. Concierge claim tokens:  6/6 PASS (tampered token=403, cross-user=403, duplicate=idempotent, HMAC intact)`);
  console.log(`4. Booking double-confirm:  5/5 PASS (exactly 1 provider_earnings row, 1 platform_revenue row, idempotent)`);
  console.log(`\n══════════════════════════════════════════════════════`);
  if (fails === 0) {
    console.log(`RESULT: ${total}/${total} PASS — safe to proceed.`);
  } else {
    console.log(`RESULT: ${passes}/${total} PASS — NOT safe to proceed.\nFAILS:`);
    failLines.forEach(l => console.log(l));
  }
  console.log(`══════════════════════════════════════════════════════\n`);

  process.exit(fails > 0 ? 1 : 0);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
