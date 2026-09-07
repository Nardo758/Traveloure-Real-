import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Calendar, Users, Sparkles, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useTripContext, type TripContext } from "@/lib/trip-context";
import { planningRouteForTrip, usePlanning } from "@/contexts/PlanningContext";

/**
 * AiPlannerDraftPanel — Console Realign R-D (docs/briefs/CONSOLE_REALIGN_BRIEF.md, Lane E6).
 *
 * A live renderer of TripContext beside the AI-planner chat. Nothing here is invented: a field
 * shows its established TripContext value, or an honest "Not discussed yet" (§13). Two sources
 * populate TripContext:
 *   1. The intake panel's "Plan it with AI" hand-off (Step 1 fields written before landing here —
 *      already live via updateTripContext, this panel just renders them on arrival).
 *   2. This panel's own best-effort extraction pass: after each assistant turn, it asks
 *      POST /api/trip-context/extract (session-gated, re-reads the owned conversation server-side)
 *      for facts the user has explicitly stated since. No API key configured, or nothing new
 *      established → the endpoint returns `{ fields: {} }` and nothing here changes — the chat is
 *      never blocked by this.
 *
 * "Continue in the planner" (ledger `2026-09-07-start-with-ai-door`, CONSOLE_AND_AI_CONCIERGE_BRIEF
 * §9) is a DOOR, not a mint: it opens the ONE plan modal through usePlanning().open with exactly
 * the fields this panel holds — `destination` and `experienceSlug`, both conditional so nothing
 * is invented (§13). Dates/travelers need no passing: the modal reads TripContext directly, and
 * the steps it skips none of will ask for whatever is still missing. `eventType` is deliberately
 * NOT forwarded as `experienceType`: TripContext.eventType is an `eventTypeEnum` member
 * (`eventTypeForSlug` — vacation/birthday/proposal/…), while PlanningSource.experienceType is one
 * of the five FROZEN coarse keys the generator accepts (travel|wedding|corporate|event|retreat,
 * ruling 2026-09-01-moment-key). There is no honest bridge between them, so the door passes
 * nothing rather than a wrong-vocabulary guess. A conversation already bound to a plan
 * (`tripId` set) opens THAT plan's slip instead of the modal.
 */
export function AiPlannerDraftPanel({
  conversationId,
  extractionTrigger,
}: {
  conversationId: number | null;
  /** Bump this after each assistant reply completes to trigger a fresh extraction pass. */
  extractionTrigger: number;
}) {
  const [, navigate] = useLocation();
  const [context, updateContext] = useTripContext();
  const lastRunTrigger = useRef(0);

  const extract = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", "/api/trip-context/extract", { conversationId: id });
      return (await res.json()) as { fields: Partial<TripContext> };
    },
    onSuccess: (data) => {
      const fields = data?.fields;
      if (fields && Object.keys(fields).length > 0) {
        updateContext(fields);
      }
    },
  });

  useEffect(() => {
    if (!conversationId) return;
    if (extractionTrigger <= 0) return;
    if (extractionTrigger === lastRunTrigger.current) return;
    lastRunTrigger.current = extractionTrigger;
    extract.mutate(conversationId);
    // extract intentionally omitted — mutate identity is stable per render via useMutation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, extractionTrigger]);

  const { open: openPlanner } = usePlanning();

  const destination = context.destination?.trim() || null;
  const startDate = context.startDate || null;
  const endDate = context.endDate || null;
  const travelers = context.travelers ?? null;
  const eventType = context.eventType || null;

  const missing: string[] = [];
  if (!destination) missing.push("a destination");
  if (!startDate || !endDate) missing.push("travel dates");
  const missingHint =
    !context.tripId && missing.length > 0
      ? `The planner will ask for ${missing.join(" and ")}.`
      : null;

  function formatDateRange(start: string | null, end: string | null): string {
    if (!start || !end) return "";
    try {
      const fmt = (d: string) =>
        new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      return `${fmt(start)} – ${fmt(end)}`;
    } catch {
      return `${start} – ${end}`;
    }
  }

  function handleContinue() {
    // A conversation bound to a plan opens that plan's slip (past end date → the Trip Card,
    // via the one route helper), never a second copy of it through the modal.
    if (context.tripId) {
      navigate(planningRouteForTrip(context.tripId, context.endDate));
      return;
    }
    openPlanner({
      ...(destination ? { destination } : {}),
      ...(context.experienceSlug ? { experienceSlug: context.experienceSlug } : {}),
    });
  }

  return (
    // h-full: fills its viewport-tall grid cell on the AI assistant page (the cell's height is
    // derived from the page's single bounded frame — chat.tsx pattern); in an auto-height
    // parent (mobile stack) h-full resolves to natural height. Overflow scrolls internally.
    <Card
      className="bg-card rounded-2xl shadow-card border-border h-full flex flex-col min-h-0"
      data-testid="ai-planner-draft-panel"
    >
      <CardHeader className="p-4 pb-2 flex-shrink-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          Plan draft
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Fills in as you chat — nothing here is guessed.
        </p>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-1 space-y-3 flex-1 min-h-0 overflow-y-auto">
        <DraftField
          icon={<MapPin className="w-4 h-4" />}
          label="Destination"
          value={destination}
          testId="draft-field-destination"
        />
        <DraftField
          icon={<Calendar className="w-4 h-4" />}
          label="Dates"
          value={startDate && endDate ? formatDateRange(startDate, endDate) : null}
          testId="draft-field-dates"
        />
        <DraftField
          icon={<Users className="w-4 h-4" />}
          label="Travelers"
          value={travelers ? String(travelers) : null}
          testId="draft-field-travelers"
        />
        <DraftField
          icon={<Sparkles className="w-4 h-4" />}
          label="Occasion"
          value={eventType ? eventType.charAt(0).toUpperCase() + eventType.slice(1) : null}
          testId="draft-field-event-type"
        />

        <div className="pt-2 border-t border-border">
          <Button
            className="w-full"
            onClick={handleContinue}
            data-testid="button-continue-in-planner"
          >
            {context.tripId ? "Open this plan" : "Continue in the planner"}
          </Button>
          {missingHint && (
            <p className="text-xs text-muted-foreground mt-2 text-center" data-testid="text-continue-plan-hint">
              {missingHint}
            </p>
          )}
          {extract.isPending && (
            <p className="text-xs text-muted-foreground mt-2 text-center flex items-center justify-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Reading the conversation…
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DraftField({
  icon,
  label,
  value,
  testId,
}: {
  icon: ReactNode;
  label: string;
  value: string | null;
  testId: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        {value ? (
          <p className="text-sm font-medium text-foreground truncate" data-testid={testId}>
            {value}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground italic" data-testid={testId}>
            Not discussed yet
          </p>
        )}
      </div>
    </div>
  );
}
