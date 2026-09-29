/**
 * THE SLIP'S COMPARISONS (Track A step A3b; ledger `2026-09-29-a3b-option-sets-slip`; product map
 * §E2/§E3 R124–R126 R129, §M3, §M7–M9; golden path Steps 2–3).
 *
 * Every figure here is the SERVER's (`GET /api/trips/:tripId/option-sets` carries each option's
 * plan-fit, derived by `shared/plan-fit.ts` through A2's travel-time reader); the slip computes
 * nothing (§E4). Every sentence an option's fit renders is `planFitLine` — one home (§18 rule 1).
 *
 * Who sees what mirrors the rails and never widens them: add / remove / close for anyone who may
 * write items on this plan; CHOOSE and "compare again" for the owner or delegate only (R129 — an
 * expert suggests, the traveler decides). A render rule grants nothing; the routes refuse on their own.
 *
 * §13 on this surface: a place with no stated price shows NO price (never "$0"); a place with no pin
 * says so and is never placed on a map; with no located stops the fit line says what is missing
 * instead of a number; "est." is printed on every straight-line figure.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { planFitLine, PLAN_FIT_MIN_LOCATED, type PlanFit } from "@shared/plan-fit";
import { OPTION_SET_CAP } from "@shared/plan-options";

export interface SlipOption {
  id: string;
  position: number;
  sourceKind: string;
  title: string;
  locationName: string | null;
  latitude: string | null;
  longitude: string | null;
  locationPrecision: string | null;
  priceSnapshot: string | null;
  addedByRole: string | null;
  fit: PlanFit;
}

export interface SlipOptionSet {
  id: string;
  itineraryItemId: string | null;
  categoryKey: string | null;
  label: string | null;
  status: "open" | "chosen" | "closed";
  anchorRole: "primary" | "secondary" | null;
  chosenOptionId: string | null;
  options: SlipOption[];
  easierCount: number | null;
}

const setsKey = (tripId: string) => [`/api/trips/${tripId}/option-sets`];

/** The plan's comparisons. `enabled` is false for a viewer who cannot read them. */
export function useOptionSets(tripId: string, enabled: boolean) {
  return useQuery<{ sets: SlipOptionSet[] }>({ queryKey: setsKey(tripId), enabled });
}

/** The item the plan is currently BUILT AROUND (the primary anchor of stop 0), or null. */
export function primaryAnchorItemId(sets: readonly SlipOptionSet[] | undefined): string | null {
  return sets?.find((s) => s.anchorRole === "primary" && s.status !== "closed" && s.itineraryItemId)?.itineraryItemId ?? null;
}

/** "409: {…json…}" → the server's own sentence. */
function serverMessage(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : "";
  const i = raw.indexOf("{");
  if (i >= 0) {
    try {
      const body = JSON.parse(raw.slice(i));
      if (typeof body?.message === "string") return body.message;
    } catch {
      /* not JSON */
    }
  }
  return fallback;
}

function invalidatePlan(tripId: string) {
  void queryClient.invalidateQueries({ queryKey: setsKey(tripId) });
  void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
}

const LODGING_LABEL = "Where you'll stay";

/** A set's GLANCE line — "Where you'll stay · 3 to compare". */
export function optionSetGlance(set: Pick<SlipOptionSet, "label" | "categoryKey" | "options">): string {
  const name = set.label ?? (set.categoryKey === "accommodation" ? LODGING_LABEL : "Comparing");
  const n = set.options.length;
  return n ? `${name} · ${n} to compare` : `${name} · nothing added yet`;
}

/**
 * The lodging entry on a slip that has stops but no place to stay: open a comparison, or — with
 * enough located stops — ask for places that fit the days (§M9). Renders nothing when a stay is
 * already on the plan or a lodging comparison is open (that card takes over).
 */
export function SlipLodgingEntry({
  tripId,
  locatedStops,
  canWrite,
}: {
  tripId: string;
  locatedStops: number;
  canWrite: boolean;
}) {
  const { toast } = useToast();
  const create = useMutation({
    mutationFn: async () =>
      (await apiRequest("POST", `/api/trips/${tripId}/option-sets`, { categoryKey: "accommodation", label: LODGING_LABEL, anchor: true })).json(),
    onSuccess: () => invalidatePlan(tripId),
    onError: (e) => toast({ title: serverMessage(e, "Couldn't start a comparison"), variant: "destructive" }),
  });
  const suggest = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/trips/${tripId}/option-sets/suggest`, {})).json(),
    onSuccess: () => invalidatePlan(tripId),
    onError: (e) => toast({ title: serverMessage(e, "No places to suggest yet") }),
  });
  if (!canWrite) return null;
  const canSuggest = locatedStops >= PLAN_FIT_MIN_LOCATED;
  return (
    <div className="rounded-lg border border-border p-3 space-y-2" data-testid="slip-lodging-entry">
      <p className="text-sm font-semibold text-foreground">Where are you staying?</p>
      <p className="text-xs text-muted-foreground">Add up to {OPTION_SET_CAP} places you're considering and see how each fits your days.</p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          className="min-h-[44px]"
          onClick={() => create.mutate()}
          disabled={create.isPending}
          data-testid="slip-lodging-compare"
        >
          Compare places to stay
        </Button>
        {canSuggest ? (
          <Button
            variant="outline"
            className="min-h-[44px]"
            onClick={() => suggest.mutate()}
            disabled={suggest.isPending}
            data-testid="slip-lodging-suggest"
          >
            Suggest places that fit these days
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Start a lodging comparison from the empty slip's anchor question ("I'm deciding"). */
export function SlipAnchorCompareButton({ tripId }: { tripId: string }) {
  const { toast } = useToast();
  const create = useMutation({
    mutationFn: async () =>
      (await apiRequest("POST", `/api/trips/${tripId}/option-sets`, { categoryKey: "accommodation", label: LODGING_LABEL, anchor: true })).json(),
    onSuccess: () => invalidatePlan(tripId),
    onError: (e) => toast({ title: serverMessage(e, "Couldn't start a comparison"), variant: "destructive" }),
  });
  return (
    <Button
      variant="outline"
      className="min-h-[44px]"
      onClick={() => create.mutate()}
      disabled={create.isPending}
      data-testid="slip-anchor-compare"
    >
      I'm deciding — compare places
    </Button>
  );
}

function OptionCard({
  tripId,
  set,
  option,
  canWrite,
  canChoose,
}: {
  tripId: string;
  set: SlipOptionSet;
  option: SlipOption;
  canWrite: boolean;
  canChoose: boolean;
}) {
  const { toast } = useToast();
  const choose = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/trips/${tripId}/option-sets/${set.id}/choose`, { optionId: option.id })).json(),
    onSuccess: () => invalidatePlan(tripId),
    onError: (e) => toast({ title: serverMessage(e, "Couldn't choose this place"), variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/trips/${tripId}/option-sets/${set.id}/options/${option.id}`),
    onSuccess: () => invalidatePlan(tripId),
    onError: (e) => toast({ title: serverMessage(e, "Couldn't remove this place"), variant: "destructive" }),
  });
  const chosen = set.chosenOptionId === option.id;
  const price = option.priceSnapshot != null && Number(option.priceSnapshot) > 0 ? `$${Number(option.priceSnapshot).toLocaleString()}` : null;
  return (
    <li
      className={`rounded-md border p-3 space-y-1 min-w-0 ${chosen ? "border-primary bg-primary/5" : "border-border"}`}
      data-testid={`slip-option-${option.id}`}
      data-option-position={option.position}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-foreground break-words min-w-0">{option.title}</p>
        {price ? (
          <span className="text-sm text-foreground shrink-0" data-testid={`slip-option-price-${option.id}`}>
            {price}
          </span>
        ) : null}
      </div>
      {option.locationName ? <p className="text-xs text-muted-foreground break-words">{option.locationName}</p> : null}
      <p className="text-xs text-foreground" data-testid={`slip-option-fit-${option.id}`}>
        {planFitLine(option.fit)}
      </p>
      {option.sourceKind === "incumbent" ? <p className="text-xs text-muted-foreground">Already on your plan</p> : null}
      {option.sourceKind === "engine" ? <p className="text-xs text-muted-foreground">Suggested for these days</p> : null}
      {option.addedByRole === "expert" ? <p className="text-xs text-muted-foreground">From your expert</p> : null}
      {set.status === "open" && (canChoose || (canWrite && option.sourceKind !== "incumbent")) ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {canChoose ? (
            <Button size="sm" className="min-h-[40px]" onClick={() => choose.mutate()} disabled={choose.isPending} data-testid={`slip-option-choose-${option.id}`}>
              Choose this
            </Button>
          ) : null}
          {canWrite && option.sourceKind !== "incumbent" ? (
            <Button size="sm" variant="ghost" className="min-h-[40px]" onClick={() => remove.mutate()} disabled={remove.isPending} data-testid={`slip-option-remove-${option.id}`}>
              Remove
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

interface SearchResult {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  starRating: number | null;
  located: boolean;
}

function AddOptionPanel({ tripId, set, onDone }: { tripId: string; set: SlipOptionSet; onDone: () => void }) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"search" | "name">("search");
  const [name, setName] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const search = useQuery<{ city: string | null; results: SearchResult[] }>({
    queryKey: [`/api/trips/${tripId}/option-sets/search`, { q }],
    enabled: mode === "search",
  });
  const add = useMutation({
    mutationFn: async (source: Record<string, unknown>) => (await apiRequest("POST", `/api/trips/${tripId}/option-sets/${set.id}/options`, { source })).json(),
    onSuccess: () => {
      invalidatePlan(tripId);
      setName("");
      setLat("");
      setLng("");
      onDone();
    },
    onError: (e) => toast({ title: serverMessage(e, "Couldn't add this place"), variant: "destructive" }),
  });
  const addByName = () => {
    const source: Record<string, unknown> = { kind: "custom", title: name.trim() };
    if (lat.trim() || lng.trim()) {
      source.lat = lat.trim() === "" ? null : Number(lat);
      source.lng = lng.trim() === "" ? null : Number(lng);
    }
    add.mutate(source);
  };
  const results = search.data?.results ?? [];
  return (
    <div className="space-y-2 rounded-md bg-muted/30 p-3" data-testid={`slip-option-add-panel-${set.id}`}>
      <div className="flex gap-2">
        <Button size="sm" variant={mode === "search" ? "default" : "outline"} className="min-h-[40px]" onClick={() => setMode("search")} data-testid="slip-option-mode-search">
          From the list
        </Button>
        <Button size="sm" variant={mode === "name" ? "default" : "outline"} className="min-h-[40px]" onClick={() => setMode("name")} data-testid="slip-option-mode-name">
          Add one that isn't listed
        </Button>
      </div>
      {mode === "search" ? (
        <div className="space-y-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search places to stay" data-testid="slip-option-search" />
          {search.data && results.length === 0 ? (
            <p className="text-xs text-muted-foreground" data-testid="slip-option-search-empty">
              {search.data.city ? `No places listed for ${search.data.city} yet — add one that isn't listed.` : "No places listed for this plan's city yet."}
            </p>
          ) : null}
          <ul className="space-y-1">
            {results.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 min-w-0">
                <span className="min-w-0 text-sm break-words">
                  {r.name}
                  {r.located ? null : <span className="text-xs text-muted-foreground"> · no pin</span>}
                </span>
                <Button size="sm" variant="outline" className="min-h-[40px] shrink-0" onClick={() => add.mutate({ kind: "hotel_cache", hotelCacheId: r.id })} disabled={add.isPending}>
                  Add
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="space-y-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name of the place" data-testid="slip-option-name" />
          <div className="grid grid-cols-2 gap-2">
            <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Latitude (optional)" inputMode="decimal" data-testid="slip-option-lat" />
            <Input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="Longitude (optional)" inputMode="decimal" data-testid="slip-option-lng" />
          </div>
          <p className="text-xs text-muted-foreground">Without a pin the place is compared by name only; we never guess where it is.</p>
          <Button size="sm" className="min-h-[40px]" onClick={addByName} disabled={!name.trim() || add.isPending} data-testid="slip-option-add-name">
            Add place
          </Button>
        </div>
      )}
    </div>
  );
}

/** One comparison on the slip (PLAN level): its GLANCE line, the stacked option cards, the actions. */
export function SlipOptionSetCard({
  tripId,
  set,
  canWrite,
  canChoose,
}: {
  tripId: string;
  set: SlipOptionSet;
  canWrite: boolean;
  canChoose: boolean;
}) {
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const close = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/trips/${tripId}/option-sets/${set.id}/close`, {})).json(),
    onSuccess: () => invalidatePlan(tripId),
    onError: (e) => toast({ title: serverMessage(e, "Couldn't close this comparison"), variant: "destructive" }),
  });
  const reopen = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/trips/${tripId}/option-sets/${set.id}/reopen`, {})).json(),
    onSuccess: () => invalidatePlan(tripId),
    onError: (e) => toast({ title: serverMessage(e, "Couldn't reopen this comparison"), variant: "destructive" }),
  });

  if (set.status === "chosen") {
    // §M9: after a choice, ONE line and only when a candidate makes the days easier by the threshold.
    if (!set.easierCount) return null;
    return (
      <p className="text-sm text-foreground" data-testid={`slip-option-easier-${set.id}`}>
        {set.easierCount === 1 ? "1 place would make your days easier" : `${set.easierCount} places would make your days easier`}
        {canChoose ? (
          <>
            {" · "}
            <button type="button" className="underline" onClick={() => reopen.mutate()} data-testid={`slip-option-reopen-${set.id}`}>
              Compare again
            </button>
          </>
        ) : null}
      </p>
    );
  }
  if (set.status !== "open") return null;
  const full = set.options.length >= OPTION_SET_CAP;
  return (
    <section className="rounded-lg border border-border p-3 space-y-3" data-testid={`slip-option-set-${set.id}`} data-set-status={set.status}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground" data-testid={`slip-option-glance-${set.id}`}>
          {optionSetGlance(set)}
        </p>
        {set.anchorRole ? (
          <span className="text-xs text-muted-foreground">{set.anchorRole === "primary" ? "The place your days are built around" : "Planned around what's fixed"}</span>
        ) : null}
      </div>
      {set.options.length ? (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3" data-testid={`slip-option-list-${set.id}`}>
          {set.options.map((o) => (
            <OptionCard key={o.id} tripId={tripId} set={set} option={o} canWrite={canWrite} canChoose={canChoose} />
          ))}
        </ul>
      ) : null}
      {canWrite ? (
        <div className="flex flex-wrap items-center gap-2">
          {full ? (
            <p className="text-xs text-muted-foreground">{OPTION_SET_CAP} places is the most one comparison holds.</p>
          ) : (
            <Button size="sm" variant="outline" className="min-h-[40px]" onClick={() => setAdding((v) => !v)} data-testid={`slip-option-add-${set.id}`}>
              {adding ? "Done adding" : "Add a place"}
            </Button>
          )}
          <Button size="sm" variant="ghost" className="min-h-[40px]" onClick={() => close.mutate()} disabled={close.isPending} data-testid={`slip-option-close-${set.id}`}>
            {set.itineraryItemId ? "Keep what's on my plan" : "Not now"}
          </Button>
        </div>
      ) : null}
      {adding && !full ? <AddOptionPanel tripId={tripId} set={set} onDone={() => setAdding(false)} /> : null}
    </section>
  );
}

/** M8 — "Build my days around this" on a located, dated item that is not already the anchor. */
export function SlipPromoteAnchorButton({ tripId, itemId }: { tripId: string; itemId: string }) {
  const { toast } = useToast();
  const promote = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/trips/${tripId}/anchor/promote`, { itemId })).json(),
    onSuccess: () => {
      invalidatePlan(tripId);
      toast({ title: "Your days are now built around this" });
    },
    onError: (e) => toast({ title: serverMessage(e, "Couldn't change what the plan is built around"), variant: "destructive" }),
  });
  return (
    <button
      type="button"
      className="whitespace-nowrap text-xs underline text-muted-foreground hover:text-foreground min-h-[32px]"
      onClick={() => promote.mutate()}
      disabled={promote.isPending}
      data-testid={`slip-item-promote-${itemId}`}
    >
      Build my days around this
    </button>
  );
}
