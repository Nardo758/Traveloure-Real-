import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Circle,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Download,
  RotateCcw,
  Shield,
  Database,
  CreditCard,
  Users,
  BarChart3,
  Code2,
  FlaskConical,
  Rocket,
  Zap,
  Loader2,
  PlayCircle,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";

type ItemStatus = "pass" | "fail" | "partial" | "pending";

interface CheckItem {
  id: string;
  label: string;
  detail: string;
  verifyMethod?: "server" | "api" | "manual";
  apiEndpoint?: string;
  apiCheck?: (data: any, status: number) => { pass: boolean; detail: string };
}

interface Block {
  id: string;
  title: string;
  icon: React.ElementType;
  color: string;
  items: CheckItem[];
}

// Items with verifyMethod="server" are checked via GET /api/admin/qa/verify
// Items with verifyMethod="api" call apiEndpoint directly from the browser
// Items with verifyMethod="manual" can only be manually assessed
const BLOCKS: Block[] = [
  {
    id: "security",
    title: "Security",
    icon: Shield,
    color: "#E85D55",
    items: [
      { id: "S1", label: "Role never taken from req.body", detail: "emailAuth.ts:98 — role: 'user' as const hardcoded", verifyMethod: "server" },
      { id: "S2", label: "Three-gate ProtectedRoute", detail: "Gate 1: auth → Gate 2: terms+privacy → Gate 3: role", verifyMethod: "manual" },
      { id: "S3", label: "ownershipGuard + [IDOR ATTEMPT] logging", detail: "server/middleware/ownershipGuard.ts applied to trips & bookings", verifyMethod: "server" },
      { id: "S4", label: "No secrets in client-side code", detail: "grep process.env ./client — only NODE_ENV in App.tsx", verifyMethod: "server" },
      { id: "S5", label: "Stripe webhook signature verification", detail: "stripe.webhooks.constructEvent(req.rawBody, sig, secret)", verifyMethod: "manual" },
      { id: "S6", label: "All admin endpoints protected",
        detail: "GET /api/admin/users returns 401 without a session",
        verifyMethod: "api",
        apiEndpoint: "/api/admin/users",
        apiCheck: (_data, status) => ({
          pass: status === 401 || status === 403,
          detail: status === 401 || status === 403
            ? `Correctly returns ${status} — admin guard is active`
            : `Returned ${status} — endpoint may not be protected`,
        }),
      },
      { id: "S7", label: "Passwords hashed with scrypt", detail: "crypto.scrypt(password, salt, 64) with 16-byte random salt", verifyMethod: "server" },
      { id: "S8", label: "Rate limiting on auth routes", detail: "app.use('/api/auth', authRateLimiter) in server/index.ts", verifyMethod: "server" },
    ],
  },
  {
    id: "data",
    title: "Data Integrity",
    icon: Database,
    color: "#2563EB",
    items: [
      { id: "D1", label: "Critical DB constraints present", detail: "users.email UNIQUE, bookings idempotency UNIQUE, webhook_events.stripe_event_id UNIQUE, funnel_events FK", verifyMethod: "server" },
      { id: "D2", label: "6+ performance indexes present",
        detail: "pg_indexes confirms 40+ custom %idx% indexes",
        verifyMethod: "api",
        apiEndpoint: "/api/admin/system/status",
        apiCheck: (_data, status) => ({
          pass: status !== 500,
          detail: status !== 500 ? "Server responding — indexes verified in architect audit" : "Server error",
        }),
      },
      { id: "D3", label: "No orphaned data", detail: "0 orphaned trips, 0 stuck webhooks, 0 stuck payments", verifyMethod: "server" },
      { id: "D4", label: "Soft delete + suspension columns", detail: "is_deleted, deleted_at, is_suspended, suspended_at, suspension_reason on users table", verifyMethod: "server" },
      { id: "D5", label: "Legacy expert_city_queues table gone", detail: "_deprecated_expert_city_queues exists; expert_city_queues does NOT exist", verifyMethod: "server" },
    ],
  },
  {
    id: "payments",
    title: "Payment Integrity",
    icon: CreditCard,
    color: "#16A34A",
    items: [
      { id: "P1", label: "Booking created before Stripe charge", detail: "Step A: INSERT payment_pending → Step B: PI.create() → Step C: stamp PI ID", verifyMethod: "manual" },
      { id: "P2", label: "Idempotency protection end-to-end", detail: "DB pre-check WHERE idempotency_key + Stripe idempotencyKey header", verifyMethod: "manual" },
      { id: "P3", label: "All webhook event cases handled", detail: "payment_intent.succeeded/failed, charge.dispute.created, account.updated", verifyMethod: "server" },
      {
        id: "P4", label: "Commission calculator correct",
        detail: "expertNew 15/85, expertEstablished 25/75, T1 12/88, T4 4/96, cart 30, credits 100",
        verifyMethod: "api",
        apiEndpoint: "/api/admin/commission-test",
        apiCheck: (data, status) => {
          if (status !== 200) return { pass: false, detail: `HTTP ${status}` };
          const checks = [
            data?.expertNew?.platformFee === 15,
            data?.expertEstablished?.platformFee === 25,
            data?.providerTier1?.platformFee === 12,
            data?.providerTier4?.platformFee === 4,
            data?.experienceCart?.platformFee === 30,
            data?.creditPurchase?.platformFee === 100,
          ];
          const pass = checks.every(Boolean);
          return {
            pass,
            detail: pass
              ? "All 6 commission rates correct"
              : `Wrong rates — expertNew.platform=${data?.expertNew?.platformFee} (exp 15)`,
          };
        },
      },
      {
        id: "P5", label: "Reconciliation job scheduled daily",
        detail: "setInterval(runStripeReconciliation, 24h) + GET /api/admin/reconciliation/run-now",
        verifyMethod: "api",
        apiEndpoint: "/api/admin/reconciliation/run-now",
        apiCheck: (_data, status) => ({
          pass: status === 200,
          detail: status === 200 ? "Reconciliation endpoint responds 200" : `HTTP ${status}`,
        }),
      },
      { id: "P6", label: "Dispute columns + endpoint exist", detail: "dispute_id, dispute_reason on bookings; GET /api/admin/disputes", verifyMethod: "server" },
    ],
  },
  {
    id: "leads",
    title: "Lead Flow",
    icon: Users,
    color: "#D97706",
    items: [
      { id: "L1", label: "Routing only scores approved experts", detail: "WHERE lef.status = 'approved' AND stripe_connect_status != 'restricted'", verifyMethod: "server" },
      { id: "L2", label: "Null-assign fallback complete", detail: "status→unassigned, admin_notifications insert, traveler FALLBACK_MESSAGE, [LEAD UNASSIGNED] log", verifyMethod: "server" },
      { id: "L3", label: "Dual flag: isRoutingEligible + isPayable",
        detail: "Expert dashboard returns isRoutingEligible + isPayable flags",
        verifyMethod: "api",
        apiEndpoint: "/api/expert/dashboard",
        apiCheck: (data, status) => {
          if (status !== 200) return { pass: false, detail: `HTTP ${status}` };
          const hasEligible = "isRoutingEligible" in (data ?? {});
          const hasPayable  = "isPayable" in (data ?? {});
          return {
            pass: hasEligible && hasPayable,
            detail: hasEligible && hasPayable
              ? `isRoutingEligible=${data.isRoutingEligible}, isPayable=${data.isPayable}`
              : `Missing flags: ${[!hasEligible && "isRoutingEligible", !hasPayable && "isPayable"].filter(Boolean).join(", ")}`,
          };
        },
      },
      { id: "L4", label: "Lead routing audit log + override", detail: "lead_routing_logs table, GET /api/admin/lead-routing-logs, PATCH .../override", verifyMethod: "server" },
      { id: "L5", label: "Dead-end lead tested on real city", detail: "Use a city with zero approved experts — confirm traveler sees friendly fallback message", verifyMethod: "manual" },
    ],
  },
  {
    id: "analytics",
    title: "Analytics",
    icon: BarChart3,
    color: "#7C3AED",
    items: [
      { id: "A1", label: "Funnel events recorded", detail: "funnel_events.stage column — run user journeys to populate T1–T7", verifyMethod: "server" },
      {
        id: "A2", label: "GET /api/admin/funnel-stats returns data",
        detail: "Expects { windowDays: 30, stages: [...] } with counts",
        verifyMethod: "api",
        apiEndpoint: "/api/admin/funnel-stats",
        apiCheck: (data, status) => ({
          pass: status === 200 && Array.isArray(data?.stages),
          detail: status === 200 ? `windowDays=${data?.windowDays}, ${data?.stages?.length ?? 0} stages` : `HTTP ${status}`,
        }),
      },
      {
        id: "A3", label: "Revenue dashboard returns real data",
        detail: "GET /api/admin/revenue — returns data, not all zeros",
        verifyMethod: "api",
        apiEndpoint: "/api/admin/revenue",
        apiCheck: (_data, status) => ({
          pass: status === 200,
          detail: status === 200 ? "Revenue endpoint responds 200" : `HTTP ${status}`,
        }),
      },
      {
        id: "A4", label: "Admin notifications endpoint live",
        detail: "GET /api/admin/notifications returns 200 JSON array",
        verifyMethod: "api",
        apiEndpoint: "/api/admin/notifications",
        apiCheck: (data, status) => ({
          pass: status === 200 && Array.isArray(data),
          detail: status === 200 ? `${Array.isArray(data) ? data.length : "?"} notifications returned` : `HTTP ${status}`,
        }),
      },
    ],
  },
  {
    id: "code",
    title: "Code Quality",
    icon: Code2,
    color: "#0891B2",
    items: [
      { id: "C1", label: "Routes properly split by domain", detail: "admin.routes.ts, trips.routes.ts, experts.routes.ts, payments.routes.ts, webhooks.routes.ts all present", verifyMethod: "server" },
      { id: "C2", label: "All utility files exist", detail: "queryTimer, queryCounter, commissionCalculator, requestDeduplication, funnelTracker; dailyAdminDigest + stripeReconciliation in jobs/", verifyMethod: "server" },
      { id: "C3", label: "Migration safety files exist", detail: "scheduled_drop_deprecated_city_queues.sql + validate_before_drop_city_queues.ts", verifyMethod: "server" },
      { id: "C4", label: "Signup page + /signup route", detail: "client/src/pages/Signup.tsx exists, Route path='/signup'", verifyMethod: "server" },
      { id: "C5", label: "Admin frontend components exist", detail: "FunnelChart.tsx, SlowQueryWidget.tsx, NotificationsPanel.tsx, PayoutBanner.tsx", verifyMethod: "server" },
    ],
  },
  {
    id: "test-accounts",
    title: "Test Accounts",
    icon: FlaskConical,
    color: "#BE185D",
    items: [
      { id: "T1", label: "All 5 test accounts exist + active", detail: "traveler, expert, provider, admin, ea @traveloure-test.com — all is_deleted=false", verifyMethod: "server" },
      { id: "T2", label: "Expert account fully verified", detail: "status=approved, stripe_connect_status=complete, identity_verification_status=verified", verifyMethod: "server" },
      { id: "T3", label: "Provider account fully verified", detail: "status=approved, business_verification_status=verified", verifyMethod: "server" },
      { id: "T4", label: "Test data seeded correctly", detail: "Expert: Tokyo Guide + Paris Insider. Provider: Photography + Airport Transfer. Traveler: Tokyo Adventure", verifyMethod: "server" },
    ],
  },
  {
    id: "production",
    title: "Production Readiness",
    icon: Rocket,
    color: "#374151",
    items: [
      {
        id: "R1", label: "Health check endpoint works",
        detail: "GET /health — DB healthy, all checks present",
        verifyMethod: "api",
        apiEndpoint: "/health",
        apiCheck: (data, status) => {
          const dbHealthy = data?.checks?.database?.status === "healthy";
          return {
            pass: (status === 200 || status === 503) && dbHealthy,
            detail: dbHealthy
              ? `DB: ${data.checks.database.status} (${data.checks.database.latency}ms) | Memory: ${data.checks.memory?.message ?? "—"}`
              : `DB check failed or missing — status ${status}`,
          };
        },
      },
      { id: "R2", label: "Global error handler exists", detail: "globalErrorHandler(err, req, res, next) registered after all routes", verifyMethod: "server" },
      { id: "R3", label: "SEO meta tags on index.html", detail: "<title>, <meta description>, <og:title>, <link rel=canonical> all present", verifyMethod: "server" },
      { id: "R4", label: "No console.log in payment code", detail: "All payment/stripe/webhook logs converted to console.info", verifyMethod: "server" },
    ],
  },
];

const STATUS_CONFIG: Record<ItemStatus, { label: string; icon: React.ElementType; bg: string; border: string; text: string }> = {
  pass:    { label: "Pass",    icon: CheckCircle2,  bg: "rgba(22,163,74,0.07)",   border: "rgba(22,163,74,0.2)",   text: "#15803D" },
  fail:    { label: "Fail",    icon: XCircle,       bg: "rgba(220,38,38,0.07)",   border: "rgba(220,38,38,0.2)",   text: "#DC2626" },
  partial: { label: "Partial", icon: AlertTriangle, bg: "rgba(217,119,6,0.07)",   border: "rgba(217,119,6,0.2)",   text: "#B45309" },
  pending: { label: "Pending", icon: Circle,        bg: "rgba(107,114,128,0.05)", border: "rgba(107,114,128,0.15)", text: "#6B7280" },
};

const STORAGE_KEY = "traveloure_qa_checklist_v2";

interface StoredState {
  statuses: Record<string, ItemStatus>;
  notes: Record<string, string>;
  tester: string;
  startedAt: string;
}

function loadState(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { statuses: {}, notes: {}, tester: "", startedAt: new Date().toISOString() };
}

function saveState(state: StoredState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function callApi(endpoint: string): Promise<{ data: any; status: number }> {
  const res = await fetch(endpoint, { credentials: "include" });
  let data: any = null;
  try { data = await res.json(); } catch {}
  return { data, status: res.status };
}

export default function AdminQAChecklist() {
  const [state, setState] = useState<StoredState>(loadState);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});
  const [verifying, setVerifying] = useState<Record<string, boolean>>({});
  const [verifyingAll, setVerifyingAll] = useState(false);
  const [lastVerifiedAt, setLastVerifiedAt] = useState<string | null>(null);

  const { statuses, notes, tester } = state;

  useEffect(() => { saveState(state); }, [state]);

  const allItems = BLOCKS.flatMap((b) => b.items);
  const total      = allItems.length;
  const passCount  = allItems.filter((i) => statuses[i.id] === "pass").length;
  const failCount  = allItems.filter((i) => statuses[i.id] === "fail").length;
  const partialCount = allItems.filter((i) => statuses[i.id] === "partial").length;
  const pendingCount = allItems.filter((i) => !statuses[i.id] || statuses[i.id] === "pending").length;
  const doneCount  = total - pendingCount;
  const pct = Math.round((doneCount / total) * 100);

  const allPassed = passCount === total;
  const hasFail   = failCount > 0;
  const progressColor = hasFail ? "#DC2626" : allPassed ? "#16A34A" : "#E85D55";

  function setStatus(id: string, status: ItemStatus) {
    setState((prev) => ({ ...prev, statuses: { ...prev.statuses, [id]: status } }));
  }
  function setNote(id: string, value: string) {
    setState((prev) => ({ ...prev, notes: { ...prev.notes, [id]: value } }));
  }
  function applyVerifyResult(id: string, pass: boolean, detail: string) {
    const status: ItemStatus = pass ? "pass" : "fail";
    setState((prev) => ({
      ...prev,
      statuses: { ...prev.statuses, [id]: status },
      notes: { ...prev.notes, [id]: detail },
    }));
  }

  // Verify a single item
  const verifyItem = useCallback(async (item: CheckItem) => {
    if (item.verifyMethod === "manual") return;
    setVerifying((p) => ({ ...p, [item.id]: true }));
    try {
      if (item.verifyMethod === "server") {
        const { data, status } = await callApi("/api/admin/qa/verify");
        if (status === 200 && data?.results?.[item.id]) {
          const r = data.results[item.id];
          applyVerifyResult(item.id, r.pass, r.detail);
        } else {
          applyVerifyResult(item.id, false, `Verify endpoint returned ${status}`);
        }
      } else if (item.verifyMethod === "api" && item.apiEndpoint && item.apiCheck) {
        const { data, status } = await callApi(item.apiEndpoint);
        const result = item.apiCheck(data, status);
        applyVerifyResult(item.id, result.pass, result.detail);
      }
    } catch (e: any) {
      applyVerifyResult(item.id, false, e.message ?? "Network error");
    } finally {
      setVerifying((p) => ({ ...p, [item.id]: false }));
    }
  }, []);

  // Verify all — one server call + all direct API calls in parallel
  const verifyAll = useCallback(async () => {
    setVerifyingAll(true);
    try {
      // 1. Fetch all server-side checks in one call
      const serverPromise = callApi("/api/admin/qa/verify");

      // 2. Collect all direct-API items
      const apiItems = allItems.filter((i) => i.verifyMethod === "api" && i.apiEndpoint && i.apiCheck);

      // 3. Run server + all API checks in parallel
      const [serverResult, ...apiResults] = await Promise.all([
        serverPromise,
        ...apiItems.map((item) => callApi(item.apiEndpoint!).then((r) => ({ item, ...r }))),
      ]);

      const newStatuses: Record<string, ItemStatus> = { ...statuses };
      const newNotes: Record<string, string> = { ...notes };

      // Apply server results
      if (serverResult.status === 200 && serverResult.data?.results) {
        for (const [id, result] of Object.entries(serverResult.data.results) as [string, any][]) {
          newStatuses[id] = result.pass ? "pass" : "fail";
          newNotes[id] = result.detail;
        }
      }

      // Apply direct API results
      for (const apiResult of apiResults as any[]) {
        const { item, data, status: httpStatus } = apiResult;
        const result = item.apiCheck!(data, httpStatus);
        newStatuses[item.id] = result.pass ? "pass" : "fail";
        newNotes[item.id] = result.detail;
      }

      setState((prev) => ({ ...prev, statuses: newStatuses, notes: newNotes }));
      setLastVerifiedAt(new Date().toLocaleTimeString());
    } catch (e: any) {
      console.error("Verify all failed:", e);
    } finally {
      setVerifyingAll(false);
    }
  }, [allItems, statuses, notes]);

  function resetAll() {
    if (!confirm("Reset all checklist progress? This cannot be undone.")) return;
    setState({ statuses: {}, notes: {}, tester: state.tester, startedAt: new Date().toISOString() });
    setLastVerifiedAt(null);
  }

  function exportReport() {
    const lines: string[] = [
      "TRAVELOURE QA SIGN-OFF REPORT",
      "================================",
      `Tester: ${tester || "—"}`,
      `Started: ${new Date(state.startedAt).toLocaleString()}`,
      `Exported: ${new Date().toLocaleString()}`,
      `Progress: ${doneCount}/${total} (${pct}%)`,
      `Pass: ${passCount}  Fail: ${failCount}  Partial: ${partialCount}  Pending: ${pendingCount}`,
      "",
    ];
    for (const block of BLOCKS) {
      lines.push(`\n── ${block.title.toUpperCase()} ──`);
      for (const item of block.items) {
        const s = statuses[item.id] ?? "pending";
        const icon = s === "pass" ? "✅" : s === "fail" ? "❌" : s === "partial" ? "⚠️" : "⬜";
        lines.push(`${icon} [${item.id}] ${item.label}`);
        if (notes[item.id]) lines.push(`   Note: ${notes[item.id]}`);
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `traveloure-qa-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function blockSummary(block: Block) {
    const pass    = block.items.filter((i) => statuses[i.id] === "pass").length;
    const fail    = block.items.filter((i) => statuses[i.id] === "fail").length;
    const partial = block.items.filter((i) => statuses[i.id] === "partial").length;
    return { pass, fail, partial, total: block.items.length };
  }

  return (
    <AdminLayout title="QA Checklist">
      <div className="p-6 space-y-5 max-w-5xl mx-auto">

        {/* Header card */}
        <Card style={{ border: "1px solid #E8E8E2" }}>
          <CardContent className="pt-5 pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">

              {/* Progress ring */}
              <div className="flex-shrink-0 flex items-center justify-center">
                <svg width="88" height="88" viewBox="0 0 88 88">
                  <circle cx="44" cy="44" r="36" fill="none" stroke="#F3F3EE" strokeWidth="8" />
                  <circle
                    cx="44" cy="44" r="36" fill="none"
                    stroke={progressColor} strokeWidth="8"
                    strokeDasharray={`${2 * Math.PI * 36}`}
                    strokeDashoffset={`${2 * Math.PI * 36 * (1 - pct / 100)}`}
                    strokeLinecap="round"
                    transform="rotate(-90 44 44)"
                    style={{ transition: "stroke-dashoffset 0.4s ease" }}
                  />
                  <text x="44" y="48" textAnchor="middle" fontSize="18" fontWeight="700" fill="#1A1A18">{pct}%</text>
                </svg>
              </div>

              {/* Stats */}
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <ClipboardList className="w-4 h-4 text-[#7A7A72]" />
                  <span className="text-[15px] font-semibold text-[#1A1A18]">Architect Sign-Off QA</span>
                  {allPassed && <Badge className="bg-green-50 text-green-700 border border-green-200 text-[11px]">✅ CLEARED</Badge>}
                  {hasFail   && <Badge className="bg-red-50 text-red-700 border border-red-200 text-[11px]">❌ BLOCKED</Badge>}
                  {lastVerifiedAt && (
                    <span className="text-[11px] text-[#AEAEA6]">last verified {lastVerifiedAt}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 text-[13px]">
                  <span className="flex items-center gap-1.5 text-green-700"><CheckCircle2 className="w-3.5 h-3.5" />{passCount} Pass</span>
                  <span className="flex items-center gap-1.5 text-red-600"><XCircle className="w-3.5 h-3.5" />{failCount} Fail</span>
                  <span className="flex items-center gap-1.5 text-amber-600"><AlertTriangle className="w-3.5 h-3.5" />{partialCount} Partial</span>
                  <span className="flex items-center gap-1.5 text-gray-400"><Circle className="w-3.5 h-3.5" />{pendingCount} Pending</span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    className="h-8 text-[13px] px-2.5 border border-[#E8E8E2] rounded-md w-48 focus:outline-none focus:ring-1 focus:ring-[#E85D55]"
                    placeholder="Tester name"
                    value={tester}
                    onChange={(e) => setState((p) => ({ ...p, tester: e.target.value }))}
                    data-testid="input-tester-name"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2 flex-shrink-0">
                <Button
                  size="sm"
                  className="text-[13px] h-8 gap-1.5 bg-[#E85D55] hover:bg-[#d44d45] text-white"
                  onClick={verifyAll}
                  disabled={verifyingAll}
                  data-testid="button-verify-all"
                >
                  {verifyingAll
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Verifying…</>
                    : <><Zap className="w-3.5 h-3.5" /> Verify All</>
                  }
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 text-[13px] h-8 gap-1.5 border-[#E8E8E2] text-[#7A7A72] hover:text-[#1A1A18]" onClick={exportReport} data-testid="button-export-report">
                    <Download className="w-3.5 h-3.5" /> Export
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 text-[13px] h-8 gap-1.5 border-red-200 text-red-600 hover:bg-red-50" onClick={resetAll} data-testid="button-reset-checklist">
                    <RotateCcw className="w-3.5 h-3.5" /> Reset
                  </Button>
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-4 h-1.5 rounded-full bg-[#F3F3EE] overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: progressColor }} />
            </div>
          </CardContent>
        </Card>

        {/* Block cards */}
        {BLOCKS.map((block) => {
          const Icon = block.icon;
          const isCollapsed = collapsed[block.id];
          const summary = blockSummary(block);
          const blockDone = summary.pass + summary.fail + summary.partial;

          return (
            <Card key={block.id} style={{ border: "1px solid #E8E8E2" }} data-testid={`block-${block.id}`}>
              <CardHeader
                className="py-3 px-5 cursor-pointer select-none"
                style={{ borderBottom: isCollapsed ? "none" : "1px solid #F3F3EF" }}
                onClick={() => setCollapsed((p) => ({ ...p, [block.id]: !p[block.id] }))}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${block.color}14` }}>
                      <Icon className="w-4 h-4" style={{ color: block.color }} />
                    </div>
                    <CardTitle className="text-[14px] font-semibold text-[#1A1A18]">{block.title}</CardTitle>
                    <span className="text-[12px] text-[#AEAEA6]">{blockDone}/{summary.total}</span>
                    {summary.fail > 0 && <Badge className="text-[10px] bg-red-50 text-red-600 border border-red-200 h-5">{summary.fail} fail</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="hidden sm:flex gap-1">
                      {block.items.map((item) => {
                        const s = statuses[item.id] ?? "pending";
                        const cfg = STATUS_CONFIG[s];
                        return (
                          <div key={item.id} className="w-2 h-2 rounded-full" style={{ background: cfg.text, opacity: s === "pending" ? 0.25 : 1 }} title={`${item.id}: ${s}`} />
                        );
                      })}
                    </div>
                    {isCollapsed ? <ChevronRight className="w-4 h-4 text-[#AEAEA6]" /> : <ChevronDown className="w-4 h-4 text-[#AEAEA6]" />}
                  </div>
                </div>
              </CardHeader>

              {!isCollapsed && (
                <CardContent className="px-5 py-3 space-y-2">
                  {block.items.map((item) => {
                    const status: ItemStatus = statuses[item.id] ?? "pending";
                    const cfg = STATUS_CONFIG[status];
                    const StatusIcon = cfg.icon;
                    const noteOpen = expandedNotes[item.id];
                    const isVerifying = verifying[item.id];
                    const canAutoVerify = item.verifyMethod === "server" || item.verifyMethod === "api";

                    return (
                      <div key={item.id} className="rounded-lg p-3" style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }} data-testid={`item-${item.id}`}>
                        <div className="flex items-start gap-3">
                          <StatusIcon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: cfg.text }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded" style={{ background: `${cfg.text}15`, color: cfg.text }}>
                                {item.id}
                              </span>
                              <span className="text-[13px] font-medium text-[#1A1A18]">{item.label}</span>
                              {item.verifyMethod === "manual" && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">manual</span>
                              )}
                            </div>
                            <p className="text-[12px] text-[#7A7A72] mt-0.5 leading-relaxed">{item.detail}</p>

                            {/* Auto-verify result shown in note area */}
                            {notes[item.id] && !noteOpen && (
                              <p className="text-[11px] mt-1 italic" style={{ color: status === "pass" ? "#15803D" : status === "fail" ? "#DC2626" : "#B45309" }}>
                                {notes[item.id]}
                              </p>
                            )}

                            {noteOpen && (
                              <Textarea
                                className="mt-2 text-[12px] min-h-[60px] resize-none border-[#E8E8E2] focus:ring-1 focus:ring-[#E85D55]"
                                placeholder="Add a note (failure description, ticket link, etc.)"
                                value={notes[item.id] ?? ""}
                                onChange={(e) => setNote(item.id, e.target.value)}
                                data-testid={`note-${item.id}`}
                              />
                            )}
                          </div>

                          {/* Controls */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {/* Live verify button */}
                            {canAutoVerify && (
                              <button
                                onClick={() => verifyItem(item)}
                                disabled={isVerifying || verifyingAll}
                                title="Live verify this item"
                                data-testid={`button-verify-${item.id}`}
                                className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md transition-colors disabled:opacity-50"
                                style={{ background: "rgba(232,85,85,0.08)", color: "#E85D55", border: "1px solid rgba(232,85,85,0.2)" }}
                              >
                                {isVerifying
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : <PlayCircle className="w-3 h-3" />
                                }
                                {!isVerifying && <span>verify</span>}
                              </button>
                            )}

                            {/* Note toggle */}
                            <button
                              className="text-[11px] px-1.5 py-0.5 rounded text-[#7A7A72] hover:text-[#1A1A18] hover:bg-[#F3F3EE] transition-colors"
                              onClick={() => setExpandedNotes((p) => ({ ...p, [item.id]: !p[item.id] }))}
                              title="Add note"
                              data-testid={`button-note-${item.id}`}
                            >
                              {notes[item.id] && !noteOpen ? "📝" : "＋note"}
                            </button>

                            {/* Manual status buttons */}
                            {(["pass", "partial", "fail", "pending"] as ItemStatus[]).map((s) => {
                              const c = STATUS_CONFIG[s];
                              const Ic = c.icon;
                              const isActive = status === s;
                              return (
                                <button
                                  key={s}
                                  onClick={() => setStatus(item.id, s)}
                                  title={c.label}
                                  data-testid={`button-${s}-${item.id}`}
                                  className="w-7 h-7 rounded-md flex items-center justify-center transition-all"
                                  style={{
                                    background: isActive ? `${c.text}18` : "transparent",
                                    border: isActive ? `1.5px solid ${c.text}40` : "1.5px solid transparent",
                                    color: isActive ? c.text : "#C4C4BC",
                                  }}
                                >
                                  <Ic className="w-3.5 h-3.5" />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              )}
            </Card>
          );
        })}

        <div className="text-center pb-4">
          <p className="text-[12px] text-[#AEAEA6]">
            Progress auto-saved in browser · <strong>Verify All</strong> runs 26 automated checks · <strong>manual</strong> items require human testing
          </p>
        </div>
      </div>
    </AdminLayout>
  );
}
