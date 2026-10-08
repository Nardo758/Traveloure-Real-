/**
 * THE ZONE'S SHORT NAME for the slip header subline (slip conformance ruling 3; ledger
 * `2026-10-08-slip-empty-board`).
 *
 * It lives apart from `slip-meta.ts` on purpose. That module's zone line must never consult `Intl`
 * (pinned by `slip-small-additions` S7), so no reader can slip in the browser's own zone. This
 * module does consult `Intl`, but only ever with the PLAN's own `trips.timezone` passed as
 * `timeZone`. It never reads `resolvedOptions()` and never falls back to UTC or the viewer's zone.
 */
/**
 * Locales asked, in order, for a zone's short ALPHABETIC name. `Intl` holds those names per
 * locale: "JST" exists only under ja-JP, "IST" under en-IN, "COT" under es-CO, while en-US
 * answers "GMT+9" for Tokyo. This is a list of LOCALES, not of zones. The zone comes from the
 * plan, and the name comes from the runtime's own time-zone data.
 */
const ZONE_NAME_LOCALES = ["en-US", "en-GB", "en-IN", "ja-JP", "es-CO", "pt-PT"] as const;

/**
 * THE ZONE IN THE HEADER SUBLINE — "JST" (slip conformance ruling 3, ledger
 * `2026-10-08-conformance-slip-phase0`; the Empty board's "Dates not set yet · JST").
 *
 * It returns the first purely alphabetic short name a locale gives for the plan's zone at `at`,
 * because a zone's name depends on the date: daylight time changes it. If no locale has one, it
 * returns the GMT offset ("GMT-5"). It reads the same `trips.timezone` as `slipZoneLine`, and the
 * same §13 rule applies: NULL means not captured, so this returns `null` and the subline drops
 * the zone. It never substitutes UTC or the browser's own zone. A value the runtime does not know
 * also returns `null`.
 */
export function slipZoneAbbrev(timezone: string | null | undefined, at: Date = new Date()): string | null {
  const zone = typeof timezone === "string" ? timezone.trim() : "";
  if (!zone) return null;
  const nameIn = (locale: string, style: "short" | "shortOffset"): string | null => {
    try {
      return (
        new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: style })
          .formatToParts(at)
          .find((p) => p.type === "timeZoneName")?.value ?? null
      );
    } catch {
      return null;
    }
  };
  for (const locale of ZONE_NAME_LOCALES) {
    const name = nameIn(locale, "short");
    if (name && /^[A-Z]{2,5}$/.test(name)) return name;
  }
  return nameIn("en-US", "shortOffset");
}
