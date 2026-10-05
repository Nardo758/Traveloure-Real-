/**
 * ISO 8601 FOR EVERY TIMESTAMP THE API RETURNS (R321, smoke 11 S11-12). `String(date)` gives the
 * engine's "Mon Oct 05 2026 09:00:00 GMT+0000" form, which no reader can parse reliably; this gives
 * `2026-10-05T09:00:00.000Z`. A value that is not a real instant is `null`, never an invented one (§13).
 */
export function isoTimestamp(value: unknown): string | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
