/**
 * The booking panel on `/s/:handle` — ledger `2026-09-23-storefront-booking-panel`.
 *
 * ONE PANEL, TWO JOBS. On an EXPERT storefront it answers "how do I work with this person?": start
 * a plan, or share the plan the traveler arrived with (the advisors rail addressed by HANDLE —
 * Locked Decisions 12, 32, 40; the expert joins as `pending` and cannot change anything until they
 * accept). On a PROVIDER storefront it answers "how do I book?": it sends the traveler to a
 * listing, and it never picks one for them when there is more than one.
 *
 * Every sentence the panel may say is decided in `@/lib/storefront-booking-panel` (pure, unit
 * tested); this file draws them. Nothing here books or charges, and the one write — sharing — goes
 * through the existing owner-gated `POST /api/trips/:tripId/advisors`, whose server decides who may
 * share and with whom.
 *
 * THE PLAN-ENTRY BUTTON IS HANDED IN, NOT DRAWN HERE. The storefront is a planning door pinned by
 * `scripts/check-planning-entry.cjs` (its `PlanEntryCta` must pass this earner's `returnTo`), so
 * the page renders that one button and passes it through `planEntry`.
 */
import type { ReactNode } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  CalendarDays,
  CheckCircle2,
  Clock,
  Eye,
  Hourglass,
  Map as MapIcon,
  MessageCircle,
  PenLine,
  Share2,
  ShieldCheck,
  Wallet,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { apiRefusalMessage } from "@/lib/api-refusal";
import { useAuth } from "@/hooks/use-auth";
import { useAskExpert } from "@/lib/use-ask-expert";
import {
  BOOKING_MODE_LINES,
  advisorStanding,
  formatPanelPrice,
  leadTimeLine,
  lowestListedPrice,
  planChipText,
  planContextLine,
  resolvePanelKind,
  shareConversationSubject,
  sharedCancellationLabel,
  sharedLeadTimeHours,
  summarizeBookingModes,
  type AdvisorStanding,
  type PanelAdvisorRow,
  type PanelKind,
  type PanelService,
  type PanelTrip,
} from "@/lib/storefront-booking-panel";

const FRAUNCES = "'Fraunces', Georgia, serif";
const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const EYEBROW = "text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[color:var(--earn-coral-ink)]";
const PRIMARY =
  "w-full min-h-[48px] text-white font-bold bg-[color:var(--earn-coral-ink)] hover:bg-[color:var(--earn-coral-ink)]/90";
const OUTLINE =
  "w-full min-h-[44px] font-bold border-[color:var(--earn-border)] bg-[var(--earn-card)] text-[color:var(--earn-navy)] hover:bg-[var(--earn-chip)]";

export interface StorefrontPlanContext {
  /** The plan named by `?tripId=`, ONLY once the server confirmed the viewer owns it. */
  ownedTrip: PanelTrip | null;
  /** Where this earner stands on that plan (advisor list, matched by handle). */
  standing: AdvisorStanding;
}

/**
 * Resolve `?tripId=` into a plan the viewer OWNS, or nothing. The owner-gated advisor list is the
 * ownership probe (it answers 404 to anyone else), so a typed-in id for someone else's plan
 * resolves to "no plan" and the panel offers "Start a plan", never "Share" (§13).
 */
export function useStorefrontPlanContext(tripId: string | null, handle: string): StorefrontPlanContext {
  const { user } = useAuth();
  const enabled = !!user && !!tripId;
  const advisors = useQuery<{ advisors?: PanelAdvisorRow[] }>({
    queryKey: [`/api/trips/${tripId}/expert-advisor`],
    enabled,
    retry: false,
  });
  const trip = useQuery<{
    id: string;
    destination: string | null;
    startDate: string | null;
    endDate: string | null;
    datesConfirmedAt?: string | null;
  }>({
    queryKey: [`/api/trips/${tripId}`],
    enabled: enabled && advisors.isSuccess,
    retry: false,
  });
  if (!enabled || !advisors.isSuccess || !trip.isSuccess || !trip.data) {
    return { ownedTrip: null, standing: "none" };
  }
  return {
    ownedTrip: {
      id: trip.data.id ?? tripId!,
      destination: trip.data.destination ?? null,
      startDate: trip.data.startDate ?? null,
      endDate: trip.data.endDate ?? null,
      datesConfirmedAt: trip.data.datesConfirmedAt ?? null,
    },
    standing: advisorStanding(advisors.data?.advisors, handle),
  };
}

function Line({ icon, children, tone = "teal" }: { icon: ReactNode; children: ReactNode; tone?: "teal" | "gold" | "green" }) {
  const color =
    tone === "gold" ? "var(--earn-gold-ink)" : tone === "green" ? "var(--earn-green-ink)" : "var(--earn-teal-ink)";
  return (
    <li className="flex items-start gap-2.5 text-[13px] leading-[1.45] text-[color:var(--earn-ink)]">
      <span className="mt-[2px] shrink-0" style={{ color }} aria-hidden="true">
        {icon}
      </span>
      <span>{children}</span>
    </li>
  );
}

function Price({ lead, amount, tail }: { lead?: string; amount: string; tail?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-1.5" data-testid="storefront-panel-price">
      {lead && <span className="text-[13px] text-[color:var(--earn-muted)]">{lead}</span>}
      <strong className="text-[30px] font-semibold leading-none text-[color:var(--earn-navy)]" style={{ fontFamily: FRAUNCES }}>
        {amount}
      </strong>
      {tail && <span className="text-[12px] text-[color:var(--earn-muted)]">{tail}</span>}
    </div>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return <p className="text-center text-[12px] text-[color:var(--earn-muted)]">{children}</p>;
}

const Rule = () => <div className="h-px bg-[color:var(--earn-border)]" />;

export interface StorefrontBookingPanelProps {
  earner: { name: string; handle: string; role: string; profileImageUrl: string | null; hasInsurance?: boolean | null };
  isProvider: boolean;
  isOwnStorefront: boolean;
  /** `loadStorefront`'s `acceptsPlanShares` — whether this earner can be invited onto a plan. */
  acceptsPlanShares: boolean;
  services: PanelService[];
  away: { until: string; message: string | null } | null;
  plan: StorefrontPlanContext;
  /** The page's `PlanEntryCta` (pinned by the planning-entry guard) — drawn as the start action. */
  planEntry: ReactNode;
  /** The id of the services section, for "Choose a service". */
  servicesAnchorId: string;
}

/** The panel's primary action, shared by the card and the mobile bar so they can never disagree. */
function usePanelActions(props: StorefrontBookingPanelProps) {
  const { earner, plan } = props;
  const askExpert = useAskExpert();
  const share = useMutation({
    mutationFn: async () => {
      if (!plan.ownedTrip) throw new Error("No plan to share");
      // Addressed by HANDLE (Locked Decision 40). No message is composed here: the traveler's own
      // words belong in the conversation that opens next, as a prefill they can edit or discard.
      await apiRequest("POST", `/api/trips/${plan.ownedTrip.id}/advisors`, { handle: earner.handle });
    },
    onSuccess: () => {
      // The panel's next state is read back from the server, never assumed: re-sharing with an
      // expert who already ACCEPTED must still say "on your plan", not "waiting".
      if (plan.ownedTrip) queryClient.invalidateQueries({ queryKey: [`/api/trips/${plan.ownedTrip.id}/expert-advisor`] });
    },
  });
  const openConversation = () =>
    askExpert({
      handle: earner.handle,
      subject: plan.ownedTrip ? shareConversationSubject(plan.ownedTrip) : undefined,
      returnTo: `/s/${earner.handle}`,
      fallbackName: earner.name,
      fallbackAvatar: earner.profileImageUrl ?? undefined,
    });
  return { share, openConversation };
}

export function StorefrontBookingPanel(props: StorefrontBookingPanelProps) {
  const { earner, isProvider, isOwnStorefront, acceptsPlanShares, services, away, plan, planEntry, servicesAnchorId } = props;
  const { share, openConversation } = usePanelActions(props);
  const kind: PanelKind = resolvePanelKind({ isProvider, isOwnStorefront, acceptsPlanShares, ownedTrip: plan.ownedTrip, standing: plan.standing });
  if (kind === "hidden") return null;

  const firstName = earner.name.split(" ")[0] || earner.name;
  const lowest = lowestListedPrice(services);
  const awayLine = away ? (
    <Line icon={<Clock className="h-[15px] w-[15px]" />} tone="gold">
      Away until {new Date(away.until).toLocaleDateString(undefined, { month: "short", day: "numeric" })}. Listings stay
      visible; booking reopens then.
    </Line>
  ) : null;

  const shell = (children: ReactNode) => (
    <aside
      className="flex flex-col gap-4 rounded-xl border border-[color:var(--earn-border)] bg-[var(--earn-card)] px-6 py-6 shadow-[0_15px_40px_rgba(20,43,69,0.06)]"
      data-testid="storefront-booking-panel"
      data-panel-kind={kind}
    >
      {children}
    </aside>
  );

  if (kind === "provider") {
    const bookable = services.filter((s) => s.bookingMode !== "hidden");
    const single = bookable.length === 1 ? bookable[0] : null;
    const modes = summarizeBookingModes(services);
    const lead = sharedLeadTimeHours(services);
    const cancel = sharedCancellationLabel(services);
    const chip = plan.ownedTrip ? planChipText(plan.ownedTrip) : null;
    const tripQuery = plan.ownedTrip ? `?tripId=${encodeURIComponent(plan.ownedTrip.id)}` : "";
    return shell(
      <>
        <div className="flex flex-col gap-2">
          <p className={EYEBROW} style={{ fontFamily: EARN_MONO }}>Book directly</p>
          <h2 className="text-[26px] font-semibold leading-[1.1] tracking-[-0.03em] text-[color:var(--earn-navy)]" style={{ fontFamily: FRAUNCES }}>
            Book {earner.name}
          </h2>
        </div>
        {lowest !== null && <Price lead="From" amount={formatPanelPrice(lowest)} tail="· lowest listed price" />}
        {chip && (
          <div
            className="flex items-center gap-2 rounded-lg bg-[var(--earn-teal-wash)] px-3 py-2 text-[12.5px] text-[color:var(--earn-teal-ink)]"
            data-testid="storefront-panel-plan-chip"
          >
            <MapIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              <strong className="font-bold">Adding to your plan:</strong> {chip}
            </span>
          </div>
        )}
        {bookable.length > 0 && (
          <div className="flex flex-col gap-2">
            {single ? (
              <Link href={`/services/${single.id}${tripQuery}`}>
                <Button className={PRIMARY} data-testid="storefront-panel-primary">
                  <CalendarDays className="mr-2 h-4 w-4" />
                  Check availability
                </Button>
              </Link>
            ) : (
              <Button asChild className={PRIMARY} data-testid="storefront-panel-primary">
                <a href={`#${servicesAnchorId}`}>
                  <ArrowDown className="mr-2 h-4 w-4" />
                  Choose a service
                </a>
              </Button>
            )}
            <Caption>
              {single ? "One service — its dates open on its page." : `${bookable.length} services — pick one to see its dates.`}
            </Caption>
          </div>
        )}
        <Rule />
        <ul className="flex flex-col gap-[11px]">
          {awayLine}
          {modes && <Line icon={modes === "request" ? <CheckCircle2 className="h-[15px] w-[15px]" /> : <Zap className="h-[15px] w-[15px]" />}>{BOOKING_MODE_LINES[modes]}</Line>}
          {lead !== null && <Line icon={<Clock className="h-[15px] w-[15px]" />}>{leadTimeLine(lead)}</Line>}
          {cancel && <Line icon={<CalendarDays className="h-[15px] w-[15px]" />}>{cancel}</Line>}
          {earner.hasInsurance === true && <Line icon={<ShieldCheck className="h-[15px] w-[15px]" />}>Insured.</Line>}
          <Line icon={<Wallet className="h-[15px] w-[15px]" />} tone="gold">
            A service fee is shown before you pay.
          </Line>
        </ul>
      </>,
    );
  }

  // ── Expert ────────────────────────────────────────────────────────────────────────────────────
  const eyebrow = plan.ownedTrip ? planContextLine(plan.ownedTrip) : "Plan with a local";
  const priceBlock = lowest !== null ? <Price lead="Services from" amount={formatPanelPrice(lowest)} tail="· each priced separately" /> : null;
  const separately = (
    <Line icon={<Wallet className="h-[15px] w-[15px]" />} tone="gold">
      {firstName}&apos;s services are booked separately, at their own price.
    </Line>
  );
  const header = (title: string) => (
    <div className="flex flex-col gap-2">
      <p className={EYEBROW} style={{ fontFamily: EARN_MONO }} data-testid="storefront-panel-eyebrow">{eyebrow}</p>
      <h2 className="text-[26px] font-semibold leading-[1.1] tracking-[-0.03em] text-[color:var(--earn-navy)]" style={{ fontFamily: FRAUNCES }}>
        {title}
      </h2>
    </div>
  );

  if (kind === "expert_start") {
    return shell(
      <>
        {header(`Work with ${firstName}`)}
        {priceBlock}
        <div className="flex flex-col gap-2 [&_button]:w-full [&_button]:min-h-[48px] [&_button]:font-bold">
          {planEntry}
          <Caption>Where, when and who — about a minute.</Caption>
        </div>
        <Rule />
        <ul className="flex flex-col gap-[11px]">
          {awayLine}
          <Line icon={<MapIcon className="h-[15px] w-[15px]" />}>Your answers become a plan you own and can edit any time.</Line>
          <Line icon={<Share2 className="h-[15px] w-[15px]" />}>Then share it with {firstName} from this page.</Line>
          <Line icon={<CheckCircle2 className="h-[15px] w-[15px]" />}>Nothing is booked or charged until you choose to.</Line>
          {separately}
        </ul>
      </>,
    );
  }

  if (kind === "expert_share") {
    return shell(
      <>
        {header(`Work with ${firstName}`)}
        {priceBlock}
        <div className="flex flex-col gap-2">
          <Button className={PRIMARY} onClick={() => share.mutate()} disabled={share.isPending} data-testid="storefront-panel-share">
            <Share2 className="mr-2 h-4 w-4" />
            {share.isPending ? "Sharing…" : `Share my plan with ${firstName}`}
          </Button>
          {share.isError ? (
            <p className="text-center text-[12px] text-[color:var(--earn-coral-ink)]" role="alert" data-testid="storefront-panel-share-error">
              {apiRefusalMessage(share.error, "Your plan could not be shared. Please try again.")}
            </p>
          ) : (
            <Caption>Nothing is booked or charged by sharing.</Caption>
          )}
        </div>
        <Rule />
        <ul className="flex flex-col gap-[11px]">
          {awayLine}
          <Line icon={<Eye className="h-[15px] w-[15px]" />}>{firstName} can read your plan. They can&apos;t change anything until they accept.</Line>
          <Line icon={<MessageCircle className="h-[15px] w-[15px]" />}>You talk in Traveloure messages.</Line>
          <Line icon={<PenLine className="h-[15px] w-[15px]" />}>Once they accept, they add notes and suggestions. You decide what changes.</Line>
          {separately}
        </ul>
      </>,
    );
  }

  // expert_pending | expert_on_plan — the server's own answer, read back after sharing.
  const onPlan = kind === "expert_on_plan";
  return shell(
    <>
      {header(onPlan ? `${firstName} is on your plan` : `${firstName} has your plan`)}
      <div
        className="inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1 text-[12px] font-semibold"
        style={
          onPlan
            ? { background: "var(--earn-teal-wash)", color: "var(--earn-teal-ink)" }
            : { background: "var(--earn-gold-wash)", color: "var(--earn-gold-ink)" }
        }
        data-testid="storefront-panel-standing"
      >
        {onPlan ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <Hourglass className="h-3.5 w-3.5" aria-hidden="true" />}
        {onPlan ? `${firstName} accepted` : `Waiting for ${firstName} to accept`}
      </div>
      <div className="flex flex-col gap-2">
        <Button className={PRIMARY} onClick={openConversation} data-testid="storefront-panel-conversation">
          <MessageCircle className="mr-2 h-4 w-4" />
          Open the conversation
        </Button>
        {plan.ownedTrip && (
          <Link href={`/plans/${plan.ownedTrip.id}`}>
            <Button variant="outline" className={OUTLINE} data-testid="storefront-panel-back-to-plan">
              <MapIcon className="mr-2 h-4 w-4" />
              Back to my plan
            </Button>
          </Link>
        )}
      </div>
      <Rule />
      <ul className="flex flex-col gap-[11px]">
        {onPlan ? (
          <Line icon={<PenLine className="h-[15px] w-[15px]" />}>{firstName} can add notes and suggestions. You decide what changes.</Line>
        ) : (
          <Line icon={<Eye className="h-[15px] w-[15px]" />}>{firstName} can read your plan now. They can&apos;t change anything until they accept.</Line>
        )}
        <Line icon={<MessageCircle className="h-[15px] w-[15px]" />}>Replies land in your Traveloure messages.</Line>
        <Line icon={<CheckCircle2 className="h-[15px] w-[15px]" />}>Nothing has been booked or charged.</Line>
      </ul>
    </>,
  );
}

/**
 * The phone layout's pinned bar — the panel's price and its ONE action, so the decision stays in
 * reach while the traveler scrolls. It never draws a second planning door: where the panel's action
 * IS the plan-entry button, the bar scrolls to the panel instead of duplicating that door.
 */
export function StorefrontBookingBar(props: StorefrontBookingPanelProps & { panelAnchorId: string }) {
  const { earner, isProvider, isOwnStorefront, acceptsPlanShares, services, plan, servicesAnchorId, panelAnchorId } = props;
  const { share, openConversation } = usePanelActions(props);
  const kind = resolvePanelKind({ isProvider, isOwnStorefront, acceptsPlanShares, ownedTrip: plan.ownedTrip, standing: plan.standing });
  if (kind === "hidden") return null;
  const firstName = earner.name.split(" ")[0] || earner.name;
  const lowest = lowestListedPrice(services);
  const bookable = services.filter((s) => s.bookingMode !== "hidden");
  const tripQuery = plan.ownedTrip ? `?tripId=${encodeURIComponent(plan.ownedTrip.id)}` : "";

  let action: ReactNode = null;
  if (kind === "provider") {
    if (bookable.length === 1) {
      action = (
        <Link href={`/services/${bookable[0].id}${tripQuery}`}>
          <Button className={PRIMARY} data-testid="storefront-bar-primary">Check availability</Button>
        </Link>
      );
    } else if (bookable.length > 1) {
      action = (
        <Button asChild className={PRIMARY} data-testid="storefront-bar-primary">
          <a href={`#${servicesAnchorId}`}>Choose a service</a>
        </Button>
      );
    }
  } else if (kind === "expert_start") {
    action = (
      <Button asChild className={PRIMARY} data-testid="storefront-bar-primary">
        <a href={`#${panelAnchorId}`}>Start a plan</a>
      </Button>
    );
  } else if (kind === "expert_share") {
    action = (
      <Button className={PRIMARY} onClick={() => share.mutate()} disabled={share.isPending} data-testid="storefront-bar-primary">
        {share.isPending ? "Sharing…" : "Share my plan"}
      </Button>
    );
  } else {
    action = (
      <Button className={PRIMARY} onClick={openConversation} data-testid="storefront-bar-primary">
        Open the conversation
      </Button>
    );
  }
  if (!action) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-[color:var(--earn-border)] bg-[var(--earn-card)] px-4 pb-6 pt-3 shadow-[0_-8px_24px_rgba(20,43,69,0.08)] lg:hidden"
      data-testid="storefront-booking-bar"
    >
      {lowest !== null && kind !== "expert_pending" && kind !== "expert_on_plan" && (
        <div className="flex shrink-0 flex-col">
          <span className="text-[11px] text-[color:var(--earn-muted)]">{kind === "provider" ? "From" : "Services from"}</span>
          <strong className="text-[20px] font-semibold text-[color:var(--earn-navy)]" style={{ fontFamily: FRAUNCES }}>
            {formatPanelPrice(lowest)}
          </strong>
        </div>
      )}
      {kind === "expert_pending" && (
        <span className="shrink-0 text-[12px] font-semibold text-[color:var(--earn-gold-ink)]">Waiting for {firstName}</span>
      )}
      <div className="flex-1">{action}</div>
    </div>
  );
}
