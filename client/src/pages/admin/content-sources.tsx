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
import type { ContentSource, PlacePhotoBlock } from "@shared/schema";
import { REFRESH_REVIEW_NOTE, TERMS_CLASSES, isLinkOutClass, isReadingClass, signoffAllowsActivation, signoffStatusOf } from "@shared/source-signoff";

interface RegistryResponse {
  sources: ContentSource[];
  viewerMayActivate: boolean;
  activatorConfigured: boolean;
  /** CS-1 item 1: reading-class sources a machine may not fetch — the server's list. */
  manualRecheckIds?: string[];
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
  /** SS-1b: the official refresh reads a source only when both are stated. Blank = not stated. */
  refreshIntervalDays: string;
  costCeilingCentsPerDay: string;
  /** CS-1 item 1: blank = not set. */
  termsClass: string;
  /** "yes" | "no" | "" (not answered). */
  automatedAccess: string;
  creditText: string;
}

const EMPTY: Draft = {
  id: "", name: "", homepage: "", market: "", adapter: "manual", covers: [], doesNotCover: [],
  licenseClass: "official", termsUrl: "", notes: "", refreshIntervalDays: "", costCeilingCentsPerDay: "",
  termsClass: "", automatedAccess: "", creditText: "",
};

const orNull = (s: string) => (s.trim() === "" ? null : s.trim());
/** A whole number typed in the form; blank ⇒ null (not stated). Anything else is sent as-is for the server to refuse. */
const intOrNull = (s: string) => (s.trim() === "" ? null : Number(s.trim()));

function fromRow(r: ContentSource): Draft {
  return {
    id: r.id, name: r.name, homepage: r.homepage ?? "", market: r.market ?? "", adapter: r.adapter,
    covers: r.covers ?? [], doesNotCover: r.doesNotCover ?? [], licenseClass: r.licenseClass,
    termsUrl: r.termsUrl ?? "", notes: r.notes ?? "",
    refreshIntervalDays: r.refreshIntervalDays == null ? "" : String(r.refreshIntervalDays),
    costCeilingCentsPerDay: r.costCeilingCentsPerDay == null ? "" : String(r.costCeilingCentsPerDay),
    termsClass: r.termsClass ?? "",
    automatedAccess: r.automatedAccessAllowed == null ? "" : r.automatedAccessAllowed ? "yes" : "no",
    creditText: r.creditText ?? "",
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
        refreshIntervalDays: intOrNull(draft.refreshIntervalDays), costCeilingCentsPerDay: intOrNull(draft.costCeilingCentsPerDay),
        termsClass: orNull(draft.termsClass),
        automatedAccessAllowed: draft.automatedAccess === "" ? null : draft.automatedAccess === "yes",
        creditText: orNull(draft.creditText),
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

  const signoff = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "approved" | "rejected" }) =>
      apiRequest("POST", `/api/admin/content-sources/${id}/signoff`, { decision }),
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
              Changing the homepage, terms URL, license class, adapter, terms class or automated access clears that check,
              returns the sign-off to pending and deactivates the source. A link-out source is never read, so its adapter
              is always manual.
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
                <select id="cs-adapter" className="w-full border rounded-md h-9 px-2 bg-background" value={isLinkOutClass(draft.termsClass) ? "manual" : draft.adapter} disabled={isLinkOutClass(draft.termsClass)} onChange={(e) => setDraft({ ...draft, adapter: e.target.value })}>
                  {SOURCE_ADAPTERS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="cs-license">License class</Label>
                <select id="cs-license" className="w-full border rounded-md h-9 px-2 bg-background" value={draft.licenseClass} onChange={(e) => setDraft({ ...draft, licenseClass: e.target.value })}>
                  {LICENSE_CLASSES.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="cs-terms-class">Terms class</Label>
                <select id="cs-terms-class" className="w-full border rounded-md h-9 px-2 bg-background" value={draft.termsClass} onChange={(e) => setDraft({ ...draft, termsClass: e.target.value })} data-testid="select-terms-class">
                  <option value="">not set</option>
                  {TERMS_CLASSES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="cs-auto">Automated access allowed</Label>
                <select id="cs-auto" className="w-full border rounded-md h-9 px-2 bg-background" value={draft.automatedAccess} onChange={(e) => setDraft({ ...draft, automatedAccess: e.target.value })} data-testid="select-automated-access">
                  <option value="">not answered</option>
                  <option value="yes">yes</option>
                  <option value="no">no</option>
                </select>
              </div>
            </div>
            <div>
              <Label htmlFor="cs-credit">Credit line (as the source states it)</Label>
              <Input id="cs-credit" value={draft.creditText} onChange={(e) => setDraft({ ...draft, creditText: e.target.value })} data-testid="input-source-credit" />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <NeedPicker label="Covers" value={draft.covers} onChange={(covers) => setDraft({ ...draft, covers })} testId="covers" />
              <NeedPicker label="Does not cover" value={draft.doesNotCover} onChange={(doesNotCover) => setDraft({ ...draft, doesNotCover })} testId="does-not-cover" />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cs-refresh">Refresh every (days)</Label>
                <Input id="cs-refresh" inputMode="numeric" value={draft.refreshIntervalDays} onChange={(e) => setDraft({ ...draft, refreshIntervalDays: e.target.value })} placeholder="blank = not refreshed" data-testid="input-source-refresh-days" />
              </div>
              <div>
                <Label htmlFor="cs-ceiling">Refresh cost ceiling (cents per day)</Label>
                <Input id="cs-ceiling" inputMode="numeric" value={draft.costCeilingCentsPerDay} onChange={(e) => setDraft({ ...draft, costCeilingCentsPerDay: e.target.value })} placeholder="blank = not refreshed" data-testid="input-source-cost-ceiling" />
              </div>
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
                    <Badge variant="outline" data-testid={`badge-signoff-${s.id}`}>sign-off: {signoffStatusOf(s)}</Badge>
                    <Badge variant="outline">{s.termsClass ?? "terms class not set"}</Badge>
                    {data.manualRecheckIds?.includes(s.id) && <Badge variant="secondary" data-testid={`badge-manual-recheck-${s.id}`}>manual recheck</Badge>}
                  </div>
                  <p className="text-sm mt-1">Covers: {(s.covers ?? []).join(", ") || "—"}</p>
                  <p className="text-sm">Does not cover: {(s.doesNotCover ?? []).join(", ") || "nothing listed"}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {s.termsCheckedAt ? `Terms checked ${new Date(s.termsCheckedAt).toLocaleDateString()}` : "Terms not checked"}
                    {s.signoffAt ? ` · ${signoffStatusOf(s)} on ${new Date(s.signoffAt).toLocaleDateString()}` : " · not signed off"}
                  </p>
                  {s.creditText && <p className="text-xs text-muted-foreground">Credit: {s.creditText}</p>}
                  <PublicOkControl
                    source={s}
                    viewerMayActivate={data.viewerMayActivate}
                    pending={setPublic.isPending}
                    onChange={(publicOk) => setPublic.mutate({ id: s.id, publicOk })}
                  />
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" variant="outline" onClick={() => { setEditingId(s.id); setDraft(fromRow(s)); }}>Edit</Button>
                    {data.viewerMayActivate && signoffStatusOf(s) !== "approved" && (
                      <Button size="sm" variant="outline" onClick={() => signoff.mutate({ id: s.id, decision: "approved" })} disabled={signoff.isPending || !s.termsClass} data-testid={`button-approve-${s.id}`}>
                        Approve
                      </Button>
                    )}
                    {data.viewerMayActivate && signoffStatusOf(s) !== "rejected" && (
                      <Button size="sm" variant="outline" onClick={() => signoff.mutate({ id: s.id, decision: "rejected" })} disabled={signoff.isPending} data-testid={`button-reject-${s.id}`}>
                        Reject
                      </Button>
                    )}
                    {!s.active && data.viewerMayActivate && signoffAllowsActivation(s) && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => {
                            // CS-1 item 3: a source that is read has its refresh output held for review.
                            if (isReadingClass(s.termsClass) && !window.confirm(REFRESH_REVIEW_NOTE)) return;
                            act.mutate({ id: s.id, action: "activate" });
                          }}
                          disabled={act.isPending}
                          data-testid={`button-activate-${s.id}`}
                        >
                          I read the terms — activate
                        </Button>
                        {isReadingClass(s.termsClass) && (
                          <span className="text-xs text-muted-foreground" data-testid={`text-refresh-review-${s.id}`}>{REFRESH_REVIEW_NOTE}</span>
                        )}
                      </>
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
        <ManualRecheckCard sources={data?.sources ?? []} ids={data?.manualRecheckIds ?? []} />
        <PhotoBlocksCard viewerMayActivate={!!data?.viewerMayActivate} />
        <LookupOutcomesCard />
      </div>
    </AdminLayout>
  );
}

interface LookupOutcomeCountsResponse {
  days: number;
  since: string;
  counts: Array<{ outcome: string; reason: string | null; count: number }>;
}
interface PlanLookupOutcomesResponse {
  tripId: string;
  items: Array<{
    itemId: string;
    itemTitle: string | null;
    day: number | null;
    outcome: string;
    reason: string | null;
    trigger: string | null;
    runStartedAt: string;
    placeId: string | null;
    cache: string | null;
  }>;
}

/**
 * PF-1 ruling 3 (ledger `2026-10-11-pf1-lookup-outcomes`): what the Places lookups did — counts by outcome and
 * reason over the server's window, and a plan-id view of each item's latest outcome. Shows the server's words
 * as stored; derives nothing. A title is the item's CURRENT title (the table stores ids only); a deleted item
 * says so rather than inventing one.
 */
export function LookupOutcomesCard() {
  const [planInput, setPlanInput] = useState("");
  const [planId, setPlanId] = useState<string | null>(null);
  const counts = useQuery<LookupOutcomeCountsResponse>({ queryKey: ["/api/admin/content-sources/lookup-outcomes"] });
  const plan = useQuery<PlanLookupOutcomesResponse>({
    queryKey: [`/api/admin/content-sources/lookup-outcomes/plan/${encodeURIComponent(planId ?? "")}`],
    enabled: !!planId,
  });
  return (
    <Card data-testid="card-lookup-outcomes">
      <CardHeader>
        <CardTitle>Places lookup outcomes</CardTitle>
        <CardDescription>
          What each plan item's Places lookup did: attached, unmatched, capped, skipped, no place, or error, with the reason.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {counts.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : counts.isError || !counts.data ? (
          <p className="text-sm text-muted-foreground" data-testid="text-lookup-counts-error">The counts could not be loaded.</p>
        ) : counts.data.counts.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-lookup-counts-empty">
            No lookups recorded in the last {counts.data.days} days.
          </p>
        ) : (
          <div data-testid="table-lookup-counts">
            <p className="text-xs text-muted-foreground mb-2">Last {counts.data.days} days</p>
            <table className="text-sm w-full">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="font-normal py-1">Outcome</th>
                  <th className="font-normal py-1">Reason</th>
                  <th className="font-normal py-1 text-right">Items</th>
                </tr>
              </thead>
              <tbody>
                {counts.data.counts.map((c) => (
                  <tr key={`${c.outcome}:${c.reason ?? ""}`} className="border-t">
                    <td className="py-1">{c.outcome}</td>
                    <td className="py-1">{c.reason ?? "—"}</td>
                    <td className="py-1 text-right tabular-nums">{c.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = planInput.trim();
            setPlanId(v || null);
          }}
        >
          <div className="space-y-1 min-w-0 flex-1">
            <Label htmlFor="lookup-plan-id">Plan id</Label>
            <Input id="lookup-plan-id" value={planInput} onChange={(e) => setPlanInput(e.target.value)} data-testid="input-lookup-plan-id" />
          </div>
          <Button type="submit" variant="outline" data-testid="button-lookup-plan">Show items</Button>
        </form>
        {planId && (
          plan.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : plan.isError || !plan.data ? (
            <p className="text-sm text-muted-foreground" data-testid="text-lookup-plan-error">That plan's outcomes could not be loaded.</p>
          ) : plan.data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="text-lookup-plan-empty">
              No lookups recorded for this plan in the retention window.
            </p>
          ) : (
            <div className="overflow-x-auto" data-testid="table-lookup-plan">
              <table className="text-sm w-full">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="font-normal py-1">Day</th>
                    <th className="font-normal py-1">Item</th>
                    <th className="font-normal py-1">Outcome</th>
                    <th className="font-normal py-1">Reason</th>
                    <th className="font-normal py-1">Run</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.data.items.map((it) => (
                    <tr key={it.itemId} className="border-t align-top" data-testid={`row-lookup-${it.itemId}`}>
                      <td className="py-1">{it.day ?? "—"}</td>
                      <td className="py-1">
                        <div>{it.itemTitle ?? "Item no longer on the plan"}</div>
                        <div className="text-xs text-muted-foreground font-mono">{it.itemId}</div>
                      </td>
                      <td className="py-1">{it.outcome}</td>
                      <td className="py-1">{it.reason ?? "—"}</td>
                      <td className="py-1 text-xs text-muted-foreground">
                        {new Date(it.runStartedAt).toLocaleString()}
                        {it.trigger ? ` · ${it.trigger}` : ""}
                        {it.cache ? ` · cache ${it.cache}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </CardContent>
    </Card>
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

/** CS-1 item 1: the sources a person rechecks by hand — the server's list, shown as it is. */
function ManualRecheckCard({ sources, ids }: { sources: ContentSource[]; ids: string[] }) {
  const rows = sources.filter((s) => ids.includes(s.id));
  return (
    <Card data-testid="card-manual-recheck">
      <CardHeader>
        <CardTitle>Manual recheck</CardTitle>
        <CardDescription>
          Sources that are read for facts but whose terms or robots.txt do not allow automated access (or were not answered).
          No scheduled refresh or plan lookup fetches them; a person rechecks them by hand.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-manual-recheck-empty">None.</p>
        ) : (
          <ul className="text-sm space-y-1">
            {rows.map((s) => (
              <li key={s.id} data-testid={`row-manual-recheck-${s.id}`}>
                <code>{s.id}</code> — {s.name}{s.homepage ? ` · ${s.homepage}` : ""}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * CS-1 item 1: per-place no_photos. A place is blocked by its Google place id, or by its name and city (normalised the
 * way LG-2 matches names). A blocked place's photos are refused at upload and hidden on every read; nothing is deleted.
 * Only the designated reviewer adds a block; there is no remove.
 */
function PhotoBlocksCard({ viewerMayActivate }: { viewerMayActivate: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ placeId: "", placeName: "", city: "", reason: "" });
  const blocks = useQuery<{ blocks: PlacePhotoBlock[] }>({ queryKey: ["/api/admin/place-photo-blocks"] });
  const add = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/admin/place-photo-blocks", {
        placeId: orNull(form.placeId),
        placeName: orNull(form.placeName),
        city: orNull(form.city),
        reason: form.reason.trim(),
      }),
    onSuccess: () => {
      setForm({ placeId: "", placeName: "", city: "", reason: "" });
      qc.invalidateQueries({ queryKey: ["/api/admin/place-photo-blocks"] });
      toast({ title: "Photos blocked for this place" });
    },
    onError: (e: Error) => toast({ title: "Not saved", description: e.message, variant: "destructive" }),
  });
  return (
    <Card data-testid="card-photo-blocks">
      <CardHeader>
        <CardTitle>No photos (per place)</CardTitle>
        <CardDescription>
          Blocks every image of a place, including expert and provider uploads: refused at upload, hidden everywhere it is read.
          An upload that names no place and carries no place id is not caught.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {blocks.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : blocks.isError || !blocks.data ? (
          <p className="text-sm text-muted-foreground">The list could not be loaded.</p>
        ) : blocks.data.blocks.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-photo-blocks-empty">No places blocked.</p>
        ) : (
          <ul className="text-sm space-y-1">
            {blocks.data.blocks.map((b) => (
              <li key={b.id} data-testid={`row-photo-block-${b.id}`}>
                {b.placeNameNormalised ? <><code>{b.placeNameNormalised}</code> in {b.city}</> : null}
                {b.placeId ? <> · place id <code>{b.placeId}</code></> : null}
                {` — ${b.reason} (${new Date(b.setAt).toLocaleDateString()})`}
              </li>
            ))}
          </ul>
        )}
        {viewerMayActivate ? (
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pb-name">Place name</Label>
              <Input id="pb-name" value={form.placeName} onChange={(e) => setForm({ ...form, placeName: e.target.value })} placeholder="Kiyomizu-dera" data-testid="input-photo-block-name" />
            </div>
            <div>
              <Label htmlFor="pb-city">City</Label>
              <Input id="pb-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Kyoto" data-testid="input-photo-block-city" />
            </div>
            <div>
              <Label htmlFor="pb-place">Google place id (optional)</Label>
              <Input id="pb-place" value={form.placeId} onChange={(e) => setForm({ ...form, placeId: e.target.value })} data-testid="input-photo-block-place-id" />
            </div>
            <div>
              <Label htmlFor="pb-reason">Reason</Label>
              <Input id="pb-reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="The temple refuses commercial photos" data-testid="input-photo-block-reason" />
            </div>
            <div>
              <Button onClick={() => add.mutate()} disabled={add.isPending || !form.reason.trim()} data-testid="button-add-photo-block">Block photos</Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Only the designated reviewer can add a block.</p>
        )}
      </CardContent>
    </Card>
  );
}
