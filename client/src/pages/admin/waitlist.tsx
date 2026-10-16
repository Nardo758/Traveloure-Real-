// LW-1c (ledger `2026-10-16-lw1c-kyoto-waitlist`): the launch waitlist for admins — counts (total, opted in to
// updates, by source) and a CSV download. Every download is audit-logged server-side.
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

interface WaitlistCounts {
  marketSlug: string | null;
  total: number;
  consented: number;
  bySource: { source: string; count: number }[];
}

export default function AdminWaitlist() {
  const { data, isLoading, isError } = useQuery<WaitlistCounts>({ queryKey: ["/api/admin/waitlist"] });
  return (
    <AdminLayout title="Waitlist">
      <div className="space-y-6 p-6" data-testid="page-admin-waitlist">
        <Card>
          <CardHeader>
            <CardTitle>Launch waitlist{data?.marketSlug ? ` — ${data.marketSlug}` : ""}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {isError && <p className="text-sm text-destructive">Could not load the waitlist.</p>}
            {data && (
              <>
                <div className="flex gap-8">
                  <div>
                    <div className="text-3xl font-semibold" data-testid="text-waitlist-total">{data.total}</div>
                    <div className="text-sm text-muted-foreground">on the list</div>
                  </div>
                  <div>
                    <div className="text-3xl font-semibold" data-testid="text-waitlist-consented">{data.consented}</div>
                    <div className="text-sm text-muted-foreground">opted in to updates</div>
                  </div>
                </div>
                <table className="text-sm" data-testid="table-waitlist-sources">
                  <thead>
                    <tr><th className="pr-6 text-left font-medium">Source</th><th className="text-right font-medium">Sign-ups</th></tr>
                  </thead>
                  <tbody>
                    {data.bySource.map((r) => (
                      <tr key={r.source}><td className="pr-6">{r.source}</td><td className="text-right">{r.count}</td></tr>
                    ))}
                  </tbody>
                </table>
                <Button asChild variant="outline" data-testid="button-waitlist-csv">
                  <a href="/api/admin/waitlist/export"><Download className="mr-2 h-4 w-4" />Download CSV</a>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
