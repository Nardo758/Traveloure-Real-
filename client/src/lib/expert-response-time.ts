/**
 * Format the response-time fact exactly as it was authored.
 *
 * Legacy records sometimes store an enum-like snake_case value while older
 * records contain display-ready prose. Only the former is normalized; empty
 * values are omitted so the UI never promises a response window that was not
 * supplied.
 */
export function formatExpertResponseTime(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;

  const trimmed = value.trim();
  if (!/^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(trimmed)) return trimmed;

  const humanized = trimmed.replace(/_/g, " ");
  return humanized.charAt(0).toUpperCase() + humanized.slice(1);
}