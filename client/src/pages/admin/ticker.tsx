// LW-1f (ledger `2026-10-16-lw1f-kyoto-ticker`; hand-off Part A item 2): the launch-market ticker, admin only.
// Add, edit, reorder and turn lines on or off, with a preview of the ribbon as the public will see it. Every
// rule (link shape, a blog line only while its post is published, 90 characters) is decided by the server when you
// save; this page shows the server's answer. Every save is audit-logged server-side.
// LW-1f-b (issue #1486): the beta list — the cities that may be called "in beta" — is switched here by hand, one
// checkbox per operating market, saved through the audited platform-settings save. Nothing works it out from supply.
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowUp } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { TickerRibbon } from "@/components/CityTickerTape";
import { Checkbox } from "@/components/ui/checkbox";
import { OPERATING_MARKETS } from "@shared/operating-markets";
import {
  BETA_MARKET_SLUGS_HELP, BETA_MARKET_SLUGS_SETTING, TICKER_CONTENT_RULE, TICKER_TEXT_MAX, betaCityNames, betaLabel,
  betaMarketSlugs, launchCityName, tickerButton,
} from "@shared/ticker";
import { EXPERT_HOOK_CITIES_HELP, EXPERT_HOOK_CITIES_SETTING, expertHookCities } from "@shared/expert-hook";

interface AdminTickerItem {
  id: string;
  text: string | null;
  href: string | null;
  sortOrder: number | null;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  updatedAt: string | null;
  postPublished: boolean | null;
  showing: boolean;
}
interface AdminTickerAnswer { marketSlug: string; items: AdminTickerItem[] }
interface SignupModeAnswer { mode: "waitlist" | "open"; launchMarketSlug: string | null }

const KEY = ["/api/admin/ticker"];
const SETTINGS_KEY = ["/api/admin/platform-settings"];

/** LW-1f-b: the beta list, switched by hand. Shows what the label will read before saving. */
function BetaCities({ launchMarketSlug }: { launchMarketSlug: string }) {
  const settings = useQuery<{ setting_key: string; setting_value: string | null }[]>({ queryKey: SETTINGS_KEY });
  const stored = settings.data?.find((r) => r.setting_key === BETA_MARKET_SLUGS_SETTING)?.setting_value ?? null;
  const current = betaMarketSlugs(stored, launchMarketSlug);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chosen = picked ?? current;
  const save = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/admin/platform-settings/${BETA_MARKET_SLUGS_SETTING}`, { settingValue: JSON.stringify(chosen) }),
    onSuccess: () => {
      setError(null);
      setPicked(null);
      queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/public/ticker") });
    },
    onError: (e) => setError(serverMessage(e)),
  });
  const toggle = (key: string, on: boolean) =>
    setPicked(OPERATING_MARKETS.map((m) => m.marketKey).filter((k) => (k === key ? on : chosen.includes(k))));
  return (
    <Card>
      <CardHeader><CardTitle>Beta cities</CardTitle></CardHeader>
      <CardContent className="space-y-4" data-testid="card-beta-cities">
        <p className="text-sm text-muted-foreground">{BETA_MARKET_SLUGS_HELP}</p>
        <div className="flex flex-wrap gap-4">
          {OPERATING_MARKETS.map((m) => (
            <label key={m.marketKey} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={chosen.includes(m.marketKey)}
                onCheckedChange={(v) => toggle(m.marketKey, v === true)}
                data-testid={`checkbox-beta-${m.marketKey}`}
              />
              {m.cityName}
            </label>
          ))}
        </div>
        <p className="text-sm" data-testid="text-beta-label-preview">
          The ribbon will read: {betaLabel(betaCityNames(chosen), launchCityName(launchMarketSlug))}
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          variant="outline"
          disabled={picked === null || save.isPending}
          onClick={() => save.mutate()}
          data-testid="button-beta-save"
        >
          Save beta cities
        </Button>
      </CardContent>
    </Card>
  );
}

/** FB-1: the expert hook's cities, switched by hand beside the beta list. Empty by default. */
function ExpertHookCities() {
  const settings = useQuery<{ setting_key: string; setting_value: string | null }[]>({ queryKey: SETTINGS_KEY });
  const current = expertHookCities(settings.data?.find((r) => r.setting_key === EXPERT_HOOK_CITIES_SETTING)?.setting_value ?? null);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chosen = picked ?? current;
  const save = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/admin/platform-settings/${EXPERT_HOOK_CITIES_SETTING}`, { settingValue: JSON.stringify(chosen) }),
    onSuccess: () => {
      setError(null);
      setPicked(null);
      queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
    },
    onError: (e) => setError(serverMessage(e)),
  });
  const toggle = (key: string, on: boolean) =>
    setPicked(OPERATING_MARKETS.map((m) => m.marketKey).filter((k) => (k === key ? on : chosen.includes(k))));
  return (
    <Card>
      <CardHeader><CardTitle>Expert hook cities</CardTitle></CardHeader>
      <CardContent className="space-y-4" data-testid="card-expert-hook-cities">
        <p className="text-sm text-muted-foreground">{EXPERT_HOOK_CITIES_HELP}</p>
        <div className="flex flex-wrap gap-4">
          {OPERATING_MARKETS.map((m) => (
            <label key={m.marketKey} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={chosen.includes(m.marketKey)}
                onCheckedChange={(v) => toggle(m.marketKey, v === true)}
                data-testid={`checkbox-expert-hook-${m.marketKey}`}
              />
              {m.cityName}
            </label>
          ))}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          variant="outline"
          disabled={picked === null || save.isPending}
          onClick={() => save.mutate()}
          data-testid="button-expert-hook-save"
        >
          Save expert hook cities
        </Button>
      </CardContent>
    </Card>
  );
}

/** The server's sentence from an apiRequest error ("409: {\"error\":\"…\"}"). */
function serverMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const body = raw.replace(/^\d{3}:\s*/, "");
  try {
    return JSON.parse(body).error ?? body;
  } catch {
    return body;
  }
}

/** An ISO instant shown in a datetime-local box (the admin's own clock), and back. Empty = no bound. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

interface Draft { text: string; href: string; active: boolean; startsAt: string; endsAt: string }
function draftOf(item?: AdminTickerItem): Draft {
  return {
    text: item?.text ?? "",
    href: item?.href ?? "",
    active: item?.active ?? false,
    startsAt: toLocalInput(item?.startsAt ?? null),
    endsAt: toLocalInput(item?.endsAt ?? null),
  };
}
function bodyOf(d: Draft) {
  return {
    text: d.text.trim(),
    href: d.href.trim() === "" ? null : d.href.trim(),
    active: d.active,
    startsAt: fromLocalInput(d.startsAt),
    endsAt: fromLocalInput(d.endsAt),
  };
}

function LineEditor({
  item,
  onSaved,
  testId,
  saveLabel,
  save,
}: {
  item?: AdminTickerItem;
  onSaved?: () => void;
  testId: string;
  saveLabel: string;
  save: (body: ReturnType<typeof bodyOf>) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState<Draft>(draftOf(item));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDraft(draftOf(item)), [item?.id, item?.updatedAt]);
  const mutation = useMutation({
    mutationFn: () => save(bodyOf(draft)),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: KEY });
      onSaved?.();
    },
    onError: (e) => setError(serverMessage(e)),
  });
  return (
    <div className="space-y-2" data-testid={testId}>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={draft.text}
          maxLength={TICKER_TEXT_MAX}
          onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          placeholder="The line, as travelers read it"
          className="min-w-[18rem] flex-1"
          data-testid={`${testId}-text`}
        />
        <span className="text-xs text-muted-foreground">{draft.text.length}/{TICKER_TEXT_MAX}</span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={draft.href}
          onChange={(e) => setDraft({ ...draft, href: e.target.value })}
          placeholder="Link on this site, like /kyoto (optional)"
          className="max-w-xs"
          data-testid={`${testId}-href`}
        />
        <Label className="flex items-center gap-2 text-sm">
          <Switch checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: v })} data-testid={`${testId}-active`} />
          On
        </Label>
        <Label className="flex items-center gap-2 text-sm">
          From
          <Input type="datetime-local" value={draft.startsAt} onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })} className="w-auto" />
        </Label>
        <Label className="flex items-center gap-2 text-sm">
          Until
          <Input type="datetime-local" value={draft.endsAt} onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })} className="w-auto" />
        </Label>
        <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || draft.text.trim() === ""} data-testid={`${testId}-save`}>
          {saveLabel}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive" data-testid={`${testId}-error`}>{error}</p>}
    </div>
  );
}

export default function AdminTicker() {
  const { data, isLoading, isError } = useQuery<AdminTickerAnswer>({ queryKey: KEY });
  const signup = useQuery<SignupModeAnswer>({ queryKey: ["/api/public/signup-mode"] });
  const [orderError, setOrderError] = useState<string | null>(null);
  const reorder = useMutation({
    mutationFn: (ids: string[]) => apiRequest("PUT", "/api/admin/ticker/order", { ids }),
    onSuccess: () => {
      setOrderError(null);
      queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => setOrderError(serverMessage(e)),
  });
  const items = data?.items ?? [];
  const move = (index: number, by: -1 | 1) => {
    const ids = items.map((i) => i.id);
    const j = index + by;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    reorder.mutate(ids);
  };
  const city = launchCityName(data?.marketSlug ?? null);
  const settings = useQuery<{ setting_key: string; setting_value: string | null }[]>({ queryKey: SETTINGS_KEY });
  const betaCities = betaCityNames(
    betaMarketSlugs(settings.data?.find((r) => r.setting_key === BETA_MARKET_SLUGS_SETTING)?.setting_value ?? null, data?.marketSlug ?? null),
  );
  const showing = items.filter((i) => i.showing).map((i) => ({ text: i.text ?? "", href: i.href }));

  return (
    <AdminLayout title="Ticker">
      <div className="space-y-6 p-6" data-testid="page-admin-ticker">
        <p className="text-sm text-muted-foreground" data-testid="text-ticker-content-rule">{TICKER_CONTENT_RULE}</p>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {isError && <p className="text-sm text-destructive">Could not load the ticker.</p>}
        {data && (
          <>
            <Card>
              <CardHeader><CardTitle>Preview — what the public sees now</CardTitle></CardHeader>
              <CardContent data-testid="ticker-preview">
                {city && showing.length > 0 ? (
                  <TickerRibbon items={showing} cityName={city} betaCities={betaCities} button={tickerButton(signup.data?.mode, data.marketSlug, city)} />
                ) : (
                  <p className="text-sm text-muted-foreground">No line is showing, so no ribbon is shown.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Lines — {data.marketSlug}</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                {orderError && <p className="text-sm text-destructive">{orderError}</p>}
                {items.map((item, index) => (
                  <div key={item.id} className="flex gap-3 border-b pb-4" data-testid={`row-ticker-${item.id}`}>
                    <div className="flex flex-col gap-1">
                      <Button size="icon" variant="ghost" aria-label="Move up" disabled={index === 0 || reorder.isPending} onClick={() => move(index, -1)} data-testid={`button-ticker-up-${item.id}`}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Move down" disabled={index === items.length - 1 || reorder.isPending} onClick={() => move(index, 1)} data-testid={`button-ticker-down-${item.id}`}>
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex gap-2">
                        {item.showing ? <Badge>Showing</Badge> : <Badge variant="outline">Not showing</Badge>}
                        {item.postPublished === false && <Badge variant="outline">Post not published</Badge>}
                      </div>
                      <LineEditor
                        item={item}
                        testId={`ticker-edit-${item.id}`}
                        saveLabel="Save"
                        save={(body) => apiRequest("PATCH", `/api/admin/ticker/${encodeURIComponent(item.id)}`, body)}
                      />
                    </div>
                  </div>
                ))}
                {items.length === 0 && <p className="text-sm text-muted-foreground">No lines yet.</p>}
              </CardContent>
            </Card>
            <BetaCities launchMarketSlug={data.marketSlug} />
            <ExpertHookCities />
            <Card>
              <CardHeader><CardTitle>Add a line</CardTitle></CardHeader>
              <CardContent>
                <NewLine />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

function NewLine() {
  // A fresh editor after each add (the key changes), so the form clears.
  const [n, setN] = useState(0);
  return (
    <LineEditor
      key={n}
      testId="ticker-new"
      saveLabel="Add"
      save={(body) => apiRequest("POST", "/api/admin/ticker", body)}
      onSaved={() => setN((x) => x + 1)}
    />
  );
}
