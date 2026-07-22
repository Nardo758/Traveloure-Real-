import { ExpertLayout } from "@/components/expert/expert-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, ArrowRight } from "lucide-react";
import { Link } from "wouter";

/**
 * Expert contract categories — GATED.
 *
 * This route (/expert/contract-categories) previously rendered a fabricated
 * static `contractCategories` array: invented Total Contracts / Total Revenue
 * stat cards and a hardcoded "4.9" Avg Rating, none of it backed by a real
 * endpoint. The page is not linked anywhere (orphaned — no sidebar entry, no
 * in-app link). Rather than surface fabricated contract/revenue/rating numbers,
 * it's gated until a real contract-category backend exists. Your real contracts
 * live on your bookings; a real category-management surface is filed.
 */
export default function ContractCategories() {
  return (
    <ExpertLayout title="Contract Categories">
      <div className="p-6">
        <Card>
          <CardContent className="p-10 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <FileText className="w-6 h-6 text-muted-foreground" />
            </div>
            <h1 className="text-xl font-bold mb-1" data-testid="text-contract-categories-title">
              Contract categories are coming soon
            </h1>
            <p className="text-muted-foreground max-w-md mx-auto mb-6">
              Category-level contract and revenue tracking isn't wired up yet. In
              the meantime, your contracts and earnings are on your Bookings and
              Earnings pages.
            </p>
            <Link href="/expert/bookings">
              <Button variant="outline" data-testid="button-go-bookings">
                Go to Bookings <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </ExpertLayout>
  );
}
