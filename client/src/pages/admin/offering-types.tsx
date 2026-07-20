/**
 * /admin/offering-types — Phase 8 admin CRUD for the Phase-2 catalog vocabularies.
 *
 * service_offering_types — provider-side catalog the /earn page + offering flows read.
 * expert_offering_types  — expert-side catalog (serviceTier + deliveryFormats).
 *
 * Both are read-only to the app; this is the only place they're mutated. Writes
 * are audit-logged server-side. offeringTypeKey is the immutable identity — set
 * at create, addressed by PATCH/DELETE. Inline editing covers the frequently-tuned
 * fields (display name, tagline, sort order, active); the structural fields
 * (key, category/tier, market/delivery scoping) are set at create.
 */

import { AdminLayout } from "@/components/admin-layout";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Layers, Save, Trash2, Plus, Sparkles, GraduationCap } from "lucide-react";

interface ServiceOfferingType {
  id: string;
  offeringTypeKey: string;
  categoryKey: string;
  displayName: string;
  tagline: string | null;
  isSurprising: boolean;
  marketScoped: string[] | null;
  isActive: boolean;
  sortOrder: number;
}

interface ExpertOfferingType {
  id: string;
  offeringTypeKey: string;
  serviceTier: string;
  displayName: string;
  tagline: string | null;
  deliveryFormats: string[];
  isSurprising: boolean;
  isActive: boolean;
  sortOrder: number;
}

const SERVICE_KEY = ["/api/admin/service-offering-types"];
const EXPERT_KEY = ["/api/admin/expert-offering-types"];
const SERVICE_TIERS = ["advisory", "planning", "coordination", "live_support", "specialized"];
const DELIVERY_FORMATS = ["chat", "written", "video", "live_text", "done_for_you"];

/** Comma-separated string → trimmed non-empty array (or null when empty). */
function parseList(raw: string): string[] | null {
  const arr = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return arr.length ? arr : null;
}

// ── shared inline-edit row ────────────────────────────────────────────────
function OfferingRow({
  row,
  queryKey,
  endpoint,
  meta,
}: {
  row: ServiceOfferingType | ExpertOfferingType;
  queryKey: string[];
  endpoint: string;
  meta: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState(row.displayName);
  const [tagline, setTagline] = useState(row.tagline ?? "");
  const [sortOrder, setSortOrder] = useState(String(row.sortOrder));
  const [isActive, setIsActive] = useState(row.isActive);

  const dirty =
    displayName !== row.displayName ||
    tagline !== (row.tagline ?? "") ||
    Number(sortOrder) !== row.sortOrder ||
    isActive !== row.isActive;

  const save = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `${endpoint}/${encodeURIComponent(row.offeringTypeKey)}`, {
        displayName,
        tagline: tagline || null,
        sortOrder: Number(sortOrder),
        isActive,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Saved", description: `${row.offeringTypeKey} updated.` });
    },
    onError: (err: any) => toast({ title: "Save failed", description: err?.message ?? "", variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: () => apiRequest("DELETE", `${endpoint}/${encodeURIComponent(row.offeringTypeKey)}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Deleted", description: `${row.offeringTypeKey} removed.` });
    },
    onError: (err: any) => toast({ title: "Delete failed", description: err?.message ?? "", variant: "destructive" }),
  });

  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-3" data-testid={`offering-row-${row.offeringTypeKey}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <code className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{row.offeringTypeKey}</code>
        {meta}
        {row.isSurprising && <Badge variant="secondary" className="text-[10px]">surprising</Badge>}
        {!row.isActive && <Badge variant="outline" className="text-[10px] text-gray-500">inactive</Badge>}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1">
          <Label className="text-xs text-gray-600">Display name</Label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="text-sm" data-testid={`offering-name-${row.offeringTypeKey}`} />
        </div>
        <div className="flex-1">
          <Label className="text-xs text-gray-600">Tagline</Label>
          <Input value={tagline} onChange={(e) => setTagline(e.target.value)} className="text-sm" placeholder="—" />
        </div>
        <div className="w-20">
          <Label className="text-xs text-gray-600">Sort</Label>
          <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="text-sm" />
        </div>
        <div className="flex items-center gap-1 pb-1">
          <Switch checked={isActive} onCheckedChange={setIsActive} data-testid={`offering-active-${row.offeringTypeKey}`} />
          <Label className="text-xs">Active</Label>
        </div>
        <div className="flex items-center gap-2 pb-0.5">
          <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()} data-testid={`offering-save-${row.offeringTypeKey}`}>
            <Save className="w-3 h-3 mr-1" />{save.isPending ? "Saving…" : "Save"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-red-600 hover:text-red-700"
            disabled={del.isPending}
            onClick={() => { if (confirm(`Delete offering type "${row.offeringTypeKey}"? This cannot be undone.`)) del.mutate(); }}
            data-testid={`offering-delete-${row.offeringTypeKey}`}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── create forms ──────────────────────────────────────────────────────────
function ServiceCreate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ offeringTypeKey: "", categoryKey: "", displayName: "", tagline: "", marketScoped: "", isSurprising: false, sortOrder: "0" });

  const create = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/admin/service-offering-types", {
        offeringTypeKey: form.offeringTypeKey.trim(),
        categoryKey: form.categoryKey.trim(),
        displayName: form.displayName.trim(),
        tagline: form.tagline.trim() || null,
        marketScoped: parseList(form.marketScoped),
        isSurprising: form.isSurprising,
        isActive: true,
        sortOrder: Number(form.sortOrder) || 0,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SERVICE_KEY });
      toast({ title: "Created", description: `${form.offeringTypeKey} added.` });
      setForm({ offeringTypeKey: "", categoryKey: "", displayName: "", tagline: "", marketScoped: "", isSurprising: false, sortOrder: "0" });
      setOpen(false);
    },
    onError: (err: any) => toast({ title: "Create failed", description: err?.message ?? "", variant: "destructive" }),
  });

  const valid = form.offeringTypeKey.trim() && form.categoryKey.trim() && form.displayName.trim();

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} data-testid="service-offering-add">
        <Plus className="w-3 h-3 mr-1" />Add service offering type
      </Button>
    );
  }

  return (
    <div className="border border-dashed border-gray-300 rounded-lg p-4 space-y-3" data-testid="service-offering-create-form">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><Label className="text-xs">offeringTypeKey *</Label><Input value={form.offeringTypeKey} onChange={(e) => setForm({ ...form, offeringTypeKey: e.target.value })} placeholder="private_chef" className="text-sm font-mono" data-testid="service-offering-key" /></div>
        <div><Label className="text-xs">categoryKey *</Label><Input value={form.categoryKey} onChange={(e) => setForm({ ...form, categoryKey: e.target.value })} placeholder="dining" className="text-sm font-mono" /></div>
        <div><Label className="text-xs">Display name *</Label><Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} className="text-sm" /></div>
        <div><Label className="text-xs">Tagline</Label><Input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} className="text-sm" /></div>
        <div><Label className="text-xs">Markets (comma-sep, empty = universal)</Label><Input value={form.marketScoped} onChange={(e) => setForm({ ...form, marketScoped: e.target.value })} placeholder="kyoto, edinburgh" className="text-sm" /></div>
        <div><Label className="text-xs">Sort order</Label><Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} className="text-sm" /></div>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="svc-surprising" checked={form.isSurprising} onCheckedChange={(c) => setForm({ ...form, isSurprising: !!c })} />
        <Label htmlFor="svc-surprising" className="text-xs">Surprising (hidden-gem flag)</Label>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!valid || create.isPending} onClick={() => create.mutate()} data-testid="service-offering-create">{create.isPending ? "Creating…" : "Create"}</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

function ExpertCreate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ offeringTypeKey: "", serviceTier: SERVICE_TIERS[0], displayName: "", tagline: "", deliveryFormats: [] as string[], isSurprising: false, sortOrder: "0" });

  const toggleFormat = (f: string) =>
    setForm((prev) => ({ ...prev, deliveryFormats: prev.deliveryFormats.includes(f) ? prev.deliveryFormats.filter((x) => x !== f) : [...prev.deliveryFormats, f] }));

  const create = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/admin/expert-offering-types", {
        offeringTypeKey: form.offeringTypeKey.trim(),
        serviceTier: form.serviceTier,
        displayName: form.displayName.trim(),
        tagline: form.tagline.trim() || null,
        deliveryFormats: form.deliveryFormats,
        isSurprising: form.isSurprising,
        isActive: true,
        sortOrder: Number(form.sortOrder) || 0,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EXPERT_KEY });
      toast({ title: "Created", description: `${form.offeringTypeKey} added.` });
      setForm({ offeringTypeKey: "", serviceTier: SERVICE_TIERS[0], displayName: "", tagline: "", deliveryFormats: [], isSurprising: false, sortOrder: "0" });
      setOpen(false);
    },
    onError: (err: any) => toast({ title: "Create failed", description: err?.message ?? "", variant: "destructive" }),
  });

  const valid = form.offeringTypeKey.trim() && form.displayName.trim() && form.deliveryFormats.length > 0;

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} data-testid="expert-offering-add">
        <Plus className="w-3 h-3 mr-1" />Add expert offering type
      </Button>
    );
  }

  return (
    <div className="border border-dashed border-gray-300 rounded-lg p-4 space-y-3" data-testid="expert-offering-create-form">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><Label className="text-xs">offeringTypeKey *</Label><Input value={form.offeringTypeKey} onChange={(e) => setForm({ ...form, offeringTypeKey: e.target.value })} placeholder="trip_architecture" className="text-sm font-mono" data-testid="expert-offering-key" /></div>
        <div>
          <Label className="text-xs">Service tier *</Label>
          <Select value={form.serviceTier} onValueChange={(v) => setForm({ ...form, serviceTier: v })}>
            <SelectTrigger className="text-sm" data-testid="expert-offering-tier"><SelectValue /></SelectTrigger>
            <SelectContent>{SERVICE_TIERS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Display name *</Label><Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} className="text-sm" /></div>
        <div><Label className="text-xs">Tagline</Label><Input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} className="text-sm" /></div>
        <div><Label className="text-xs">Sort order</Label><Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} className="text-sm" /></div>
      </div>
      <div>
        <Label className="text-xs">Delivery formats * (at least one)</Label>
        <div className="flex flex-wrap gap-3 mt-1.5">
          {DELIVERY_FORMATS.map((f) => (
            <label key={f} className="flex items-center gap-1.5 text-xs cursor-pointer">
              <Checkbox checked={form.deliveryFormats.includes(f)} onCheckedChange={() => toggleFormat(f)} data-testid={`expert-offering-format-${f}`} />
              {f}
            </label>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="exp-surprising" checked={form.isSurprising} onCheckedChange={(c) => setForm({ ...form, isSurprising: !!c })} />
        <Label htmlFor="exp-surprising" className="text-xs">Surprising (hidden-gem flag)</Label>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!valid || create.isPending} onClick={() => create.mutate()} data-testid="expert-offering-create">{create.isPending ? "Creating…" : "Create"}</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

export default function OfferingTypesAdminPage() {
  const { data: services, isLoading: sLoading } = useQuery<ServiceOfferingType[]>({ queryKey: SERVICE_KEY });
  const { data: experts, isLoading: eLoading } = useQuery<ExpertOfferingType[]>({ queryKey: EXPERT_KEY });

  return (
    <AdminLayout title="Offering Types">
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="heading-offering-types">
          <Layers className="w-6 h-6 text-primary" />
          Offering Types
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          The Phase-2 catalog vocabularies the <code>/earn</code> page and offering flows read.
          Edits here are audit-logged. <code>offeringTypeKey</code> is immutable — to rename a key, delete and recreate.
        </p>
      </div>

      <Card className="border-gray-200" data-testid="card-service-offering-types">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4" />
            Service offering types ({services?.length ?? 0})
          </CardTitle>
          <p className="text-xs text-gray-500">Provider-side catalog. Each maps to a <code>service_categories.categoryKey</code>.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {sLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : (
            <>
              {(services ?? []).map((s) => (
                <OfferingRow
                  key={s.offeringTypeKey}
                  row={s}
                  queryKey={SERVICE_KEY}
                  endpoint="/api/admin/service-offering-types"
                  meta={<Badge variant="default" className="text-[10px]">{s.categoryKey}</Badge>}
                />
              ))}
              <ServiceCreate />
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-gray-200" data-testid="card-expert-offering-types">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GraduationCap className="w-4 h-4" />
            Expert offering types ({experts?.length ?? 0})
          </CardTitle>
          <p className="text-xs text-gray-500">Expert-side catalog. <code>serviceTier</code> + <code>deliveryFormats</code> are DB-constrained enums.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {eLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : (
            <>
              {(experts ?? []).map((e) => (
                <OfferingRow
                  key={e.offeringTypeKey}
                  row={e}
                  queryKey={EXPERT_KEY}
                  endpoint="/api/admin/expert-offering-types"
                  meta={
                    <>
                      <Badge variant="default" className="text-[10px]">{e.serviceTier}</Badge>
                      {(e.deliveryFormats ?? []).map((f) => <Badge key={f} variant="outline" className="text-[10px]">{f}</Badge>)}
                    </>
                  }
                />
              ))}
              <ExpertCreate />
            </>
          )}
        </CardContent>
      </Card>
    </div>
    </AdminLayout>
  );
}
