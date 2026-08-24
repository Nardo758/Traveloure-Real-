import { ExpertLayout } from "@/components/expert/expert-layout";
import { ServiceForm } from "@/components/ServiceForm";
import { useParams } from "wouter";
import { useApplicationGuard } from "@/hooks/use-application-guard";
import { useAuth } from "@/hooks/use-auth";
import { isExpertRole } from "@shared/roles";
import { Skeleton } from "@/components/ui/skeleton";

export default function ExpertServiceFormPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  // Audit A3 / CLAUDE.md §5 Phase 3 "role is the gate" (ratified Jul 29, 2026): this route
  // is already gated by <ProtectedRoute requiredRole="expert"> (App.tsx), so `user.role`
  // is guaranteed expert-family by the time this component renders — skip the
  // local_expert_forms-based application-wizard check entirely for that session and land
  // directly in ServiceForm. The wizard remains for users who don't yet hold the role
  // (reached via other, non-role-gated entry points such as expert-status.tsx).
  const hasExpertRole = isExpertRole(user?.role);
  const { isLoading, requiresApplication } = useApplicationGuard({ skip: hasExpertRole });

  if (isLoading) {
    return (
      <ExpertLayout title={params?.id ? "Edit Service" : "New Service"}>
        <div className="space-y-4 p-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </ExpertLayout>
    );
  }

  if (requiresApplication) {
    return null;
  }

  return (
    <ExpertLayout title={params?.id ? "Edit Service" : "New Service"}>
      <ServiceForm role="expert" id={params?.id} />
    </ExpertLayout>
  );
}
