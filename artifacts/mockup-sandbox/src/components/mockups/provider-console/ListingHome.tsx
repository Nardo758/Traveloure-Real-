// Listing home — replicated from docs/design/provider-console-mockup/mockup.html (~1088-1261)
import React from "react";

const INK = "#1A1A18";
const MUTED = "#7A7A72";
const HAIR = "#E8E8E2";
const GROUND = "#FAFAF8";
const ACCENT = "#35605A";
const SOFT = "#EDF2F1";
const WARN_BG = "#FBF6EC";
const WARN_LINE = "#D9C79A";
const WARN_INK = "#6B551F";

function Shell({ crumbs, activeNav, children }: { crumbs: { label: string; link?: boolean }[]; activeNav: string; children: React.ReactNode }) {
  const navGroups: [string, { key: string; gl: string; label: string; proposed?: boolean }[]][] = [
    ["Work", [
      { key: "dashboard", gl: "◇", label: "Dashboard" },
      { key: "calendar", gl: "▤", label: "Calendar" },
      { key: "inbox", gl: "✉", label: "Inbox" },
      { key: "workstation", gl: "⚒", label: "Workstation" },
    ]],
    ["Business", [
      { key: "catalog", gl: "▦", label: "Catalog" },
      { key: "distribute", gl: "↗", label: "Distribute", proposed: true },
      { key: "customers", gl: "☺", label: "Customers" },
      { key: "performance", gl: "↑", label: "Performance" },
      { key: "money", gl: "$", label: "Money" },
    ]],
    ["Account", [
      { key: "settings", gl: "⚙", label: "Settings" },
      { key: "playbook", gl: "▣", label: "Playbook" },
    ]],
  ];
  return (
    <div className="min-h-screen w-full" style={{ background: GROUND, color: INK, fontFamily: "system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif", fontSize: 14, lineHeight: 1.5, display: "grid", gridTemplateColumns: "216px minmax(0,1fr)" }}>
      <aside style={{ background: "#fff", borderRight: `1px solid ${HAIR}`, padding: "16px 12px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "2px 8px 18px", fontWeight: 650, letterSpacing: "-.01em", fontSize: 15 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke={ACCENT} strokeWidth="1.7" />
            <path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" stroke={ACCENT} strokeWidth="1.5" />
          </svg>
          Traveloure
        </div>
        <nav>
          {navGroups.map(([g, items]) => (
            <div key={g}>
              <div style={{ fontSize: 10.5, letterSpacing: ".07em", textTransform: "uppercase", color: MUTED, padding: "14px 8px 5px", fontWeight: 600 }}>{g}</div>
              {items.map((it) => {
                const on = it.key === activeNav;
                return (
                  <button key={it.key} type="button" style={{
                    display: "flex", alignItems: "center", gap: 9, padding: "7px 8px", borderRadius: 5, fontSize: 13,
                    color: on ? ACCENT : INK, background: on ? SOFT : "none",
                    border: it.proposed ? "1px dashed #BFD5D0" : "1px solid transparent",
                    boxShadow: on ? "inset 0 0 0 1px #CBDAD7" : undefined,
                    fontWeight: on ? 600 : 400, width: "100%", textAlign: "left", cursor: "pointer", font: "inherit",
                  }}>
                    <span style={{ width: 15, textAlign: "center", color: on ? ACCENT : MUTED, fontSize: 12, flex: "0 0 15px" }}>{it.gl}</span>
                    {it.label}
                    {it.proposed && (
                      <span title="proposed new nav entry" style={{ marginLeft: "auto", width: 15, height: 15, borderRadius: 100, background: SOFT, border: "1px solid #CBDAD7", color: ACCENT, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>⑧</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div style={{ marginTop: "auto", padding: "14px 8px 4px", borderTop: `1px solid ${HAIR}`, fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
          Provider console — proposed structure.<br />
          <b style={{ color: INK }}>Distribute</b> is the one new entry.
        </div>
      </aside>
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ background: "#fff", borderBottom: `1px solid ${HAIR}`, padding: "11px 26px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span aria-hidden="true" style={{ width: 29, height: 29, flex: "0 0 29px", borderRadius: 100, background: SOFT, border: "1px solid #CBDAD7", color: ACCENT, fontSize: 11, fontWeight: 650, display: "flex", alignItems: "center", justifyContent: "center" }}>AT</span>
          <span>
            <b style={{ display: "block", fontSize: 13.5, fontWeight: 650, lineHeight: 1.25 }}>Aiko Tanaka</b>
            <span style={{ display: "block", fontSize: 12, color: MUTED, lineHeight: 1.3 }}>Machiya Kikuya · Gion, Kyoto · Provider</span>
          </span>
          <span style={{ marginLeft: "auto", fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", color: MUTED, border: `1px solid ${HAIR}`, borderRadius: 100, padding: "3px 11px", background: GROUND }}>Mock — not connected to live data</span>
          <button type="button" style={{ background: "transparent", color: INK, border: `1px solid ${HAIR}`, padding: "6px 11px", borderRadius: 6, cursor: "pointer", fontSize: 12.5, fontWeight: 550, font: "inherit", whiteSpace: "nowrap" }}>Mock notes</button>
        </div>
        <div style={{ background: "#fff", borderBottom: `1px solid ${HAIR}`, padding: "9px 26px", fontSize: 12.5 }}>
          <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", color: MUTED }}>
            {crumbs.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span style={{ color: "#C4C4BC" }}>›</span>}
                {i === crumbs.length - 1 ? (
                  <span style={{ color: INK, fontWeight: 600 }}>{c.label}</span>
                ) : c.link ? (
                  <button type="button" style={{ background: "none", border: "none", padding: 0, color: ACCENT, cursor: "pointer", fontSize: 12.5, textDecoration: "underline", textUnderlineOffset: 2, font: "inherit" }}>{c.label}</button>
                ) : (
                  <span>{c.label}</span>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
        <div style={{ padding: "22px 26px 76px", maxWidth: 1180, width: "100%" }}>{children}</div>
      </div>
    </div>
  );
}

function TickSvg({ white }: { white?: boolean }) {
  return (
    <svg width={white ? 11 : 17} height={white ? 11 : 17} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 10.5l4 4 8-9" stroke={white ? "#fff" : ACCENT} strokeWidth={white ? 3 : 2.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GhostDot({ children, inline }: { children: React.ReactNode; inline?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 17, height: 17, flex: "0 0 17px", borderRadius: 100, background: SOFT, color: ACCENT, border: "1px solid #CBDAD7", fontSize: 11, lineHeight: 1, fontWeight: 600, verticalAlign: "middle", marginLeft: inline ? 6 : 0 }}>{children}</span>
  );
}

function PropChip({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 550, color: WARN_INK, background: WARN_BG, border: `1px solid ${WARN_LINE}`, borderRadius: 100, padding: "2px 10px", whiteSpace: "nowrap", ...style }}>
      <span style={{ width: 6, height: 6, borderRadius: 100, background: "#C79A3C", flex: "0 0 6px", display: "inline-block" }} />
      {children}
    </span>
  );
}

const cardStyle: React.CSSProperties = { background: "#fff", border: `1px solid ${HAIR}`, borderRadius: 7 };
const cardHd: React.CSSProperties = { padding: "14px 22px", borderBottom: `1px solid ${HAIR}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" };
const noteQuiet: React.CSSProperties = { background: GROUND, border: `1px dashed ${HAIR}`, borderRadius: 6, padding: "11px 14px", fontSize: 12.5, color: MUTED, lineHeight: 1.5 };
const btnGhost: React.CSSProperties = { background: "transparent", color: INK, border: `1px solid ${HAIR}`, padding: "9px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13.5, fontWeight: 550, font: "inherit" };
const btnGhostSm: React.CSSProperties = { ...btnGhost, padding: "6px 11px", fontSize: 12.5, whiteSpace: "nowrap", flex: "0 0 auto" };

interface CheckRow {
  title: React.ReactNode;
  desc: React.ReactNode;
  go?: string;
  done: boolean;
}

function ChecklistRow({ row, last }: { row: CheckRow; last?: boolean }) {
  return (
    <button type="button" style={{ display: "flex", gap: 13, alignItems: "flex-start", padding: "14px 18px", borderBottom: last ? "none" : `1px solid ${HAIR}`, width: "100%", background: "none", border: "none", borderBottomStyle: last ? undefined : "solid", borderBottomWidth: last ? 0 : 1, borderBottomColor: HAIR, textAlign: "left", cursor: "pointer", font: "inherit" }}>
      <span style={{ width: 19, height: 19, flex: "0 0 19px", borderRadius: 5, border: row.done ? `1.5px solid ${ACCENT}` : `1.5px solid ${HAIR}`, background: row.done ? ACCENT : "#fff", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
        {row.done && <TickSvg white />}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13.5, fontWeight: 550, color: row.done ? MUTED : INK, textDecoration: row.done ? "line-through" : "none" }}>{row.title}</span>
        <span style={{ display: "block", fontSize: 12.5, color: MUTED, marginTop: 2, lineHeight: 1.45 }}>{row.desc}</span>
      </span>
      {row.go && (
        <span style={{ marginLeft: "auto", fontSize: 12.5, color: ACCENT, whiteSpace: "nowrap", alignSelf: "center", visibility: row.done ? "hidden" : "visible" }}>{row.go} →</span>
      )}
    </button>
  );
}

function DoneRow({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{ display: "flex", gap: 13, alignItems: "flex-start", padding: "14px 18px", borderBottom: `1px solid ${HAIR}` }}>
      <span style={{ width: 19, height: 19, flex: "0 0 19px", borderRadius: 5, background: ACCENT, border: `1.5px solid ${ACCENT}`, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
        <TickSvg white />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13.5, fontWeight: 550, color: INK }}>{title}</span>
        <span style={{ display: "block", fontSize: 12.5, color: MUTED, marginTop: 2, lineHeight: 1.45 }}>{desc}</span>
      </span>
    </div>
  );
}

function SettingsRow({ icon, title, dot, desc, last }: { icon: React.ReactNode; title: string; dot?: string; desc: string; last?: boolean }) {
  return (
    <button type="button" style={{ display: "flex", gap: 13, alignItems: "flex-start", padding: "14px 18px", width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: last ? "none" : `1px solid ${HAIR}`, cursor: "pointer", font: "inherit" }}>
      <span style={{ width: 19, height: 19, flex: "0 0 19px", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13.5, fontWeight: 550 }}>
          {title}
          {dot && <GhostDot inline>{dot}</GhostDot>}
        </span>
        <span style={{ display: "block", fontSize: 12.5, color: MUTED, marginTop: 2, lineHeight: 1.45 }}>{desc}</span>
      </span>
      <span style={{ marginLeft: "auto", fontSize: 12.5, color: ACCENT, whiteSpace: "nowrap", alignSelf: "center" }}>→</span>
    </button>
  );
}

export function ListingHome() {
  return (
    <Shell activeNav="workstation" crumbs={[{ label: "Workstation", link: true }, { label: "New service", link: true }, { label: "Listing home" }]}>
      <button type="button" style={{ background: "none", border: "none", color: ACCENT, cursor: "pointer", fontSize: 13, textDecoration: "underline", textUnderlineOffset: 2, marginBottom: 14, display: "inline-block", font: "inherit" }}>← Back</button>

      {/* draft hero */}
      <div style={{ background: "#fff", border: `1px solid ${ACCENT}`, borderRadius: 7, padding: "20px 22px", display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ width: 34, height: 34, flex: "0 0 34px", borderRadius: 100, background: SOFT, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <TickSvg />
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{ fontSize: 17, fontWeight: 650, marginBottom: 3, margin: 0 }}>
            Your listing is saved — finish it now or later<GhostDot inline>②</GhostDot>
          </h2>
          <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Morning Tea Ceremony in a Machiya Townhouse · In person · $68 per person · saved a moment ago</p>
        </div>
        <span style={{ display: "inline-block", fontSize: 11.5, padding: "2px 9px", borderRadius: 100, border: "1px solid #D9CDB2", background: WARN_BG, color: WARN_INK }}>Draft</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 336px", gap: 20, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* checklist */}
          <div style={cardStyle}>
            <div style={cardHd}>
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>3 things left before review</h3>
              <GhostDot>⑤</GhostDot>
              <span style={{ marginLeft: "auto", fontSize: 12, color: MUTED }}>Derived from the draft — rows navigate, they do not tick</span>
            </div>
            <div>
              <ChecklistRow row={{
                title: "Add a cover photo",
                desc: "Listings without one get far fewer opens. One good photo is enough to start.",
                go: "Open photos", done: false,
              }} />
              <ChecklistRow row={{
                title: "Confirm where it happens",
                desc: <>Your address is typed, but the pin is not confirmed yet — an address alone is not a location. This row opens the flow's <b style={{ color: INK }}>step 4, Logistics</b>, where the map now lives.</>,
                go: "Open step 4 · Logistics", done: true,
              }} />
              <ChecklistRow row={{
                title: "Confirm the safety basics",
                desc: "Liability cover and the in-person conduct standards, on the Scheduling step.",
                go: "Open Scheduling", done: true,
              }} />
              <ChecklistRow row={{
                title: "Publish some availability",
                desc: "Nothing else in the flow makes this bookable — a listing with no slots can be approved and still sell nothing.",
                go: "Open Availability", done: false,
              }} />
              <ChecklistRow row={{
                title: "Expand the description",
                desc: "A one-liner is enough to save a draft, not to sell. 95 of 140 characters so far.",
                go: "Open Basics", done: false,
              }} last />
              <div style={{ padding: "11px 18px", fontSize: 11.5, color: MUTED, lineHeight: 1.5, background: GROUND }}>
                Each row <b style={{ color: INK }}>opens the surface that owns the work</b>. Nothing ticks because you clicked it here — the tick is read back from the listing.
              </div>
            </div>
          </div>

          {/* already done */}
          <div style={cardStyle}>
            <div style={cardHd}><h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Already done</h3></div>
            <div>
              <DoneRow title="Name" desc="Morning Tea Ceremony in a Machiya Townhouse" />
              <DoneRow title="Delivery method" desc="In person — Scheduling, Capacity and the new Logistics step added to your flow" />
              <DoneRow title="Price" desc="$68 per person" />
              <DoneRow title="Offering" desc="Tea ceremony & cultural ritual · Arts & Crafts Instruction" />
              <DoneRow title="Confirm where it happens" desc="Done on the step 4 · Logistics surface" />
              <div style={{ display: "flex", gap: 13, alignItems: "flex-start", padding: "14px 18px" }}>
                <span style={{ width: 19, height: 19, flex: "0 0 19px", borderRadius: 5, background: ACCENT, border: `1.5px solid ${ACCENT}`, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
                  <TickSvg white />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 550, color: INK }}>Confirm the safety basics</span>
                  <span style={{ display: "block", fontSize: 12.5, color: MUTED, marginTop: 2, lineHeight: 1.45 }}>Done on the Scheduling surface</span>
                </span>
              </div>
            </div>
          </div>

          {/* gap #17 — edit split */}
          <div style={cardStyle}>
            <div style={cardHd}>
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Editing a live listing</h3>
              <PropChip>Proposed — gap #17 · ratify or amend</PropChip>
              <GhostDot>⑰</GhostDot>
            </div>
            <div style={{ padding: "20px 22px" }}>
              <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.65, marginBottom: 14 }}>
                The copy below promises “changes are re-checked before anything goes live”. Re-checking <i>everything</i> would mean a host cannot fix a typo or raise a price without going dark for two days. The proposed split: edits that cannot mislead a traveler about <b style={{ color: INK }}>what they are buying</b> go straight live; edits that change the thing itself re-enter review, and the previously approved version stays live while they do.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", border: `1px solid ${HAIR}`, borderRadius: 6, overflow: "hidden" }}>
                <div style={{ padding: "14px 16px", borderRight: `1px solid ${HAIR}`, background: SOFT }}>
                  <h6 style={{ fontSize: 10.5, letterSpacing: ".07em", textTransform: "uppercase", fontWeight: 650, marginBottom: 9, marginTop: 0, color: ACCENT }}>Goes live immediately</h6>
                  <ul style={{ listStyle: "none", fontSize: 12.5, lineHeight: 1.9, margin: 0, padding: 0 }}>
                    {["Price and pricing settings", "Photos and gallery order", "Availability, slots and blackouts", "Description wording", "What to bring · access notes", "Meeting-point pin position"].map((t) => (
                      <li key={t}><span style={{ color: MUTED }}>— </span>{t}</li>
                    ))}
                  </ul>
                </div>
                <div style={{ padding: "14px 16px" }}>
                  <h6 style={{ fontSize: 10.5, letterSpacing: ".07em", textTransform: "uppercase", fontWeight: 650, marginBottom: 9, marginTop: 0, color: WARN_INK }}>Re-enters review</h6>
                  <ul style={{ listStyle: "none", fontSize: 12.5, lineHeight: 1.9, margin: 0, padding: 0 }}>
                    {["Listing name", "Category and offering", "Delivery method", "Safety attestations", "Adding a route where there was none"].map((t) => (
                      <li key={t}><span style={{ color: MUTED }}>— </span>{t}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div style={{ ...noteQuiet, marginTop: 14 }}>
                While a re-review is pending, the listing shows{" "}
                <span style={{ display: "inline-block", fontSize: 11.5, padding: "2px 9px", borderRadius: 100, border: "1px solid #BFD5D0", background: SOFT, color: ACCENT }}>Live</span> +{" "}
                <span style={{ display: "inline-block", fontSize: 11.5, padding: "2px 9px", borderRadius: 100, border: "1px solid #D9CDB2", background: WARN_BG, color: WARN_INK }}>Edit in review</span> on Catalog — travelers keep booking the approved version, and the edit lands only when it passes. <b style={{ color: INK }}>Nothing is taken down for an edit.</b>
              </div>
            </div>
          </div>

          {/* submit */}
          <div style={{ ...cardStyle, padding: "20px 22px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Ready when you are<GhostDot inline>⑤</GhostDot></div>
                <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.55 }}>
                  Reviewed by our team, usually within 2 business days. You can keep editing while it is in review — changes are re-checked before anything goes live.
                  <span style={{ display: "block", marginTop: 7, color: WARN_INK }}>
                    “Usually within 2 business days” is written as an <b>expectation, not a committed SLA</b>. Whether the platform stands behind a number — and which number — is a decision still to be made (spec gap #7).
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
                <button type="button" style={btnGhost}>Finish later</button>
                <button type="button" style={{ background: ACCENT, border: `1px solid ${ACCENT}`, color: "#fff", padding: "9px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13.5, fontWeight: 550, font: "inherit" }}>Submit for review</button>
              </div>
            </div>
          </div>

          {/* gap #18 — delete */}
          <div style={{ ...cardStyle, borderStyle: "dashed", padding: "20px 22px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 240, fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>
                <b style={{ color: INK }}>Deleting a listing that has bookings.</b> The confirm dialog is not the whole answer — a listing with travelers on it should not be deletable at all.
                <PropChip style={{ marginLeft: 6 }}>Proposed — gap #18 · ratify or amend</PropChip>
              </div>
              <button type="button" style={btnGhostSm}>Delete this listing</button>
            </div>
          </div>
        </div>

        {/* right rail */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={cardStyle}>
            <div style={cardHd}><h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Listing settings</h3></div>
            <div style={{ padding: "6px 0" }}>
              <SettingsRow
                icon={<svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 3v14M6.5 6.5h5.2a2.4 2.4 0 010 4.8H8.3a2.4 2.4 0 000 4.8h5.2" stroke={MUTED} strokeWidth="1.6" strokeLinecap="round" /></svg>}
                title="Pricing & fees" dot="④"
                desc="Surcharges, deposit, cancellation. Tune later — not required to go live."
              />
              <SettingsRow
                icon={<svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="3" y="5" width="14" height="12" rx="2" stroke={MUTED} strokeWidth="1.6" /><path d="M3 9h14M7 3v3M13 3v3" stroke={MUTED} strokeWidth="1.6" strokeLinecap="round" /></svg>}
                title="Availability"
                desc="Slots, ranges and blackout dates. Lives on Catalog, beside the listing."
              />
              <SettingsRow
                icon={<svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 15l4.5-5.5 3 3.4L14 10l2 5z" stroke={MUTED} strokeWidth="1.6" strokeLinejoin="round" /><rect x="3" y="4" width="14" height="12" rx="2" stroke={MUTED} strokeWidth="1.6" /></svg>}
                title="Photos & media"
                desc="Cover photo, gallery, short clip."
                last
              />
            </div>
          </div>

          <div style={{ ...cardStyle, padding: "20px 22px" }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>After creation there are two things to do</div>
            <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>
              <b style={{ color: INK }}>1 · Publish availability</b> — the Catalog section, unchanged by this proposal. Nothing is bookable until it exists.<br />
              <b style={{ color: INK }}>2 · Develop the offering</b> — the checklist rows walk back into the flow's steps, including the new <b style={{ color: INK }}>step 4, Logistics</b>, for anything about where it happens. There is no third verb and no third surface.
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 11, flexWrap: "wrap" }}>
              <button type="button" style={btnGhostSm}>Publish availability →</button>
              <button type="button" style={btnGhostSm}>Fix the location →</button>
            </div>
          </div>

          <div style={noteQuiet}>
            <b style={{ color: INK }}>What changed:</b> today the form collects everything before it will save anything, and the last screen shows a disabled button with five red asterisks. Here the listing exists after five fields, and what is left is named in plain language.
          </div>
        </aside>
      </div>
    </Shell>
  );
}

export default ListingHome;
