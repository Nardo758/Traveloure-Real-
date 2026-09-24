import { EALayout } from "@/components/ea-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plane, ArrowRight, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

/**
 * EA Managed Trips — the plans this assistant builds for its clients (Locked Decision 52 (C),
 * ledger `2026-09-24-ea-plans-for-executive`).
 *
 * Each plan belongs to the CLIENT (the executive); the assistant builds it from the plan page and
 * the client approves, books and pays. A plan leaves this list the moment its client revokes the
 * link, because the assistant's access goes with it. New plans start from a client card on
 * /ea/clients ("Plan a trip"), which is where the accepted link lives.
 */
interface ManagedPlan {
  id: string;
  title: string | null;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string | null;
  finalizedAt: string | null;
  clientName: string | null;
}

function dateRange(p: ManagedPlan): string | null {
  const s = p.startDate?.slice(0, 10);
  const e = p.endDate?.slice(0, 10);
  if (!s || !e) return null;
  return s === e ? s : `${s} → ${e}`;
}

export default function EATrips() {
  const { data: plans, isLoading, isError } = useQuery<ManagedPlan[]>({ queryKey: ["/api/ea/trips"] });

  return (
    <EALayout title="Managed Trips">
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-[#1A1A18]" data-testid="text-ea-trips-title">
              Plans you're building for clients
            </h1>
            <p className="text-sm text-[#7A7A72]">Your clients own these plans. They approve, book and pay.</p>
          </div>
          <Link href="/ea/clients">
            <Button variant="outline" data-testid="button-go-clients">
              Plan for a client <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>

        {isLoading && (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-[#AEAEA6]" />
          </div>
        )}
        {isError && <p className="text-sm text-red-600" data-testid="text-ea-trips-error">Couldn't load your plans.</p>}

        {plans && plans.length === 0 && (
          <Card className="border border-[#E8E8E2]">
            <CardContent className="p-10 text-center" data-testid="text-ea-trips-empty">
              <div className="w-12 h-12 rounded-full bg-[#F3F3EF] flex items-center justify-center mx-auto mb-4">
                <Plane className="w-6 h-6 text-[#AEAEA6]" />
              </div>
              <p className="text-[#7A7A72] max-w-md mx-auto">
                No plans yet. Open a client who has accepted your invitation and choose "Plan a trip".
              </p>
            </CardContent>
          </Card>
        )}

        {plans?.map((p) => (
          <Link key={p.id} href={`/plans/${p.id}`}>
            <Card className="border border-[#E8E8E2] hover:border-[#AEAEA6] cursor-pointer" data-testid={`card-ea-plan-${p.id}`}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-[#1A1A18] truncate">{p.title || p.destination || "Untitled plan"}</p>
                  <p className="text-sm text-[#7A7A72] truncate">
                    {[p.clientName, p.destination, dateRange(p)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {p.finalizedAt ? <Badge variant="secondary">Final</Badge> : <Badge variant="outline">Planning</Badge>}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </EALayout>
  );
}
