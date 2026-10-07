/**
 * THE OCCASION PICKER — ONE component, two mounts (step 8a, ledger `2026-10-06-step8a-experiences-entry`;
 * step 8 brief rev 3.1, 8a item 1).
 *
 * The `/experiences` start page and the planning modal's occasion step both render THIS, over the same
 * `GET /api/experience-types` rows, so the two can never list different occasions or file one under
 * different groups (§18 rule 1). The order is the board's: the five groups → the occasions in the chosen
 * group → "See all occasions" with search. Grouping is `groupOccasions` (`shared/experience-group.ts`),
 * which reads each row's own switches through `experienceGroupFor` — no hardcoded slug list — and the
 * five labels come from `OCCASION_GROUP_LABELS` alone. A row whose switches are not set has no group and
 * is reachable only under See all and in search (§13 — never a nearest-looking group).
 *
 * Picking ends in the caller's `onPick(slug)` — on the modal that is `setOccasionSlug`.
 * Test ids: `occasion-group-<key>`, `option-occasion-<slug>` (kept from the old grid),
 * `occasion-see-all`, `occasion-search`.
 */
import { useEffect, useMemo, useState } from "react";
import {
  groupOccasions,
  occasionPickerGroupFor,
  searchOccasions,
  type ExperienceGroupRow,
  type OccasionPickerGroup,
} from "@shared/experience-group";

export interface OccasionPickerRow extends ExperienceGroupRow {
  slug: string;
  name: string;
  description?: string | null;
}

interface Props<T extends OccasionPickerRow> {
  occasions: readonly T[] | null | undefined;
  loading?: boolean;
  value: string;
  onPick: (slug: string) => void;
  /** A group tab to open on (the nav's `?group=`, already an exact key). Absent ⇒ none, as before. */
  initialGroup?: OccasionPickerGroup | null;
}

type View = { kind: "group"; key: OccasionPickerGroup } | { kind: "all" } | { kind: "none" };

export function OccasionPicker<T extends OccasionPickerRow>({ occasions, loading, value, onPick, initialGroup = null }: Props<T>) {
  const { groups } = useMemo(() => groupOccasions(occasions), [occasions]);
  const pickedRow = useMemo(() => (occasions ?? []).find((o) => o.slug === value) ?? null, [occasions, value]);
  const [view, setView] = useState<View>(() => (initialGroup ? { kind: "group", key: initialGroup } : { kind: "none" }));
  const [query, setQuery] = useState("");

  // A picker that opens on an answered occasion shows where that answer sits: its group, or See all
  // for an ungrouped row. Only before the traveler has moved — never overriding their own click.
  useEffect(() => {
    if (view.kind !== "none" || !pickedRow) return;
    const g = occasionPickerGroupFor(pickedRow);
    setView(g ? { kind: "group", key: g } : { kind: "all" });
  }, [pickedRow, view.kind]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading occasions…</p>;
  }
  if ((occasions ?? []).length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="plan-occasions-unavailable">
        The occasion catalog is unavailable right now. Try again in a moment — nothing here is guessed on
        your behalf.
      </p>
    );
  }

  const listed: T[] =
    view.kind === "group"
      ? groups.find((g) => g.key === view.key)?.rows ?? []
      : view.kind === "all"
        ? searchOccasions(occasions, query)
        : [];

  const chip = (active: boolean) =>
    `rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
      active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-muted"
    }`;

  return (
    <div className="space-y-3" data-testid="occasion-picker">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Occasion groups">
        {groups.map((g) => {
          const active = view.kind === "group" && view.key === g.key;
          return (
            <button
              key={g.key}
              type="button"
              aria-pressed={active}
              onClick={() => setView({ kind: "group", key: g.key })}
              className={chip(active)}
              data-testid={`occasion-group-${g.key}`}
            >
              {g.label}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={view.kind === "all"}
          onClick={() => setView({ kind: "all" })}
          className={chip(view.kind === "all")}
          data-testid="occasion-see-all"
        >
          See all occasions
        </button>
      </div>

      {view.kind === "all" && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search occasions"
          aria-label="Search occasions"
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
          data-testid="occasion-search"
        />
      )}

      {view.kind !== "none" &&
        (listed.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="occasion-search-empty">
            No occasion matches that search.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {listed.map((t) => {
              const picked = t.slug === value;
              return (
                <button
                  key={t.slug}
                  type="button"
                  onClick={() => onPick(t.slug)}
                  aria-pressed={picked}
                  className={`flex flex-col gap-1 rounded-xl border p-3.5 text-left transition-colors ${
                    picked ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted"
                  }`}
                  data-testid={`option-occasion-${t.slug}`}
                >
                  <span className="text-sm font-semibold text-foreground">{t.name}</span>
                  {t.description && <span className="text-xs text-muted-foreground">{t.description}</span>}
                </button>
              );
            })}
          </div>
        ))}
    </div>
  );
}
