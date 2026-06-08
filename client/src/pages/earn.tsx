/**
 * /earn — Phase 7
 *
 * Two-track acquisition page (provider · expert). Each track lists the
 * offering types from the Phase 2 catalogs (service_offering_types and
 * expert_offering_types), with a "I never knew" surprising row at the top
 * per brief §7.
 *
 * Phase 7 gate: editing an offering-type row (is_active, display_name,
 * is_surprising, etc.) changes this page on next render — no deploy.
 * The "surprising" row reads from is_surprising = true.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, Wrench, BookOpen } from "lucide-react";

interface ServiceOfferingType {
  offering_type_key: string;
  category_key: string;
  display_name: string;
  tagline: string | null;
  is_surprising: boolean;
  market_scoped: string[] | null;
  sort_order: number;
}

interface ExpertOfferingType {
  offering_type_key: string;
  service_tier: "advisory" | "planning" | "coordination" | "live_support" | "specialized";
  display_name: string;
  tagline: string | null;
  delivery_formats: string[];
  is_surprising: boolean;
  sort_order: number;
}

const EXPERT_TIER_LABELS: Record<ExpertOfferingType["service_tier"], string> = {
  advisory: "Advisory",
  planning: "Planning",
  coordination: "Coordination",
  live_support: "Live Support",
  specialized: "Specialized",
};

function SurprisingRow({ children }: { children: React.ReactNode }) {
  return (
    <Card className="border-amber-300 bg-amber-50/40 mb-6" data-testid="earn-surprising-row">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-amber-900">
          <Sparkles className="w-4 h-4" />
          You probably didn't know you could offer these
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {children}
        </div>
      </CardContent>
    </Card>
  );
}

function OfferingCard({
  name,
  tagline,
  tag,
  testId,
}: {
  name: string;
  tagline: string | null;
  tag?: string;
  testId: string;
}) {
  return (
    <div
      className="p-3 rounded-lg border border-gray-200 bg-white hover:border-gray-400 transition-colors"
      data-testid={testId}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-sm text-gray-900">{name}</p>
        {tag && <Badge variant="outline" className="text-[10px] flex-shrink-0">{tag}</Badge>}
      </div>
      {tagline && <p className="text-xs text-gray-600 mt-1">{tagline}</p>}
    </div>
  );
}

function ProviderTrack() {
  const { data, isLoading, error } = useQuery<ServiceOfferingType[]>({
    queryKey: ["/api/offering-types/services"],
    staleTime: 5 * 60_000,
  });

  if (isLoading) return <p className="text-sm text-gray-500">Loading offerings…</p>;
  if (error) return <p className="text-sm text-red-600">Couldn't load offerings.</p>;
  if (!data || data.length === 0) return <p className="text-sm text-gray-500">No offerings published yet.</p>;

  const surprising = data.filter((o) => o.is_surprising);
  const standard = data.filter((o) => !o.is_surprising);

  return (
    <div data-testid="earn-provider-track">
      {surprising.length > 0 && (
        <SurprisingRow>
          {surprising.map((o) => (
            <OfferingCard
              key={o.offering_type_key}
              name={o.display_name}
              tagline={o.tagline}
              tag={o.market_scoped && o.market_scoped.length > 0 ? o.market_scoped[0] : undefined}
              testId={`earn-provider-surprising-${o.offering_type_key}`}
            />
          ))}
        </SurprisingRow>
      )}

      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="w-4 h-4" />
            All provider offerings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {standard.map((o) => (
              <OfferingCard
                key={o.offering_type_key}
                name={o.display_name}
                tagline={o.tagline}
                tag={o.market_scoped && o.market_scoped.length > 0 ? o.market_scoped[0] : undefined}
                testId={`earn-provider-${o.offering_type_key}`}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ExpertTrack() {
  const { data, isLoading, error } = useQuery<ExpertOfferingType[]>({
    queryKey: ["/api/offering-types/experts"],
    staleTime: 5 * 60_000,
  });

  if (isLoading) return <p className="text-sm text-gray-500">Loading offerings…</p>;
  if (error) return <p className="text-sm text-red-600">Couldn't load offerings.</p>;
  if (!data || data.length === 0) return <p className="text-sm text-gray-500">No offerings published yet.</p>;

  const surprising = data.filter((o) => o.is_surprising);
  // Group standard offerings by tier so the page communicates the 5-tier model
  // even before the visitor knows it exists.
  const standard = data.filter((o) => !o.is_surprising);
  const byTier = standard.reduce<Record<string, ExpertOfferingType[]>>((acc, o) => {
    (acc[o.service_tier] ??= []).push(o);
    return acc;
  }, {});
  const tierOrder: ExpertOfferingType["service_tier"][] = [
    "advisory", "planning", "coordination", "live_support", "specialized",
  ];

  return (
    <div data-testid="earn-expert-track">
      {surprising.length > 0 && (
        <SurprisingRow>
          {surprising.map((o) => (
            <OfferingCard
              key={o.offering_type_key}
              name={o.display_name}
              tagline={o.tagline}
              tag={EXPERT_TIER_LABELS[o.service_tier]}
              testId={`earn-expert-surprising-${o.offering_type_key}`}
            />
          ))}
        </SurprisingRow>
      )}

      {tierOrder.map((tier) =>
        byTier[tier] && byTier[tier].length > 0 ? (
          <Card key={tier} className="border-gray-200 mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="w-4 h-4" />
                {EXPERT_TIER_LABELS[tier]}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {byTier[tier].map((o) => (
                  <OfferingCard
                    key={o.offering_type_key}
                    name={o.display_name}
                    tagline={o.tagline}
                    tag={o.delivery_formats.length > 0 ? o.delivery_formats[0] : undefined}
                    testId={`earn-expert-${o.offering_type_key}`}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null
      )}
    </div>
  );
}

export default function EarnPage() {
  const [track, setTrack] = useState<"provider" | "expert">("provider");

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto px-4 max-w-5xl">
          <header className="mb-6" data-testid="earn-header">
            <h1 className="text-3xl font-bold text-gray-900">Earn on Traveloure</h1>
            <p className="text-gray-600 mt-2 max-w-2xl">
              Two tracks: offer a service on the ground, or share your expertise remotely.
              Pick what fits and we'll walk you through onboarding.
            </p>
          </header>

          <Tabs value={track} onValueChange={(v) => setTrack(v as typeof track)}>
            <TabsList className="grid w-full grid-cols-2 max-w-md mb-6" data-testid="earn-tabs">
              <TabsTrigger value="provider" data-testid="earn-tab-provider">
                Offer a service
              </TabsTrigger>
              <TabsTrigger value="expert" data-testid="earn-tab-expert">
                Share your expertise
              </TabsTrigger>
            </TabsList>

            <TabsContent value="provider">
              <ProviderTrack />
            </TabsContent>
            <TabsContent value="expert">
              <ExpertTrack />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </Layout>
  );
}
