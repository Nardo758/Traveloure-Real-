/**
 * Admin — Event Packages (CON-A.P8 / N6).
 *
 * Minimal CRUD for the Full / Done-for-You catalog. Concierge surface reads this
 * catalog via /api/concierge/event-packages and the router service. Phase A is
 * catalog-only; the transactional quote flow ships in Phase C / C1.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Crown, Plus, Trash2, RefreshCw } from "lucide-react";

interface EventPackage {
  id: string;
  event_type: string;
  market: string;
  title: string;
  description: string | null;
  price_from_cents: number | null;
  status: "active" | "paused" | "archived";
  created_at: string | null;
  updated_at: string | null;
}

const EVENT_TYPE_OPTIONS = [
  { value: "wedding", label: "Wedding" },
  { value: "proposal", label: "Proposal" },
  { value: "corporate", label: "Corporate" },
  { value: "honeymoon", label: "Honeymoon" },
  { value: "anniversary", label: "Anniversary" },
  { value: "birthday", label: "Birthday" },
  { value: "other", label: "Other" },
];

const STATUS_OPTIONS = ["active", "paused", "archived"] as const;

function formatPrice(cents: number | null) {
  if (cents === null || cents === undefined) return "Quote on request";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default function AdminEventPackagesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: packages, isLoading } = useQuery<EventPackage[]>({
    queryKey: ["/api/admin/event-packages"],
  });

  const [draft, setDraft] = useState({
    eventType: "",
    market: "",
    title: "",
    description: "",
    priceFromDollars: "",
  });

  const createMutation = useMutation({
    mutationFn: (payload: { eventType: string; market: string; title: string; description: string | null; priceFromCents: number | null }) =>
      apiRequest("POST", "/api/admin/event-packages", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/event-packages"] });
      setDraft({ eventType: "", market: "", title: "", description: "", priceFromDollars: "" });
      toast({ title: "Package created" });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Create failed", description: err?.message ?? "Try again." });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/admin/event-packages/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/event-packages"] }),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/event-packages/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/event-packages"] });
      toast({ title: "Package archived" });
    },
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.eventType || !draft.market.trim() || !draft.title.trim()) {
      toast({ variant: "destructive", title: "Missing fields", description: "Event type, market, and title are required." });
      return;
    }
    const priceFromCents = draft.priceFromDollars.trim()
      ? Math.round(parseFloat(draft.priceFromDollars) * 100)
      : null;
    createMutation.mutate({
      eventType: draft.eventType,
      market: draft.market.trim(),
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      priceFromCents,
    });
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="heading-event-packages">
          <Crown className="w-6 h-6 text-primary" />
          Event Packages
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Full / Done-for-You catalog. Concierge presents these as quote-on-request for high-stakes events.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />
            Create package
          </CardTitle>
          <CardDescription>
            Market matches case-insensitively against the traveler's destination (e.g. "Kyoto", "Cartagena").
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ep-event-type">Event type</Label>
              <Select value={draft.eventType} onValueChange={v => setDraft(d => ({ ...d, eventType: v }))}>
                <SelectTrigger id="ep-event-type" data-testid="select-ep-event-type">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep-market">Market (city / region)</Label>
              <Input
                id="ep-market"
                value={draft.market}
                onChange={e => setDraft(d => ({ ...d, market: e.target.value }))}
                placeholder="e.g. Kyoto"
                data-testid="input-ep-market"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="ep-title">Title</Label>
              <Input
                id="ep-title"
                value={draft.title}
                onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                placeholder="e.g. Kyoto Cherry Blossom Wedding Coordination"
                data-testid="input-ep-title"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="ep-description">Description</Label>
              <Textarea
                id="ep-description"
                value={draft.description}
                onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                placeholder="What's included…"
                rows={3}
                data-testid="textarea-ep-description"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep-price">Price from (USD, optional)</Label>
              <Input
                id="ep-price"
                type="number"
                min={0}
                step={0.01}
                value={draft.priceFromDollars}
                onChange={e => setDraft(d => ({ ...d, priceFromDollars: e.target.value }))}
                placeholder="Leave blank for quote-only"
                data-testid="input-ep-price"
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={createMutation.isPending} className="w-full" data-testid="button-create-ep">
                {createMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                Create package
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Catalog</CardTitle>
          <CardDescription>{packages?.length ?? 0} package(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
              Loading packages…
            </div>
          ) : !packages || packages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No packages yet. Create one above.</p>
          ) : (
            <div className="space-y-3" data-testid="list-event-packages">
              {packages.map(pkg => (
                <div
                  key={pkg.id}
                  className="border rounded-lg p-4 flex items-start justify-between gap-3"
                  data-testid={`row-ep-${pkg.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold">{pkg.title}</span>
                      <Badge variant="outline" className="text-xs">{pkg.event_type}</Badge>
                      <Badge variant="outline" className="text-xs">{pkg.market}</Badge>
                      <Badge
                        variant={pkg.status === "active" ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {pkg.status}
                      </Badge>
                    </div>
                    {pkg.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{pkg.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatPrice(pkg.price_from_cents)}
                      {pkg.price_from_cents !== null && " · from"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Select
                      value={pkg.status}
                      onValueChange={v => statusMutation.mutate({ id: pkg.id, status: v })}
                    >
                      <SelectTrigger className="w-32 h-8 text-xs" data-testid={`select-ep-status-${pkg.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map(s => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {pkg.status !== "archived" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => archiveMutation.mutate(pkg.id)}
                        disabled={archiveMutation.isPending}
                        data-testid={`button-archive-ep-${pkg.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
