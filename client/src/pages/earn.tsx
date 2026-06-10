/**
 * /earn — Ways to Earn hub (Phase 7, visual spec: ways-to-earn-ui.html)
 *
 * Two-track acquisition page (provider · expert). Each track lists the
 * offering types from the Phase 2 catalogs (service_offering_types and
 * expert_offering_types), with a surprising "I never knew" row at the top
 * per brief §7.
 *
 * Phase 7 gate: editing an offering-type row (is_active, display_name,
 * is_surprising, etc.) changes this page on next render — no deploy.
 * The surprising row reads from is_surprising = true.
 *
 * The track toggle reads AND writes ?track=provider|expert so views are
 * deep-linkable. Clicking any offering routes into the Join-as-Partner
 * signup flow with that offering carried as URL params.
 */

import { useQuery } from "@tanstack/react-query";
import { useSearch, useLocation, Link } from "wouter";
import { Layout } from "@/components/layout";
import { useSignInModal } from "@/contexts/SignInModalContext";
import {
  Star,
  ArrowRight,
  Car,
  Map,
  Camera,
  Building2,
  UtensilsCrossed,
  Compass,
  ChefHat,
  Crown,
  HeartHandshake,
  PartyPopper,
  Flower2,
  Music,
  Scissors,
  MonitorSpeaker,
  Package,
  MessageCircle,
  Route,
  ClipboardList,
  MessageSquare,
  Sparkles,
  Briefcase,
  type LucideIcon,
} from "lucide-react";

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

interface ServiceCategory {
  id: string;
  name: string;
  categoryKey: string | null;
}

const EXPERT_TIER_LABELS: Record<ExpertOfferingType["service_tier"], string> = {
  advisory: "Quick advice",
  planning: "Planning",
  coordination: "Done-for-you",
  live_support: "While they're there",
  specialized: "Your niche",
};

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  private_transportation: Car,
  tour_guide: Map,
  photography: Camera,
  accommodation: Building2,
  dining_venue: UtensilsCrossed,
  activity_provider: Compass,
  private_chef: ChefHat,
  concierge_vip: Crown,
  childcare_family: HeartHandshake,
  event_coordinator: PartyPopper,
  florist: Flower2,
  entertainment: Music,
  hair_makeup: Scissors,
  av_tech: MonitorSpeaker,
  rentals: Package,
};

const TIER_ICONS: Record<ExpertOfferingType["service_tier"], LucideIcon> = {
  advisory: MessageCircle,
  planning: Route,
  coordination: ClipboardList,
  live_support: MessageSquare,
  specialized: Star,
};

const SURPRISING_COPY = {
  provider: "You probably didn't know you could get paid to…",
  expert: "You can earn from more than itineraries…",
} as const;

const BROWSE_COPY = {
  provider: "Browse all the ways to earn",
  expert: "Browse all the ways to share your expertise",
} as const;

/** Spec card: surprising-row tile with icon, name, tagline, "I do this →". */
function SurprisingCard({
  icon: Icon,
  name,
  tagline,
  testId,
  onClick,
}: {
  icon: LucideIcon;
  name: string;
  tagline: string | null;
  testId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left bg-[#F6F5F1] border border-[#E7E4DD] rounded-xl p-3.5 w-full transition-all hover:border-[#2E8B8B] hover:-translate-y-px"
      data-testid={testId}
    >
      <Icon className="w-5 h-5 text-[#2E8B8B]" />
      <h3 className="text-[13.5px] font-semibold text-[#1F2733] mt-2">{name}</h3>
      {tagline && <p className="text-xs text-[#6A7480] mt-0.5 leading-snug">{tagline}</p>}
      <div className="text-xs font-medium text-[#0F6E56] mt-2.5">I do this →</div>
    </button>
  );
}

/** Spec row inside a category box: offering name + arrow, whole row clickable. */
function OfferingRow({
  name,
  testId,
  onClick,
}: {
  name: string;
  testId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center justify-between w-full py-1.5 text-left"
      data-testid={testId}
    >
      <span className="text-[13px] text-[#6A7480] group-hover:text-[#0F6E56] transition-colors">
        {name}
      </span>
      <ArrowRight className="w-3.5 h-3.5 text-[#9AA2AC] group-hover:text-[#2E8B8B] group-hover:translate-x-0.5 transition-all" />
    </button>
  );
}

function CategoryBox({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-[#E7E4DD] rounded-xl px-4 py-4">
      <div className="flex items-center gap-2 text-[13.5px] font-semibold text-[#1E3A5F] mb-2.5">
        <Icon className="w-4 h-4 text-[#2E8B8B]" />
        {title}
      </div>
      {children}
    </div>
  );
}

function LoadState({ status }: { status: "loading" | "error" | "empty" }) {
  if (status === "loading") return <p className="text-sm text-[#6A7480]">Loading offerings…</p>;
  if (status === "error") return <p className="text-sm text-[#E85D55]">Couldn't load offerings.</p>;
  return <p className="text-sm text-[#6A7480]">No offerings published yet.</p>;
}

function SurprisingSection({
  track,
  children,
}: {
  track: "provider" | "expert";
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border-b border-[#E7E4DD]">
      <div className="max-w-5xl mx-auto px-5 py-6">
        <div
          className="flex items-center gap-1.5 text-[13px] font-medium text-[#6A7480] mb-3.5"
          data-testid="earn-surprising-label"
        >
          <Star className="w-4 h-4 text-[#E8B339]" />
          <span>{SURPRISING_COPY[track]}</span>
        </div>
        <div
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3"
          data-testid="earn-surprising-row"
        >
          {children}
        </div>
      </div>
    </section>
  );
}

function ProviderTrack({ onSelect }: { onSelect: (key: string, name: string) => void }) {
  const { data, isLoading, error } = useQuery<ServiceOfferingType[]>({
    queryKey: ["/api/offering-types/services"],
    staleTime: 5 * 60_000,
  });
  const { data: categories } = useQuery<ServiceCategory[]>({
    queryKey: ["/api/service-categories"],
    staleTime: 5 * 60_000,
  });

  if (isLoading) return <div className="max-w-5xl mx-auto px-5 py-6"><LoadState status="loading" /></div>;
  if (error) return <div className="max-w-5xl mx-auto px-5 py-6"><LoadState status="error" /></div>;
  if (!data || data.length === 0) return <div className="max-w-5xl mx-auto px-5 py-6"><LoadState status="empty" /></div>;

  const categoryNames = new globalThis.Map<string, string>(
    (categories ?? [])
      .filter((c) => c.categoryKey)
      .map((c) => [c.categoryKey as string, c.name])
  );

  const surprising = data.filter((o) => o.is_surprising);
  const standard = data.filter((o) => !o.is_surprising);

  // Group by category_key preserving the API's sort_order within and across groups.
  const groups: { key: string; items: ServiceOfferingType[] }[] = [];
  const groupIndex = new globalThis.Map<string, number>();
  for (const o of standard) {
    const idx = groupIndex.get(o.category_key);
    if (idx === undefined) {
      groupIndex.set(o.category_key, groups.length);
      groups.push({ key: o.category_key, items: [o] });
    } else {
      groups[idx].items.push(o);
    }
  }

  return (
    <div data-testid="earn-provider-track">
      {surprising.length > 0 && (
        <SurprisingSection track="provider">
          {surprising.map((o) => (
            <SurprisingCard
              key={o.offering_type_key}
              icon={CATEGORY_ICONS[o.category_key] ?? Sparkles}
              name={o.display_name}
              tagline={o.tagline}
              testId={`earn-provider-surprising-${o.offering_type_key}`}
              onClick={() => onSelect(o.offering_type_key, o.display_name)}
            />
          ))}
        </SurprisingSection>
      )}

      <section className="bg-white border-b border-[#E7E4DD]">
        <div className="max-w-5xl mx-auto px-5 py-6">
          <div className="text-sm font-medium text-[#1F2733] mb-3.5" data-testid="earn-browse-title">
            {BROWSE_COPY.provider}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {groups.map((g) => (
              <CategoryBox
                key={g.key}
                icon={CATEGORY_ICONS[g.key] ?? Briefcase}
                title={categoryNames.get(g.key) ?? "More ways to earn"}
              >
                {g.items.map((o) => (
                  <OfferingRow
                    key={o.offering_type_key}
                    name={o.display_name}
                    testId={`earn-provider-${o.offering_type_key}`}
                    onClick={() => onSelect(o.offering_type_key, o.display_name)}
                  />
                ))}
              </CategoryBox>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function ExpertTrack({ onSelect }: { onSelect: (key: string, name: string) => void }) {
  const { data, isLoading, error } = useQuery<ExpertOfferingType[]>({
    queryKey: ["/api/offering-types/experts"],
    staleTime: 5 * 60_000,
  });

  if (isLoading) return <div className="max-w-5xl mx-auto px-5 py-6"><LoadState status="loading" /></div>;
  if (error) return <div className="max-w-5xl mx-auto px-5 py-6"><LoadState status="error" /></div>;
  if (!data || data.length === 0) return <div className="max-w-5xl mx-auto px-5 py-6"><LoadState status="empty" /></div>;

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
        <SurprisingSection track="expert">
          {surprising.map((o) => (
            <SurprisingCard
              key={o.offering_type_key}
              icon={TIER_ICONS[o.service_tier] ?? Sparkles}
              name={o.display_name}
              tagline={o.tagline}
              testId={`earn-expert-surprising-${o.offering_type_key}`}
              onClick={() => onSelect(o.offering_type_key, o.display_name)}
            />
          ))}
        </SurprisingSection>
      )}

      <section className="bg-white border-b border-[#E7E4DD]">
        <div className="max-w-5xl mx-auto px-5 py-6">
          <div className="text-sm font-medium text-[#1F2733] mb-3.5" data-testid="earn-browse-title">
            {BROWSE_COPY.expert}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {tierOrder.map((tier) =>
              byTier[tier] && byTier[tier].length > 0 ? (
                <CategoryBox key={tier} icon={TIER_ICONS[tier]} title={EXPERT_TIER_LABELS[tier]}>
                  {byTier[tier].map((o) => (
                    <OfferingRow
                      key={o.offering_type_key}
                      name={o.display_name}
                      testId={`earn-expert-${o.offering_type_key}`}
                      onClick={() => onSelect(o.offering_type_key, o.display_name)}
                    />
                  ))}
                </CategoryBox>
              ) : null
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

export default function EarnPage() {
  const searchString = useSearch();
  const [, navigate] = useLocation();
  const { openSignInModal } = useSignInModal();

  // URL is the single source of truth for the active track (deep-linkable).
  const trackParam = new URLSearchParams(searchString).get("track");
  const track: "provider" | "expert" = trackParam === "expert" ? "expert" : "provider";

  const setTrack = (t: "provider" | "expert") => {
    navigate(`/earn?track=${t}`, { replace: true });
  };

  const handleProviderSelect = (offeringKey: string, displayName: string) => {
    navigate(
      `/become-provider?offeringType=${encodeURIComponent(offeringKey)}&offeringName=${encodeURIComponent(displayName)}`
    );
  };

  const handleExpertSelect = (offeringKey: string, displayName: string) => {
    navigate(
      `/become-expert?offeringTypeKey=${encodeURIComponent(offeringKey)}&offeringName=${encodeURIComponent(displayName)}`
    );
  };

  return (
    <Layout>
      <div className="min-h-screen bg-[#F6F5F1]">
        {/* ── Hero + dual-track toggle ───────────────────────────────────── */}
        <div className="bg-white border-b border-[#E7E4DD]" data-testid="earn-hero">
          <div className="max-w-5xl mx-auto px-5 pt-9 pb-7">
            <h1
              className="text-[26px] font-semibold text-[#1E3A5F] tracking-tight mb-2"
              data-testid="earn-hero-title"
            >
              Get paid for what you already know
            </h1>
            <p className="text-[15px] text-[#6A7480] mb-5 max-w-xl">
              Travelers in your city need locals like you. Offer a service or share your
              expertise — on your terms.
            </p>
            <div className="inline-flex gap-2.5 mb-3.5 flex-wrap" data-testid="earn-tabs">
              <button
                type="button"
                onClick={() => setTrack("provider")}
                className={`text-sm font-medium px-[18px] py-[9px] rounded-lg border transition-colors ${
                  track === "provider"
                    ? "bg-[#2E8B8B] text-white border-[#2E8B8B]"
                    : "bg-white text-[#1F2733] border-[#D8D4CB]"
                }`}
                data-testid="earn-tab-provider"
              >
                Offer a service
              </button>
              <button
                type="button"
                onClick={() => setTrack("expert")}
                className={`text-sm font-medium px-[18px] py-[9px] rounded-lg border transition-colors ${
                  track === "expert"
                    ? "bg-[#2E8B8B] text-white border-[#2E8B8B]"
                    : "bg-white text-[#1F2733] border-[#D8D4CB]"
                }`}
                data-testid="earn-tab-expert"
              >
                Share your expertise
              </button>
            </div>
            <div className="text-[13px]">
              <span className="text-[#6A7480]">Already a partner?</span>{" "}
              <button
                type="button"
                onClick={() => openSignInModal()}
                className="text-[#0F6E56] font-medium"
                data-testid="earn-signin"
              >
                Sign in →
              </button>
            </div>
          </div>
        </div>

        {/* ── Surprising row + browse catalog (data-driven per track) ───── */}
        {track === "provider" ? (
          <ProviderTrack onSelect={handleProviderSelect} />
        ) : (
          <ExpertTrack onSelect={handleExpertSelect} />
        )}

        {/* ── Footer role link ───────────────────────────────────────────── */}
        <div className="text-center px-5 py-5">
          <span className="text-[13px] text-[#6A7480]">New here and not sure where you fit?</span>{" "}
          <Link
            href="/partner-with-us"
            className="text-[13px] text-[#0F6E56] font-semibold"
            data-testid="earn-see-all-roles"
          >
            See all partner roles →
          </Link>
        </div>
      </div>
    </Layout>
  );
}
