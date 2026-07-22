import { ExpertLayout } from "@/components/expert/expert-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, ArrowRight } from "lucide-react";
import { Link } from "wouter";

/**
 * Expert client detail — GATED.
 *
 * This route (/expert/clients/:id) previously rendered 100% mock data: a
 * hardcoded "Yuki Matsuda" with fabricated bookings and messages, shown for
 * EVERY id (the param was only used to set the fake record's id). There is no
 * /api/expert/clients/:id endpoint, and nothing in the app links here — the real
 * client surface is the Assigned Trips list and the per-trip workspace, both
 * backed by live endpoints. Rather than surface a fake person, this points the
 * expert at the real data. (A real per-client aggregate view is filed.)
 */
export default function ExpertClientDetail() {
  return (
    <ExpertLayout title="Client">
      <div className="p-6">
        <Card>
          <CardContent className="p-10 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Users className="w-6 h-6 text-muted-foreground" />
            </div>
            <h1 className="text-xl font-bold mb-1" data-testid="text-client-detail-title">
              Open a client from your trips
            </h1>
            <p className="text-muted-foreground max-w-md mx-auto mb-6">
              Your clients live under the trips assigned to you. Head to Clients to
              open a client's plan and coordinate their experience.
            </p>
            <Link href="/expert/clients">
              <Button variant="outline" data-testid="button-go-clients">
                Go to Clients <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </ExpertLayout>
  );
}
