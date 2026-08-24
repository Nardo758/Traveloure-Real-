/**
 * venue-timeline — the event structure (client:kyoto-wedding / client:event)
 * (DISTRIBUTION_FORMATS.md `client:*`; mockup-destination-formats.html §2 wedding frame).
 *
 * Four panels: Ceremony & Venues · Timeline · Vendors & Services · Guest Logistics.
 * Every item appears in exactly ONE panel. Precedence (mirrors the mockup, where every
 * TIMED row is a timeline row and untimed items distribute by type):
 *   1. Timeline — any item WITH a time value, sorted chronologically within day order;
 *   2. Ceremony & Venues — venue-ish itemTypes (registry section "venues");
 *   3. Vendors & Services — items carrying a providerServiceId linkage (a platform service
 *      dropped onto the plan), or service-ish itemTypes (registry section "vendors");
 *   4. Guest Logistics — transport + guest-lodging itemTypes (registry section "logistics");
 *   5. anything left lands in a visible "Other" list at the bottom — never dropped (§13).
 *
 * Vocabulary: item type tags ride the format's vocabulary (getTemplateConfig activityTypes —
 * dining reads "Catering" on a wedding, "Meal" on corporate) where a mapping exists.
 * Empty panels are omitted — never padded with invented content (§13).
 *
 * Expert-notes contract: item-level notes render WITH their item inside its panel.
 */
import type { BuildFormat, FormatSection } from "@/lib/build-formats/registry";
import {
  INK, MID, FAINT, LINE, GROUND, CARD, BRAND,
  type FormatDay, type FlatFormatItem,
  flattenDays, compareChrono, itemNote,
} from "./format-shared";

interface VenueTimelineViewProps {
  format: BuildFormat;
  days: FormatDay[];
}

function sectionLabel(sections: FormatSection[], key: string, fallback: string): string {
  return sections.find((s) => s.key === key)?.label ?? fallback;
}

function sectionTypes(sections: FormatSection[], key: string): string[] {
  return sections.find((s) => s.key === key)?.itemTypes ?? [];
}

export function VenueTimelineView({ format, days }: VenueTimelineViewProps) {
  const items = flattenDays(days);
  const multiDay = new Set(items.map((i) => i.dayNumber)).size > 1;

  const venueTypes = sectionTypes(format.sections, "venues");
  const vendorTypes = sectionTypes(format.sections, "vendors");
  const logisticsTypes = sectionTypes(format.sections, "logistics");

  const timeline: FlatFormatItem[] = [];
  const venues: FlatFormatItem[] = [];
  const vendors: FlatFormatItem[] = [];
  const logistics: FlatFormatItem[] = [];
  const other: FlatFormatItem[] = [];

  for (const item of items) {
    const t = (item.itemType ?? "").trim().toLowerCase();
    if ((item.startTime ?? "").trim() !== "") timeline.push(item);
    else if (venueTypes.includes(t)) venues.push(item);
    else if (item.providerServiceId || vendorTypes.includes(t)) vendors.push(item);
    else if (logisticsTypes.includes(t)) logistics.push(item);
    else other.push(item);
  }
  timeline.sort(compareChrono);

  // Type tag through the format's vocabulary where a mapping exists (wedding: dining→Catering).
  const typeTag = (item: FlatFormatItem): string | null => {
    const t = (item.itemType ?? "").trim().toLowerCase();
    if (!t) return null;
    return format.vocabulary.activityTypes[t] ?? null;
  };

  const panelStyle: React.CSSProperties = { border: `1px solid ${LINE}`, borderRadius: 11, padding: "12px 14px", background: CARD };
  const panelHeadStyle: React.CSSProperties = { margin: "0 0 8px", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.09em", color: MID, fontWeight: 700 };

  const ListPanel = ({ testId, label, rows }: { testId: string; label: string; rows: FlatFormatItem[] }) => (
    <div style={panelStyle} data-testid={testId}>
      <h4 style={panelHeadStyle}>{label}</h4>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((item) => {
          const tag = typeTag(item);
          const note = itemNote(item);
          return (
            <div key={item.id} style={{ fontSize: 13, color: INK }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <span style={{ minWidth: 0 }}>{item.title}</span>
                {tag && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: GROUND, color: MID, whiteSpace: "nowrap" }}>{tag}</span>
                )}
                <span style={{ marginLeft: "auto", fontSize: 10.5, color: FAINT, whiteSpace: "nowrap" }}>Day {item.dayNumber}</span>
              </div>
              {note && (
                <div style={{ fontSize: 11.5, color: MID, marginTop: 2, lineHeight: 1.45 }} data-testid={`item-note-${item.id}`}>
                  {note}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div data-testid="venue-timeline-view">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
        {venues.length > 0 && (
          <ListPanel testId="panel-venues" label={sectionLabel(format.sections, "venues", "Ceremony & Venues")} rows={venues} />
        )}

        {timeline.length > 0 && (
          <div style={panelStyle} data-testid="panel-timeline">
            <h4 style={panelHeadStyle}>{sectionLabel(format.sections, "timeline", "Timeline")}{multiDay ? "" : " — day of"}</h4>
            <div style={{ borderLeft: `2px solid ${LINE}`, marginLeft: 8, paddingLeft: 16 }}>
              {timeline.map((item) => {
                const note = itemNote(item);
                return (
                  <div key={item.id} style={{ position: "relative", padding: "7px 0", fontSize: 13, color: INK }}>
                    <span style={{ position: "absolute", left: -21.5, top: 13, width: 9, height: 9, borderRadius: "50%", background: BRAND }} />
                    <span style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 11.5, color: MID, marginRight: 10, whiteSpace: "nowrap" }}>
                      {multiDay ? `Day ${item.dayNumber} · ` : ""}{(item.startTime ?? "").trim()}
                    </span>
                    {item.title}
                    {note && (
                      <div style={{ fontSize: 11.5, color: MID, marginTop: 2, lineHeight: 1.45 }} data-testid={`item-note-${item.id}`}>
                        {note}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {vendors.length > 0 && (
          <ListPanel testId="panel-vendors" label={sectionLabel(format.sections, "vendors", "Vendors & Services")} rows={vendors} />
        )}

        {logistics.length > 0 && (
          <ListPanel testId="panel-logistics" label={sectionLabel(format.sections, "logistics", "Guest Logistics")} rows={logistics} />
        )}
      </div>

      {/* Visible catch-all — unmatched items are never dropped (§13). */}
      {other.length > 0 && (
        <div style={{ ...panelStyle, marginTop: 14 }} data-testid="panel-other">
          <h4 style={panelHeadStyle}>Other</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {other.map((item) => {
              const note = itemNote(item);
              return (
                <div key={item.id} style={{ fontSize: 13, color: INK }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <span style={{ minWidth: 0 }}>{item.title}</span>
                    <span style={{ marginLeft: "auto", fontSize: 10.5, color: FAINT, whiteSpace: "nowrap" }}>Day {item.dayNumber}</span>
                  </div>
                  {note && (
                    <div style={{ fontSize: 11.5, color: MID, marginTop: 2, lineHeight: 1.45 }} data-testid={`item-note-${item.id}`}>
                      {note}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
