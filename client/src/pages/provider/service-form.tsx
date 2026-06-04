import { ProviderLayout } from "@/components/provider/provider-layout";
import { ServiceForm } from "@/components/ServiceForm";
import { useParams } from "wouter";

export default function ProviderServiceFormPage() {
  const params = useParams<{ id: string }>();

  return (
    <ProviderLayout title={params?.id ? "Edit Service" : "New Service"}>
      <ServiceForm role="provider" id={params?.id} />
    </ProviderLayout>
  );
}
