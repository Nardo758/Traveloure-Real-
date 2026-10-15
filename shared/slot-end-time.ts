/**
 * EX-1 (4) — a dated slot's end time, derived and never guessed.
 *
 * The expert console's slot rails take a start time and no end time, so `end_time` was always
 * stored NULL. The listing already states how long it runs (`provider_services.duration_minutes`),
 * so the end is start + duration — but ONLY when both are real:
 *   - no start, an unreadable start, or no positive duration ⇒ NULL (§13 — never a default);
 *   - an end at or past midnight ⇒ NULL, because `end_time` is a same-day wall-clock "HH:MM" and a
 *     wrapped "01:30" would read as earlier than the start.
 * Wall-clock arithmetic only: no zone is applied or implied.
 */
export function deriveSlotEndTime(
  startTime: string | null | undefined,
  durationMinutes: number | null | undefined,
): string | null {
  if (typeof startTime !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(startTime.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  if (typeof durationMinutes !== "number" || !Number.isInteger(durationMinutes) || durationMinutes <= 0) return null;
  const end = hours * 60 + minutes + durationMinutes;
  if (end >= 24 * 60) return null;
  return `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
}
