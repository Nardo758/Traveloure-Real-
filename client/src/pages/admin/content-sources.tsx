/**
 * Content source registry — the admin surface (A6 (2), ledger `2026-10-01-a6-registry-surface`;
 * content sourcing brief §5). Sources are entered HERE, never by a deploy or a seed script.
 *
 * The page mirrors the server and restates none of its rules: the need choices come from the shared
 * vocabulary (`CONTENT_NEEDS` + `CONTENT_SUB_NEEDS`), "Activate" draws only when the server says the
 * viewer may activate, and the terms-check date is shown as the server stamped it.
 *
 * "May appear on public pages" (ruling R-p, ledger `2026-10-03-official-facts-public-ok`) is enabled
 * only when the shared `publicOkEligibleSource` says so (official + terms checked) AND the viewer is
 * the designated reviewer; the answer, who gave it and when are shown as the server stamped them.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CONTENT_NEEDS, LICENSE_CLASSES, SOURCE_ADAPTERS, publicOkEligibleSource, subNeedsOf } from "@shared/content-facts";
import type { ContentSource } from "@shared/schema";

interface RegistryResponse {
  sources: ContentSource[];
  viewerMayActivate: boolean;
  activatorConfigured: boolean;
}

const NEED_OPTIONS: { key: string; nested: boolean }[] = CONTENT_NEEDS.flatMap((n) => [
  { key: n as string, nested: false },
  ...subNeedsOf(n).map((s) => ({ key: s as string, nested: true })),
]);

interface Draft {
  id: string;
  name: string;
  homepage: string;
  market: string;
  adapter: string;
  covers: string[];
  doesNotCover: string[];
  licenseClass: string;
  termsUrl: string;
  notes: string;
}

const EMPTY: Draft = {
  id: "", name: "", homepage: "", market: "", adapter: "manual", covers: [], doesNotCover: [],
  licenseClass: "official", termsUrl: "", notes: "",
};

const orNull = (s: string) => (s.trim() === "" ? null : s.trim());

function fromRow(r: ContentSource): Draft {
  return {
    id: r.id, name: r.name, homepage: r.homepage ?? "", market: r.market ?? "", adapter: r.adapter,
    covers: r.covers ?? [], doesNotCover: r.doesNotCover ?? [], licenseClass: r.licenseClass,
    termsUrl: r.termsUrl ?? "", notes: r.notes ?? "",
  };
}

function NeedPicker({ label, value, onChange, testId }: { label: string; value: string[]; onChange: (v: string[]) => void; testId: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-1" data-testid={testId}>
        {NEED_OPTIONS.map(({ key, nested }) => (
          <label key={key} className={`flex items-center gap-2 text-sm ${nested ? "pl-5" : ""}`}>
            <Checkbox
              checked={value.includes(key)}
              onCheckedChange={(c) => onChange(c ? [...value, key] : value.filter((v) => v !== key))}
              data-testid={`${testId}-${key}`}
            />
            <code>{key}</code>
          </label>
        ))}
      </div>
    </div>
  );
}

export default function AdminContentSources() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery<RegistryResponse>({ queryKey: ["/api/admin/content-sources"] });
  const refresh = () => qc.invalidateQueries({ queryKey: ["/api/admin/content-sources"] });
  const onError = (e: Error) => toast({ title: "Not saved", description: e.message, variant: "destructive" });

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: draft.name, homepage: orNull(draft.homepage), market: orNull(draft.market), adapter: draft.adapter,
        covers: draft.covers, doesNotCover: draft.doesNotCover, licenseClass: draft.licenseClass,
        termsUrl: orNull(draft.termsUrl), notes: orNull(draft.notes),
      };
      return editingId
        ? apiRequest("PATCH", `/api/admin/content-sources/${editingId}`, body)
        : apiRequest("POST", "/api/admin/content-sources", { id: draft.id, ...body });
    },
    onSuccess: () => {
      toast({ title: editingId ? "Source updated" : "Source drafted (inactive)" });
      setDraft(EMPTY);
      setEditingId(null);
      refresh();
    },
    onError,
  });

  const setPublic = useMutation({
    mutationFn: ({ id, publicOk }: { id: string; publicOk: boolean }) =>
      apiRequest("POST", `/api/admin/content-sources/${id}/public-ok`, { publicOk }),
    onSuccess: refresh,
    onError,
  });

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "activate" | "deactivate" }) =>
      apiRequest("POST", `/api/admin/content-sources/${id}/${action}`),
    onSuccess: refresh,
    onError,
  });

  return (
    <AdminLayout title="Content Sources">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? `Edit ${editingId}` : "Add a source"}</CardTitle>
            <CardDescription>
              A new source is saved inactive. Activating it records that its terms were read, by whom and when.
              Changing the homepage, terms URL, license class or adapter clears that check and deactivates the source.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!editingId && (
              <div>
                <Label htmlFor="cs-id">Id</Label>
                <Input id="cs-id" value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value })} placeholder="kyoto_city_bus" data-testid="input-source-id" />
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="cs-name">Name</Label>
                <Input id="cs-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} data-testid="input-source-name" />
              </div>
              <div>
                <Label htmlFor="cs-market">Market (blank = global)</Label>
                <Input id="cs-market" value={draft.market} onChange={(e) => setDraft({ ...draft, market: e.target.value })} data-testid="input-source-market" />
              </div>
              <div>
                <Label htmlFor="cs-home">Homepage</Label>
                <Input id="cs-home" value={draft.homepage} onChange={(e) => setDraft({ ...draft, homepage: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="cs-terms">Terms URL</Label>
                <Input id="cs-terms" value={draft.termsUrl} onChange={(e) => setDraft({ ...draft, termsUrl: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="cs-adapter">Adapter</Label>
                <select id="cs-adapter" className="w-full border rounded-md h-9 px-2 bg-background" value={draft.adapter} onChange={(e) => setDraft({ ...draft, adapter: e.target.value })}>
                  {SOURCE_ADAPTERS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="cs-license">License class</Label>
                <select id="cs-license" className="w-full border rounded-md h-9 px-2 bg-background" value={draft.licenseClass} onChange={(e) => setDraft({ ...draft, licenseClass: e.target.value })}>
                  {LICENSE_CLASSES.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <NeedPicker label="Covers" value={draft.covers} onChange={(covers) => setDraft({ ...draft, covers })} testId="covers" />
              <NeedPicker label="Does not cover" value={draft.doesNotCover} onChange={(doesNotCover) => setDraft({ ...draft, doesNotCover })} testId="does-not-cover" />
            </div>
            <div>
              <Label htmlFor="cs-notes">Notes</Label>
              <Textarea id="cs-notes" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-source">
                {editingId ? "Save changes" : "Save as inactive"}
              </Button>
              {editingId && <Button variant="outline" onClick={() => { setEditingId(null); setDraft(EMPTY); }}>Cancel</Button>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Registry</CardTitle>
            {data && !data.activatorConfigured && (
              <CardDescription data-testid="text-no-activator">
                No activator is configured, so no source can be activated yet.
              </CardDescription>
            )}
            {data && data.activatorConfigured && !data.viewerMayActivate && (
              <CardDescription>You can draft and edit sources. Activation is limited to the designated reviewer.</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {isError && <p className="text-sm text-destructive">The registry could not be loaded.</p>}
            {data && data.sources.length === 0 && <p className="text-sm text-muted-foreground">No sources registered.</p>}
            <div className="space-y-3">
              {data?.sources.map((s) => (
                <div key={s.id} className="border rounded-md p-3" data-testid={`row-source-${s.id}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="font-semibold">{s.id}</code>
                    <span>{s.name}</span>
                    <Badge variant={s.active ? "default" : "secondary"}>{s.active ? "active" : "inactive"}</Badge>
                    <Badge variant="outline">{s.market ?? "global"}</Badge>
                    <Badge variant="outline">{s.licenseClass}</Badge>
                    <Badge variant="outline">{s.adapter}</Badge>
                  </div>
                  <p className="text-sm mt-1">Covers: {(s.covers ?? []).join(", ") || "—"}</p>
                  <p className="text-sm">Does not cover: {(s.doesNotCover ?? []).join(", ") || "nothing listed"}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {s.termsCheckedAt ? `Terms checked ${new Date(s.termsCheckedAt).toLocaleDateString()}` : "Terms not checked"}
                  </p>
                  <PublicOkControl
                    source={s}
                    viewerMayActivate={data.viewerMayActivate}
                    pending={setPublic.isPending}
                    onChange={(publicOk) => setPublic.mutate({ id: s.id, publicOk })}
                  />
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" variant="outline" onClick={() => { setEditingId(s.id); setDraft(fromRow(s)); }}>Edit</Button>
                    {!s.active && data.viewerMayActivate && (
                      <Button size="sm" onClick={() => act.mutate({ id: s.id, action: "activate" })} disabled={act.isPending} data-testid={`button-activate-${s.id}`}>
                        I read the terms — activate
                      </Button>
                    )}
                    {s.active && (
                      <Button size="sm" variant="outline" onClick={() => act.mutate({ id: s.id, action: "deactivate" })} disabled={act.isPending}>
                        Deactivate
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}

/**
 * "May appear on public pages" — ruling R-p. Enabled only for an official, terms-checked source and
 * only for the designated reviewer. NULL renders as "not answered", never as "no".
 */
function PublicOkControl({
  source,
  viewerMayActivate,
  pending,
  onChange,
}: {
  source: ContentSource;
  viewerMayActivate: boolean;
  pending: boolean;
  onChange: (publicOk: boolean) => void;
}) {
  const eligible = publicOkEligibleSource(source);
  const enabled = eligible && viewerMayActivate && !pending;
  const why = !eligible
    ? source.licenseClass !== "official"
      ? "Only an official source can be marked for public pages."
      : "Check the terms first."
    : !viewerMayActivate
      ? "Only the designated reviewer can change this."
      : null;
  const answered = source.publicOk === true ? "yes" : source.publicOk === false ? "no" : "not answered";
  return (
    <div className="mt-2" data-testid={`public-ok-${source.id}`}>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={source.publicOk === true}
          disabled={!enabled}
          onCheckedChange={(c) => onChange(c === true)}
          data-testid={`checkbox-public-ok-${source.id}`}
        />
        May appear on public pages
      </label>
      <p className="text-xs text-muted-foreground pl-6">
        Hours, closures, ticketing, transit and event facts only, always shown with "from {source.name}" and the date checked.
        Descriptions and tips stay inside plans.
      </p>
      <p className="text-xs text-muted-foreground pl-6" data-testid={`text-public-ok-state-${source.id}`}>
        {source.publicOkCheckedAt
          ? `Answered ${answered} on ${new Date(source.publicOkCheckedAt).toLocaleDateString()}`
          : "Not answered"}
        {why ? ` · ${why}` : ""}
      </p>
    </div>
  );
}
