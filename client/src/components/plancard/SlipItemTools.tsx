/**
 * THE OWNER'S HANDS ON THEIR OWN PLAN — add, edit, remove and reorder, on the slip.
 *
 * Ledger `2026-09-05-slip-own-your-plan`; CLAUDE.md Locked Decision 42 rows 1.6 / S1 / S2 / D16,
 * Locked Decision 39 (every add surface is a view of `itinerary_items`) and Locked Decision 29
 * (the item→event link).
 *
 * WHAT THIS COMPONENT IS NOT: a new rail. Every button below calls an endpoint that already
 * exists and that another surface already uses — the Workstation's own request shapes, reused
 * rather than re-derived (`client/src/lib/slip-item-tools.ts` holds the four URLs and the bodies).
 * No route was added under `server/` for this lane; the only server change is a REFUSAL (a booked
 * row's DELETE now 409s, review R14).
 *
 * D16 — every control here is the OWNER'S. The caller decides that once, and `slipItemTools`
 * returns an empty toolset for anyone else; an advisor's edit surface stays the Workstation.
 *
 * §13 — the fields the traveler leaves blank are OMITTED from the body, never sent as "". The edit
 * form prefills from the item's real row (the existing `GET /api/trips/:tripId/itinerary-items`,
 * the read the Workstation already uses) rather than from the plancard DTO, which carries no
 * `description`: showing an empty note box over an item that HAS a note would be the surface
 * telling the traveler something untrue about their own plan. While that read is in flight the
 * form says so and does not accept a save.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  buildSlipAddItemBody,
  buildSlipEditItemBody,
  canReorderInDirection,
  EMPTY_SLIP_ITEM_FORM,
  reorderedDayItemIds,
  SLIP_ADD_NEEDS_A_DAY_NOTE,
  SLIP_DELETE_CONFIRM_LABEL,
  SLIP_ITEM_ENDPOINTS,
  type SlipItemFormValues,
  type SlipItemToolset,
} from "@/lib/slip-item-tools";

/** The two reads a write here invalidates — the plan surface and the row list the form prefills from. */
function invalidatePlan(tripId: string) {
  queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
  queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/itinerary-items`] });
}

/** The shape `GET /api/trips/:tripId/itinerary-items` answers with — the rows themselves, by day. */
interface ItineraryItemsResponse {
  days?: Array<{
    dayNumber: number;
    items?: Array<{
      id: string;
      title?: string | null;
      startTime?: string | null;
      locationName?: string | null;
      description?: string | null;
    }>;
  }>;
}

// ── The four fields, shared by the add form and the edit form ──────────────────────────────────

function ItemFields({
  values,
  onChange,
  idPrefix,
  disabled,
}: {
  values: SlipItemFormValues;
  onChange: (next: SlipItemFormValues) => void;
  idPrefix: string;
  disabled?: boolean;
}) {
  const set = (key: keyof SlipItemFormValues) => (e: { target: { value: string } }) =>
    onChange({ ...values, [key]: e.target.value });
  const inputClass =
    "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground";
  return (
    <div className="space-y-2">
      <input
        className={inputClass}
        value={values.title}
        onChange={set("title")}
        disabled={disabled}
        placeholder="What is it?"
        aria-label="Title"
        data-testid={`${idPrefix}-title`}
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          className={inputClass}
          type="time"
          value={values.startTime}
          onChange={set("startTime")}
          disabled={disabled}
          aria-label="Time (optional)"
          data-testid={`${idPrefix}-time`}
        />
        <input
          className={inputClass}
          value={values.locationName}
          onChange={set("locationName")}
          disabled={disabled}
          placeholder="Where? (optional)"
          aria-label="Location (optional)"
          data-testid={`${idPrefix}-location`}
        />
      </div>
      <textarea
        className={`${inputClass} min-h-[54px]`}
        value={values.notes}
        onChange={set("notes")}
        disabled={disabled}
        placeholder="Notes (optional)"
        aria-label="Notes (optional)"
        data-testid={`${idPrefix}-notes`}
      />
    </div>
  );
}

// ── S1: add an item by hand, under this event ──────────────────────────────────────────────────

/**
 * "Add something to this event" — and its day-level twin for the plan's ONE implicit unnamed
 * event, which has no header of its own to hang a control on (Locked Decision 29: NULL IS that
 * event, so a `null` link here is an answer, not an absence).
 *
 * `dayNumber === null` means the plan has not told us which day this slot is (an undated event, or
 * a plan with no start date to count from). `itinerary_items.day_number` is NOT NULL, so rather
 * than file the item on a day nobody chose, the control is replaced by the reason (§13).
 */
export function SlipAddItemControl({
  tripId,
  dayNumber,
  userExperienceId,
  label,
  testId,
}: {
  tripId: string;
  dayNumber: number | null;
  userExperienceId: string | null;
  label: string;
  testId: string;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<SlipItemFormValues>(EMPTY_SLIP_ITEM_FORM);

  const addMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiRequest("POST", SLIP_ITEM_ENDPOINTS.add(tripId), body);
      return res.json();
    },
    onSuccess: () => {
      invalidatePlan(tripId);
      setValues(EMPTY_SLIP_ITEM_FORM);
      setOpen(false);
      toast({ title: "Added to your plan" });
    },
    onError: (err: any) =>
      toast({
        title: "Couldn't add that",
        description: err?.message || "Please try again.",
        variant: "destructive",
      }),
  });

  if (dayNumber == null) {
    return (
      <p className="text-[11px] text-muted-foreground" data-testid={`${testId}-needs-day`}>
        {SLIP_ADD_NEEDS_A_DAY_NOTE}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
        onClick={() => setOpen(true)}
        data-testid={testId}
      >
        <Plus className="w-3 h-3" /> {label}
      </button>
    );
  }

  const body = buildSlipAddItemBody(values, { dayNumber, userExperienceId });
  return (
    <div className="mt-2 w-full rounded-md border border-border bg-background p-2.5" data-testid={`${testId}-form`}>
      <ItemFields values={values} onChange={setValues} idPrefix={`${testId}-input`} />
      <div className="mt-2 flex items-center gap-2">
        <Button
          size="sm"
          className="h-7 px-3 text-xs"
          disabled={!body || addMutation.isPending}
          onClick={() => body && addMutation.mutate(body)}
          data-testid={`${testId}-save`}
        >
          {addMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
          Add
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => {
            setValues(EMPTY_SLIP_ITEM_FORM);
            setOpen(false);
          }}
          data-testid={`${testId}-cancel`}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── S2: edit, remove, reorder — the row's own tools ────────────────────────────────────────────

export function SlipItemTools({
  tripId,
  itemId,
  tools,
  dayNumber,
  dayItemIds,
  groupItemIds,
}: {
  tripId: string;
  itemId: string;
  tools: SlipItemToolset;
  /** The day this row sits on. `null` only for a slot with no day — no reorder is possible there. */
  dayNumber: number | null;
  dayItemIds: readonly string[];
  groupItemIds: readonly string[];
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [values, setValues] = useState<SlipItemFormValues | null>(null);

  // The item's REAL row, for an honest prefill. Fetched only once an edit is opened; the key is
  // the one the Workstation and this lane's own writes already invalidate, so react-query serves
  // one request for however many rows are open.
  const { data: rows, isLoading: rowsLoading } = useQuery<ItineraryItemsResponse>({
    queryKey: [`/api/trips/${tripId}/itinerary-items`],
    enabled: editing,
  });

  const loaded: SlipItemFormValues | null = useMemo(() => {
    if (!rows?.days) return null;
    for (const day of rows.days) {
      for (const row of day.items ?? []) {
        if (row.id !== itemId) continue;
        return {
          title: row.title ?? "",
          startTime: row.startTime ?? "",
          locationName: row.locationName ?? "",
          notes: row.description ?? "",
        };
      }
    }
    return null;
  }, [rows, itemId]);

  const current = values ?? loaded;

  const editMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", SLIP_ITEM_ENDPOINTS.edit(tripId, itemId), body);
      return res.json();
    },
    onSuccess: () => {
      invalidatePlan(tripId);
      setEditing(false);
      setValues(null);
      toast({ title: "Saved" });
    },
    onError: (err: any) =>
      toast({
        title: "Couldn't save that",
        description: err?.message || "Please try again.",
        variant: "destructive",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", SLIP_ITEM_ENDPOINTS.remove(tripId, itemId));
    },
    onSuccess: () => {
      invalidatePlan(tripId);
      setConfirmingDelete(false);
      toast({ title: "Removed from your plan" });
    },
    // A booked row answers 409 `item_booked` (review R14). The server's sentence is the honest one
    // — surfaced verbatim rather than replaced by a generic failure.
    onError: (err: any) =>
      toast({
        title: "Couldn't remove that",
        description: err?.message || "Please try again.",
        variant: "destructive",
      }),
  });

  const reorderMutation = useMutation({
    mutationFn: async ({ itemIds }: { itemIds: string[] }) => {
      const res = await apiRequest("POST", SLIP_ITEM_ENDPOINTS.reorder(tripId), {
        dayNumber,
        itemIds,
      });
      return res.json();
    },
    onSuccess: () => invalidatePlan(tripId),
    onError: (err: any) =>
      toast({
        title: "Couldn't reorder",
        description: err?.message || "Please try again.",
        variant: "destructive",
      }),
  });

  const move = (direction: -1 | 1) => {
    if (dayNumber == null) return;
    const itemIds = reorderedDayItemIds({ dayItemIds, groupItemIds, itemId, direction });
    if (!itemIds) return;
    reorderMutation.mutate({ itemIds });
  };

  const canMove = (direction: -1 | 1) =>
    dayNumber != null && canReorderInDirection({ dayItemIds, groupItemIds, itemId, direction });

  if (!tools.reorder && !tools.edit && !tools.remove) return null;

  const iconButton =
    "inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground";

  const body = current ? buildSlipEditItemBody(current, loaded ?? current) : null;

  return (
    <div className="mt-1.5" data-testid={`slip-item-tools-${itemId}`}>
      <div className="flex items-center gap-0.5">
        {tools.reorder && (
          <>
            <button
              type="button"
              className={iconButton}
              disabled={!canMove(-1) || reorderMutation.isPending}
              onClick={() => move(-1)}
              aria-label="Move up"
              title="Move up"
              data-testid={`slip-item-up-${itemId}`}
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className={iconButton}
              disabled={!canMove(1) || reorderMutation.isPending}
              onClick={() => move(1)}
              aria-label="Move down"
              title="Move down"
              data-testid={`slip-item-down-${itemId}`}
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
          </>
        )}
        {tools.edit && (
          <button
            type="button"
            className={iconButton}
            onClick={() => {
              setValues(null);
              setEditing((v) => !v);
            }}
            aria-label="Edit"
            title="Edit"
            data-testid={`slip-item-edit-${itemId}`}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
        {tools.remove && (
          <button
            type="button"
            className={iconButton}
            onClick={() => setConfirmingDelete(true)}
            aria-label="Remove"
            title="Remove"
            data-testid={`slip-item-remove-${itemId}`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Deleting a row is not undoable from this surface, so it asks first. */}
      {confirmingDelete && (
        <div
          className="mt-1.5 flex items-center gap-2 text-xs text-foreground"
          data-testid={`slip-item-remove-confirm-${itemId}`}
        >
          <span>{SLIP_DELETE_CONFIRM_LABEL}</span>
          <Button
            size="sm"
            variant="destructive"
            className="h-6 px-2 text-[11px]"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
            data-testid={`slip-item-remove-yes-${itemId}`}
          >
            {deleteMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
            Remove
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px]"
            onClick={() => setConfirmingDelete(false)}
            data-testid={`slip-item-remove-no-${itemId}`}
          >
            Keep
          </Button>
        </div>
      )}

      {editing && (
        <div
          className="mt-2 rounded-md border border-border bg-background p-2.5"
          data-testid={`slip-item-edit-form-${itemId}`}
        >
          {!current ? (
            <p className="text-xs text-muted-foreground" data-testid={`slip-item-edit-loading-${itemId}`}>
              {rowsLoading ? "Loading this item…" : "This item's details aren't available right now."}
            </p>
          ) : (
            <>
              <ItemFields
                values={current}
                onChange={setValues}
                idPrefix={`slip-item-edit-input-${itemId}`}
              />
              <div className="mt-2 flex items-center gap-2">
                <Button
                  size="sm"
                  className="h-7 px-3 text-xs"
                  disabled={!body || editMutation.isPending}
                  onClick={() => body && editMutation.mutate(body)}
                  data-testid={`slip-item-edit-save-${itemId}`}
                >
                  {editMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    setValues(null);
                    setEditing(false);
                  }}
                  data-testid={`slip-item-edit-cancel-${itemId}`}
                >
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
