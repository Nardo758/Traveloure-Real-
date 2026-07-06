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
} from "lucide-react";
import { useState, useEffect } from "react";

type ItemStatus = "pass" | "fail" | "partial" | "pending";

interface CheckItem {
  id: string;
  label: string;
  detail: string;
}

interface Block {
  id: string;
  title: string;
  icon: React.ElementType;
  color: string;
  items: CheckItem[];
}

const BLOCKS: Block[] = [
  {
    id: "security",
    title: "Security",
    icon: Shield,
    color: "#E85D55",
    items: [
      { id: "S1", label: "Role never taken from req.body", detail: "emailAuth.ts:98 — role: 'user' as const hardcoded" },
      { id: "S2", label: "Three-gate ProtectedRoute", detail: "Gate 1: auth → Gate 2: terms+privacy → Gate 3: role" },
      { id: "S3", label: "ownershipGuard + [IDOR ATTEMPT] logging", detail: "server/middleware/ownershipGuard.ts applied to trips & bookings" },
      { id: "S4", label: "No secrets in client-side code", detail: "grep process.env ./client — only NODE_ENV in App.tsx" },
      { id: "S5", label: "Stripe webhook signature verification", detail: "stripe.webhooks.constructEvent(req.rawBody, sig, secret)" },
      { id: "S6", label: "All admin endpoints protected", detail: "isAuthenticated + role===admin in admin, content, experts, payments routes" },
      { id: "S7", label: "Passwords hashed with scrypt", detail: "crypto.scrypt(password, salt, 64) with 16-byte random salt" },
      { id: "S8", label: "Rate limiting on auth routes", detail: "app.use('/api/auth', authRateLimiter) in server/index.ts:91" },
    ],
  },
  {
    id: "data",
    title: "Data Integrity",
    icon: Database,
    color: "#2563EB",
    items: [
      { id: "D1", label: "Critical DB constraints present", detail: "users.email UNIQUE, bookings idempotency UNIQUE, webhook_events.stripe_event_id UNIQUE, funnel_events FK" },
      { id: "D2", label: "6+ performance indexes present", detail: "40+ %idx% indexes confirmed via pg_indexes" },
      { id: "D3", label: "No orphaned data", detail: "0 trips with NULL user_id, 0 stuck webhooks, 0 stuck payments. 164 NULL trip_id bookings are intentional (trip_id nullable by design)" },
      { id: "D4", label: "Soft delete working", detail: "is_deleted + deleted_at on users; isAuthenticated rejects is_deleted=true" },
      { id: "D5", label: "Legacy expert_city_queues table gone", detail: "_deprecated_expert_city_queues exists; expert_city_queues does NOT exist" },
    ],
  },
  {
    id: "payments",
    title: "Payment Integrity",
    icon: CreditCard,
    color: "#16A34A",
    items: [
      { id: "P1", label: "Booking created before Stripe charge", detail: "Step A: INSERT payment_pending → Step B: PI.create() → Step C: stamp PI ID" },
      { id: "P2", label: "Idempotency protection end-to-end", detail: "DB pre-check WHERE idempotency_key + Stripe idempotencyKey header" },
      { id: "P3", label: "All webhook event cases handled", detail: "payment_intent.succeeded/failed, charge.dispute.created, account.updated all present" },
      { id: "P4", label: "Commission calculator correct", detail: "expertNew 15/85, expertEstablished 25/75, T1 12/88, T4 4/96, cart 30, credits 100" },
      { id: "P5", label: "Reconciliation job scheduled daily", detail: "setInterval(runStripeReconciliation, 24h) + GET /api/admin/reconciliation/run-now" },
      { id: "P6", label: "Dispute columns + endpoint exist", detail: "dispute_id, dispute_reason on bookings; GET /api/admin/disputes" },
    ],
  },
  {
    id: "leads",
    title: "Lead Flow",
    icon: Users,
    color: "#D97706",
    items: [
      { id: "L1", label: "Routing only scores approved experts", detail: "WHERE lef.status = 'approved' AND stripe_connect_status != 'restricted'" },
      { id: "L2", label: "Null-assign fallback complete", detail: "status→unassigned, admin_notifications insert, traveler FALLBACK_MESSAGE, [LEAD UNASSIGNED] log" },
      { id: "L3", label: "Dual flag: isRoutingEligible + isPayable", detail: "Expert dashboard returns both flags from status + stripeConnectStatus" },
      { id: "L4", label: "Lead routing audit log + override", detail: "lead_routing_logs table, GET /api/admin/lead-routing-logs, PATCH .../override" },
      { id: "L5", label: "Dead-end lead tested on real city", detail: "Use a city with zero approved experts — confirm traveler sees friendly fallback message" },
    ],
  },
  {
    id: "analytics",
    title: "Analytics",
    icon: BarChart3,
    color: "#7C3AED",
    items: [
      { id: "A1", label: "Funnel stages T1–T7 fire correctly", detail: "funnel_events.stage column (not funnel_stage). Run full user journey to populate all 7 stages." },
      { id: "A2", label: "GET /api/admin/funnel-stats returns data", detail: "Expects { windowDays: 30, stages: [...] } with T1+T2 counts > 0" },
      { id: "A3", label: "Revenue dashboard returns real data", detail: "GET /api/admin/revenue — real numbers, MoM growth %, at least 1 transaction" },
      { id: "A4", label: "Admin notifications endpoint live", detail: "GET /api/admin/notifications returns 200 JSON array with requireAdmin guard" },
    ],
  },
  {
    id: "code",
    title: "Code Quality",
    icon: Code2,
    color: "#0891B2",
    items: [
      { id: "C1", label: "Routes properly split by domain", detail: "admin.routes.ts, trips.routes.ts, experts.routes.ts, payments.routes.ts, webhooks.routes.ts, instagram.ts, my-itinerary.routes.ts all present" },
      { id: "C2", label: "All utility files exist", detail: "queryTimer, queryCounter, commissionCalculator, requestDeduplication, funnelTracker; dailyAdminDigest + stripeReconciliation in jobs/" },
      { id: "C3", label: "Migration safety files exist", detail: "scheduled_drop_deprecated_city_queues.sql + validate_before_drop_city_queues.ts (passes 5 checks)" },
      { id: "C4", label: "Signup page + /signup route", detail: "client/src/pages/Signup.tsx, Route path='/signup', ?ref= attribution captured" },
      { id: "C5", label: "Admin frontend components exist", detail: "FunnelChart.tsx, SlowQueryWidget.tsx, NotificationsPanel.tsx, PayoutBanner.tsx" },
    ],
  },
  {
    id: "test-accounts",
    title: "Test Accounts",
    icon: FlaskConical,
    color: "#BE185D",
    items: [
      { id: "T1", label: "All 5 test accounts exist + active", detail: "traveler, expert, provider, admin, ea @traveloure-test.com — all is_deleted=false" },
      { id: "T2", label: "Expert account fully verified", detail: "status=approved, stripe_connect_status=complete, identity_verification_status=verified" },
      { id: "T3", label: "Provider account fully verified", detail: "status=approved, business_verification_status=verified" },
      { id: "T4", label: "Test data seeded correctly", detail: "Expert: Tokyo Guide + Paris Insider. Provider: Photography + Airport Transfer. Traveler: Tokyo Adventure Sep 1–10 2026" },
    ],
  },
  {
    id: "production",
    title: "Production Readiness",
    icon: Rocket,
    color: "#374151",
    items: [
      { id: "R1", label: "Health check endpoint works", detail: "GET /health returns 503 when degraded (correct). DB check, memory check, pool check all present." },
      { id: "R2", label: "Global error handler exists", detail: "globalErrorHandler(err, req, res, next) in server/infrastructure/error-handler.ts; app.use(globalErrorHandler) registered" },
      { id: "R3", label: "SEO meta tags on index.html", detail: "<title>, <meta description>, <og:title>, <link rel=canonical href=https://traveloure.com/> all present" },
      { id: "R4", label: "No console.log in payment code", detail: "All payment/stripe/webhook operational logs converted to console.info — 0 console.log remaining" },
    ],
  },
];

const STATUS_CONFIG: Record<ItemStatus, { label: string; icon: React.ElementType; bg: string; border: string; text: string }> = {
  pass:    { label: "Pass",    icon: CheckCircle2,   bg: "rgba(22,163,74,0.07)",  border: "rgba(22,163,74,0.2)",  text: "#15803D" },
  fail:    { label: "Fail",    icon: XCircle,        bg: "rgba(220,38,38,0.07)",  border: "rgba(220,38,38,0.2)",  text: "#DC2626" },
  partial: { label: "Partial", icon: AlertTriangle,  bg: "rgba(217,119,6,0.07)",  border: "rgba(217,119,6,0.2)",  text: "#B45309" },
  pending: { label: "Pending", icon: Circle,         bg: "rgba(107,114,128,0.05)", border: "rgba(107,114,128,0.15)", text: "#6B7280" },
};

const STORAGE_KEY = "traveloure_qa_checklist_v1";

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

export default function AdminQAChecklist() {
  const [state, setState] = useState<StoredState>(loadState);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});

  const { statuses, notes, tester } = state;

  useEffect(() => {
    saveState(state);
  }, [state]);

  const allItems = BLOCKS.flatMap((b) => b.items);
  const total = allItems.length;
  const passCount  = allItems.filter((i) => statuses[i.id] === "pass").length;
  const failCount  = allItems.filter((i) => statuses[i.id] === "fail").length;
  const partialCount = allItems.filter((i) => statuses[i.id] === "partial").length;
  const pendingCount = allItems.filter((i) => !statuses[i.id] || statuses[i.id] === "pending").length;
  const doneCount  = total - pendingCount;
  const pct = Math.round((doneCount / total) * 100);

  const allPassed = passCount === total;
  const hasFail   = failCount > 0;

  function setStatus(id: string, status: ItemStatus) {
    setState((prev) => ({ ...prev, statuses: { ...prev.statuses, [id]: status } }));
  }

  function setNote(id: string, value: string) {
    setState((prev) => ({ ...prev, notes: { ...prev.notes, [id]: value } }));
  }

  function resetAll() {
    if (!confirm("Reset all checklist progress? This cannot be undone.")) return;
    const fresh: StoredState = { statuses: {}, notes: {}, tester: state.tester, startedAt: new Date().toISOString() };
    setState(fresh);
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
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
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

  const progressColor = hasFail ? "#DC2626" : allPassed ? "#16A34A" : "#E85D55";

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
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-[#7A7A72]" />
                  <span className="text-[15px] font-semibold text-[#1A1A18]">Architect Sign-Off QA</span>
                  {allPassed && (
                    <Badge className="bg-green-50 text-green-700 border border-green-200 text-[11px]">
                      ✅ CLEARED
                    </Badge>
                  )}
                  {hasFail && (
                    <Badge className="bg-red-50 text-red-700 border border-red-200 text-[11px]">
                      ❌ BLOCKED
                    </Badge>
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
              <div className="flex gap-2 flex-shrink-0">
                <Button
                  variant="outline" size="sm"
                  className="text-[13px] h-8 gap-1.5 border-[#E8E8E2] text-[#7A7A72] hover:text-[#1A1A18]"
                  onClick={exportReport}
                  data-testid="button-export-report"
                >
                  <Download className="w-3.5 h-3.5" /> Export
                </Button>
                <Button
                  variant="outline" size="sm"
                  className="text-[13px] h-8 gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
                  onClick={resetAll}
                  data-testid="button-reset-checklist"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Reset
                </Button>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-4 h-1.5 rounded-full bg-[#F3F3EE] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: progressColor }}
              />
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
              {/* Block header */}
              <CardHeader
                className="py-3 px-5 cursor-pointer select-none"
                style={{ borderBottom: isCollapsed ? "none" : "1px solid #F3F3EE" }}
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
                          <div
                            key={item.id}
                            className="w-2 h-2 rounded-full"
                            style={{ background: cfg.text, opacity: s === "pending" ? 0.25 : 1 }}
                            title={`${item.id}: ${s}`}
                          />
                        );
                      })}
                    </div>
                    {isCollapsed ? <ChevronRight className="w-4 h-4 text-[#AEAEA6]" /> : <ChevronDown className="w-4 h-4 text-[#AEAEA6]" />}
                  </div>
                </div>
              </CardHeader>

              {/* Items */}
              {!isCollapsed && (
                <CardContent className="px-5 py-3 space-y-2">
                  {block.items.map((item) => {
                    const status: ItemStatus = statuses[item.id] ?? "pending";
                    const cfg = STATUS_CONFIG[status];
                    const StatusIcon = cfg.icon;
                    const noteOpen = expandedNotes[item.id];

                    return (
                      <div
                        key={item.id}
                        className="rounded-lg p-3"
                        style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
                        data-testid={`item-${item.id}`}
                      >
                        <div className="flex items-start gap-3">
                          <StatusIcon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: cfg.text }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded" style={{ background: `${cfg.text}15`, color: cfg.text }}>
                                {item.id}
                              </span>
                              <span className="text-[13px] font-medium text-[#1A1A18]">{item.label}</span>
                            </div>
                            <p className="text-[12px] text-[#7A7A72] mt-0.5 leading-relaxed">{item.detail}</p>

                            {/* Note */}
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
                            <button
                              className="text-[11px] px-1.5 py-0.5 rounded text-[#7A7A72] hover:text-[#1A1A18] hover:bg-[#F3F3EE] transition-colors"
                              onClick={() => setExpandedNotes((p) => ({ ...p, [item.id]: !p[item.id] }))}
                              title="Add note"
                              data-testid={`button-note-${item.id}`}
                            >
                              {notes[item.id] ? "📝" : "＋note"}
                            </button>
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

        {/* Footer */}
        <div className="text-center pb-4">
          <p className="text-[12px] text-[#AEAEA6]">
            Progress auto-saved in browser. Use Export to create a shareable report.
          </p>
        </div>
      </div>
    </AdminLayout>
  );
}
