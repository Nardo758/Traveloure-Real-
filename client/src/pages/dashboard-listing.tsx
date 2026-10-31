import { PROVIDER_SIGNUP_COPY } from "@shared/copy-2026-10-31";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { ServiceForm } from "@/components/ServiceForm";
import { useAuth } from "@/hooks/use-auth";
import { applicationStatusQuery } from "@/lib/application-status-query";
import { isEarnerRole, isExpertRole, isProviderRole } from "@shared/roles";
import type { ApplicationPhase } from "@shared/application-status";

interface SupplyAccount {
  kind: "expert" | "provider" | null;
  phase: ApplicationPhase;
  phaseTitle: string;
  phaseDetail: string;
  canSaveDraftListing: boolean;
}

/**
 * Draft listing for an account that is not an earner yet. Publish stays on the
 * console, which opens after the application is approved.
 */
export default function DashboardListingPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const supply = useQuery<SupplyAccount>({
    queryKey: ["/api/me/supply-account"],
    ...applicationStatusQuery,
  });

  if (supply.isPending) {
    return (
      <DashboardLayout>
        <div className="min-h-[40vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const account = supply.data;
  const role = user?.role ?? "user";

  if (supply.isError || !account) {
    return (
      <DashboardLayout>
        <div className="p-6 max-w-xl" data-testid="draft-listing-unavailable">
          <h1 className="text-2xl font-bold">Draft a listing</h1>
          <p className="text-muted-foreground mt-2">We couldn't load your application status. This page stays closed.</p>
          <a href="/dashboard" className="inline-block mt-4 text-primary underline">Back to Dashboard</a>
        </div>
      </DashboardLayout>
    );
  }

  if (isEarnerRole(role) || role === "admin") {
    const href = isProviderRole(role) ? "/provider/services/new" : isExpertRole(role) ? "/expert/services/new" : "/dashboard";
    const label = isProviderRole(role) ? "Provider console" : isExpertRole(role) ? "Expert console" : "Back to Dashboard";
    return (
      <DashboardLayout>
        <div className="p-6 max-w-xl" data-testid="draft-listing-use-console">
          <h1 className="text-2xl font-bold">Your account is approved</h1>
          <p className="text-muted-foreground mt-2">Create listings from your console. This draft page is for applications that are still open.</p>
          <Link href={href}><span className="inline-block mt-4 text-primary underline">{label}</span></Link>
        </div>
      </DashboardLayout>
    );
  }

  if (!account.canSaveDraftListing) {
    const applyHref = account.kind === "provider" ? "/become-provider" : account.kind === "expert" ? "/expert/apply" : null;
    return (
      <DashboardLayout>
        <div className="p-6 max-w-xl" data-testid="draft-listing-closed">
          <h1 className="text-2xl font-bold">{account.phaseTitle}</h1>
          <p className="text-muted-foreground mt-2">{account.phaseDetail}</p>
          <div className="mt-4 flex flex-col gap-2">
            {applyHref ? (
              <Link href={applyHref}><span className="text-primary underline">Update application</span></Link>
            ) : (
              <>
                <Link href="/expert/apply"><span className="text-primary underline">Apply as an expert</span></Link>
                <Link href={PROVIDER_SIGNUP_COPY.href}><span className="text-primary underline">{PROVIDER_SIGNUP_COPY.label}</span></Link>
              </>
            )}
            <a href="/dashboard" className="text-primary underline">Back to Dashboard</a>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const formRole = account.kind === "provider" ? "provider" : "expert";
  return (
    <DashboardLayout>
      <div className="p-3 sm:p-6" data-testid="draft-listing-form">
        <h1 className="text-2xl font-bold mb-1">Draft a listing</h1>
        <p className="text-muted-foreground mb-4">{account.phaseDetail}</p>
        <ServiceForm role={formRole} id={id} draftOnly />
      </div>
    </DashboardLayout>
  );
}
