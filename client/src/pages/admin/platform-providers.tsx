import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity, CheckCircle, ExternalLink, RefreshCw,
  Globe, Brain, Map, Search, Ticket, Train, Hotel,
  DollarSign, TrendingUp, XCircle, HelpCircle, Loader2, Mail, Archive,
} from "lucide-react";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminErrorBanner } from "@/components/admin/AdminErrorBanner";

// L5 fix (docs/audits/ux-walkthrough-5-roles-jul29.md, §13 class): this page used to be a
// static PROVIDERS array of hand-typed numbers (Claude "42,180 requests / $284.40",
// "$12,270 affiliate revenue MTD", fake latency/uptime/status) that contradicted the honest
// $0 shown on Revenue and AI Costs one click away. Every metric below is now sourced from
// the same real endpoints those two pages use — no invented numbers. A provider with no
// real usage/cost/revenue pipeline (Google Maps, 12Go Asia — nothing logs their calls or
// commissions today) is labeled "Not tracked" instead of a fabricated figure.

interface ProviderMeta {
  id: string;
  name: string;
  category: "AI" | "Booking" | "Maps" | "Search" | "Transport" | "Events" | "Email";
  /** Integration was dropped — render a Decommissioned badge, never Connected. */
  decommissioned?: boolean;
  description: string;
  icon: string;
  type: "API" | "Affiliate";
  commission?: string; // informational partnership term, not a live metric
  docsUrl: string;
  // How this provider's real numbers are sourced below — used to render the honest
  // "Not tracked" state for providers with no logging pipeline yet.
  source: "ai-usage" | "api-costs" | "affiliate-commission" | "untracked";
  aiProviderKey?: string; // key into ai-usage byProvider
  apiCostsLabel?: string; // display label used by api-costs.service.ts entries
  affiliateKey?: "viator" | "fever" | "bookingCom";
}

const PROVIDER_META: ProviderMeta[] = [
  {
    id: "anthropic",
    name: "Anthropic Claude",
    category: "AI",
    description: "Empathetic chat, itinerary optimization, and nuanced travel advice.",
    icon: "🧠",
    type: "API",
    docsUrl: "https://docs.anthropic.com",
    source: "ai-usage",
    aiProviderKey: "anthropic",
  },
  {
    id: "xai",
    name: "Grok (xAI)",
    category: "AI",
    description: "Expert matching, real-time intelligence, and hidden gem discovery.",
    icon: "⚡",
    type: "API",
    docsUrl: "https://x.ai/api",
    source: "ai-usage",
    aiProviderKey: "grok",
  },
  {
    id: "viator",
    name: "Viator",
    category: "Booking",
    description: "Real-time tours and activities search with affiliate booking links.",
    icon: "🎭",
    type: "Affiliate",
    commission: "8%",
    docsUrl: "https://docs.viator.com",
    source: "affiliate-commission",
    affiliateKey: "viator",
  },
  {
    id: "amadeus",
    name: "Amadeus",
    category: "Booking",
    description:
      "Decommissioned Aug 2026 — integration dropped and service code removed. Shown for historical API-cost records only.",
    icon: "✈️",
    type: "API",
    decommissioned: true,
    docsUrl: "https://developers.amadeus.com",
    source: "api-costs",
    apiCostsLabel: "Amadeus",
  },
  {
    id: "booking",
    name: "Booking.com",
    category: "Booking",
    description: "Hotel search and affiliate bookings.",
    icon: "🏨",
    type: "Affiliate",
    commission: "4–8%",
    docsUrl: "https://developers.booking.com",
    source: "affiliate-commission",
    affiliateKey: "bookingCom",
  },
  {
    id: "12go",
    name: "12Go Asia",
    category: "Transport",
    description: "Ground transportation affiliate bookings across Asia.",
    icon: "🚅",
    type: "Affiliate",
    commission: "3–5%",
    docsUrl: "https://12go.asia/en/affiliate",
    source: "untracked",
  },
  {
    id: "googlemaps",
    name: "Google Maps",
    category: "Maps",
    description: "Interactive mapping, route visualization, and transit information.",
    icon: "🗺️",
    type: "API",
    docsUrl: "https://developers.google.com/maps",
    source: "untracked",
  },
  {
    id: "serpapi",
    name: "SerpAPI",
    category: "Search",
    description: "Venue searches for restaurants, attractions, and nightlife.",
    icon: "🔍",
    type: "API",
    docsUrl: "https://serpapi.com/docs",
    source: "api-costs",
    apiCostsLabel: "SerpAPI",
  },
  {
    id: "fever",
    name: "Fever",
    category: "Events",
    description: "Event discovery and ticketing with affiliate revenue.",
    icon: "🎟️",
    type: "Affiliate",
    commission: "5%",
    docsUrl: "https://partners.feverup.com",
    source: "affiliate-commission",
    affiliateKey: "fever",
  },
  {
    id: "resend",
    name: "Resend",
    category: "Email",
    description: "Transactional email — booking confirmations, password resets, admin digests.",
    icon: "✉️",
    type: "API",
    docsUrl: "https://resend.com/docs",
    source: "untracked",
  },
];

const CATEGORY_ICONS: Record<string, any> = {
  AI: Brain,
  Booking: Hotel,
  Maps: Map,
  Search: Search,
  Transport: Train,
  Events: Ticket,
  Email: Mail,
};

interface AiUsageSummary {
  byProvider: Record<string, { calls: number; tokens: number; costCents: number }>;
}

interface ApiCostsSummary {
  entries: { provider: string; calls: number; costDollars: number }[];
  totalCostDollars: number;
}

interface AffiliateStream {
  configured: boolean;
  thisMonth: number;
  total: number;
  currency: string;
}

interface UnifiedRevenue {
  viator: AffiliateStream;
  fever: AffiliateStream;
  bookingCom: AffiliateStream;
  apiCosts: ApiCostsSummary;
}

interface IntegrationStatus {
  providers: Record<string, { configured: boolean }>;
}

function money(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Status badge driven by REAL configuration (secret presence, from /api/admin/integration-status) —
// never inferred from usage/revenue data provenance.
function ResolvedBadge({ configured, decommissioned }: { configured?: boolean; decommissioned?: boolean }) {
  if (decommissioned) {
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1" data-testid="badge-decommissioned">
        <Archive className="w-3 h-3" /> Decommissioned
      </Badge>
    );
  }
  if (configured === undefined) {
    return (
      <Badge className="bg-gray-100 text-gray-500 border-gray-200 gap-1" data-testid="badge-status-unknown">
        <HelpCircle className="w-3 h-3" /> Status unknown
      </Badge>
    );
  }
  if (!configured) {
    return (
      <Badge className="bg-gray-100 text-gray-500 border-gray-200 gap-1" data-testid="badge-not-connected">
        <XCircle className="w-3 h-3" /> Not connected
      </Badge>
    );
  }
  return (
    <Badge className="bg-green-100 text-green-700 border-green-200 gap-1" data-testid="badge-connected">
      <CheckCircle className="w-3 h-3" /> Connected
    </Badge>
  );
}

export default function AdminPlatformProviders() {
  const [filter, setFilter] = useState<"all" | ProviderMeta["category"]>("all");
  const queryClient = useQueryClient();

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const { data: aiSummary, isLoading: aiLoading, isError: aiError } = useQuery<AiUsageSummary>({
    queryKey: ["/api/admin/ai-usage/summary", monthStart],
    queryFn: () =>
      fetch(`/api/admin/ai-usage/summary?startDate=${encodeURIComponent(monthStart)}`).then((r) => {
        if (!r.ok) throw new Error("Failed to load AI usage summary");
        return r.json();
      }),
  });

  const { data: unified, isLoading: unifiedLoading, isError: unifiedError } = useQuery<UnifiedRevenue>({
    queryKey: ["/api/admin/revenue/unified", "this_month"],
    queryFn: () =>
      fetch(`/api/admin/revenue/unified?period=this_month`).then((r) => {
        if (!r.ok) throw new Error("Failed to load unified revenue");
        return r.json();
      }),
  });

  // Real configuration status (secret presence per provider) — the source of the Connected /
  // Not connected badge. Usage/revenue provenance is no longer used to infer connection status.
  const { data: integrationStatus, isLoading: statusLoading, isError: statusError } = useQuery<IntegrationStatus>({
    queryKey: ["/api/admin/integration-status"],
    queryFn: () =>
      fetch(`/api/admin/integration-status`).then((r) => {
        if (!r.ok) throw new Error("Failed to load integration status");
        return r.json();
      }),
  });

  const isLoading = aiLoading || unifiedLoading || statusLoading;
  const isError = aiError || unifiedError || statusError;

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-usage/summary"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/revenue/unified"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/integration-status"] });
  };

  // Resolve each provider's real numbers. tracked=false means "no logging pipeline exists
  // for this integration" — rendered as an honest "Not tracked" state, never a guess.
  // `configured` comes exclusively from the integration-status endpoint (secret presence).
  const resolved = PROVIDER_META.map((p) => {
    const configured = integrationStatus?.providers?.[p.id]?.configured;
    if (p.source === "ai-usage") {
      const row = aiSummary?.byProvider?.[p.aiProviderKey!];
      return {
        ...p,
        tracked: true,
        configured,
        requests: row?.calls ?? 0,
        costDollars: row ? row.costCents / 100 : 0,
        revenueDollars: null as number | null,
      };
    }
    if (p.source === "api-costs") {
      const row = unified?.apiCosts?.entries?.find((e) => e.provider === p.apiCostsLabel);
      return {
        ...p,
        tracked: true,
        configured,
        requests: row?.calls ?? 0,
        costDollars: row?.costDollars ?? 0,
        revenueDollars: null as number | null,
      };
    }
    if (p.source === "affiliate-commission") {
      const stream = unified?.[p.affiliateKey!];
      return {
        ...p,
        tracked: true,
        configured,
        requests: null as number | null,
        costDollars: 0,
        revenueDollars: stream?.thisMonth ?? 0,
      };
    }
    return {
      ...p,
      tracked: false,
      configured,
      requests: null as number | null,
      costDollars: 0,
      revenueDollars: null as number | null,
    };
  });

  const categories = ["all", ...Array.from(new Set(PROVIDER_META.map((p) => p.category)))] as const;
  const filtered = filter === "all" ? resolved : resolved.filter((p) => p.category === filter);

  const connectedCount = resolved.filter((p) => !p.decommissioned && p.configured === true).length;
  const notConnectedCount = resolved.filter((p) => !p.decommissioned && p.configured === false).length;
  const totalCost = resolved.reduce((sum, p) => sum + p.costDollars, 0);
  const totalRevenue = resolved.reduce((sum, p) => sum + (p.revenueDollars ?? 0), 0);

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Platform API Providers</h1>
            <p className="text-sm text-gray-500 mt-1">
              All external APIs, affiliate integrations, and AI services powering Traveloure.
              Numbers are pulled live from the same sources as Revenue and AI Costs.
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={handleRefresh} data-testid="button-refresh-providers">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
        </div>

        {isError && (
          <AdminErrorBanner
            label="Couldn't load provider usage — server error."
            onRetry={handleRefresh}
            testId="banner-providers-error"
          />
        )}

        {/* Summary stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Connected", value: isLoading ? "…" : connectedCount, icon: CheckCircle, color: "text-green-600", bg: "bg-green-50" },
            { label: "Not connected", value: isLoading ? "…" : notConnectedCount, icon: XCircle, color: "text-gray-500", bg: "bg-gray-50" },
            { label: "API cost (MTD)", value: isLoading ? "…" : money(totalCost), icon: DollarSign, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Affiliate revenue (MTD)", value: isLoading ? "…" : money(totalRevenue), icon: TrendingUp, color: "text-violet-600", bg: "bg-violet-50" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg ${s.bg} flex items-center justify-center`}>
                  <s.icon className={`w-5 h-5 ${s.color}`} />
                </div>
                <div>
                  <div className="text-xl font-bold text-gray-900">{s.value}</div>
                  <div className="text-xs text-gray-500">{s.label}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Category filter */}
        <div className="flex gap-2 flex-wrap">
          {categories.map((c) => {
            const Icon = c !== "all" ? CATEGORY_ICONS[c] : Globe;
            return (
              <button
                key={c}
                onClick={() => setFilter(c as any)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  filter === c
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                }`}
                data-testid={`filter-${c}`}
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                {c === "all" ? "All Providers" : c}
              </button>
            );
          })}
        </div>

        {/* Provider cards */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((p) => {
              return (
                <Card key={p.id} className={`border ${!p.tracked ? "opacity-70" : ""}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      {/* Icon */}
                      <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-2xl flex-shrink-0">
                        {p.icon}
                      </div>

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-base font-semibold text-gray-900">{p.name}</span>
                          <ResolvedBadge configured={p.configured} decommissioned={p.decommissioned} />
                          <Badge className="bg-blue-100 text-blue-700 border-blue-200">{p.type}</Badge>
                          {p.commission && (
                            <Badge className="bg-green-100 text-green-700 border-green-200">
                              {p.commission} commission
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mb-3">{p.description}</p>

                        {/* Metrics row */}
                        {p.tracked ? (
                          <div className="flex flex-wrap gap-5">
                            {p.requests !== null && (
                              <div className="flex items-center gap-1.5">
                                <Activity className="w-3.5 h-3.5 text-gray-400" />
                                <span className="text-xs text-gray-500">Requests (MTD):</span>
                                <span className="text-xs font-semibold text-gray-700">
                                  {p.requests.toLocaleString()}
                                </span>
                              </div>
                            )}
                            {p.costDollars > 0 && (
                              <div className="flex items-center gap-1.5">
                                <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                                <span className="text-xs text-gray-500">Cost (MTD):</span>
                                <span className="text-xs font-semibold text-gray-700">{money(p.costDollars)}</span>
                              </div>
                            )}
                            {p.revenueDollars !== null && (
                              <div className="flex items-center gap-1.5">
                                <TrendingUp className="w-3.5 h-3.5 text-green-500" />
                                <span className="text-xs text-gray-500">Revenue (MTD):</span>
                                <span className="text-xs font-semibold text-green-700">
                                  {p.revenueDollars > 0 ? money(p.revenueDollars) : "$0.00"}
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 italic">
                            No usage/cost data recorded yet for this integration.
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs"
                          onClick={() => window.open(p.docsUrl, "_blank")}
                          data-testid={`btn-docs-${p.id}`}
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> Docs
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
