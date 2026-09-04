/**
 * SlipTravelingParty — WHO IS TRAVELING, on the plan's own page.
 * Ledger `2026-09-04-plan-islands`; CLAUDE.md Locked Decision 37, §13, §14, §19.
 *
 * ── THE ISLAND ──────────────────────────────────────────────────────────────────────────────
 * `trip_participants` is the richest roster the platform holds — role, RSVP, dietary notes,
 * accessibility needs, mobility level, per-person emergency contact, arrival and departure
 * timestamps — and until now there was no screen that could POPULATE it. The one component that
 * edits a participant (`participant-travel-tracker.tsx`) is unmounted and stays that way; the
 * logistics dashboard renders COUNTS off the same rows and offers no way to create one. So the
 * columns existed, the owner-gated routes existed, and the couple's own page could not answer
 * "who is coming with us".
 *
 * ── IT IS NOT THE GUEST LIST, AND THE COPY SAYS SO (Locked Decision 37) ─────────────────────
 * Ruling 37: "`trip_participants` is the TRAVELLING PARTY, a different population under a
 * different predicate, and is NEVER merged into this roster". The guest roster
 * (`/plans/:tripId/guests`) is DERIVED from `event_invites` per event and answers WHO IS
 * INVITED; this list is stored rows and answers WHO IS TRAVELING. The section header says both
 * out loud, because two lists of people on one page with no stated difference is how they get
 * merged by whoever reads them next. Nothing here reads an invite, dedupes against one, or
 * matches a name to one — ruling 37's "no name matching and no fuzzy match of any kind" is a
 * rule about identity, and this surface has no reason to reach across the line at all.
 *
 * ── HIDDEN OCCASIONS HAVE NO PARTY SURFACE (Locked Decision 28) ─────────────────────────────
 * A `default_visibility: hidden` occasion — the proposal case — hides this section exactly as it
 * hides Guests. The whole point is that the other person does not find out, and a roster naming
 * them is the same disclosure an invite is. §13: an occasion that resolves to NULL or is not
 * uniquely identified is NOT hidden, which is the pre-switch behaviour — nothing disappears
 * because a row was never given a value.
 *
 * ── MONEY IS NOT ON THIS SCREEN (§14) ───────────────────────────────────────────────────────
 * `amount_owed` / `amount_paid` / `payment_status` are columns on every row here and are neither
 * rendered nor sent. They are derived by `POST /api/participants/:id/payment` from the stored
 * row; a settle-up surface is a different lane with a narrower gate. The body this component
 * sends is built by `travelingPartyBody` (`client/src/lib/traveling-party.ts`), whose key list is
 * asserted against the money family by a negative test.
 *
 * ── THE RAILS ARE THE EXISTING ONES ─────────────────────────────────────────────────────────
 *   read   GET    /api/trips/:tripId/participants   (owner-gated, `verifyTripOwnership`)
 *   add    POST   /api/trips/:tripId/participants   (owner-gated; §19 allowlist,
 *                                                    `tripParticipantCreateSchema`)
 *   edit   PATCH  /api/participants/:id             (owner-gated from the STORED row;
 *                                                    §19 allowlist, `tripParticipantPatchSchema`)
 *   remove DELETE /api/participants/:id             (owner-gated from the STORED row)
 * No new route, no second admission rail, and the RSVP and payment rails are untouched — this
 * surface never writes `status`, so it cannot move an RSVP without the `respondedAt` stamp that
 * rail exists to write.
 *
 * ── §13: WHAT AN EMPTY CELL MEANS ───────────────────────────────────────────────────────────
 * Only a name is required. An unstated arrival, departure, role, mobility level or accessibility
 * note renders as NOTHING — never "not arriving", never "no needs", never the column's DB
 * default presented as the traveler's own answer. And the section says out loud that no
 * accessibility standard is claimed on anyone's behalf: these are free-text notes the party
 * wrote about themselves, the same posture §24 takes for a listing's access notes.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Loader2, Pencil, Plus, Trash2, UserRound, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  EMPTY_TRAVELING_PARTY_FORM,
  MOBILITY_LEVELS,
  TRAVELING_PARTY_ROLES,
  formatAccessibilityNeeds,
  isSubmittableTravelingParty,
  travelingPartyBody,
  type TravelingPartyForm,
} from "@/lib/traveling-party";

/** The subset of a `trip_participants` row this surface reads. Money columns are deliberately
 *  not in this type — a field that is not declared cannot be rendered by accident. */
interface PartyMember {
  id: string;
  name: string;
  role?: string | null;
  arrivalDatetime?: string | null;
  departureDatetime?: string | null;
  accessibilityNeeds?: unknown;
  mobilityLevel?: string | null;
}

/** A stored timestamp as a date input's value. A value this cannot read renders as EMPTY rather
 *  than as a guessed day (§13) — the row keeps whatever it holds until someone re-answers. */
function toDateInput(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  const day = value.trim().split(/[T ]/)[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
}

/** A stored timestamp for display. Same rule: unreadable ⇒ nothing shown, never a fallback day. */
function displayDay(value: string | null | undefined): string | null {
  const day = toDateInput(value);
  return day || null;
}

function memberToForm(member: PartyMember): TravelingPartyForm {
  return {
    name: member.name ?? "",
    role: member.role ?? "",
    arrival: toDateInput(member.arrivalDatetime),
    departure: toDateInput(member.departureDatetime),
    accessibilityNeeds: formatAccessibilityNeeds(member.accessibilityNeeds),
    mobilityLevel: member.mobilityLevel ?? "",
  };
}

function PartyForm({
  form,
  setForm,
  onSubmit,
  onCancel,
  submitting,
  submitLabel,
  testPrefix,
}: {
  form: TravelingPartyForm;
  setForm: (next: TravelingPartyForm) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
  submitLabel: string;
  testPrefix: string;
}) {
  const set = (patch: Partial<TravelingPartyForm>) => setForm({ ...form, ...patch });
  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-3" data-testid={`${testPrefix}-form`}>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`${testPrefix}-name`} className="text-xs">
            Name
          </Label>
          <Input
            id={`${testPrefix}-name`}
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Who is traveling"
            data-testid={`${testPrefix}-name`}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${testPrefix}-role`} className="text-xs">
            Role <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          {/* A native select so an unrecognised STORED value is never silently rewritten to a
              option this list happens to carry. The blank option is how "not stated" stays
              reachable after an answer (§13). */}
          <select
            id={`${testPrefix}-role`}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            value={form.role}
            onChange={(e) => set({ role: e.target.value })}
            data-testid={`${testPrefix}-role`}
          >
            <option value="">Not stated</option>
            {TRAVELING_PARTY_ROLES.map((r) => (
              <option key={r} value={r}>
                {r.replace(/_/g, " ")}
              </option>
            ))}
            {form.role && !TRAVELING_PARTY_ROLES.includes(form.role as never) && (
              <option value={form.role}>{form.role}</option>
            )}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${testPrefix}-arrival`} className="text-xs">
            Arrives <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            id={`${testPrefix}-arrival`}
            type="date"
            value={form.arrival}
            onChange={(e) => set({ arrival: e.target.value })}
            data-testid={`${testPrefix}-arrival`}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${testPrefix}-departure`} className="text-xs">
            Departs <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            id={`${testPrefix}-departure`}
            type="date"
            value={form.departure}
            onChange={(e) => set({ departure: e.target.value })}
            data-testid={`${testPrefix}-departure`}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${testPrefix}-mobility`} className="text-xs">
            Mobility <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <select
            id={`${testPrefix}-mobility`}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            value={form.mobilityLevel}
            onChange={(e) => set({ mobilityLevel: e.target.value })}
            data-testid={`${testPrefix}-mobility`}
          >
            <option value="">Not stated</option>
            {MOBILITY_LEVELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            {form.mobilityLevel && !MOBILITY_LEVELS.includes(form.mobilityLevel as never) && (
              <option value={form.mobilityLevel}>{form.mobilityLevel}</option>
            )}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${testPrefix}-access`} className="text-xs">
            Accessibility needs <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            id={`${testPrefix}-access`}
            value={form.accessibilityNeeds}
            onChange={(e) => set({ accessibilityNeeds: e.target.value })}
            placeholder="Comma separated"
            data-testid={`${testPrefix}-access`}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={onSubmit}
          disabled={submitting || !isSubmittableTravelingParty(form)}
          data-testid={`${testPrefix}-save`}
        >
          {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          {submitLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} data-testid={`${testPrefix}-cancel`}>
          <X className="w-4 h-4 mr-1" />
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function SlipTravelingParty({ tripId }: { tripId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState<TravelingPartyForm>(EMPTY_TRAVELING_PARTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TravelingPartyForm>(EMPTY_TRAVELING_PARTY_FORM);

  const listKey = `/api/trips/${tripId}/participants`;
  const { data: members, isLoading } = useQuery<PartyMember[]>({
    queryKey: [listKey],
    enabled: !!tripId && open,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [listKey] });
    // The dashboard's counts read the same rows through their own endpoints; refreshing them
    // here keeps the two from disagreeing after a write on this surface.
    queryClient.invalidateQueries({ queryKey: [`${listKey}/stats`] });
    queryClient.invalidateQueries({ queryKey: [`${listKey}/dietary`] });
  };

  const addMutation = useMutation({
    mutationFn: (form: TravelingPartyForm) =>
      apiRequest("POST", listKey, travelingPartyBody(form)),
    onSuccess: () => {
      invalidate();
      setAddForm(EMPTY_TRAVELING_PARTY_FORM);
      setAdding(false);
    },
    onError: () => toast({ title: "Could not add to the traveling party", variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, form }: { id: string; form: TravelingPartyForm }) =>
      apiRequest("PATCH", `/api/participants/${id}`, travelingPartyBody(form)),
    onSuccess: () => {
      invalidate();
      setEditingId(null);
    },
    onError: () => toast({ title: "Could not save the change", variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/participants/${id}`),
    onSuccess: invalidate,
    onError: () => toast({ title: "Could not remove them", variant: "destructive" }),
  });

  const rows = useMemo(() => members ?? [], [members]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between"
          data-testid="button-toggle-traveling-party"
        >
          <span className="flex items-center gap-2">
            <UserRound className="w-4 h-4 text-primary" />
            Traveling party
          </span>
          <ChevronRight className={`w-4 h-4 transition-transform ${open ? "rotate-90" : ""}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3 space-y-3" data-testid="slip-traveling-party">
        {/*
          THE TWO LISTS ARE TWO, AND THIS SAYS WHICH ONE THIS IS (Locked Decision 37). The guest
          roster is derived from per-event invites and answers "who is invited"; these are stored
          rows and answer "who is traveling". They are never merged.
        */}
        <p className="text-sm text-muted-foreground">
          Who is <strong>traveling</strong> with you — arrival and departure days, and anything the
          plan needs to work around. This is a different list from{" "}
          <strong>Guests &amp; invites</strong>, which is who is <strong>invited</strong> to each
          event; the two are kept separate on purpose.
        </p>

        {isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground" data-testid="party-empty">
            Nobody has been added yet.
          </div>
        ) : (
          <ul className="space-y-2" data-testid="party-list">
            {rows.map((member) => {
              const needs = formatAccessibilityNeeds(member.accessibilityNeeds);
              const arrives = displayDay(member.arrivalDatetime);
              const departs = displayDay(member.departureDatetime);
              return (
                <li key={member.id} className="rounded-lg border p-3" data-testid={`party-row-${member.id}`}>
                  {editingId === member.id ? (
                    <PartyForm
                      form={editForm}
                      setForm={setEditForm}
                      onSubmit={() => editMutation.mutate({ id: member.id, form: editForm })}
                      onCancel={() => setEditingId(null)}
                      submitting={editMutation.isPending}
                      submitLabel="Save"
                      testPrefix="party-edit"
                    />
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{member.name}</span>
                          {/* Every badge below is OMITTED when its column is unanswered (§13) —
                              an absent role is not "guest", an absent mobility level is not
                              "high", and neither is filled in from a DB default here. */}
                          {member.role ? (
                            <Badge variant="outline" className="text-[10px]">
                              {member.role.replace(/_/g, " ")}
                            </Badge>
                          ) : null}
                          {member.mobilityLevel ? (
                            <Badge variant="outline" className="text-[10px]">
                              mobility: {member.mobilityLevel}
                            </Badge>
                          ) : null}
                        </div>
                        {(arrives || departs) && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {arrives ? `Arrives ${arrives}` : null}
                            {arrives && departs ? " · " : null}
                            {departs ? `Departs ${departs}` : null}
                          </div>
                        )}
                        {needs ? (
                          <div className="text-xs text-muted-foreground mt-1">Access notes: {needs}</div>
                        ) : null}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditForm(memberToForm(member));
                            setEditingId(member.id);
                          }}
                          data-testid={`party-edit-${member.id}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeMutation.mutate(member.id)}
                          disabled={removeMutation.isPending}
                          data-testid={`party-remove-${member.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {adding ? (
          <PartyForm
            form={addForm}
            setForm={setAddForm}
            onSubmit={() => addMutation.mutate(addForm)}
            onCancel={() => {
              setAdding(false);
              setAddForm(EMPTY_TRAVELING_PARTY_FORM);
            }}
            submitting={addMutation.isPending}
            submitLabel="Add"
            testPrefix="party-add"
          />
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)} data-testid="button-add-party-member">
            <Plus className="w-4 h-4 mr-2" />
            Add someone
          </Button>
        )}

        {/*
          §24's posture, one surface over: these are free-text notes the party wrote about
          themselves, not a checklist of certified attributes, so the platform claims no
          accessibility standard on anyone's behalf.
        */}
        <p className="text-[11px] text-muted-foreground">
          Access notes are free text and are not a claim of any accessibility standard. Payment
          and RSVP for the party are handled elsewhere and are never edited here.
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}
