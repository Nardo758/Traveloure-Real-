/**
 * /admin/markets — the "Add market" console (CLAUDE.md market-geography ruling, migration 186,
 * Aug 9 2026). Runs the server-side Overpass extract (server/routes/admin-markets.routes.ts →
 * server/services/market-extract.service.ts) and stores the result in `market_geography`,
 * optionally seeding `city_neighborhoods` from the same bbox. Read-only checklist state is
 * reported honestly — a check the server couldn't compute renders as "unavailable", never a
 * guessed value (§13).
 *
 * The "Manual launch steps" panel below hardcodes a summary of docs/MARKET_LAUNCH_CHECKLIST.md —
 * that file is the canonical text; keep both in sync when either changes.
 */
import { useState } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Map, Plus, RefreshCw, CheckCircle2, XCircle, HelpCircle, Loader2 } from "lucide-react";

type WayCounts = {
  water?: { kept: number; total: number };
  parks?: { kept: number; total: number };
  roads?: { kept: number; total: number };
} | null;

interface ChecklistItem {
  ok: boolean;
  count?: number;
  wayCounts?: WayCounts;
}

interface AdminMarketRow {
  market: string;
  displayName: string | null;
  country: string | null;
  bbox: [number, number, number, number];
  wayCounts: WayCounts;
  extractedAt: string | null;
  neighborhoodCount: number;
  launchChecklist: {
    geographyReady: ChecklistItem;
    neighborhoodsSeeded: ChecklistItem;
    approvedLodgingWithCoords: ChecklistItem | null;
    dmoContentVisible: ChecklistItem | null;
    dmoSourceKit: ChecklistItem | null;
  };
}

function wayCountsLabel(wc: WayCounts): string {
  if (!wc) return "—";
  const parts = (["water", "parks", "roads"] as const)
    .filter((k) => wc[k])
    .map((k) => `${k} ${wc[k]!.kept}/${wc[k]!.total}`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function ChecklistBadge({ label, item }: { label: string; item: ChecklistItem | null }) {
  if (item === null) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-gray-400" title={`${label}: not computed`}>
        <HelpCircle className="h-3 w-3" /> {label} unavailable
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium ${item.ok ? "text-green-700" : "text-amber-700"}`}
      title={label}
    >
      {item.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {label}
      {item.count != null ? ` (${item.count})` : ""}
    </span>
  );
}

const OVERPASS_BBOX_HINT =
  "Bbox order is [west, south, east, north] in decimal degrees. A quick way to find one: draw a box on a site like bboxfinder.com over the city core and copy its 4 numbers in that order. Keep each side to roughly 1 degree or less — Overpass rejects huge boxes.";

// 3.5 Item 3 — the ADMIN cross-market demand view. Reads /api/admin/demand-rollup (cross_partner
// floor, R27; includes the __unmapped__ bucket, R13). The admin is NOT the party a figure is about,
// so its floor is 10 whatever the cell's grain — the server enforces this; the page only renders it.
const UNMAPPED_MARKET_SLUG = "__unmapped__";
interface AdminRollupBucket {
  slipAmount: number | null; slipCount: number; slipValuedCount: number;
  stayTrips: number; stayNights: number; stayTravelers: number | null;
}
interface AdminRollupSummary { marketSlug: string; requested: AdminRollupBucket; missed: AdminRollupBucket }
interface AdminRollupRow { marketSlug: string; status: "ok" | "no_data"; n: number }
interface AdminRollupResult {
  cadence: string; floor: number; summary: AdminRollupSummary[]; rows: AdminRollupRow[];
}
function usd(n: number | null): string {
  return n == null ? "—" : n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function marketLabel(slug: string): string {
  return slug === UNMAPPED_MARKET_SLUG ? "Unmapped destinations" : slug;
}

export default function AdminMarkets() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery<{ markets: AdminMarketRow[] }>({
    queryKey: ["/api/admin/markets"],
  });

  // 3.5 Item 3 — cross-market unmet demand (admin cross_partner read, incl. __unmapped__).
  const { data: demand } = useQuery<AdminRollupResult>({
    queryKey: ["/api/admin/demand-rollup"],
  });

  const [showForm, setShowForm] = useState(false);
  const [market, setMarket] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [country, setCountry] = useState("");
  const [west, setWest] = useState("");
  const [south, setSouth] = useState("");
  const [east, setEast] = useState("");
  const [north, setNorth] = useState("");
  const [seedNeighborhoods, setSeedNeighborhoods] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const addMutation = useMutation({
    mutationFn: async () => {
      const bbox = [Number(west), Number(south), Number(east), Number(north)];
      return apiRequest("POST", "/api/admin/markets", {
        market: market.trim().toLowerCase(),
        displayName: displayName.trim(),
        country: country.trim(),
        bbox,
        seedNeighborhoods,
      });
    },
    onSuccess: async (res) => {
      const body = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/markets"] });
      toast({
        title: "Market added",
        description: `Geography stored${body?.neighborhoods ? ` · neighborhoods: ${body.neighborhoods.inserted} inserted, ${body.neighborhoods.skipped} skipped${body.neighborhoods.error ? ` (${body.neighborhoods.error})` : ""}` : ""}`,
      });
      setShowForm(false);
      setMarket(""); setDisplayName(""); setCountry("");
      setWest(""); setSouth(""); setEast(""); setNorth("");
      setFormError(null);
    },
    onError: async (err: any) => {
      let message = err?.message ?? "Failed to add market";
      // Surface the server's honest Overpass-unavailable message verbatim when present.
      try {
        const parsed = JSON.parse(err?.message?.replace(/^\d+:\s*/, "") ?? "{}");
        if (parsed?.message) message = parsed.message;
      } catch {
        // err.message wasn't JSON — keep the raw message
      }
      setFormError(message);
      toast({ title: "Could not add market", description: message, variant: "destructive" });
    },
  });

  const refreshMutation = useMutation({
    mutationFn: async (slug: string) => apiRequest("POST", `/api/admin/markets/${encodeURIComponent(slug)}/refresh-geography`),
    onSuccess: (_res, slug) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/markets"] });
      toast({ title: `Geography refreshed for "${slug}"` });
    },
    onError: async (err: any, slug) => {
      let message = err?.message ?? "Refresh failed";
      try {
        const parsed = JSON.parse(err?.message?.replace(/^\d+:\s*/, "") ?? "{}");
        if (parsed?.message) message = parsed.message;
      } catch {
        // not JSON — keep raw message
      }
      toast({ title: `Could not refresh "${slug}"`, description: message, variant: "destructive" });
    },
  });

  const markets = data?.markets ?? [];

  // Per-market floor STATUS (not a demand figure — status/max only, no client math over amounts):
  // a market is "below floor" when every one of its cells is suppressed. Cleared markets carry
  // figures in `summary`; below-floor ones are named honestly, never shown with a guessed number.
  const clearedMarkets = new Set((demand?.summary ?? []).map((s) => s.marketSlug));
  const belowFloorMarkets: string[] = [];
  const seenBelow = new Set<string>();
  for (const r of demand?.rows ?? []) {
    if (clearedMarkets.has(r.marketSlug) || seenBelow.has(r.marketSlug)) continue;
    // only add once we've confirmed no cell for this market cleared the floor
    const anyOk = (demand?.rows ?? []).some((x) => x.marketSlug === r.marketSlug && x.status === "ok");
    if (!anyOk) { belowFloorMarkets.push(r.marketSlug); seenBelow.add(r.marketSlug); }
  }
  belowFloorMarkets.sort();

  const submit = () => {
    setFormError(null);
    if (!/^[a-z0-9-]{2,60}$/.test(market.trim().toLowerCase())) {
      setFormError("Slug must be lowercase letters, numbers and hyphens (2-60 chars).");
      return;
    }
    if (!displayName.trim() || !country.trim()) {
      setFormError("Display name and country are required.");
      return;
    }
    const nums = [west, south, east, north].map(Number);
    if (nums.some((n) => !Number.isFinite(n))) {
      setFormError("Bbox values must all be numbers.");
      return;
    }
    addMutation.mutate();
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6" data-testid="page-admin-markets">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Map className="h-6 w-6 text-blue-600" />
              Markets
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Self-rendered OSM geography per launch market — extracted server-side, no code commit
              per market.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} data-testid="button-refresh-markets">
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setShowForm((v) => !v)} data-testid="button-add-market">
              <Plus className="h-4 w-4 mr-1.5" />
              Add market
            </Button>
          </div>
        </div>

        {showForm && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add market</CardTitle>
              <CardDescription>
                Runs a server-side Overpass extract for water/parks/roads inside the bbox and stores
                it. Overpass calls can take up to a few minutes for a dense city core.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="market-slug" className="text-xs">Slug</Label>
                  <Input id="market-slug" value={market} onChange={(e) => setMarket(e.target.value)} placeholder="osaka" data-testid="input-market-slug" />
                </div>
                <div>
                  <Label htmlFor="market-display-name" className="text-xs">Display name</Label>
                  <Input id="market-display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Osaka" data-testid="input-market-display-name" />
                </div>
                <div>
                  <Label htmlFor="market-country" className="text-xs">Country</Label>
                  <Input id="market-country" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Japan" data-testid="input-market-country" />
                </div>
              </div>

              <div>
                <Label className="text-xs">Bbox (west, south, east, north)</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-1">
                  <Input value={west} onChange={(e) => setWest(e.target.value)} placeholder="west" data-testid="input-market-bbox-west" />
                  <Input value={south} onChange={(e) => setSouth(e.target.value)} placeholder="south" data-testid="input-market-bbox-south" />
                  <Input value={east} onChange={(e) => setEast(e.target.value)} placeholder="east" data-testid="input-market-bbox-east" />
                  <Input value={north} onChange={(e) => setNorth(e.target.value)} placeholder="north" data-testid="input-market-bbox-north" />
                </div>
                <p className="text-xs text-gray-400 mt-1">{OVERPASS_BBOX_HINT}</p>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="seed-neighborhoods"
                  checked={seedNeighborhoods}
                  onCheckedChange={(v) => setSeedNeighborhoods(!!v)}
                  data-testid="checkbox-seed-neighborhoods"
                />
                <Label htmlFor="seed-neighborhoods" className="text-sm font-normal">
                  Also seed neighborhoods from named OSM place nodes in this bbox
                </Label>
              </div>

              {formError && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" data-testid="text-market-form-error">
                  {formError}
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button onClick={submit} disabled={addMutation.isPending} data-testid="button-submit-market">
                  {addMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Run extract + save
                </Button>
                <Button variant="outline" onClick={() => setShowForm(false)} disabled={addMutation.isPending}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-5">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading markets…
              </div>
            ) : markets.length === 0 ? (
              <div className="text-sm text-gray-500 py-4" data-testid="text-markets-empty">
                No markets extracted yet. Add one above.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Market</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Country</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Extracted</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Way counts</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Neighborhoods</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Checklist</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {markets.map((m) => (
                      <tr key={m.market} className="border-b border-gray-100 hover:bg-gray-50" data-testid={`row-market-${m.market}`}>
                        <td className="py-2 px-3">
                          <p className="font-medium text-gray-900">{m.displayName ?? m.market}</p>
                          <p className="text-xs text-gray-400 font-mono">{m.market}</p>
                        </td>
                        <td className="py-2 px-3 text-xs text-gray-600">{m.country ?? "—"}</td>
                        <td className="py-2 px-3 text-xs text-gray-500">
                          {m.extractedAt ? new Date(m.extractedAt).toLocaleDateString() : "—"}
                        </td>
                        <td className="py-2 px-3 text-xs text-gray-600">{wayCountsLabel(m.wayCounts)}</td>
                        <td className="py-2 px-3">
                          <Badge variant="outline">{m.neighborhoodCount}</Badge>
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex flex-col gap-1">
                            <ChecklistBadge label="Geography" item={m.launchChecklist.geographyReady} />
                            <ChecklistBadge label="Neighborhoods" item={m.launchChecklist.neighborhoodsSeeded} />
                            <ChecklistBadge label="Lodging w/ coords" item={m.launchChecklist.approvedLodgingWithCoords} />
                            <ChecklistBadge label="DMO content visible" item={m.launchChecklist.dmoContentVisible} />
                            <ChecklistBadge label="Sources" item={m.launchChecklist.dmoSourceKit} />
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => refreshMutation.mutate(m.market)}
                            disabled={refreshMutation.isPending}
                            data-testid={`button-refresh-geo-${m.market}`}
                          >
                            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
                            Refresh geo
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 3.5 Item 3 — cross-market unmet demand. Admin is a CROSS-PARTNER reader (R27): its floor
            is the higher bar (server-enforced); below-floor markets are named, never numbered (§13).
            Includes the __unmapped__ bucket (R13) — unresolved destinations (Lisbon, SF, …). */}
        {demand && (
          <Card data-testid="card-admin-demand">
            <CardHeader>
              <CardTitle className="text-base">Cross-market unmet demand</CardTitle>
              <CardDescription>
                {demand.cadence} · cross-partner floor {demand.floor} (R27 — the admin is not the party
                a figure is about, so it reads at the higher bar). Requested and missed are never summed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {demand.summary.length === 0 ? (
                <p className="text-sm text-gray-500" data-testid="text-admin-demand-empty">
                  No market has demand above the cross-partner floor of {demand.floor} yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Market</th>
                        <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Requested ($ / stays)</th>
                        <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Missed ($ / stays)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {demand.summary.map((m) => (
                        <tr key={m.marketSlug} className="border-b border-gray-100" data-testid={`row-admin-demand-${m.marketSlug}`}>
                          <td className="py-2 px-3">
                            <span className={`font-medium ${m.marketSlug === UNMAPPED_MARKET_SLUG ? "text-amber-700" : "text-gray-900"}`}>
                              {marketLabel(m.marketSlug)}
                            </span>
                            {m.marketSlug === UNMAPPED_MARKET_SLUG && (
                              <span className="block text-xs text-gray-400">destinations outside the operating markets</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-gray-700">
                            {usd(m.requested.slipAmount)} <span className="text-xs text-gray-400">· {m.requested.slipCount} exp</span>
                            {m.requested.stayTrips > 0 && <span className="block text-xs text-gray-500">{m.requested.stayTrips} stays · {m.requested.stayNights} nights</span>}
                          </td>
                          <td className="py-2 px-3 text-gray-700">
                            {usd(m.missed.slipAmount)} <span className="text-xs text-gray-400">· {m.missed.slipCount} exp</span>
                            {m.missed.stayTrips > 0 && <span className="block text-xs text-gray-500">{m.missed.stayTrips} stays · {m.missed.stayNights} nights</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {belowFloorMarkets.length > 0 && (
                <p className="text-xs text-gray-400 mt-3" data-testid="text-admin-demand-belowfloor">
                  Below the cross-partner floor of {demand.floor} (omitted, §13):{" "}
                  {belowFloorMarkets.map(marketLabel).join(", ")}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Manual launch steps — hardcoded summary of docs/MARKET_LAUNCH_CHECKLIST.md (canonical
            text lives there; keep both in sync). */}
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-sm text-gray-600">Manual launch steps</CardTitle>
            <CardDescription>
              What "Add market" does NOT do — see docs/MARKET_LAUNCH_CHECKLIST.md for the full text.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-xs text-gray-600 space-y-2">
            <p>1. Review + tune seeded neighborhoods — rename, set radii, mark 1-2 as featured.</p>
            <p>2. Recruit local experts to fill each neighborhood's lead-expert slot.</p>
            <p>3. Get approved lodging/services with real coordinates into this market (Advisor stay-anchor + platform-first booking, CLAUDE.md §16).</p>
            <p>4. Ingest and admin-approve DMO/research content for the city (<code className="bg-gray-100 px-1 rounded">expert_workspace_visible = true</code>).</p>
            <p>5. QA pass: teaser SVG, Social Kit route frame, expert workspace map, Advisor anchor label.</p>
            <p>6. Confirm the Google Places/geocoding key has quota for the new market's expected traffic.</p>
            <p className="pt-1 text-gray-400">Not per-market: fee bands (§8), service templates, Places/geocoding provider config — all global.</p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
