import { ExpertLayout } from "@/components/expert/expert-layout";
import { ServiceForm } from "@/components/ServiceForm";
import { useParams } from "wouter";

export default function ExpertServiceFormPage() {
  const params = useParams<{ id: string }>();

  return (
    <ExpertLayout title={params?.id ? "Edit Service" : "New Service"}>
      <ServiceForm role="expert" id={params?.id} />
    </ExpertLayout>
  );
}
