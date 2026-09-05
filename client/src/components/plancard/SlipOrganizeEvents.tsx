/**
 * SlipOrganizeEvents — STEP 5, ALONE, on a plan that never walked the modal.
 * Ledger `2026-09-04-plan-islands`; CLAUDE.md Locked Decisions 28 / 29 / 30 / 35.
 *
 * ── THE ISLAND ──────────────────────────────────────────────────────────────────────────────
 * A READY-MADE buyer's clone lands on the slip with items and ZERO events. The plan modal's
 * step 5 ("What's happening") is the only place events are created, and a purchase never opens
 * it — so an occasion whose whole shape is an internal schedule renders as a flat day list with
 * no way back to the question. Every part of the answer already existed and was simply not
 * reachable from the plan's own page: the server's preset chips, the step-5 reducer, the
 * owner-scoped create rail.
 *
 * ── ONE-TIME, AND NEVER AUTOMATIC ───────────────────────────────────────────────────────────
 * `canOrganizeIntoEvents` (`client/src/lib/organize-events.ts`) is the whole gate: the occasion's
 * own `default_schedule` is true AND the plan holds zero events. So the offer appears once, and
 * the moment the plan has an event it is gone — per-event editing owns them from then on. It
 * never creates anything on its own: a traveler ticks chips and presses a button. A row this
 * screen invented would carry a day, a place and a time nobody gave.
 *
 * ── EVERY RULE IS BORROWED, NOT RESTATED (§18 rule 1) ───────────────────────────────────────
 *   · The CHIPS are the occasion's own server presets (`GET /api/logistics/presets/:slug`) — the
 *     same `TEMPLATE_PRESETS` the modal reads, so a chip can never name something the platform
 *     does not otherwise know about. No presets ⇒ only the free-text row, which is honest: the
 *     platform has nothing to suggest, not "there is nothing happening".
 *   · The TABLE's rules are `client/src/lib/plan-events.ts` — `toggleEventRow`, `setEventDetail`,
 *     `eventsToCreate`, `planDayOptions`. A default day is SHOWN as a placeholder and never
 *     written; the day list is the PLAN's own days so an event cannot fall outside its plan.
 *   · The INHERITANCE at create is the ONE shared `planEventRowValues` (`shared/plan-events.ts`),
 *     the same function the modal's save and the pre-trip pen drain use: an unanswered day/place
 *     inherits the PLAN's own, and the TIME inherits nothing — NULL is never midnight
 *     (Locked Decision 35).
 *   · The WRITE is the existing owner-scoped `POST /api/user-experiences`, whose pick-based
 *     allowlist already admits `startTime` (§19; no second admission rail was opened).
 *   · Creation is IDEMPOTENT BY TITLE (`eventsNotYetCreated`), the same rule the pen drain uses,
 *     so a double press or a save racing a refetch creates nothing extra.
 *
 * An event inside a plan IS a `user_experiences` row bound to the trip (Locked Decision 29) —
 * there is no second event artifact and this opens no new one.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  eventsToCreate,
  hasEventRow,
  planDayOptions,
  planEventRowValues,
  setEventDetail,
  toggleEventRow,
  type PlanEventDraft,
} from "@/lib/plan-events";
import { eventsNotYetCreated } from "@/lib/organize-events";
import type { ExperienceType } from "@shared/schema";

/** The server preset shape, exactly as the modal reads it. */
interface LogisticsPresets {
  anchors?: Array<{ anchorType?: string; label?: string }>;
}

export interface SlipOrganizeEventsProps {
  tripId: string;
  /** The resolved occasion row. `experienceTypeId` is NOT NULL on `user_experiences`, so this is
   *  what makes the create possible at all — with no resolvable occasion there is no offer. */
  occasion: ExperienceType;
  /** The plan's own facts, for the day list and the create-time inheritance. */
  startDate?: string | null;
  endDate?: string | null;
  destination?: string | null;
  /** Titles the plan's events already carry, for the idempotence check. */
  existingTitles: readonly (string | null | undefined)[];
  /** Invalidated after a successful save so the offer disappears with the first event. */
  onCreated: () => void;
}

export function SlipOrganizeEvents({
  tripId,
  occasion,
  startDate,
  endDate,
  destination,
  existingTitles,
  onCreated,
}: SlipOrganizeEventsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [openPanel, setOpenPanel] = useState(false);
  const [rows, setRows] = useState<PlanEventDraft[]>([]);
  const [customEvent, setCustomEvent] = useState("");

  const { data: presets } = useQuery<LogisticsPresets>({
    queryKey: ["/api/logistics/presets", occasion.slug],
    enabled: openPanel && !!occasion.slug,
  });

  const chipLabels = useMemo(() => {
    const labels = (presets?.anchors ?? [])
      .map((a) => (a.label || "").trim())
      .filter((l) => l.length > 0);
    return Array.from(new Set(labels));
  }, [presets]);

  /** The plan's own days. A plan whose range is unreadable offers none and the Day cell simply
   *  does not ask (§13) — it never falls back to a free calendar. */
  const dayOptions = useMemo(() => planDayOptions(startDate, endDate), [startDate, endDate]);
  const defaultDay = dayOptions[0] ?? "";

  /** ONE derivation of "what will be created", so the button's count and the save agree. */
  const eventRows = useMemo(() => eventsToCreate(rows, customEvent), [rows, customEvent]);

  const createMutation = useMutation({
    mutationFn: async () => {
      // Idempotent by title against what the plan ALREADY holds — the same rule the pre-trip pen
      // drain applies. The eligibility gate means this list starts empty; this is what makes a
      // second press, or a save racing a refetch, create nothing extra.
      const toCreate = eventsNotYetCreated(eventRows, existingTitles);
      for (const draft of toCreate) {
        // The ONE inheritance rule, shared with the modal's save and the pen drain: an unanswered
        // day/place becomes the PLAN's own; the TIME inherits nothing and stays NULL.
        const values = planEventRowValues(draft, { startDate, destination });
        await apiRequest("POST", "/api/user-experiences", {
          tripId,
          title: values.title,
          eventDate: values.eventDate,
          startTime: values.startTime,
          location: values.location,
          experienceTypeId: occasion.id,
        });
      }
      return toCreate.length;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-experiences"] });
      onCreated();
      setRows([]);
      setCustomEvent("");
      setOpenPanel(false);
      toast({
        title: created > 0 ? `Added ${created} event${created > 1 ? "s" : ""}` : "Nothing new to add",
      });
    },
    onError: () => toast({ title: "Could not create the events", variant: "destructive" }),
  });

  if (!openPanel) {
    return (
      <Button
        variant="outline"
        className="w-full justify-start"
        onClick={() => setOpenPanel(true)}
        data-testid="button-organize-into-events"
      >
        <CalendarPlus className="w-4 h-4 mr-2 text-primary" />
        Organize into events
      </Button>
    );
  }

  return (
    <div className="rounded-lg border p-3 space-y-3" data-testid="slip-organize-events">
      <div>
        <p className="font-medium text-sm">What&apos;s happening?</p>
        <p className="text-xs text-muted-foreground">
          Pick the parts of your {occasion.name?.toLowerCase() || "plan"}. Days and places default
          to your plan; a time is only set if you give one.
        </p>
      </div>

      {chipLabels.length > 0 ? (
        <div className="flex flex-wrap gap-2" data-testid="organize-chips">
          {chipLabels.map((label) => {
            const picked = hasEventRow(rows, label);
            return (
              <button
                key={label}
                type="button"
                onClick={() => setRows((prev) => toggleEventRow(prev, label))}
                data-testid={`organize-chip-${label}`}
                className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${
                  picked ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : (
        // §13: no presets is "we have nothing to suggest", never "there is nothing happening".
        <p className="text-xs text-muted-foreground" data-testid="organize-no-presets">
          We have no suggestions for this occasion — add your own below.
        </p>
      )}

      {rows.length > 0 && (
        <div className="space-y-2" data-testid="organize-table">
          {rows.map((row) => (
            <div key={row.title} className="grid sm:grid-cols-4 gap-2 items-center">
              <div className="text-sm font-medium truncate">{row.title}</div>
              {/* THE DAY IS PICKED FROM THE PLAN'S OWN DAYS, and the plan's first day is a
                  PLACEHOLDER — shown, never written, until the traveler chooses it. */}
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={row.eventDate ?? ""}
                onChange={(e) => setRows((prev) => setEventDetail(prev, row.title, { eventDate: e.target.value }))}
                data-testid={`organize-day-${row.title}`}
                disabled={dayOptions.length === 0}
              >
                <option value="">{defaultDay ? `${defaultDay} (plan default)` : "No days to choose"}</option>
                {dayOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <Input
                type="time"
                value={row.startTime ?? ""}
                onChange={(e) => setRows((prev) => setEventDetail(prev, row.title, { startTime: e.target.value }))}
                data-testid={`organize-time-${row.title}`}
              />
              <Input
                value={row.location ?? ""}
                placeholder={destination || "Place"}
                onChange={(e) => setRows((prev) => setEventDetail(prev, row.title, { location: e.target.value }))}
                data-testid={`organize-place-${row.title}`}
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          value={customEvent}
          placeholder="Something else…"
          onChange={(e) => setCustomEvent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            const title = customEvent.trim();
            if (!title) return;
            // Re-confirming a title that is already a row must ABSORB, not untick it.
            setRows((prev) => (hasEventRow(prev, title) ? prev : toggleEventRow(prev, title)));
            setCustomEvent("");
          }}
          data-testid="organize-custom"
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending || eventRows.length === 0}
          data-testid="button-create-events"
        >
          {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Add {eventRows.length} event{eventRows.length === 1 ? "" : "s"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpenPanel(false)} data-testid="button-organize-cancel">
          Cancel
        </Button>
        {eventRows.length > 0 && (
          <Badge variant="outline" className="text-[10px]">
            {eventRows.length} selected
          </Badge>
        )}
      </div>
    </div>
  );
}
