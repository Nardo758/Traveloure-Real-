/**
 * B-11 (ruled 2026-11-09) — the party sheet's ROWS, as one pure mapping.
 *
 * The roster is `GET /api/trips/:tripId/guests` (`loadPlanGuestRoster`): one row per person, each
 * carrying their RSVP per event. The ruling's two states are read off that map and nothing else:
 *
 *   · **joined**  — the person is `attending` ANY event on this plan;
 *   · **invited** — the person is `pending` somewhere and is not attending anything.
 *
 * A person who declined everywhere, or who was never invited to any event, is neither: the sheet is
 * a statement about who is coming and who was asked, and a declined row would be a third claim the
 * ruling did not make (§13 — no invented states).
 *
 * The copy is the approved string, word for word: "You · owner" is drawn by the component (it needs
 * no name), and these rows are `"{name} · joined"` / `"{name} · invited"`. The ruling ships the
 * invited row WITHOUT the RSVP-by clause, because the roster payload carries no such date; that
 * clause waits on a separate server follow-up and must not be faked here.
 */

export type PartyRowKind = "joined" | "invited";

export interface PartyRow {
  kind: PartyRowKind;
  name: string;
}

/** The roster row's shape, as much of it as this mapping reads. */
export interface PartyRosterGuestLike {
  name?: string | null;
  /** eventId → "attending" | "declined" | "pending" | "not_invited". */
  rsvp?: Record<string, string | null | undefined> | null;
}

/** The approved line for one row. `joined` and `invited` are the ruling's own words. */
export function partyRowLine(row: PartyRow): string {
  return `${row.name} · ${row.kind}`;
}

/**
 * Joined first (they are coming), then invited, each by name — a stable order so the sheet does not
 * reshuffle between reads. Rows with no name are dropped: a nameless line is not a person's row.
 */
export function partyRosterRows(guests: ReadonlyArray<PartyRosterGuestLike> | null | undefined): PartyRow[] {
  const rows: PartyRow[] = [];
  for (const g of guests ?? []) {
    const name = (g.name ?? "").trim();
    if (!name) continue;
    const states = Object.values(g.rsvp ?? {}).filter((s): s is string => typeof s === "string");
    if (states.includes("attending")) rows.push({ kind: "joined", name });
    else if (states.includes("pending")) rows.push({ kind: "invited", name });
  }
  const rank = (k: PartyRowKind) => (k === "joined" ? 0 : 1);
  return rows.sort((a, b) => rank(a.kind) - rank(b.kind) || a.name.localeCompare(b.name));
}
