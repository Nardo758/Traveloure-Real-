// LW-1c (ledger `2026-10-16-lw1c-kyoto-waitlist`): the launch waitlist for admins — travelers (by trip type and
// source) and providers (by type of service) counted apart, never mixed; experts credited through their own
// Ready-Made link (LW-1d); and a CSV download per role. Every
// download is audit-logged server-side. Stored keys are shown with the forms' own labels.
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { WAITLIST_SERVICE_TYPES, WAITLIST_TRIP_TYPES } from "@shared/launch-waitlist";

interface WaitlistCount { key: string; count: number }
interface WaitlistReferrerCount { referrerUserId: string; handle: string | null; count: number }
interface WaitlistCounts {
  marketSlug: string | null;
  referrers: WaitlistReferrerCount[];
  travelers: { total: number; consented: number; byTripType: WaitlistCount[]; bySource: WaitlistCount[] };
  providers: { total: number; consented: number; byServiceType: WaitlistCount[] };
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

export default function AdminWaitlist() {
  const { data, isLoading, isError } = useQuery<WaitlistCounts>({ queryKey: ["/api/admin/waitlist"] });
  const market = data?.marketSlug ? ` — ${data.marketSlug}` : "";
  return (
    <AdminLayout title="Waitlist">
      <div className="space-y-6 p-6" data-testid="page-admin-waitlist">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {isError && <p className="text-sm text-destructive">Could not load the waitlist.</p>}
        {data && (
          <>
            <Card>
              <CardHeader><CardTitle>Travelers{market}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Totals total={data.travelers.total} consented={data.travelers.consented} prefix="waitlist-travelers" />
                <div className="flex flex-wrap gap-10">
                  <CountTable heading="Trip type" rows={data.travelers.byTripType} label={(k) => labelFor(WAITLIST_TRIP_TYPES, k)} testId="table-waitlist-trip-types" />
                  <CountTable heading="Source" rows={data.travelers.bySource} label={(k) => k} testId="table-waitlist-sources" />
                </div>
                <Button asChild variant="outline" data-testid="button-waitlist-csv-travelers">
                  <a href="/api/admin/waitlist/export?role=traveler"><Download className="mr-2 h-4 w-4" />Download travelers CSV</a>
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Guides and providers{market}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Totals total={data.providers.total} consented={data.providers.consented} prefix="waitlist-providers" />
                <CountTable heading="Type of service" rows={data.providers.byServiceType} label={(k) => labelFor(WAITLIST_SERVICE_TYPES, k)} testId="table-waitlist-service-types" />
                <Button asChild variant="outline" data-testid="button-waitlist-csv-providers">
                  <a href="/api/admin/waitlist/export?role=provider"><Download className="mr-2 h-4 w-4" />Download providers CSV</a>
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
          </>
        )}
      </div>
    </AdminLayout>
  );
}
