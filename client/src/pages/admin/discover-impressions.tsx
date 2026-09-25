/**
 * Admin — Discover impressions (board #621, ledger `2026-09-24-discover-impressions-admin`).
 *
 * Reads GET /api/admin/discover/impressions. Every figure is the server's own; this page
 * computes no rate. §13: click-through is shown only where the server returned one — it is
 * counted from the first card click linked to its impression, and before that the page says
 * so rather than printing 0%.
 */
import { AdminLayout } from "@/components/admin-layout";
import { AdminTabNav } from "@/components/admin/AdminTabNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Eye, Info, MousePointerClick, Users } from "lucide-react";

interface ImpressionGroup {
  key: string | null;
  impressions: number;
  sessions: number;
  cards: number;
  impressionsSinceLinking: number;
  impressionsClicked: number;
  clickThroughRate: number | null;
}

interface ImpressionCard {
  contentType: string;
  contentId: string;
  city: string | null;
  impressions: number;
  sessions: number;
  averagePosition: number | null;
  firstSeen: string;
  lastSeen: string;
  impressionsSinceLinking: number;
  impressionsClicked: number;
  clickThroughRate: number | null;
}

interface ImpressionsReport {
  window: "7" | "30" | "90" | "all";
  city: string | null;
  impressionsRecordedSince: string | null;
  linkingSince: string | null;
  totals: ImpressionGroup;
  byCity: ImpressionGroup[];
  byType: ImpressionGroup[];
  cards: ImpressionCard[];
  cardLimit: number;
  cities: string[];
}

const WINDOW_LABELS: Record<ImpressionsReport["window"], string> = {
  "7": "Last 7 days",
  "30": "Last 30 days",
  "90": "Last 90 days",
  all: "All time",
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Renders the server's rate, or says why there is none. Never a computed or zero-filled rate. */
function ClickThrough({ group, testId }: { group: Pick<ImpressionGroup, "clickThroughRate" | "impressionsClicked" | "impressionsSinceLinking">; testId: string }) {
  if (group.clickThroughRate == null) {
    return <span className="text-gray-400" data-testid={testId}>—</span>;
  }
  return (
    <span data-testid={testId}>
      {group.clickThroughRate}%{" "}
      <span className="text-gray-400 text-xs">
        ({group.impressionsClicked.toLocaleString()} of {group.impressionsSinceLinking.toLocaleString()})
      </span>
    </span>
  );
}

function typeLabel(contentType: string): string {
  return contentType.replace(/[-_]/g, " ");
}

function GroupTable({ title, description, rows, keyLabel, testPrefix, keyIsType }: {
  title: string;
  description: string;
  rows: ImpressionGroup[];
  keyLabel: string;
  testPrefix: string;
  /** Card types are slugs and read as words; a city is shown exactly as recorded. */
  keyIsType: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-gray-400 text-center py-6 text-sm">No impressions in this range</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-3 font-medium">{keyLabel}</th>
                  <th className="py-2 pr-3 font-medium text-right">Impressions</th>
                  <th className="py-2 pr-3 font-medium text-right">Sessions</th>
                  <th className="py-2 pr-3 font-medium text-right">Cards</th>
                  <th className="py-2 font-medium text-right">Click-through</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.key ?? `none-${i}`} className="border-b last:border-0" data-testid={`${testPrefix}-${i}`}>
                    <td className="py-2 pr-3">
                      {row.key == null ? (
                        <span className="text-gray-400">No city recorded</span>
                      ) : keyIsType ? (
                        <span className="capitalize">{typeLabel(row.key)}</span>
                      ) : (
                        row.key
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right">{row.impressions.toLocaleString()}</td>
                    <td className="py-2 pr-3 text-right">{row.sessions.toLocaleString()}</td>
                    <td className="py-2 pr-3 text-right">{row.cards.toLocaleString()}</td>
                    <td className="py-2 text-right"><ClickThrough group={row} testId={`${testPrefix}-ctr-${i}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminDiscoverImpressions() {
  const [windowKey, setWindowKey] = useState<ImpressionsReport["window"]>("30");
  const [city, setCity] = useState<string>("all");

  const { data, isLoading, isError } = useQuery<ImpressionsReport>({
    queryKey: ["/api/admin/discover/impressions", windowKey, city],
    queryFn: async () => {
      const params = new URLSearchParams({ window: windowKey });
      if (city !== "all") params.set("city", city);
      const res = await fetch(`/api/admin/discover/impressions?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load impressions");
      return res.json();
    },
  });

  const recordedSince = formatDate(data?.impressionsRecordedSince ?? null);
  const linkingSince = formatDate(data?.linkingSince ?? null);

  return (
    <AdminLayout title="Discover Impressions">
      <div className="p-6 space-y-6">
        <AdminTabNav
          tabs={[
            { label: "Overview", href: "/admin/analytics" },
            { label: "Tourism", href: "/admin/tourism-analytics" },
            { label: "Discover", href: "/admin/analytics/discover" },
          ]}
        />
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Discover impressions</h1>
            <p className="text-gray-500 mt-1">
              How often each Discover card was seen, by city and card type. A card counts once per browser session.
            </p>
          </div>
          <div className="flex gap-3">
            <div className="w-40" data-testid="select-window">
              <Select value={windowKey} onValueChange={(v) => setWindowKey(v as ImpressionsReport["window"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(WINDOW_LABELS) as ImpressionsReport["window"][]).map((w) => (
                    <SelectItem key={w} value={w}>{WINDOW_LABELS[w]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-48" data-testid="select-city">
              <Select value={city} onValueChange={setCity}>
                <SelectTrigger><SelectValue placeholder="All cities" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All cities</SelectItem>
                  {(data?.cities ?? []).map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <Card className="border-dashed">
          <CardContent className="py-4 flex gap-3 text-sm text-gray-600" data-testid="text-counting-note">
            <Info className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
            <div className="space-y-1">
              <p data-testid="text-recorded-since">
                {recordedSince
                  ? `Impressions have been recorded since ${recordedSince}.`
                  : "No impressions have been recorded yet."}
              </p>
              <p data-testid="text-linking-since">
                {linkingSince
                  ? `Click-through counts presses on a card's Book or site link, linked to the impression they came from, starting ${linkingSince}. Impressions before then are not counted in click-through; earlier clicks were never linked to a card.`
                  : "Click-through is not available yet: no card press has been linked to its impression. Presses are linked from this release on; earlier ones were never recorded against a card."}
              </p>
            </div>
          </CardContent>
        </Card>

        {isError ? (
          <Card><CardContent className="py-10 text-center text-sm text-red-600">Could not load impressions.</CardContent></Card>
        ) : isLoading || !data ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 text-gray-500 text-sm"><Eye className="w-4 h-4" /> Impressions</div>
                  <p className="text-2xl font-bold mt-1" data-testid="stat-impressions">{data.totals.impressions.toLocaleString()}</p>
                  <p className="text-xs text-gray-400">{data.totals.cards.toLocaleString()} distinct cards</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 text-gray-500 text-sm"><Users className="w-4 h-4" /> Browser sessions</div>
                  <p className="text-2xl font-bold mt-1" data-testid="stat-sessions">{data.totals.sessions.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 text-gray-500 text-sm"><MousePointerClick className="w-4 h-4" /> Click-through</div>
                  <p className="text-2xl font-bold mt-1"><ClickThrough group={data.totals} testId="stat-ctr" /></p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <GroupTable title="By city" description="Where cards were seen" rows={data.byCity} keyLabel="City" testPrefix="row-city" keyIsType={false} />
              <GroupTable title="By card type" description="Which kinds of card were seen" rows={data.byType} keyLabel="Card type" testPrefix="row-type" keyIsType />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Cards</CardTitle>
                <CardDescription>
                  Most-seen cards first (top {data.cardLimit}). Cards are listed by type and id: Discover mixes
                  several sources, including outside event feeds, so no name is guessed.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.cards.length === 0 ? (
                  <p className="text-gray-400 text-center py-6 text-sm" data-testid="text-no-cards">No impressions in this range</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 border-b">
                          <th className="py-2 pr-3 font-medium">Card</th>
                          <th className="py-2 pr-3 font-medium">City</th>
                          <th className="py-2 pr-3 font-medium text-right">Impressions</th>
                          <th className="py-2 pr-3 font-medium text-right">Sessions</th>
                          <th className="py-2 pr-3 font-medium text-right">Avg. position</th>
                          <th className="py-2 pr-3 font-medium">Last seen</th>
                          <th className="py-2 font-medium text-right">Click-through</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.cards.map((card, i) => (
                          <tr key={`${card.contentType}:${card.contentId}:${card.city ?? ""}`} className="border-b last:border-0" data-testid={`row-card-${i}`}>
                            <td className="py-2 pr-3">
                              <span className="capitalize">{typeLabel(card.contentType)}</span>{" "}
                              <span className="font-mono text-xs text-gray-500 break-all">{card.contentId}</span>
                            </td>
                            <td className="py-2 pr-3">{card.city ?? <span className="text-gray-400">—</span>}</td>
                            <td className="py-2 pr-3 text-right">{card.impressions.toLocaleString()}</td>
                            <td className="py-2 pr-3 text-right">{card.sessions.toLocaleString()}</td>
                            <td className="py-2 pr-3 text-right">{card.averagePosition ?? <span className="text-gray-400">—</span>}</td>
                            <td className="py-2 pr-3 whitespace-nowrap">{formatDate(card.lastSeen) ?? "—"}</td>
                            <td className="py-2 text-right"><ClickThrough group={card} testId={`row-card-ctr-${i}`} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
