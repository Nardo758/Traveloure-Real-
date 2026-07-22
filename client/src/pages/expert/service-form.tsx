import { ExpertLayout } from "@/components/expert/expert-layout";
import { ServiceForm } from "@/components/ServiceForm";
import { useParams } from "wouter";
import { useApplicationGuard } from "@/hooks/use-application-guard";
import { Skeleton } from "@/components/ui/skeleton";

export default function ExpertServiceFormPage() {
  const params = useParams<{ id: string }>();
  const { isLoading, requiresApplication } = useApplicationGuard();

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
