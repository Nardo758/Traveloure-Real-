/**
 * B-11 (ruled 2026-11-09) — the travel party sheet's ROSTER rows.
 *
 * Reads `GET /api/trips/:tripId/guests` (`loadPlanGuestRoster`, owner tier) and draws the owner's
 * view of who is on the plan:
 *
 *   · **"You · owner"** — the owner's own row. The approved string is literal: no name is needed,
 *     and none is printed (the sheet already knows whose it is).
 *   · **"Name · joined"** — attending any event on this plan.
 *   · **"Name · invited"** — pending somewhere and attending nothing. The ruling ships this row
 *     WITHOUT an RSVP-by clause: the roster payload carries no such date, and that clause waits on a
 *     separate server follow-up. It is deliberately absent rather than approximated (§13).
 *
 * Two controls, both on the ONE share rail this lane already has (`useSlipShare`, the plan menu's
 * own handler): **"Invite someone"** presses it exactly as the menu does; **"Copy link"** presses the
 * same mutation with the native sheet suppressed. Neither mints a token by a second route.
 *
 * **A guest sees none of this.** The component returns null for a non-owner, and the read itself is
 * owner-gated server-side (`authorizeTripOwnerTier`) — the sheet keeps today's count view, with no
 * names and no controls.
 */
import { useQuery } from "@tanstack/react-query";
import { partyRosterRows, partyRowLine } from "@/lib/party-roster";
import { useSlipShare } from "./SlipRail";

export function SlipPartyRoster({ trip, tripId, isOwner }: { trip: { title?: string | null; destination?: string | null }; tripId: string; isOwner: boolean }) {
  const share = useSlipShare(trip, tripId);
  const { data } = useQuery<{ guests?: ReadonlyArray<{ name?: string | null; rsvp?: Record<string, string | null> }> }>({
    queryKey: [`/api/trips/${tripId}/guests`],
    enabled: isOwner && !!tripId,
    retry: false,
  });
  // The guest's sheet is today's count view: no names, no controls, no reads.
  if (!isOwner) return null;
  const rows = partyRosterRows(data?.guests);
  return (
    <section className="space-y-2" data-testid="slip-party-roster">
      <p
        className="text-[13px] font-semibold text-[color:var(--slip-ink)]"
        data-testid="slip-party-row-owner"
      >
        You · owner
      </p>
      {rows.length > 0 ? (
        <ul className="space-y-1">
          {rows.map((row) => (
            <li
              key={`${row.kind}:${row.name}`}
              className="text-[13px] text-[color:var(--slip-ink)]"
              data-testid={`slip-party-row-${row.kind}`}
              data-party-kind={row.kind}
            >
              {partyRowLine(row)}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          className="inline-flex min-h-[36px] items-center rounded-[var(--slip-radius-button)] bg-[color:var(--slip-primary)] px-3 text-[13px] font-semibold text-[color:var(--slip-primary-ink)] hover:brightness-95 disabled:opacity-60"
          onClick={() => share.mutate({})}
          disabled={share.isPending}
          data-testid="slip-party-invite"
        >
          Invite someone
        </button>
        <button
          type="button"
          className="inline-flex min-h-[36px] items-center rounded-[var(--slip-radius-button)] border border-[color:var(--slip-line-strong)] bg-[color:var(--slip-card)] px-3 text-[13px] font-semibold text-[color:var(--slip-navy)] hover:bg-[color:var(--slip-wash)] disabled:opacity-60"
          onClick={() => share.mutate({ copyOnly: true })}
          disabled={share.isPending}
          data-testid="slip-party-copy"
        >
          Copy link
        </button>
      </div>
    </section>
  );
}
