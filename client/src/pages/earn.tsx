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
 *
 * Clicking any offering card triggers the provider/expert application flow
 * with that offering pre-selected as a URL param.
 */

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, Wrench, BookOpen, MapPin, GraduationCap, ChevronRight } from "lucide-react";

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
  onClick,
}: {
  name: string;
  tagline: string | null;
  tag?: string;
  testId: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left p-3 rounded-lg border border-gray-200 bg-white hover:border-[#FF385C] hover:shadow-sm transition-all w-full"
      data-testid={testId}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-sm text-gray-900">{name}</p>
        {tag && <Badge variant="outline" className="text-[10px] flex-shrink-0">{tag}</Badge>}
      </div>
      {tagline && <p className="text-xs text-gray-600 mt-1">{tagline}</p>}
      <div className="flex items-center gap-1 mt-2 text-[11px] text-[#FF385C] font-semibold">
        I do this <ChevronRight className="w-3 h-3" />
      </div>
    </button>
  );
}

function ProviderTrack({ onSelect }: { onSelect: (key: string, name: string) => void }) {
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
              onClick={() => onSelect(o.offering_type_key, o.display_name)}
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
                onClick={() => onSelect(o.offering_type_key, o.display_name)}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ExpertTrack({ onSelect }: { onSelect: (key: string, name: string) => void }) {
  const { data, isLoading, error } = useQuery<ExpertOfferingType[]>({
    queryKey: ["/api/offering-types/experts"],
    staleTime: 5 * 60_000,
  });

  if (isLoading) return <p className="text-sm text-gray-500">Loading offerings…</p>;
  if (error) return <p className="text-sm text-red-600">Couldn't load offerings.</p>;
  if (!data || data.length === 0) return <p className="text-sm text-gray-500">No offerings published yet.</p>;

  const surprising = data.filter((o) => o.is_surprising);
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
              onClick={() => onSelect(o.offering_type_key, o.display_name)}
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
                    onClick={() => onSelect(o.offering_type_key, o.display_name)}
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
  const searchString = useSearch();
  const [, navigate] = useLocation();

  const trackParam = new URLSearchParams(searchString).get("track");
  const [track, setTrack] = useState<"provider" | "expert">(
    trackParam === "expert" ? "expert" : "provider"
  );

  useEffect(() => {
    if (trackParam === "expert") setTrack("expert");
    else if (trackParam === "provider") setTrack("provider");
  }, [trackParam]);

  const handleProviderSelect = (offeringKey: string, displayName: string) => {
    navigate(`/become-provider?offeringType=${encodeURIComponent(offeringKey)}&offeringName=${encodeURIComponent(displayName)}`);
  };

  const handleExpertSelect = (offeringKey: string, _displayName: string) => {
    navigate(`/expert/services/new?offeringTypeKey=${encodeURIComponent(offeringKey)}`);
  };

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50">
        {/* ── Dual-path hero ─────────────────────────────────────────────── */}
        <section
          className="bg-gradient-to-br from-[#0F6E56] to-[#0c5a47] text-white py-14 px-4"
          data-testid="earn-hero"
        >
          <div className="container mx-auto max-w-5xl text-center">
            <h1 className="text-4xl font-bold mb-3" data-testid="earn-hero-title">
              Earn on Traveloure
            </h1>
            <p className="text-green-100 text-lg mb-8 max-w-2xl mx-auto">
              Two paths. Pick yours.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl mx-auto">
              <button
                type="button"
                onClick={() => setTrack("provider")}
                className={`rounded-xl border-2 p-5 text-left transition-all ${
                  track === "provider"
                    ? "border-white bg-white/20"
                    : "border-white/30 hover:border-white/60 bg-white/5"
                }`}
                data-testid="earn-cta-provider"
              >
                <MapPin className="w-6 h-6 mb-2 text-green-300" />
                <div className="font-semibold text-lg">Earn as a local</div>
                <p className="text-green-100 text-sm mt-1">
                  Offer on-the-ground services — tours, transport, photography, and more.
                </p>
                <div className="mt-3 flex items-center gap-1 text-sm font-semibold text-white/80">
                  See local offerings <ChevronRight className="w-4 h-4" />
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTrack("expert")}
                className={`rounded-xl border-2 p-5 text-left transition-all ${
                  track === "expert"
                    ? "border-white bg-white/20"
                    : "border-white/30 hover:border-white/60 bg-white/5"
                }`}
                data-testid="earn-cta-expert"
              >
                <GraduationCap className="w-6 h-6 mb-2 text-green-300" />
                <div className="font-semibold text-lg">Share your expertise</div>
                <p className="text-green-100 text-sm mt-1">
                  Advise travellers, review plans, coordinate logistics — remotely or in-person.
                </p>
                <div className="mt-3 flex items-center gap-1 text-sm font-semibold text-white/80">
                  See expert offerings <ChevronRight className="w-4 h-4" />
                </div>
              </button>
            </div>
          </div>
        </section>

        {/* ── Offering catalog ───────────────────────────────────────────── */}
        <div className="container mx-auto px-4 max-w-5xl py-8">
          <header className="mb-6" data-testid="earn-header">
            <p className="text-gray-600 max-w-2xl">
              Pick any offering below to start your application with it pre-selected.
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
              <ProviderTrack onSelect={handleProviderSelect} />
            </TabsContent>
            <TabsContent value="expert">
              <ExpertTrack onSelect={handleExpertSelect} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </Layout>
  );
}
