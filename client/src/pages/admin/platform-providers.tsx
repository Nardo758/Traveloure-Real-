import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity, AlertTriangle, CheckCircle, ExternalLink, RefreshCw,
  Zap, Globe, Brain, Map, Search, Ticket, Train, Hotel, ShoppingBag,
  DollarSign, TrendingUp, Clock, XCircle,
} from "lucide-react";
import { useState } from "react";

interface PlatformProvider {
  id: string;
  name: string;
  category: "AI" | "Booking" | "Maps" | "Search" | "Transport" | "Events";
  description: string;
  icon: string;
  status: "active" | "degraded" | "inactive";
  type: "API" | "Affiliate" | "OAuth";
  commission?: string;
  requestsThisMonth: number;
  costThisMonth: string;
  revenueThisMonth?: string;
  latencyMs: number;
  uptime: string;
  lastChecked: string;
  docsUrl: string;
}

const PROVIDERS: PlatformProvider[] = [
  {
    id: "anthropic",
    name: "Anthropic Claude",
    category: "AI",
    description: "Empathetic chat, itinerary optimization, and nuanced travel advice.",
    icon: "🧠",
    status: "active",
    type: "API",
    requestsThisMonth: 42_180,
    costThisMonth: "$284.40",
    latencyMs: 1240,
    uptime: "99.98%",
    lastChecked: "2 min ago",
    docsUrl: "https://docs.anthropic.com",
  },
  {
    id: "xai",
    name: "Grok (xAI)",
    category: "AI",
    description: "Expert matching, real-time intelligence, and hidden gem discovery.",
    icon: "⚡",
    status: "active",
    type: "API",
    requestsThisMonth: 31_554,
    costThisMonth: "$196.80",
    latencyMs: 890,
    uptime: "99.94%",
    lastChecked: "2 min ago",
    docsUrl: "https://x.ai/api",
  },
  {
    id: "viator",
    name: "Viator",
    category: "Booking",
    description: "Real-time tours and activities search with affiliate booking links.",
    icon: "🎭",
    status: "active",
    type: "Affiliate",
    commission: "8%",
    requestsThisMonth: 18_902,
    costThisMonth: "$0",
    revenueThisMonth: "$4,210",
    latencyMs: 340,
    uptime: "99.72%",
    lastChecked: "4 min ago",
    docsUrl: "https://docs.viator.com",
  },
  {
    id: "amadeus",
    name: "Amadeus",
    category: "Booking",
    description: "Flights, hotels, POI discovery, airport transfers, and safety ratings.",
    icon: "✈️",
    status: "active",
    type: "API",
    requestsThisMonth: 9_441,
    costThisMonth: "$118.20",
    latencyMs: 620,
    uptime: "99.81%",
    lastChecked: "5 min ago",
    docsUrl: "https://developers.amadeus.com",
  },
  {
    id: "booking",
    name: "Booking.com",
    category: "Booking",
    description: "Hotel search and affiliate bookings with 4–8% commission rates.",
    icon: "🏨",
    status: "active",
    type: "Affiliate",
    commission: "4–8%",
    requestsThisMonth: 12_340,
    costThisMonth: "$0",
    revenueThisMonth: "$6,820",
    latencyMs: 290,
    uptime: "99.90%",
    lastChecked: "3 min ago",
    docsUrl: "https://developers.booking.com",
  },
  {
    id: "12go",
    name: "12Go Asia",
    category: "Transport",
    description: "Ground transportation affiliate bookings across Asia.",
    icon: "🚅",
    status: "active",
    type: "Affiliate",
    commission: "3–5%",
    requestsThisMonth: 5_610,
    costThisMonth: "$0",
    revenueThisMonth: "$1,240",
    latencyMs: 410,
    uptime: "99.40%",
    lastChecked: "6 min ago",
    docsUrl: "https://12go.asia/en/affiliate",
  },
  {
    id: "googlemaps",
    name: "Google Maps",
    category: "Maps",
    description: "Interactive mapping, route visualization, and transit information.",
    icon: "🗺️",
    status: "active",
    type: "API",
    requestsThisMonth: 88_200,
    costThisMonth: "$176.40",
    latencyMs: 145,
    uptime: "99.99%",
    lastChecked: "1 min ago",
    docsUrl: "https://developers.google.com/maps",
  },
  {
    id: "serpapi",
    name: "SerpAPI",
    category: "Search",
    description: "Venue searches for restaurants, attractions, and nightlife.",
    icon: "🔍",
    status: "degraded",
    type: "API",
    requestsThisMonth: 7_820,
    costThisMonth: "$62.56",
    latencyMs: 1850,
    uptime: "97.12%",
    lastChecked: "8 min ago",
    docsUrl: "https://serpapi.com/docs",
  },
  {
    id: "fever",
    name: "Fever",
    category: "Events",
    description: "Event discovery and ticketing with affiliate revenue.",
    icon: "🎟️",
    status: "inactive",
    type: "Affiliate",
    commission: "5%",
    requestsThisMonth: 0,
    costThisMonth: "$0",
    revenueThisMonth: "$0",
    latencyMs: 0,
    uptime: "—",
    lastChecked: "—",
    docsUrl: "https://partners.feverup.com",
  },
];

const CATEGORY_ICONS: Record<string, any> = {
  AI: Brain,
  Booking: Hotel,
  Maps: Map,
  Search: Search,
  Transport: Train,
  Events: Ticket,
};

function StatusBadge({ status }: { status: PlatformProvider["status"] }) {
  if (status === "active") {
    return (
      <Badge className="bg-green-100 text-green-700 border-green-200 gap-1">
        <CheckCircle className="w-3 h-3" /> Active
      </Badge>
    );
  }
  if (status === "degraded") {
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1">
        <AlertTriangle className="w-3 h-3" /> Degraded
      </Badge>
    );
  }
  return (
    <Badge className="bg-gray-100 text-gray-500 border-gray-200 gap-1">
      <XCircle className="w-3 h-3" /> Inactive
    </Badge>
  );
}

function TypeBadge({ type }: { type: PlatformProvider["type"] }) {
  const map: Record<string, string> = {
    API: "bg-blue-100 text-blue-700 border-blue-200",
    Affiliate: "bg-violet-100 text-violet-700 border-violet-200",
    OAuth: "bg-orange-100 text-orange-700 border-orange-200",
  };
  return <Badge className={map[type]}>{type}</Badge>;
}

export default function AdminPlatformProviders() {
  const [filter, setFilter] = useState<"all" | PlatformProvider["category"]>("all");

  const categories = ["all", ...Array.from(new Set(PROVIDERS.map(p => p.category)))] as const;
  const filtered = filter === "all" ? PROVIDERS : PROVIDERS.filter(p => p.category === filter);

  const active = PROVIDERS.filter(p => p.status === "active").length;
  const degraded = PROVIDERS.filter(p => p.status === "degraded").length;
  const totalCost = "$837.36";
  const totalRevenue = "$12,270";

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Platform API Providers</h1>
            <p className="text-sm text-gray-500 mt-1">
              All external APIs, affiliate integrations, and AI services powering Traveloure.
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh All
          </Button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Active integrations", value: active, icon: CheckCircle, color: "text-green-600", bg: "bg-green-50" },
            { label: "Degraded", value: degraded, icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50" },
            { label: "API cost (MTD)", value: totalCost, icon: DollarSign, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Affiliate revenue (MTD)", value: totalRevenue, icon: TrendingUp, color: "text-violet-600", bg: "bg-violet-50" },
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
          {categories.map(c => {
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
        <div className="space-y-3">
          {filtered.map((p) => {
            const CategoryIcon = CATEGORY_ICONS[p.category];
            return (
              <Card key={p.id} className={`border ${p.status === "degraded" ? "border-amber-200 bg-amber-50/30" : p.status === "inactive" ? "opacity-60" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-2xl flex-shrink-0">
                      {p.icon}
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-base font-semibold text-gray-900">{p.name}</span>
                        <StatusBadge status={p.status} />
                        <TypeBadge type={p.type} />
                        {p.commission && (
                          <Badge className="bg-green-100 text-green-700 border-green-200">
                            {p.commission} commission
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mb-3">{p.description}</p>

                      {/* Metrics row */}
                      <div className="flex flex-wrap gap-5">
                        <div className="flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-xs text-gray-500">Requests (MTD):</span>
                          <span className="text-xs font-semibold text-gray-700">
                            {p.requestsThisMonth.toLocaleString()}
                          </span>
                        </div>
                        {p.costThisMonth !== "$0" && (
                          <div className="flex items-center gap-1.5">
                            <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                            <span className="text-xs text-gray-500">Cost (MTD):</span>
                            <span className="text-xs font-semibold text-gray-700">{p.costThisMonth}</span>
                          </div>
                        )}
                        {p.revenueThisMonth && p.revenueThisMonth !== "$0" && (
                          <div className="flex items-center gap-1.5">
                            <TrendingUp className="w-3.5 h-3.5 text-green-500" />
                            <span className="text-xs text-gray-500">Revenue (MTD):</span>
                            <span className="text-xs font-semibold text-green-700">{p.revenueThisMonth}</span>
                          </div>
                        )}
                        {p.latencyMs > 0 && (
                          <div className="flex items-center gap-1.5">
                            <Zap className="w-3.5 h-3.5 text-gray-400" />
                            <span className="text-xs text-gray-500">Avg latency:</span>
                            <span className={`text-xs font-semibold ${p.latencyMs > 1500 ? "text-amber-600" : "text-gray-700"}`}>
                              {p.latencyMs}ms
                            </span>
                          </div>
                        )}
                        {p.uptime !== "—" && (
                          <div className="flex items-center gap-1.5">
                            <CheckCircle className="w-3.5 h-3.5 text-gray-400" />
                            <span className="text-xs text-gray-500">Uptime:</span>
                            <span className={`text-xs font-semibold ${parseFloat(p.uptime) < 99 ? "text-amber-600" : "text-gray-700"}`}>
                              {p.uptime}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-xs text-gray-500">Last checked:</span>
                          <span className="text-xs font-semibold text-gray-700">{p.lastChecked}</span>
                        </div>
                      </div>
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
                      {p.status === "inactive" ? (
                        <Button size="sm" className="gap-1.5 text-xs bg-gray-900 hover:bg-gray-800" data-testid={`btn-enable-${p.id}`}>
                          Enable
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" className="gap-1.5 text-xs" data-testid={`btn-configure-${p.id}`}>
                          Configure
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Degraded alert */}
                  {p.status === "degraded" && (
                    <div className="mt-3 flex items-center gap-2 p-2.5 bg-amber-100 border border-amber-200 rounded-lg">
                      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      <span className="text-xs text-amber-700 font-medium">
                        Elevated latency detected ({p.latencyMs}ms avg). Fallback search active. Check API quota and rate limits.
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </AdminLayout>
  );
}
