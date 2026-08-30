// Drawers & overlays — replicated from docs/design/provider-console-mockup/mockup.html (~1441-1585)
// Pricing & fees drawer ④, Photos drawer (gap #16), delete-confirm modal, gap #18 refusal modal — laid out as static panels.
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

const noteQuiet: React.CSSProperties = { background: GROUND, border: `1px dashed ${HAIR}`, borderRadius: 6, padding: "11px 14px", fontSize: 12.5, color: MUTED, lineHeight: 1.5 };
const grouplabel: React.CSSProperties = { fontSize: 11, letterSpacing: ".07em", textTransform: "uppercase", color: MUTED, fontWeight: 600, marginBottom: 10, marginTop: 0 };
const fieldLabel: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 550, marginBottom: 5 };
const helpText: React.CSSProperties = { fontSize: 12, color: MUTED, marginTop: 5, lineHeight: 1.5 };
const inp: React.CSSProperties = { width: "100%", padding: "9px 11px", border: `1px solid ${HAIR}`, borderRadius: 6, background: "#fff", color: INK, font: "inherit", fontSize: 13.5 };
const divider: React.CSSProperties = { height: 1, background: HAIR, margin: "20px 0" };
const btn: React.CSSProperties = { border: `1px solid ${INK}`, background: INK, color: "#fff", padding: "9px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13.5, fontWeight: 550, font: "inherit" };
const btnGhost: React.CSSProperties = { ...btn, background: "transparent", color: INK, borderColor: HAIR };
const btnGhostSm: React.CSSProperties = { ...btnGhost, padding: "6px 11px", fontSize: 12.5, whiteSpace: "nowrap" };

function Seg({ options, pressed }: { options: string[]; pressed: string }) {
  return (
    <div style={{ display: "inline-flex", border: `1px solid ${HAIR}`, borderRadius: 6, overflow: "hidden", background: "#fff" }}>
      {options.map((o, i) => (
        <button key={o} type="button" aria-pressed={o === pressed} style={{
          background: o === pressed ? INK : "#fff", color: o === pressed ? "#fff" : MUTED,
          border: "none", borderRight: i === options.length - 1 ? "none" : `1px solid ${HAIR}`,
          padding: "7px 13px", fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap", font: "inherit",
        }}>{o}</button>
      ))}
    </div>
  );
}

function PropChip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 550, color: WARN_INK, background: WARN_BG, border: `1px solid ${WARN_LINE}`, borderRadius: 100, padding: "2px 10px", whiteSpace: "nowrap" }}>
      <span style={{ width: 6, height: 6, borderRadius: 100, background: "#C79A3C", flex: "0 0 6px", display: "inline-block" }} />
      {children}
    </span>
  );
}

function PanelLabel({ children }: { children: React.ReactNode }) {
  return <h5 style={{ ...grouplabel, marginBottom: 8 }}>{children}</h5>;
}

function DrawerFrame({ header, children, footer }: { header: React.ReactNode; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${HAIR}`, borderRadius: 7, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "18px 22px", borderBottom: `1px solid ${HAIR}`, display: "flex", alignItems: "center", gap: 10 }}>
        {header}
        <button type="button" aria-label="Close" style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: MUTED, fontSize: 18, lineHeight: 1, font: "inherit" }}>×</button>
      </div>
      <div style={{ padding: "20px 22px", flex: 1 }}>{children}</div>
      <div style={{ padding: "14px 22px", borderTop: `1px solid ${HAIR}`, display: "flex", gap: 10 }}>{footer}</div>
    </div>
  );
}

export function DrawersOverlays() {
  return (
    <div className="min-h-screen w-full" style={{ background: GROUND, color: INK, fontFamily: "system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif", fontSize: 14, lineHeight: 1.5, padding: "26px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 26, maxWidth: 1000, alignItems: "start" }}>

        {/* ══ Pricing & fees drawer ④ ══ */}
        <div>
          <PanelLabel>Pricing &amp; fees drawer</PanelLabel>
          <DrawerFrame
            header={<>
              <h3 style={{ fontSize: 15, fontWeight: 650, margin: 0 }}>Pricing &amp; fees</h3>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 17, height: 17, flex: "0 0 17px", borderRadius: 100, background: SOFT, color: ACCENT, border: "1px solid #CBDAD7", fontSize: 11, lineHeight: 1, fontWeight: 600 }}>④</span>
            </>}
            footer={<>
              <button type="button" style={{ ...btnGhost, flex: 1 }}>Cancel</button>
              <button type="button" style={{ ...btn, flex: 1 }}>Save settings</button>
            </>}
          >
            <div style={{ ...noteQuiet, marginBottom: 18 }}>
              <b style={{ color: INK }}>Tune later.</b> None of this is required to go live. Your listing already has a price — everything here is an adjustment on top of it.
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={fieldLabel}>Base price</label>
              <input readOnly value="$68 per person" style={{ ...inp, background: GROUND, color: MUTED }} />
              <div style={helpText}>Set during creation. Edit it on the listing itself.</div>
            </div>

            <div style={divider} />
            <h5 style={grouplabel}>Surcharges</h5>
            <div style={{ marginBottom: 16 }}>
              <label style={fieldLabel}>Extra travel beyond your free radius</label>
              <Seg options={["None", "Flat fee", "Per km"]} pressed="None" />
              <div style={helpText}>Shown because this is an in-person listing. Remote listings do not render this section at all.</div>
            </div>

            <div style={divider} />
            <h5 style={grouplabel}>Deposit</h5>
            <div style={{ marginBottom: 16 }}>
              <label style={fieldLabel}>Take a deposit at booking</label>
              <Seg options={["No deposit", "Part now"]} pressed="No deposit" />
              <div style={helpText}>Travelers pay the balance on the day.</div>
            </div>

            <div style={divider} />
            <h5 style={grouplabel}>Cancellation</h5>
            <div style={{ marginBottom: 16 }}>
              <label style={fieldLabel}>Policy</label>
              <select style={inp} defaultValue="Moderate — full refund 5+ days before; 50% refund 2+ days before">
                <option>Flexible — full refund if cancelled at least 24 hours before the start</option>
                <option>Moderate — full refund 5+ days before; 50% refund 2+ days before</option>
                <option>Strict — 50% refund if cancelled at least 7 days before</option>
                <option>Non-refundable — no refund once booked</option>
              </select>
            </div>

            <div style={{ ...noteQuiet, marginTop: 16 }}>
              Unsaved. Cancel discards these edits; Save keeps them and says what it kept.
            </div>

            <div style={{ ...noteQuiet, marginTop: 18 }}>
              Platform commission is not shown or set here — it is resolved from your category, not typed into a form. The amounts above are <b style={{ color: INK }}>illustrative inputs</b>; the surcharge taxonomy itself (and zone geometry) is still a spec gap (#8).
            </div>
          </DrawerFrame>
        </div>

        {/* ══ Photos drawer (gap #16) ══ */}
        <div>
          <PanelLabel>Photos &amp; media drawer</PanelLabel>
          <DrawerFrame
            header={<>
              <h3 style={{ fontSize: 15, fontWeight: 650, margin: 0 }}>Photos &amp; media</h3>
              <PropChip>gap #16</PropChip>
            </>}
            footer={<button type="button" style={{ ...btnGhost, flex: 1 }}>Back to the checklist</button>}
          >
            <div style={{ ...noteQuiet, marginBottom: 18 }}>
              The checklist row “Add a cover photo” links <b style={{ color: INK }}>here</b>. It ticks when a cover photo exists on the listing — not when you click the row.
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={fieldLabel}>Cover photo</label>
              <div style={{ border: `1px dashed ${HAIR}`, borderRadius: 6, padding: 22, textAlign: "center", background: GROUND }}>
                <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 9 }}>No cover photo yet.</div>
                <button type="button" style={btnGhostSm}>Add a cover photo</button>
              </div>
            </div>

            <h5 style={grouplabel}>How photos get onto a listing</h5>
            <div style={{ border: `1px dashed ${HAIR}`, borderRadius: 6, background: GROUND, padding: "20px 16px", textAlign: "center" }}>
              <b style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Drop photos here, or choose files</b>
              <span style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, display: "block" }}>
                Uploads are <b style={{ color: INK }}>platform-protected</b> — stored by us and served from our domain, like your PDF guide. They cannot be hot-linked, moved or taken away by a third party.
              </span>
              <button type="button" style={{ ...btnGhostSm, marginTop: 11 }}>Choose files</button>
            </div>

            <div style={{ marginTop: 16, marginBottom: 16 }}>
              <label style={fieldLabel}>…or paste an image link</label>
              <input placeholder="Paste a link" aria-label="Paste an image link" style={inp} />
              <div style={helpText}>
                The honest trade-off, stated where the choice is made: a pasted link is a URL we do not own. It can break, move or change to something else, and we cannot vouch for it. Providers who only have a link should still be able to use it; uploads are the recommended path.
              </div>
            </div>

            <div style={noteQuiet}>
              Gallery ordering, clip support and whether a cover photo is <i>required</i> to go live are still open questions. Only the cover-photo state is simulated here, because the checklist derives from it.
            </div>
          </DrawerFrame>
        </div>

        {/* ══ Delete-confirm modal ══ */}
        <div>
          <PanelLabel>Delete confirm modal</PanelLabel>
          <div style={{ background: "#fff", border: `1px solid ${HAIR}`, borderRadius: 8, maxWidth: 470, width: "100%", padding: 22 }}>
            <h3 style={{ fontSize: 15.5, fontWeight: 650, marginBottom: 7, marginTop: 0 }}>Delete “Morning Tea Ceremony in a Machiya Townhouse”?</h3>
            <p style={{ fontSize: 13, color: MUTED, marginBottom: 16, marginTop: 0, lineHeight: 1.55 }}>
              This listing has no upcoming bookings. Deleting it removes it from your Catalog and from search. This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 9, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button type="button" style={btnGhost}>Keep listing</button>
              <button type="button" style={{ ...btn, background: "#8C2F2A", borderColor: "#8C2F2A" }}>Delete listing</button>
            </div>
          </div>
        </div>

        {/* ══ gap #18 — refusal modal ══ */}
        <div>
          <PanelLabel>Deletion refused — archive path (gap #18)</PanelLabel>
          <div style={{ background: "#fff", border: `1px solid ${HAIR}`, borderRadius: 8, maxWidth: 470, width: "100%", padding: 22 }}>
            <h3 style={{ fontSize: 15.5, fontWeight: 650, marginBottom: 7, marginTop: 0 }}>This listing cannot be deleted</h3>
            <p style={{ fontSize: 13, color: MUTED, marginBottom: 16, marginTop: 0, lineHeight: 1.55 }}>
              <b style={{ color: INK }}>“Gion Evening Food Walk” has 2 upcoming bookings.</b> Deleting it would leave those travelers holding a booking for a listing that no longer exists — the record their receipt, review and payout all point at. So deletion is refused, and the honest alternative is offered instead.
            </p>
            <div style={{ background: GROUND, border: `1px dashed ${HAIR}`, borderRadius: 7, marginBottom: 16, overflow: "hidden" }}>
              {[
                <><b>Archive it.</b> It leaves your Catalog and search immediately — nobody can book it again.</>,
                <>The <b>2 upcoming bookings stand</b>, and you still owe those travelers the walk.</>,
                <>Past bookings, reviews and payouts keep pointing at a listing that still exists.</>,
                <>Once the last booking is delivered, deleting it becomes possible.</>,
              ].map((content, i, arr) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderBottom: i === arr.length - 1 ? "none" : `1px solid ${HAIR}`, fontSize: 13, flexWrap: "wrap" }}>
                  <span style={{ width: 20, height: 20, flex: "0 0 20px", borderRadius: 100, background: GROUND, border: `1px solid ${HAIR}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: MUTED }}>✓</span>
                  <span style={{ flex: 1, minWidth: 150 }}>{content}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 9, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button type="button" style={btnGhost}>Keep it live</button>
              <button type="button" style={btn}>Archive listing</button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default DrawersOverlays;
