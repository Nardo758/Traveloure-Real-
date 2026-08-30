import { EALayout } from "@/components/ea-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plane, ArrowRight } from "lucide-react";
import { Link } from "wouter";

/**
 * EA Managed Trips — GATED (coming soon).
 *
 * The create/list flow targeted `/api/ea/trips` (GET) and
 * `/api/ea/clients/:id/trips` (POST), neither of which exists server-side — the
 * create dialog POSTed into the Vite catch-all (200-HTML) and fired a
 * fake-success "Trip created" toast while nothing was persisted. Rather than ship
 * a facade, this surface is gated honestly until the managed-trips backend is
 * built (filed). EAs can still coordinate individual client trips from the
 * Clients console today.
 */
export default function EATrips() {
  return (
    <EALayout title="Managed Trips">
      <div className="p-6">
        <Card className="border border-[#E8E8E2]">
          <CardContent className="p-10 text-center">
            <div className="w-12 h-12 rounded-full bg-[#F3F3EF] flex items-center justify-center mx-auto mb-4">
              <Plane className="w-6 h-6 text-[#AEAEA6]" />
            </div>
            <h1
              className="text-xl font-bold text-[#1A1A18] mb-1"
              data-testid="text-ea-trips-title"
            >
              Managed Trips are coming soon
            </h1>
            <p className="text-[#7A7A72] max-w-md mx-auto mb-6">
              A dedicated place to plan and track trips on behalf of your clients is
              on the way. In the meantime, coordinate each client's travel from their
              profile in the Clients console.
            </p>
            <Link href="/ea/clients">
              <Button variant="outline" data-testid="button-go-clients">
                Go to Clients <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </EALayout>
  );
}
