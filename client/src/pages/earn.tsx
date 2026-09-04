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
 * catalog by category, remote = expert catalog by service_tier — EXCEPT the
 * Event Planner card, which is fed by BOTH catalogs (ledger
 * `2026-09-04-earn-planner-roles`): the event VENDORS from the provider
 * catalog and the six event PLANNERS from the expert catalog, partitioned by
 * the explicit EVENT_PLANNER_OFFERING_KEYS list. The catalogs are still never
 * merged (§4) — a row carries which side it came from, because that decides
 * which door /start/events sends it through and because the two tables have
 * separate key namespaces (`proposal_planner` exists in both).
 *
 * Earning indicators are config-driven: each category's commissionBandKey
 * (/api/service-categories) resolved through /api/fee-bands/:bandKey, and
 * the expert floor from the expert_standard band. No hardcoded percentages.
 *
 * Editing an offering-type row (is_active, display_name, is_surprising…)
 * changes this page on next render — no deploy. Selecting any offering
 * routes into signup carrying ?offeringTypeKey=… (the one canonical param).
 */

import { useState } from "react";
import { useQuery, useQueries, useMutation } from "@tanstack/react-query";
import { useSearch, useLocation, Link } from "wouter";
import { Layout } from "@/components/layout";
import { useSignInModal } from "@/contexts/SignInModalContext";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { Star, ArrowRight, AlertCircle, PackageOpen, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  EARN_ROLES,
  EA_SIGNUP,
  isAffiliateCategory,
  roleForProviderCategory,
  roleForExpertOffering,
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
  const { isAuthenticated } = useAuth();

  // ── Gap 14 (ledger `2026-09-04-earn-contained-fixes`): "Don't see your trade?" ──────────
  // The catalog is finite and admin-edited, and a person whose trade is not on it had nowhere
  // to say so — they either picked a wrong-but-close row or left. The queue for exactly this
  // already exists (`offering_type_requests`, migration 189, surfaced on /admin/categories and
  // /admin/content-ops), and the provider wizard already files into it. This is the SAME rail —
  // `POST /api/me/offering-requests`, no new route, no new table — reached one step earlier,
  // before signup rather than mid-listing.
  //
  // AUTH: the endpoint is under `/api/me` and is `isAuthenticated`. /earn is a PUBLIC
  // pre-signup surface, so a guest is routed through the existing sign-in modal with a
  // `returnTo` back here — never allowed to type a request that would 401 on submit (§13: we
  // ask before the work, not after it).
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestName, setRequestName] = useState("");
  const [requestDescription, setRequestDescription] = useState("");
  const [requestSubmitted, setRequestSubmitted] = useState<string | null>(null);

  const offeringRequestMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/me/offering-requests", {
        requestedName: requestName.trim(),
        description: requestDescription.trim() || undefined,
      }),
    onSuccess: () => {
      setRequestSubmitted(requestName.trim());
      setRequestOpen(false);
      setRequestName("");
      setRequestDescription("");
    },
  });

  const openOfferingRequest = () => {
    if (!isAuthenticated) {
      openSignInModal({
        title: "Sign in to tell us about your trade",
        description: "We route these to the team that adds new offering types — we just need to know who to follow up with.",
        returnTo: window.location.pathname + window.location.search,
      });
      return;
    }
    setRequestSubmitted(null);
    setRequestOpen(true);
  };

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
    // Event Planner spans BOTH catalogs, so its ceiling must consider the expert
    // floor band too — a "keep up to N%" derived from the provider half alone
    // would be a claim about offerings it does not govern (§13). Still config —
    // no rate is written here (§8).
    if (role.key === "event_planner") {
      const expertRate = bandRates.get(EXPERT_FLOOR_BAND);
      if (expertRate !== undefined) rates.push(expertRate);
    }
    if (rates.length === 0) return null;
    return formatKeep(Math.min(...rates), "up_to");
  };

  // ── Role → offerings (partition functions from the config module) ────────
  // Both catalogs are asked for every card and the partition functions decide.
  // For three of the four cards exactly one side answers; for Event Planner
  // both do, which is the whole point of that card. `catalog` rides along
  // because the two tables have SEPARATE key namespaces — `proposal_planner`
  // is a row in each — so it is what keeps React keys and test ids unique.
  const offeringsForRole = (
    key: RoleKey
  ): { key: string; catalog: "provider" | "expert"; name: string; tagline: string | null }[] => [
    ...(providerOfferings ?? [])
      .filter((o) => !isAffiliateCategory(o.category_key) && roleForProviderCategory(o.category_key) === key)
      .map((o) => ({ key: o.offering_type_key, catalog: "provider" as const, name: o.display_name, tagline: o.tagline })),
    ...(expertOfferings ?? [])
      .filter((o) => roleForExpertOffering(o.service_tier, o.offering_type_key) === key)
      .map((o) => ({ key: o.offering_type_key, catalog: "expert" as const, name: o.display_name, tagline: o.tagline })),
  ];

  // Every Event Planner row — vendor or planner — still lands on the /start/events
  // fork, which asks which side of the event you are on and FORWARDS the offering
  // params to the door you pick. That is why the key may be shared between the two
  // catalogs: each door resolves it against its own table.
  const handleSelect = (role: EarnRole, offeringKey: string, displayName: string) => {
    const sep = role.signupPath.includes("?") ? "&" : "?";
    navigate(
      `${role.signupPath}${sep}offeringTypeKey=${encodeURIComponent(offeringKey)}&offeringName=${encodeURIComponent(displayName)}`
    );
  };

  // Featured strip: surprising rows from both catalogs, clickable into the
  // owning role's signup.
  const surprising: { key: string; catalog: "provider" | "expert"; name: string; role: EarnRole }[] = [
    ...(providerOfferings ?? [])
      .filter((o) => o.is_surprising && !isAffiliateCategory(o.category_key))
      .map((o) => ({
        key: o.offering_type_key,
        catalog: "provider" as const,
        name: o.display_name,
        role: EARN_ROLES.find((r) => r.key === roleForProviderCategory(o.category_key))!,
      })),
    ...(expertOfferings ?? [])
      .filter((o) => o.is_surprising)
      .map((o) => ({
        key: o.offering_type_key,
        catalog: "expert" as const,
        name: o.display_name,
        role: EARN_ROLES.find((r) => r.key === roleForExpertOffering(o.service_tier, o.offering_type_key))!,
      })),
  ];

  // Event Planner reads BOTH catalogs, so it is loading while either is and broken
  // if either is — showing half a card as if it were the whole list would be the
  // dishonest failure mode (§13).
  const spansBothCatalogs = activeKey === "event_planner";
  const catalogLoading = spansBothCatalogs
    ? loadingProv || loadingExp
    : activeRole.track === "in-person"
    ? loadingProv
    : loadingExp;
  const catalogError = spansBothCatalogs
    ? errProv ?? errExp
    : activeRole.track === "in-person"
    ? errProv
    : errExp;
  const catalogRefetch = spansBothCatalogs
    ? () => {
        void refetchProv();
        void refetchExp();
      }
    : activeRole.track === "in-person"
    ? refetchProv
    : refetchExp;
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
                    key={`${o.catalog}:${o.key}`}
                    name={o.name}
                    tagline={o.tagline}
                    testId={`earn-offering-${o.catalog}-${o.key}`}
                    onClick={() => handleSelect(activeRole, o.key, o.name)}
                  />
                ))}
              </div>
            )}

            {/* Gap 14: the catalog is finite. Say so, and give the person whose trade is not on
                it somewhere to go — the EXISTING offering-request queue. Rendered whatever the
                catalog's state is: "not listed" is exactly as true when the list failed to load
                or is empty as when it loaded fine. */}
            <div className="mt-3" data-testid="earn-trade-request">
              {requestSubmitted ? (
                <p
                  className="inline-flex items-start gap-1.5 text-xs text-[#0F6E56]"
                  data-testid="earn-trade-request-done"
                >
                  <Check className="w-3.5 h-3.5 mt-[1px] flex-shrink-0" />
                  <span>
                    Thanks — we've logged <span className="font-medium">{requestSubmitted}</span>. We review these
                    by hand and will follow up by email. We can't promise a date.
                  </span>
                </p>
              ) : requestOpen ? (
                <form
                  className="rounded-lg border border-[#E7E4DD] bg-white p-3.5 max-w-md"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!requestName.trim()) return;
                    offeringRequestMutation.mutate();
                  }}
                  data-testid="earn-trade-request-form"
                >
                  <Label htmlFor="earn-request-name" className="text-[13px] font-medium text-[#1F2733]">
                    What do you do?
                  </Label>
                  <Input
                    id="earn-request-name"
                    value={requestName}
                    onChange={(e) => setRequestName(e.target.value)}
                    placeholder="e.g. Kimono dressing, Sound bath facilitator"
                    maxLength={120}
                    className="mt-1.5"
                    data-testid="earn-trade-request-name"
                  />
                  <Label htmlFor="earn-request-desc" className="mt-3 block text-[13px] font-medium text-[#1F2733]">
                    Anything else? (optional)
                  </Label>
                  <Textarea
                    id="earn-request-desc"
                    value={requestDescription}
                    onChange={(e) => setRequestDescription(e.target.value)}
                    placeholder="Who it's for, how you deliver it, what travellers ask you for."
                    rows={3}
                    className="mt-1.5"
                    data-testid="earn-trade-request-description"
                  />
                  {offeringRequestMutation.isError && (
                    <p className="mt-2 text-xs text-[#C0392B]" data-testid="earn-trade-request-error">
                      We couldn't send that. Please try again.
                    </p>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!requestName.trim() || offeringRequestMutation.isPending}
                      className="bg-[#0F6E56] hover:bg-[#0F6E56]/90 text-white"
                      data-testid="earn-trade-request-submit"
                    >
                      {offeringRequestMutation.isPending ? "Sending…" : "Send"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setRequestOpen(false)}
                      data-testid="earn-trade-request-cancel"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={openOfferingRequest}
                  className="text-xs font-medium text-[#0F6E56] hover:underline"
                  data-testid="earn-trade-request-open"
                >
                  Don't see your trade? Tell us →
                </button>
              )}
            </div>
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
                  key={`${s.catalog}:${s.key}`}
                  type="button"
                  onClick={() => handleSelect(s.role, s.key, s.name)}
                  className="text-xs text-[#2E8B8B] bg-[#2E8B8B]/10 px-2.5 py-1 rounded-md hover:bg-[#2E8B8B]/20 transition-colors inline-flex items-center gap-1"
                  data-testid={`earn-surprising-${s.catalog}-${s.key}`}
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
