/**
 * Official hours and admission on a discover gem (ledger `2026-10-20-kyoto-feed-cleanup`).
 *
 * The fact line is composed here and nowhere else. Hours and admission are not part of the
 * description. A card with neither hours nor admission has no fact line (null, never "free").
 * The checked date is formatted only when the row stored one — a missing date is not invented.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export interface GemFactParts {
  hours?: string | null;
  admission?: string | null;
  sourceUrl?: string | null;
  factCheckedOn?: string | Date | null;
}

export interface GemFactLine {
  /** Hours and admission joined with ". ", or "" when both are absent. */
  lead: string;
  /** "20 Oct 2026", or "" when no checked date was stored. */
  checkedLabel: string;
  /** http(s) source, or "" when none was stored. */
  sourceUrl: string;
}

export function formatFactCheckedOn(value: string | Date | null | undefined): string | null {
  if (value == null || value === "") return null;
  let iso: string;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    iso = `${y}-${m}-${d}`;
  } else {
    iso = String(value).trim().slice(0, 10);
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const month = MONTHS[Number(match[2]) - 1];
  const day = Number(match[3]);
  if (!month || day < 1 || day > 31) return null;
  return `${day} ${month} ${match[1]}`;
}

function httpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const url = value.trim();
  return /^https?:\/\//i.test(url) ? url : null;
}

/**
 * The fact line, or null when there is nothing stated.
 * Callers render a stored checked date and source as
 * "Checked {checkedLabel} · Source: {sourceUrl}" after `lead`.
 */
export function composeGemFactLine(parts: GemFactParts): GemFactLine | null {
  const hours = parts.hours?.trim() || "";
  const admission = parts.admission?.trim() || "";
  const lead = [hours, admission].filter(Boolean).join(". ");
  const checkedLabel = formatFactCheckedOn(parts.factCheckedOn) ?? "";
  const sourceUrl = httpUrl(parts.sourceUrl) ?? "";
  if (!lead && !(checkedLabel && sourceUrl)) return null;
  return { lead, checkedLabel, sourceUrl };
}
