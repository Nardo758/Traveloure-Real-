/**
 * /admin/neighborhoods — Phase 8.3
 *
 * Three editors under one page:
 *   1. List of neighborhoods (with city filter)
 *   2. Per-neighborhood detail panel: lead assignment, coverage targets, adjacency
 *
 * Footgun discipline enforced server-side; UI surfaces friendly confirmation
 * before the swap path fires.
 */

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Map, Crown, Tag, Network, Plus, Trash2, Save } from "lucide-react";

interface NeighborhoodSummary {
  id: string;
  city: string;
  country: string;
  name: string;
  slug: string;
  adjacent_keys: string[] | null;
  lead_expert_target: number;
  lead_expert_id: string | null;
  coverage_target_count: number;
}

interface NeighborhoodDetail {
  neighborhood: NeighborhoodSummary & { adjacentKeys: string[] | null };
  experts: Array<{
    expert_id: string;
    is_lead: boolean;
    sort_order: number;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  }>;
  coverage: Array<{
    neighborhoodId: string;
    categoryKey: string;
    targetCount: number;
  }>;
}

interface ServiceCategory {
  id: string;
  name: string;
  categoryKey: string | null;
}

function NeighborhoodDetailPanel({
  detail,
  allNeighborhoods,
  categories,
  onClose,
}: {
  detail: NeighborhoodDetail;
  allNeighborhoods: NeighborhoodSummary[];
  categories: ServiceCategory[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [newLeadExpertId, setNewLeadExpertId] = useState<string>("");
  const [pendingSwap, setPendingSwap] = useState<{ from: string | null; to: string } | null>(null);
  const [newCatKey, setNewCatKey] = useState<string>("");
  const [newTargetCount, setNewTargetCount] = useState<string>("1");

  const currentLead = detail.experts.find(e => e.is_lead);
  const sameMarketSlugs = useMemo(
    () => allNeighborhoods
      .filter(n => n.city === detail.neighborhood.city && n.country === detail.neighborhood.country && n.id !== detail.neighborhood.id)
      .map(n => ({ slug: n.slug, name: n.name })),
    [allNeighborhoods, detail.neighborhood.city, detail.neighborhood.country, detail.neighborhood.id]
  );
  const currentAdjacency = detail.neighborhood.adjacent_keys ?? detail.neighborhood.adjacentKeys ?? [];

  const assignLead = useMutation({
    mutationFn: async (params: { expertId?: string; clear?: boolean }) => {
      return apiRequest("PUT", `/api/admin/neighborhoods/${detail.neighborhood.id}/lead`, params);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/neighborhoods"] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/neighborhoods/${detail.neighborhood.id}`] });
      const note = data?.marketCheck === "missing"
        ? " (market data was missing — verify manually)"
        : "";
      toast({ title: "Lead updated", description: `Atomic swap committed.${note}` });
      setPendingSwap(null);
      setNewLeadExpertId("");
    },
    onError: (err: any) => {
      toast({ title: "Lead assignment failed", description: err?.message ?? "", variant: "destructive" });
      setPendingSwap(null);
    },
  });

  const upsertCoverage = useMutation({
    mutationFn: async (params: { categoryKey: string; targetCount: number }) => {
      return apiRequest("POST", `/api/admin/neighborhoods/${detail.neighborhood.id}/coverage-targets`, params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/neighborhoods/${detail.neighborhood.id}`] });
      toast({ title: "Coverage target saved" });
      setNewCatKey("");
      setNewTargetCount("1");
    },
    onError: (err: any) => toast({ title: "Save failed", description: err?.message ?? "", variant: "destructive" }),
  });

  const deleteCoverage = useMutation({
    mutationFn: async (categoryKey: string) => {
      return apiRequest("DELETE", `/api/admin/neighborhoods/${detail.neighborhood.id}/coverage-targets/${encodeURIComponent(categoryKey)}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/neighborhoods/${detail.neighborhood.id}`] });
      toast({ title: "Coverage target removed" });
    },
    onError: (err: any) => toast({ title: "Delete failed", description: err?.message ?? "", variant: "destructive" }),
  });

  const saveAdjacency = useMutation({
    mutationFn: async (adjacentKeys: string[]) => {
      return apiRequest("PATCH", `/api/admin/neighborhoods/${detail.neighborhood.id}/adjacency`, { adjacentKeys });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/neighborhoods/${detail.neighborhood.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/neighborhoods"] });
      toast({
        title: "Adjacency saved",
        description: `Symmetric writes: +${data?.added?.length ?? 0} / -${data?.removed?.length ?? 0}`,
      });
    },
    onError: (err: any) => toast({ title: "Adjacency save failed", description: err?.message ?? "", variant: "destructive" }),
  });

  function handleAssignLeadClick() {
    if (!newLeadExpertId.trim()) return;
    if (currentLead && currentLead.expert_id !== newLeadExpertId) {
      // Surface the swap explicitly before firing.
      setPendingSwap({ from: currentLead.expert_id, to: newLeadExpertId });
    } else {
      assignLead.mutate({ expertId: newLeadExpertId });
    }
  }

  function toggleAdjacency(slug: string) {
    const next = currentAdjacency.includes(slug)
      ? currentAdjacency.filter(s => s !== slug)
      : [...currentAdjacency, slug];
    saveAdjacency.mutate(next);
  }

  return (
    <Card className="border-gray-200" data-testid={`neighborhood-detail-${detail.neighborhood.id}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Map className="w-4 h-4" />
            {detail.neighborhood.city} / {detail.neighborhood.name}
            <code className="font-mono text-[10px] bg-gray-100 px-1 rounded">{detail.neighborhood.slug}</code>
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Lead expert */}
        <section data-testid="lead-section">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
            <Crown className="w-4 h-4 text-amber-500" />
            Featured lead expert
          </h3>
          {currentLead ? (
            <p className="text-sm text-gray-700 mb-2">
              Current lead: <strong>{currentLead.first_name} {currentLead.last_name}</strong>{" "}
              <span className="text-gray-500">({currentLead.email})</span>
            </p>
          ) : (
            <p className="text-sm text-gray-500 mb-2">No lead assigned.</p>
          )}
          <div className="flex items-center gap-2">
            <Input
              placeholder="Expert user ID"
              value={newLeadExpertId}
              onChange={(e) => setNewLeadExpertId(e.target.value)}
              className="text-sm font-mono"
              data-testid="lead-input-expert-id"
            />
            <Button
              size="sm"
              disabled={!newLeadExpertId.trim() || assignLead.isPending}
              onClick={handleAssignLeadClick}
              data-testid="lead-assign-button"
            >
              <Save className="w-3 h-3 mr-1" />
              Assign
            </Button>
            {currentLead && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => assignLead.mutate({ clear: true })}
                disabled={assignLead.isPending}
                data-testid="lead-clear-button"
              >
                Clear
              </Button>
            )}
          </div>
          <p className="text-[10px] text-gray-500 mt-1">
            Atomic swap: existing lead is demoted in the same transaction. Server rejects experts outside this market.
          </p>
        </section>

        {/* Coverage targets */}
        <section data-testid="coverage-section">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
            <Tag className="w-4 h-4 text-blue-500" />
            Coverage targets
          </h3>
          <div className="space-y-2">
            {detail.coverage.length === 0 && (
              <p className="text-sm text-gray-500">No coverage targets configured.</p>
            )}
            {detail.coverage.map((ct) => (
              <div key={ct.categoryKey} className="flex items-center gap-2" data-testid={`coverage-row-${ct.categoryKey}`}>
                <code className="font-mono text-xs bg-gray-100 px-1 rounded flex-1">{ct.categoryKey}</code>
                <Badge variant="outline">{ct.targetCount}</Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => deleteCoverage.mutate(ct.categoryKey)}
                  disabled={deleteCoverage.isPending}
                  data-testid={`coverage-delete-${ct.categoryKey}`}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-200">
            <Select value={newCatKey} onValueChange={setNewCatKey}>
              <SelectTrigger className="text-sm" data-testid="coverage-add-category">
                <SelectValue placeholder="Category key" />
              </SelectTrigger>
              <SelectContent>
                {categories
                  .filter(c => c.categoryKey)
                  .filter(c => !detail.coverage.some(ct => ct.categoryKey === c.categoryKey))
                  .map(c => (
                    <SelectItem key={c.categoryKey!} value={c.categoryKey!}>
                      {c.categoryKey} ({c.name})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={0}
              value={newTargetCount}
              onChange={(e) => setNewTargetCount(e.target.value)}
              className="w-20 text-sm"
              data-testid="coverage-add-count"
            />
            <Button
              size="sm"
              disabled={!newCatKey || upsertCoverage.isPending}
              onClick={() => upsertCoverage.mutate({ categoryKey: newCatKey, targetCount: parseInt(newTargetCount, 10) || 1 })}
              data-testid="coverage-add-button"
            >
              <Plus className="w-3 h-3 mr-1" />
              Add
            </Button>
          </div>
        </section>

        {/* Adjacency */}
        <section data-testid="adjacency-section">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
            <Network className="w-4 h-4 text-emerald-500" />
            Adjacent neighborhoods <span className="text-xs font-normal text-gray-500">(undirected; symmetric writes)</span>
          </h3>
          {sameMarketSlugs.length === 0 ? (
            <p className="text-sm text-gray-500">No other neighborhoods in {detail.neighborhood.city} yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sameMarketSlugs.map(({ slug, name }) => {
                const adjacent = currentAdjacency.includes(slug);
                return (
                  <button
                    key={slug}
                    onClick={() => toggleAdjacency(slug)}
                    disabled={saveAdjacency.isPending}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      adjacent
                        ? "bg-emerald-100 border-emerald-400 text-emerald-900"
                        : "bg-white border-gray-300 text-gray-600 hover:border-gray-500"
                    }`}
                    data-testid={`adjacency-toggle-${slug}`}
                  >
                    {adjacent ? "✓ " : ""}{name}
                    <code className="ml-1 font-mono text-[10px] opacity-60">{slug}</code>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </CardContent>

      <AlertDialog open={!!pendingSwap} onOpenChange={(open) => !open && setPendingSwap(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reassign lead?</AlertDialogTitle>
            <AlertDialogDescription>
              Featured-lead for <strong>{detail.neighborhood.name}</strong> is currently{" "}
              <code className="font-mono text-xs">{pendingSwap?.from}</code>. This will demote them
              and promote <code className="font-mono text-xs">{pendingSwap?.to}</code> in the same
              transaction. No partial-index conflict will be exposed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="lead-swap-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingSwap && assignLead.mutate({ expertId: pendingSwap.to })}
              data-testid="lead-swap-confirm"
            >
              Reassign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default function NeighborhoodsAdminPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cityFilter, setCityFilter] = useState<string>("");

  const { data: neighborhoods, isLoading } = useQuery<NeighborhoodSummary[]>({
    queryKey: ["/api/admin/neighborhoods"],
  });
  const { data: detail } = useQuery<NeighborhoodDetail>({
    queryKey: [`/api/admin/neighborhoods/${selectedId}`],
    enabled: !!selectedId,
  });
  const { data: categories } = useQuery<ServiceCategory[]>({
    queryKey: ["/api/admin/categories"],
  });

  const cities = useMemo(
    () => Array.from(new Set((neighborhoods ?? []).map(n => n.city))).sort(),
    [neighborhoods]
  );
  const filtered = useMemo(
    () => (neighborhoods ?? []).filter(n => !cityFilter || n.city === cityFilter),
    [neighborhoods, cityFilter]
  );

  if (isLoading) return <div className="p-6 text-sm text-gray-500">Loading neighborhoods…</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="heading-neighborhoods">
          <Map className="w-6 h-6 text-primary" />
          Neighborhood Spine
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Lead-expert assignment, coverage targets, and adjacency graph. Lead
          swaps are atomic — admins never see raw partial-unique-index conflicts.
          Adjacency is undirected and city-scoped.
        </p>
      </div>

      <Card className="border-gray-200">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-base">
              {filtered.length} / {neighborhoods?.length ?? 0} neighborhoods
            </CardTitle>
            <Select value={cityFilter || "__all__"} onValueChange={(v) => setCityFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-48 text-sm" data-testid="city-filter">
                <SelectValue placeholder="Filter by city" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All cities</SelectItem>
                {cities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {filtered.map(n => (
              <button
                key={n.id}
                onClick={() => setSelectedId(n.id)}
                className={`text-left p-3 rounded-lg border transition-colors ${
                  selectedId === n.id
                    ? "border-primary bg-primary/5"
                    : "border-gray-200 hover:border-gray-400"
                }`}
                data-testid={`neighborhood-card-${n.id}`}
              >
                <p className="font-medium text-sm">{n.name}</p>
                <p className="text-xs text-gray-500">{n.city}, {n.country}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  {n.lead_expert_id ? (
                    <Badge variant="default" className="text-[10px]">Lead set</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">No lead</Badge>
                  )}
                  <Badge variant="secondary" className="text-[10px]">
                    {n.coverage_target_count} targets
                  </Badge>
                  {n.adjacent_keys && n.adjacent_keys.length > 0 && (
                    <Badge variant="outline" className="text-[10px]">
                      {n.adjacent_keys.length} adj
                    </Badge>
                  )}
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {detail && (
        <NeighborhoodDetailPanel
          detail={detail}
          allNeighborhoods={neighborhoods ?? []}
          categories={categories ?? []}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
