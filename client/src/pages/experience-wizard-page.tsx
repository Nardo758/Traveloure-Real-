import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Layout } from "@/components/layout";
import { ExperienceWizard } from "@/components/experience-wizard";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowLeft, AlertCircle } from "lucide-react";
import type { ExperienceType, ExperienceTemplateStep } from "@shared/schema";

export default function ExperienceWizardPage() {
  const [, params] = useRoute("/experiences/:slug");
  const slug = params?.slug || "";

  const { data: experienceType, isLoading: typeLoading, error: typeError } = useQuery<ExperienceType>({
    queryKey: ["/api/experience-types", slug],
    queryFn: async () => {
      const res = await fetch(`/api/experience-types/${slug}`);
      if (!res.ok) throw new Error("Experience type not found");
      return res.json();
    },
    enabled: !!slug,
  });

  const { data: steps, isLoading: stepsLoading } = useQuery<ExperienceTemplateStep[]>({
    queryKey: ["/api/experience-types", experienceType?.id, "steps"],
    queryFn: async () => {
      const res = await fetch(`/api/experience-types/${experienceType?.id}/steps`);
      if (!res.ok) throw new Error("Failed to load steps");
      return res.json();
    },
    enabled: !!experienceType?.id,
  });

  if (typeLoading || stepsLoading) {
    return (
      <Layout>
        <div className="min-h-screen bg-background">
          <div className="container mx-auto px-4 py-8">
            <div className="max-w-4xl mx-auto">
              <Card className="p-8">
                <div className="flex items-center gap-4 mb-8">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div>
                    <Skeleton className="h-6 w-48 mb-2" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                </div>
                <Skeleton className="h-2 w-full mb-8" />
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-3/4" />
                </div>
              </Card>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (typeError || !experienceType) {
    return (
      <Layout>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Card className="p-8 max-w-md text-center">
            <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Experience Not Found</h2>
            <p className="text-muted-foreground mb-6">
              The experience type you're looking for doesn't exist or has been removed.
            </p>
            <Link href="/experiences">
              <Button data-testid="button-back-to-experiences">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Experiences
              </Button>
            </Link>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <ExperienceWizard 
      experienceType={experienceType} 
      steps={steps || []} 
    />
  );
}
