import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  PLATFORM_SURFACES,
  SURFACE_DEFAULT_CONTENT_TYPES,
  SURFACE_DEFAULT_AFFILIATE_CATEGORIES,
  CONTENT_TYPES,
  CONTENT_SOURCES,
  SURFACE_SLUGS,
  getPulseTierLabel,
  type SurfaceSlug,
  type ContentTypeKey,
  type ContentSourceKey,
} from "@shared/content-surface-map";
import {
  TrendingUp, Compass, Zap, LayoutTemplate, Map,
  Plus, Trash2, RefreshCw, Info, ExternalLink,
  Search, Filter, CheckCircle2, XCircle, Pin,
  Bot, User, ChevronRight,
} from "lucide-react";

const SURFACE_ICONS: Record<SurfaceSlug, typeof TrendingUp> = {
  "travelpulse-discover": TrendingUp,
  "experience-discovery": Compass,
  "spontaneous": Zap,
  "experience-template": LayoutTemplate,
  "itinerary": Map,
};

const CONTENT_TYPE_COLORS: Record<ContentTypeKey, string> = {
  experience: "bg-blue-100 text-blue-700",
  template: "bg-purple-100 text-purple-700",
  service: "bg-green-100 text-green-700",
  media: "bg-orange-100 text-orange-700",
  trip: "bg-pink-100 text-pink-700",
  itinerary: "bg-indigo-100 text-indigo-700",
  review: "bg-yellow-100 text-yellow-700",
  expert_profile: "bg-teal-100 text-teal-700",
  vendor: "bg-gray-100 text-gray-700",
  other: "bg-gray-100 text-gray-600",
};

type PlacementRule = {
  id: string;
  contentSource: string;
  sourceId: string;
  contentLabel?: string;
  cityName: string;
  country?: string;
  surfaces: string[];
  minPulseScore: number;
  isPinned: boolean;
  isAutoTagged: boolean;
  isActive: boolean;
  notes?: string;
  createdAt: string;
};

const defaultForm = {
  contentSource: "affiliate_product" as ContentSourceKey,
  sourceId: "",
  contentLabel: "",
  cityName: "",
  country: "",
  surfaces: [] as string[],
  minPulseScore: 0,
  isPinned: false,
  notes: "",
};

export default function ContentMappingPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("surface-map");
  const [searchCity, setSearchCity] = useState("");
  const [filterSurface, setFilterSurface] = useState("all");
  const [filterSource, setFilterSource] = useState("all");
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: rules = [], isLoading } = useQuery<PlacementRule[]>({
    queryKey: ["/api/admin/content-placement-rules", searchCity, filterSurface, filterSource],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchCity) params.set("cityName", searchCity);
      if (filterSurface !== "all") params.set("surface", filterSurface);
      if (filterSource !== "all") params.set("contentSource", filterSource);
      const res = await fetch(`/api/admin/content-placement-rules?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch rules");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof defaultForm) =>
      apiRequest("POST", "/api/admin/content-placement-rules", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/content-placement-rules"] });
      setShowDialog(false);
      setForm(defaultForm);
      setEditingId(null);
      toast({ title: "Rule created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PlacementRule> }) =>
      apiRequest("PATCH", `/api/admin/content-placement-rules/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/content-placement-rules"] });
      setShowDialog(false);
      setEditingId(null);
      toast({ title: "Rule updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/admin/content-placement-rules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/content-placement-rules"] });
      toast({ title: "Rule deleted" });
    },
  });

  const autoIndexMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/content-placement-rules/auto-index"),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/content-placement-rules"] });
      toast({
        title: "Auto-index complete",
        description: `${data?.created ?? 0} new rules created from TravelPulse data`,
      });
    },
    onError: (e: any) => toast({ title: "Auto-index failed", description: e.message, variant: "destructive" }),
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(defaultForm);
    setShowDialog(true);
  };

  const openEdit = (rule: PlacementRule) => {
    setEditingId(rule.id);
    setForm({
      contentSource: rule.contentSource as ContentSourceKey,
      sourceId: rule.sourceId,
      contentLabel: rule.contentLabel ?? "",
      cityName: rule.cityName,
      country: rule.country ?? "",
      surfaces: rule.surfaces,
      minPulseScore: rule.minPulseScore,
      isPinned: rule.isPinned,
      notes: rule.notes ?? "",
    });
    setShowDialog(true);
  };

  const handleSave = () => {
    if (!form.sourceId || !form.cityName || form.surfaces.length === 0) {
      toast({ title: "Fill in Source ID, City, and at least one Surface", variant: "destructive" });
      return;
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const toggleSurface = (slug: string) => {
    setForm(f => ({
      ...f,
      surfaces: f.surfaces.includes(slug)
        ? f.surfaces.filter(s => s !== slug)
        : [...f.surfaces, slug],
    }));
  };

  const toggleRuleActive = (rule: PlacementRule) => {
    updateMutation.mutate({ id: rule.id, data: { isActive: !rule.isActive } });
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Content Surface Map</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Define where content types appear across the platform, and set TravelPulse-aware placement rules.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => autoIndexMutation.mutate()}
              disabled={autoIndexMutation.isPending}
              data-testid="button-auto-index"
            >
              <Bot className={`h-4 w-4 mr-2 ${autoIndexMutation.isPending ? "animate-spin" : ""}`} />
              {autoIndexMutation.isPending ? "Indexing…" : "Auto-Index Trending"}
            </Button>
            <Button onClick={openCreate} data-testid="button-add-rule">
              <Plus className="h-4 w-4 mr-2" />
              Add Rule
            </Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="surface-map">Surface Map</TabsTrigger>
            <TabsTrigger value="placement-rules">
              Placement Rules
              {rules.length > 0 && (
                <Badge variant="secondary" className="ml-2 text-xs">{rules.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Surface Map Reference ── */}
          <TabsContent value="surface-map" className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              Default rules applied when no explicit placement rule exists for a content item.
              Override these with explicit rules in the Placement Rules tab.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {SURFACE_SLUGS.map(slug => {
                const surface = PLATFORM_SURFACES[slug];
                const Icon = SURFACE_ICONS[slug];
                const contentTypes = SURFACE_DEFAULT_CONTENT_TYPES[slug];
                const affiliateCats = SURFACE_DEFAULT_AFFILIATE_CATEGORIES[slug];
                return (
                  <Card key={slug} className="border-2 hover:border-primary/30 transition-colors" data-testid={`card-surface-${slug}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Icon className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-sm">{surface.label}</CardTitle>
                          <code className="text-xs text-muted-foreground">{surface.path}</code>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-xs text-muted-foreground">{surface.description}</p>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Content Types</p>
                        <div className="flex flex-wrap gap-1">
                          {contentTypes.map(ct => (
                            <span key={ct} className={`text-xs px-2 py-0.5 rounded-full font-medium ${CONTENT_TYPE_COLORS[ct]}`}>
                              {CONTENT_TYPES[ct].label}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Affiliate Categories</p>
                        <div className="flex flex-wrap gap-1">
                          {affiliateCats.map(cat => (
                            <span key={cat} className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium border border-amber-200">
                              {cat}
                            </span>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-4">
                <div className="flex gap-3">
                  <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">How location matching works</p>
                    <ol className="space-y-1 text-blue-700 list-decimal list-inside">
                      <li><strong>Placement rules first</strong> — explicit city + surface + pulse threshold rules take priority.</li>
                      <li><strong>ILIKE fallback</strong> — if no rule exists, content is matched by city/country name substring.</li>
                      <li><strong>TravelPulse pulse check</strong> — rules with minPulseScore &gt; 0 only activate when the city's live pulse score meets the threshold. Pinned rules always show regardless.</li>
                    </ol>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Placement Rules ── */}
          <TabsContent value="placement-rules" className="space-y-4 mt-4">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filter by city…"
                  className="pl-9"
                  value={searchCity}
                  onChange={e => setSearchCity(e.target.value)}
                  data-testid="input-search-city"
                />
              </div>
              <Select value={filterSurface} onValueChange={setFilterSurface}>
                <SelectTrigger className="w-52" data-testid="select-filter-surface">
                  <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="All surfaces" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All surfaces</SelectItem>
                  {SURFACE_SLUGS.map(slug => (
                    <SelectItem key={slug} value={slug}>{PLATFORM_SURFACES[slug].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterSource} onValueChange={setFilterSource}>
                <SelectTrigger className="w-48" data-testid="select-filter-source">
                  <SelectValue placeholder="All sources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  <SelectItem value="affiliate_product">Affiliate Product</SelectItem>
                  <SelectItem value="content_registry">Content Registry</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="text-sm text-muted-foreground py-8 text-center">Loading placement rules…</div>
            ) : rules.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center">
                  <Bot className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="font-medium text-muted-foreground">No placement rules yet</p>
                  <p className="text-sm text-muted-foreground mt-1 mb-4">
                    Use "Auto-Index Trending" to create rules from TravelPulse data, or add rules manually.
                  </p>
                  <div className="flex gap-2 justify-center">
                    <Button variant="outline" onClick={() => autoIndexMutation.mutate()} disabled={autoIndexMutation.isPending}>
                      <Bot className="h-4 w-4 mr-2" />
                      Auto-Index
                    </Button>
                    <Button onClick={openCreate}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Manually
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left p-3 font-medium">Content</th>
                      <th className="text-left p-3 font-medium">City</th>
                      <th className="text-left p-3 font-medium">Surfaces</th>
                      <th className="text-left p-3 font-medium">Pulse ≥</th>
                      <th className="text-left p-3 font-medium">Flags</th>
                      <th className="text-left p-3 font-medium">Active</th>
                      <th className="p-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rules.map(rule => (
                      <tr key={rule.id} className="hover:bg-muted/30 transition-colors" data-testid={`row-rule-${rule.id}`}>
                        <td className="p-3">
                          <div className="max-w-48">
                            <p className="font-medium truncate">{rule.contentLabel || rule.sourceId}</p>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                              rule.contentSource === "affiliate_product"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-blue-100 text-blue-700"
                            }`}>
                              {rule.contentSource === "affiliate_product" ? "Affiliate" : "Registry"}
                            </span>
                          </div>
                        </td>
                        <td className="p-3">
                          <p className="font-medium">{rule.cityName}</p>
                          {rule.country && <p className="text-xs text-muted-foreground">{rule.country}</p>}
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {rule.surfaces.map(s => (
                              <span key={s} className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                                {PLATFORM_SURFACES[s as SurfaceSlug]?.label ?? s}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                            {rule.isPinned ? "Pinned" : rule.minPulseScore === 0 ? "Any" : rule.minPulseScore}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            {rule.isPinned && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger><Pin className="h-3.5 w-3.5 text-orange-500" /></TooltipTrigger>
                                  <TooltipContent>Pinned — always shows</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {rule.isAutoTagged && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger><Bot className="h-3.5 w-3.5 text-blue-500" /></TooltipTrigger>
                                  <TooltipContent>Auto-indexed by TravelPulse</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <Switch
                            checked={rule.isActive}
                            onCheckedChange={() => toggleRuleActive(rule)}
                            data-testid={`switch-active-${rule.id}`}
                          />
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(rule)} data-testid={`button-edit-${rule.id}`}>
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm("Delete this rule?")) deleteMutation.mutate(rule.id);
                              }}
                              data-testid={`button-delete-${rule.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Create / Edit Dialog ── */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Placement Rule" : "New Placement Rule"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Source Type</Label>
                <Select value={form.contentSource} onValueChange={v => setForm(f => ({ ...f, contentSource: v as ContentSourceKey }))}>
                  <SelectTrigger data-testid="select-content-source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="affiliate_product">Affiliate Product</SelectItem>
                    <SelectItem value="content_registry">Content Registry</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Source ID</Label>
                <Input
                  placeholder="UUID of the item"
                  value={form.sourceId}
                  onChange={e => setForm(f => ({ ...f, sourceId: e.target.value }))}
                  data-testid="input-source-id"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Display Label <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                placeholder="e.g. Tokyo Food Tour"
                value={form.contentLabel}
                onChange={e => setForm(f => ({ ...f, contentLabel: e.target.value }))}
                data-testid="input-content-label"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>City Name</Label>
                <Input
                  placeholder="e.g. Tokyo"
                  value={form.cityName}
                  onChange={e => setForm(f => ({ ...f, cityName: e.target.value }))}
                  data-testid="input-city-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Country <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  placeholder="e.g. Japan"
                  value={form.country}
                  onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                  data-testid="input-country"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Surfaces</Label>
              <div className="grid grid-cols-1 gap-1.5">
                {SURFACE_SLUGS.map(slug => {
                  const Icon = SURFACE_ICONS[slug];
                  const active = form.surfaces.includes(slug);
                  return (
                    <button
                      key={slug}
                      type="button"
                      onClick={() => toggleSurface(slug)}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border text-left transition-all ${
                        active
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border hover:border-muted-foreground/40"
                      }`}
                      data-testid={`button-surface-${slug}`}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-tight">{PLATFORM_SURFACES[slug].label}</p>
                        <p className="text-xs text-muted-foreground truncate">{PLATFORM_SURFACES[slug].path}</p>
                      </div>
                      {active && <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Min Pulse Score <span className="text-muted-foreground font-normal">(0 = any city)</span></Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.minPulseScore}
                  onChange={e => setForm(f => ({ ...f, minPulseScore: parseInt(e.target.value) || 0 }))}
                  className="w-24"
                  disabled={form.isPinned}
                  data-testid="input-pulse-score"
                />
                <span className="text-sm text-muted-foreground">
                  {form.isPinned ? "Pinned — ignores threshold" : getPulseTierLabel(form.minPulseScore)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="pinned"
                checked={form.isPinned}
                onCheckedChange={v => setForm(f => ({ ...f, isPinned: v }))}
                data-testid="switch-pinned"
              />
              <Label htmlFor="pinned" className="cursor-pointer">
                Pin rule — always show regardless of pulse score
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-rule"
            >
              {createMutation.isPending || updateMutation.isPending ? "Saving…" : editingId ? "Update Rule" : "Create Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
