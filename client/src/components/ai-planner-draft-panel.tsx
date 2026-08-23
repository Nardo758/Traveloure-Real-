import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Calendar, Users, Sparkles, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useTripContext, type TripContext } from "@/lib/trip-context";
import { useCreateTrip } from "@/hooks/use-trips";
import type { InsertTrip } from "@shared/schema";

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
 * "Create this plan" uses the ONE create rail (R-B: useCreateTrip → POST /api/trips) — no trip is
 * persisted unless this button is pressed. Minimum required is destination + both dates, mirroring
 * client/src/components/intake-panel.tsx (the reference implementation for payload shape, incl. the
 * "<destination> Trip" title default).
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

  const createTrip = useCreateTrip();

  const destination = context.destination?.trim() || null;
  const startDate = context.startDate || null;
  const endDate = context.endDate || null;
  const travelers = context.travelers ?? null;
  const eventType = context.eventType || null;

  const canCreate = !!destination && !!startDate && !!endDate;
  const missing: string[] = [];
  if (!destination) missing.push("a destination");
  if (!startDate || !endDate) missing.push("travel dates");
  const missingHint = missing.length > 0 ? `Add ${missing.join(" and ")} to create this plan` : null;

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

  function handleCreate() {
    if (!canCreate || !destination || !startDate || !endDate) return;
    const payload: InsertTrip = {
      title: `${destination} Trip`,
      destination,
      startDate,
      endDate,
      ...(travelers ? { numberOfTravelers: travelers, adults: travelers } : {}),
      kids: 0,
      ...(eventType ? { eventType } : {}),
    } as InsertTrip;

    createTrip.mutate(payload, {
      onSuccess: (trip) => {
        navigate(`/plans/${trip.id}`);
      },
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
            disabled={!canCreate || createTrip.isPending}
            onClick={handleCreate}
            data-testid="button-create-plan-from-ai"
          >
            {createTrip.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating…
              </>
            ) : (
              "Create this plan"
            )}
          </Button>
          {!canCreate && missingHint && (
            <p className="text-xs text-muted-foreground mt-2 text-center" data-testid="text-create-plan-hint">
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
