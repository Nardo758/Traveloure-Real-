// LW-1c (ledger `2026-10-16-lw1c-kyoto-waitlist`): the launch waitlist for admins — travelers (by trip type and
// source) and providers (by type of service) counted apart, never mixed; experts credited through their own
// Ready-Made link (LW-1d); and a CSV download per role. Every
// download is audit-logged server-side. Stored keys are shown with the forms' own labels.
// LW-1e: QA rows (QA-domain addresses) are left out of the numbers and the default CSVs, and said so; an admin can
// find a row by email and delete it (the server writes the audit row, keeping the row id and a hash of the address).
// LW-2: every operating market's totals in one table, and a market filter (default the launch market) that the
// counts and both CSVs follow; each CSV row carries its market_slug.
// 291b: the "market opened" card queues the waitlist_open email for one city and one role (WaitlistMarketOpenedCard).
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { WaitlistMarketOpenedCard } from "@/components/admin/WaitlistMarketOpenedCard";
import {
  WAITLIST_MARKET_OPTIONS, WAITLIST_SEARCH_MIN_CHARS, WAITLIST_SERVICE_TYPES, WAITLIST_TRIP_TYPES, waitlistCityName,
} from "@shared/launch-waitlist";

interface WaitlistCount { key: string; count: number }
interface WaitlistReferrerCount { referrerUserId: string; handle: string | null; count: number }
interface WaitlistCounts {
  marketSlug: string | null;
  referrers: WaitlistReferrerCount[];
  travelers: { total: number; consented: number; byTripType: WaitlistCount[]; bySource: WaitlistCount[] };
  providers: { total: number; consented: number; byServiceType: WaitlistCount[] };
  qaExcluded: number;
  byMarket: { marketSlug: string; travelers: number; providers: number }[];
}
interface WaitlistSearchRow {
  id: string; email: string; role: string; marketSlug: string | null; source: string | null; createdAt: string | null; isQa: boolean;
}

function WaitlistSearch() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<WaitlistSearchRow | null>(null);
  const search = useQuery<{ rows: WaitlistSearchRow[] }>({
    queryKey: [`/api/admin/waitlist/search?email=${encodeURIComponent(query)}`],
    enabled: query.length >= WAITLIST_SEARCH_MIN_CHARS,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/waitlist/${encodeURIComponent(id)}`),
    onSuccess: () => {
      setPending(null);
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/admin/waitlist") });
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle>Find and remove a sign-up</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); setQuery(input.trim()); }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Email address, or part of one"
            className="max-w-sm"
            data-testid="input-waitlist-search"
          />
          <Button type="submit" variant="outline" disabled={input.trim().length < WAITLIST_SEARCH_MIN_CHARS} data-testid="button-waitlist-search">
            Search
          </Button>
        </form>
        {search.isError && <p className="text-sm text-destructive">Search failed.</p>}
        {search.data && (
          <table className="text-sm" data-testid="table-waitlist-search">
            <thead>
              <tr>
                <th className="pr-6 text-left font-medium">Email</th>
                <th className="pr-6 text-left font-medium">Role</th>
                <th className="pr-6 text-left font-medium">Market</th>
                <th className="pr-6 text-left font-medium">Joined</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {search.data.rows.length === 0 && (
                <tr><td className="pr-6 text-muted-foreground" colSpan={5}>No sign-up matches.</td></tr>
              )}
              {search.data.rows.map((r) => (
                <tr key={r.id} data-testid={`row-waitlist-${r.id}`}>
                  <td className="pr-6">{r.email}{r.isQa && <span className="ml-2 text-xs text-muted-foreground">QA</span>}</td>
                  <td className="pr-6">{r.role}</td>
                  <td className="pr-6">{r.marketSlug ?? ""}</td>
                  <td className="pr-6">{r.createdAt ?? ""}</td>
                  <td>
                    <Button size="sm" variant="outline" onClick={() => setPending(r)} data-testid={`button-waitlist-delete-${r.id}`}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <AlertDialog open={pending !== null} onOpenChange={(open) => { if (!open) setPending(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this sign-up?</AlertDialogTitle>
              <AlertDialogDescription>
                {pending?.email} will be removed from the waitlist for good. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {remove.isError && <p className="text-sm text-destructive">Could not delete the row.</p>}
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); if (pending) remove.mutate(pending.id); }}
                disabled={remove.isPending}
                data-testid="button-waitlist-delete-confirm"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

function labelFor(list: readonly { key: string; label: string }[], key: string): string {
  if (key === "not_answered") return "Not answered";
  return list.find((t) => t.key === key)?.label ?? key;
}

function CountTable({ heading, rows, label, testId }: { heading: string; rows: WaitlistCount[]; label: (k: string) => string; testId: string }) {
  return (
    <table className="text-sm" data-testid={testId}>
      <thead>
        <tr><th className="pr-6 text-left font-medium">{heading}</th><th className="text-right font-medium">Sign-ups</th></tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr><td className="pr-6 text-muted-foreground" colSpan={2}>None yet</td></tr>
        )}
        {rows.map((r) => (
          <tr key={r.key}><td className="pr-6">{label(r.key)}</td><td className="text-right">{r.count}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function Totals({ total, consented, prefix }: { total: number; consented: number; prefix: string }) {
  return (
    <div className="flex gap-8">
      <div>
        <div className="text-3xl font-semibold" data-testid={`text-${prefix}-total`}>{total}</div>
        <div className="text-sm text-muted-foreground">on the list</div>
      </div>
      <div>
        <div className="text-3xl font-semibold" data-testid={`text-${prefix}-consented`}>{consented}</div>
        <div className="text-sm text-muted-foreground">opted in to updates</div>
      </div>
    </div>
  );
}

function MarketTable({ rows }: { rows: WaitlistCounts["byMarket"] }) {
  return (
    <table className="text-sm" data-testid="table-waitlist-markets">
      <thead>
        <tr>
          <th className="pr-6 text-left font-medium">City</th>
          <th className="pr-6 text-right font-medium">Travelers</th>
          <th className="text-right font-medium">Guides and providers</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.marketSlug} data-testid={`row-waitlist-market-${r.marketSlug}`}>
            <td className="pr-6">{waitlistCityName(r.marketSlug) ?? r.marketSlug}</td>
            <td className="pr-6 text-right">{r.travelers}</td>
            <td className="text-right">{r.providers}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AdminWaitlist() {
  // "" = the server's default (the launch market); "all" = every market; else one market key.
  const [filter, setFilter] = useState("");
  const qs = filter ? `?market=${encodeURIComponent(filter)}` : "";
  const { data, isLoading, isError } = useQuery<WaitlistCounts>({ queryKey: [`/api/admin/waitlist${qs}`] });
  const market = data?.marketSlug ? ` — ${waitlistCityName(data.marketSlug) ?? data.marketSlug}` : filter === "all" ? " — all cities" : "";
  const exportHref = (role: "traveler" | "provider") => `/api/admin/waitlist/export?role=${role}${filter ? `&market=${encodeURIComponent(filter)}` : ""}`;
  return (
    <AdminLayout title="Waitlist">
      <div className="space-y-6 p-6" data-testid="page-admin-waitlist">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {isError && <p className="text-sm text-destructive">Could not load the waitlist.</p>}
        {data && (
          <>
            {data.qaExcluded > 0 && (
              <p className="text-sm text-muted-foreground" data-testid="text-waitlist-qa-excluded">
                {data.qaExcluded} QA sign-up{data.qaExcluded === 1 ? "" : "s"} (test addresses) left out of these numbers and the CSVs.
              </p>
            )}
            <Card>
              <CardHeader><CardTitle>By city</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <MarketTable rows={data.byMarket} />
                <label className="flex items-center gap-2 text-sm">
                  <span>Show</span>
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    data-testid="select-waitlist-market"
                  >
                    <option value="">Launch market</option>
                    <option value="all">All cities</option>
                    {WAITLIST_MARKET_OPTIONS.map((m) => (
                      <option key={m.key} value={m.key}>{m.city}</option>
                    ))}
                  </select>
                </label>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Travelers{market}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Totals total={data.travelers.total} consented={data.travelers.consented} prefix="waitlist-travelers" />
                <div className="flex flex-wrap gap-10">
                  <CountTable heading="Trip type" rows={data.travelers.byTripType} label={(k) => labelFor(WAITLIST_TRIP_TYPES, k)} testId="table-waitlist-trip-types" />
                  <CountTable heading="Source" rows={data.travelers.bySource} label={(k) => k} testId="table-waitlist-sources" />
                </div>
                <Button asChild variant="outline" data-testid="button-waitlist-csv-travelers">
                  <a href={exportHref("traveler")}><Download className="mr-2 h-4 w-4" />Download travelers CSV</a>
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Guides and providers{market}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Totals total={data.providers.total} consented={data.providers.consented} prefix="waitlist-providers" />
                <CountTable heading="Type of service" rows={data.providers.byServiceType} label={(k) => labelFor(WAITLIST_SERVICE_TYPES, k)} testId="table-waitlist-service-types" />
                <Button asChild variant="outline" data-testid="button-waitlist-csv-providers">
                  <a href={exportHref("provider")}><Download className="mr-2 h-4 w-4" />Download providers CSV</a>
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Credited to experts{market}</CardTitle></CardHeader>
              <CardContent>
                <p className="mb-3 text-sm text-muted-foreground">
                  Sign-ups that arrived through an expert's own Ready-Made Trip link (source expert_link).
                </p>
                <CountTable
                  heading="Expert"
                  rows={data.referrers.map((r) => ({ key: r.handle ? `@${r.handle}` : r.referrerUserId, count: r.count }))}
                  label={(k) => k}
                  testId="table-waitlist-referrers"
                />
              </CardContent>
            </Card>
            <WaitlistMarketOpenedCard />
            <WaitlistSearch />
          </>
        )}
      </div>
    </AdminLayout>
  );
}
