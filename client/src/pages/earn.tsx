/**
 * /earn — Ways to Earn hub, role→offering layout
 * (earn-page role-to-offering redesign brief; supersedes the two-tab track
 * toggle while keeping the same data plumbing).
 *
 * Structure: hero → "Which of these is you?" role band (4 cards + EA text
 * line) → catalog of the selected role's full mapped offering list →
 * featured "you probably didn't know…" strip (is_surprising rows).
 *
 * The role→offering mapping lives in lib/earn-roles.ts (single source of
 * truth, partition-by-construction; see its completeness test). Roles are a
 * presentation layer over the two delivery tracks: in-person = provider
 * catalog by category, remote = expert catalog by service_tier.
 *
 * Earning indicators are config-driven: each category's commissionBandKey
 * (/api/service-categories) resolved through /api/fee-bands/:bandKey, and
 * the expert floor from the expert_standard band. No hardcoded percentages.
 *
 * Editing an offering-type row (is_active, display_name, is_surprising…)
 * changes this page on next render — no deploy. Selecting any offering
 * routes into signup carrying ?offeringTypeKey=… (the one canonical param).
 */

import { useQuery, useQueries } from "@tanstack/react-query";
import { useSearch, useLocation, Link } from "wouter";
import { Layout } from "@/components/layout";
import { useSignInModal } from "@/contexts/SignInModalContext";
import { Star, ArrowRight, AlertCircle, PackageOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  EARN_ROLES,
  EA_SIGNUP,
  isAffiliateCategory,
  roleForProviderCategory,
  roleForExpertTier,
  type EarnRole,
  type ExpertTier,
  type RoleKey,
} from "@/lib/earn-roles";

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
  service_tier: ExpertTier;
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
  commissionBandKey: string | null;
}

interface FeeBand {
  band_key: string;
  rate_type: "percent" | "flat";
  default_rate: number;
}

const EXPERT_FLOOR_BAND = "expert_standard";

/** "keep up to N%" / "keep N%+" — N derived from live band rates only. */
function formatKeep(rate: number, style: "up_to" | "floor"): string {
  const keepPct = Math.round((1 - rate) * 100);
  return style === "up_to" ? `keep up to ${keepPct}%` : `keep ${keepPct}%+`;
}

function TrackPill({ track }: { track: EarnRole["track"] }) {
  const isInPerson = track === "in-person";
  return (
    <span
      className={`text-[10px] font-medium px-2 py-0.5 rounded ${
        isInPerson ? "bg-[#5DCAA5]/15 text-[#1f7a5c]" : "bg-[#2E8B8B]/12 text-[#2E8B8B]"
      }`}
    >
      {track}
    </span>
  );
}

function EarningBadge({ text, testId }: { text: string | null; testId: string }) {
  if (!text) return null;
  return (
    <span
      className="text-xs font-medium text-[#8a6414] bg-[#E8B339]/15 px-2.5 py-0.5 rounded-md whitespace-nowrap"
      data-testid={testId}
    >
      {text}
    </span>
  );
}

function RoleCard({
  role,
  active,
  chips,
  earning,
  onSelect,
}: {
  role: EarnRole;
  active: boolean;
  chips: string[];
  earning: string | null;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-left bg-white rounded-xl p-4 transition-colors ${
        active ? "border-2 border-[#2E8B8B]" : "border border-[#E7E4DD] hover:border-[#2E8B8B]/60"
      }`}
      data-testid={`earn-role-${role.key}`}
      aria-pressed={active}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-[#1E3A5F]">{role.label}</span>
        <TrackPill track={role.track} />
      </div>
      <p className="text-xs text-[#6A7480] leading-snug mb-2">{role.blurb}</p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {chips.map((c) => (
          <span key={c} className="text-[11px] text-[#6A7480] bg-[#F6F5F1] px-2 py-0.5 rounded-md">
            {c}
          </span>
        ))}
      </div>
      <EarningBadge text={earning} testId={`earn-role-earning-${role.key}`} />
    </button>
  );
}

function OfferingRow({
  name,
  tagline,
  testId,
  onClick,
}: {
  name: string;
  tagline: string | null;
  testId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center justify-between gap-3 w-full text-left bg-white border border-[#E7E4DD] rounded-lg px-3.5 py-2.5 transition-colors hover:border-[#2E8B8B]"
      data-testid={testId}
    >
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-[#1F2733]">{name}</div>
        {tagline && <div className="text-xs text-[#6A7480] mt-0.5">{tagline}</div>}
      </div>
      <span className="text-xs font-medium text-[#0F6E56] whitespace-nowrap group-hover:translate-x-0.5 transition-transform">
        I do this →
      </span>
    </button>
  );
}

export default function EarnPage() {
  const searchString = useSearch();
  const [, navigate] = useLocation();
  const { openSignInModal } = useSignInModal();

  // URL is the single source of truth for the selected role (deep-linkable).
  // Legacy ?track= deep links map onto the role layer.
  const params = new URLSearchParams(searchString);
  const roleParam = params.get("role") ?? (params.get("track") === "expert" ? "trip_planner" : params.get("track") === "provider" ? "service_provider" : null);
  const activeKey: RoleKey = (EARN_ROLES.some((r) => r.key === roleParam)
    ? roleParam
    : "service_provider") as RoleKey;
  const activeRole = EARN_ROLES.find((r) => r.key === activeKey)!;

  const setRole = (key: RoleKey) => navigate(`/earn?role=${key}`, { replace: true });

  // ── Data: the two offering catalogs + categories (names + band keys) ──────
  const { data: providerOfferings, isLoading: loadingProv, error: errProv, refetch: refetchProv } = useQuery<ServiceOfferingType[]>({
    queryKey: ["/api/offering-types/services"],
    staleTime: 5 * 60_000,
  });
  const { data: expertOfferings, isLoading: loadingExp, error: errExp, refetch: refetchExp } = useQuery<ExpertOfferingType[]>({
    queryKey: ["/api/offering-types/experts"],
    staleTime: 5 * 60_000,
  });
  const { data: categories } = useQuery<ServiceCategory[]>({
    queryKey: ["/api/service-categories"],
    staleTime: 5 * 60_000,
  });

  // ── Earning config: live band rates, never hardcoded ─────────────────────
  // Distinct provider bands (from each category's commissionBandKey) + the
  // expert floor band.
  const providerBandKeys = Array.from(
    new Set(
      (categories ?? [])
        .filter((c) => c.categoryKey && c.commissionBandKey)
        .map((c) => c.commissionBandKey as string)
    )
  ).sort();
  const bandQueries = useQueries({
    queries: [...providerBandKeys, EXPERT_FLOOR_BAND].map((key) => ({
      queryKey: [`/api/fee-bands/${key}`],
      staleTime: 60_000,
    })),
  });
  const bandRates = new Map<string, number>();
  bandQueries.forEach((q) => {
    const band = q.data as FeeBand | undefined;
    if (band && band.rate_type === "percent") bandRates.set(band.band_key, Number(band.default_rate));
  });

  /** Best (highest) keep-% across the categories a role spans. */
  const roleEarning = (role: EarnRole): string | null => {
    if (role.track === "remote") {
      const rate = bandRates.get(EXPERT_FLOOR_BAND);
      return rate === undefined ? null : formatKeep(rate, "floor");
    }
    const rates = (categories ?? [])
      .filter((c) => c.categoryKey && roleForProviderCategory(c.categoryKey) === role.key)
      .map((c) => (c.commissionBandKey ? bandRates.get(c.commissionBandKey) : undefined))
      .filter((r): r is number => r !== undefined);
    if (rates.length === 0) return null;
    return formatKeep(Math.min(...rates), "up_to");
  };

  // ── Role → offerings (partition functions from the config module) ────────
  const offeringsForRole = (key: RoleKey): { key: string; name: string; tagline: string | null }[] => {
    const role = EARN_ROLES.find((r) => r.key === key)!;
    if (role.track === "in-person") {
      return (providerOfferings ?? [])
        .filter((o) => !isAffiliateCategory(o.category_key) && roleForProviderCategory(o.category_key) === key)
        .map((o) => ({ key: o.offering_type_key, name: o.display_name, tagline: o.tagline }));
    }
    return (expertOfferings ?? [])
      .filter((o) => roleForExpertTier(o.service_tier) === key)
      .map((o) => ({ key: o.offering_type_key, name: o.display_name, tagline: o.tagline }));
  };

  const handleSelect = (role: EarnRole, offeringKey: string, displayName: string) => {
    const sep = role.signupPath.includes("?") ? "&" : "?";
    navigate(
      `${role.signupPath}${sep}offeringTypeKey=${encodeURIComponent(offeringKey)}&offeringName=${encodeURIComponent(displayName)}`
    );
  };

  // Featured strip: surprising rows from both catalogs, clickable into the
  // owning role's signup.
  const surprising: { key: string; name: string; role: EarnRole }[] = [
    ...(providerOfferings ?? [])
      .filter((o) => o.is_surprising && !isAffiliateCategory(o.category_key))
      .map((o) => ({
        key: o.offering_type_key,
        name: o.display_name,
        role: EARN_ROLES.find((r) => r.key === roleForProviderCategory(o.category_key))!,
      })),
    ...(expertOfferings ?? [])
      .filter((o) => o.is_surprising)
      .map((o) => ({
        key: o.offering_type_key,
        name: o.display_name,
        role: EARN_ROLES.find((r) => r.key === roleForExpertTier(o.service_tier))!,
      })),
  ];

  const catalogLoading = activeRole.track === "in-person" ? loadingProv : loadingExp;
  const catalogError = activeRole.track === "in-person" ? errProv : errExp;
  const catalogRefetch = activeRole.track === "in-person" ? refetchProv : refetchExp;
  const catalog = offeringsForRole(activeKey);

  return (
    <Layout>
      <div className="min-h-screen bg-[#F6F5F1]">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <div className="bg-white border-b border-[#E7E4DD]" data-testid="earn-hero">
          <div className="max-w-5xl mx-auto px-5 pt-9 pb-6">
            <h1
              className="text-[26px] font-semibold text-[#1E3A5F] tracking-tight mb-2"
              data-testid="earn-hero-title"
            >
              Get paid for what you already know
            </h1>
            <p className="text-[15px] text-[#6A7480] max-w-xl mb-3">
              Pick the role that sounds like you — see exactly what you'd offer and what you keep.
            </p>
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

        {/* ── Role band: "Which of these is you?" ──────────────────────── */}
        <div className="bg-white border-b border-[#E7E4DD]">
          <div className="max-w-5xl mx-auto px-5 py-5">
            <div className="flex items-center gap-4 mb-3">
              <span className="text-[13px] font-semibold text-[#1F2733]">Which of these is you?</span>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-[#6A7480]">
                <span className="w-2 h-2 rounded-sm bg-[#5DCAA5]" /> in-person
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-[#6A7480]">
                <span className="w-2 h-2 rounded-sm bg-[#2E8B8B]" /> remote
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5" data-testid="earn-role-band">
              {EARN_ROLES.map((role) => (
                <RoleCard
                  key={role.key}
                  role={role}
                  active={role.key === activeKey}
                  chips={offeringsForRole(role.key).slice(0, 3).map((o) => o.name)}
                  earning={roleEarning(role)}
                  onSelect={() => setRole(role.key)}
                />
              ))}
            </div>
            {/* EA: real signup, no offering backing yet — text link, not a card. */}
            <p className="text-xs text-[#6A7480] mt-3">
              {EA_SIGNUP.label} — {EA_SIGNUP.blurb}.{" "}
              <Link
                href={EA_SIGNUP.signupPath}
                className="text-[#0F6E56] font-medium"
                data-testid="earn-ea-signup"
              >
                Apply as an EA →
              </Link>
            </p>
          </div>
        </div>

        {/* ── Catalog: the selected role's full mapped offering list ───── */}
        <section className="bg-[#FAFAF8] border-b border-[#E7E4DD]">
          <div className="max-w-5xl mx-auto px-5 py-6">
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="text-base font-semibold text-[#1E3A5F]" data-testid="earn-catalog-title">
                {activeRole.label} · all services
              </h3>
              <EarningBadge text={roleEarning(activeRole)} testId="earn-catalog-earning" />
            </div>
            {catalogLoading ? (
              <p className="text-sm text-[#6A7480]">Loading offerings…</p>
            ) : catalogError ? (
              <div
                className="flex flex-col items-center gap-3 py-8 px-5 bg-[#FFF4F4] border border-[#FCCACA] rounded-xl text-center"
                data-testid="earn-catalog-error"
              >
                <AlertCircle className="w-7 h-7 text-[#E85D55]" />
                <div>
                  <p className="text-sm font-semibold text-[#C0392B]">Couldn't load offerings</p>
                  <p className="text-xs text-[#8B3A3A] mt-0.5">There was a problem fetching the catalog. Please try again.</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => catalogRefetch()}
                  className="border-[#E85D55] text-[#E85D55] hover:bg-[#FFF0F0]"
                  data-testid="earn-catalog-retry"
                >
                  Retry
                </Button>
              </div>
            ) : catalog.length === 0 ? (
              <div
                className="flex flex-col items-center gap-2 py-8 px-5 bg-white border border-dashed border-[#D5D0C8] rounded-xl text-center"
                data-testid="earn-catalog-empty"
              >
                <PackageOpen className="w-7 h-7 text-[#B0AAA0]" />
                <p className="text-sm text-[#6A7480]">No offerings published yet.</p>
              </div>
            ) : (
              <div className="grid gap-2" data-testid="earn-catalog">
                {catalog.map((o) => (
                  <OfferingRow
                    key={o.key}
                    name={o.name}
                    tagline={o.tagline}
                    testId={`earn-offering-${o.key}`}
                    onClick={() => handleSelect(activeRole, o.key, o.name)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Featured strip: is_surprising rows ───────────────────────── */}
        {surprising.length > 0 && (
          <div className="max-w-5xl mx-auto px-5 py-5">
            <div
              className="flex items-center gap-1.5 text-[13px] font-medium text-[#1F2733] mb-2.5"
              data-testid="earn-surprising-label"
            >
              <Star className="w-4 h-4 text-[#E8B339]" />
              <span>You probably didn't know you could get paid to…</span>
            </div>
            <div className="flex flex-wrap gap-2" data-testid="earn-surprising-row">
              {surprising.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => handleSelect(s.role, s.key, s.name)}
                  className="text-xs text-[#2E8B8B] bg-[#2E8B8B]/10 px-2.5 py-1 rounded-md hover:bg-[#2E8B8B]/20 transition-colors inline-flex items-center gap-1"
                  data-testid={`earn-surprising-${s.key}`}
                >
                  {s.name}
                  <ArrowRight className="w-3 h-3" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
