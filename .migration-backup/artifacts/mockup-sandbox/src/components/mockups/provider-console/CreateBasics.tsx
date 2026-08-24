// Create flow — Basics step (in_person). Replicates docs/design/provider-console-mockup/mockup.html
// (create flow shell ~lines 988-1086, body_basics ~lines 2062-2108) with zero divergence.

const INK = "#1A1A18";
const MUTED = "#7A7A72";
const HAIR = "#E8E8E2";
const GROUND = "#FAFAF8";
const ACCENT = "#35605A";
const SOFT = "#EDF2F1";

const STEPS = ["Basics", "Scheduling", "Capacity", "Logistics", "Review & submit"];

function Dot({ children, ghost, style }: { children: React.ReactNode; ghost?: boolean; style?: React.CSSProperties }) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 17, height: 17, borderRadius: 100, fontSize: 11, lineHeight: 1, fontWeight: 600,
        verticalAlign: "middle", marginLeft: 6,
        background: ghost ? SOFT : ACCENT, color: ghost ? ACCENT : "#fff",
        border: ghost ? "1px solid #CBDAD7" : "none",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

function NavItem({ label, gl, on, proposed, dot }: { label: string; gl: string; on?: boolean; proposed?: boolean; dot?: string }) {
  return (
    <button
      style={{
        display: "flex", alignItems: "center", gap: 9, padding: "7px 8px", borderRadius: 5,
        fontSize: 13, width: "100%", textAlign: "left", cursor: "pointer", font: "inherit",
        background: on ? SOFT : "none",
        color: on ? ACCENT : INK,
        fontWeight: on ? 600 : 400,
        border: proposed ? "1px dashed #BFD5D0" : "1px solid transparent",
        boxShadow: on ? "inset 0 0 0 1px #CBDAD7" : "none",
      }}
    >
      <span style={{ width: 15, textAlign: "center", color: on ? ACCENT : MUTED, fontSize: 12, flex: "0 0 15px" }}>{gl}</span>
      {label}
      {dot && (
        <span style={{ marginLeft: "auto", width: 15, height: 15, borderRadius: 100, background: SOFT, border: "1px solid #CBDAD7", color: ACCENT, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {dot}
        </span>
      )}
    </button>
  );
}

function NavGroup({ label }: { label: string }) {
  return (
    <div style={{ fontSize: 10.5, letterSpacing: ".07em", textTransform: "uppercase", color: MUTED, padding: "14px 8px 5px", fontWeight: 600 }}>
      {label}
    </div>
  );
}

export function ConsoleShell({ curStep, stepTitle, children, footer }: { curStep: number; stepTitle: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: GROUND, color: INK, fontFamily: 'system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif', fontSize: 14, lineHeight: 1.5 }}>
      <div style={{ display: "grid", gridTemplateColumns: "216px minmax(0,1fr)", minHeight: "100vh" }}>
        {/* sidebar */}
        <aside style={{ background: "#fff", borderRight: `1px solid ${HAIR}`, padding: "16px 12px", position: "sticky", top: 0, height: "100vh", overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "2px 8px 18px", fontWeight: 650, letterSpacing: "-.01em", fontSize: 15 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke={ACCENT} strokeWidth="1.7" />
              <path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" stroke={ACCENT} strokeWidth="1.5" />
            </svg>
            Traveloure
          </div>
          <nav>
            <NavGroup label="Work" />
            <NavItem gl="◇" label="Dashboard" />
            <NavItem gl="▤" label="Calendar" />
            <NavItem gl="✉" label="Inbox" />
            <NavItem gl="⚒" label="Workstation" on />
            <NavGroup label="Business" />
            <NavItem gl="▦" label="Catalog" />
            <NavItem gl="↗" label="Distribute" proposed dot="⑧" />
            <NavItem gl="☺" label="Customers" />
            <NavItem gl="↑" label="Performance" />
            <NavItem gl="$" label="Money" />
            <NavGroup label="Account" />
            <NavItem gl="⚙" label="Settings" />
            <NavItem gl="▣" label="Playbook" />
          </nav>
          <div style={{ marginTop: "auto", padding: "14px 8px 4px", borderTop: `1px solid ${HAIR}`, fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
            Provider console — proposed structure.<br />
            <b style={{ color: INK }}>Distribute</b> is the one new entry.
          </div>
        </aside>

        {/* main column */}
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ background: "#fff", borderBottom: `1px solid ${HAIR}`, padding: "11px 26px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ width: 29, height: 29, flex: "0 0 29px", borderRadius: 100, background: SOFT, border: "1px solid #CBDAD7", color: ACCENT, fontSize: 11, fontWeight: 650, display: "flex", alignItems: "center", justifyContent: "center" }} aria-hidden="true">AT</span>
            <span>
              <b style={{ display: "block", fontSize: 13.5, fontWeight: 650, lineHeight: 1.25 }}>Aiko Tanaka</b>
              <span style={{ display: "block", fontSize: 12, color: MUTED, lineHeight: 1.3 }}>Machiya Kikuya · Gion, Kyoto · Provider</span>
            </span>
            <span style={{ marginLeft: "auto", fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", color: MUTED, border: `1px solid ${HAIR}`, borderRadius: 100, padding: "3px 11px", background: GROUND }}>
              Mock — not connected to live data
            </span>
            <button style={{ font: "inherit", background: "transparent", color: INK, border: `1px solid ${HAIR}`, padding: "6px 11px", borderRadius: 6, cursor: "pointer", fontSize: 12.5, fontWeight: 550, whiteSpace: "nowrap" }}>Mock notes</button>
          </div>

          <div style={{ background: "#fff", borderBottom: `1px solid ${HAIR}`, padding: "9px 26px", fontSize: 12.5 }}>
            <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", color: MUTED }}>
              <button style={{ background: "none", border: "none", padding: 0, color: ACCENT, cursor: "pointer", fontSize: 12.5, textDecoration: "underline", textUnderlineOffset: 2, font: "inherit" }}>Workstation</button>
              <span style={{ color: "#C4C4BC" }}>›</span>
              <button style={{ background: "none", border: "none", padding: 0, color: ACCENT, cursor: "pointer", fontSize: 12.5, textDecoration: "underline", textUnderlineOffset: 2, font: "inherit" }}>New service</button>
              <span style={{ color: "#C4C4BC" }}>›</span>
              <span style={{ color: INK, fontWeight: 600 }}>Step {curStep + 1} · {STEPS[curStep]}</span>
            </div>
          </div>

          <div style={{ padding: "22px 26px 76px", maxWidth: 1180, width: "100%" }}>
            <button style={{ background: "none", border: "none", color: ACCENT, cursor: "pointer", fontSize: 13, textDecoration: "underline", textUnderlineOffset: 2, marginBottom: 14, display: "inline-block", font: "inherit" }}>
              ← Back to “What are you building?”
            </button>
            <div style={{ display: "grid", gridTemplateColumns: "236px minmax(0,1fr)", gap: 22, alignItems: "start" }}>
              {/* steplist */}
              <aside style={{ background: "#fff", border: `1px solid ${HAIR}`, borderRadius: 7, padding: 14, position: "sticky", top: 16 }}>
                <h5 style={{ fontSize: 11, letterSpacing: ".07em", textTransform: "uppercase", color: MUTED, fontWeight: 600, marginBottom: 12 }}>Steps</h5>
                <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {STEPS.map((s, i) => {
                    const cur = i === curStep;
                    const done = i < curStep;
                    return (
                      <li key={s} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 6px", borderRadius: 6, fontSize: 13, cursor: "pointer", color: cur || done ? INK : MUTED, fontWeight: cur ? 600 : 400, background: cur ? SOFT : "transparent" }}>
                        <span style={{ width: 20, height: 20, flex: "0 0 20px", borderRadius: 100, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, background: cur ? ACCENT : done ? INK : "#fff", border: `1px solid ${cur ? ACCENT : done ? INK : HAIR}`, color: cur || done ? "#fff" : "inherit" }}>
                          {done ? "✓" : i + 1}
                        </span>
                        <span>{s}</span>
                      </li>
                    );
                  })}
                </ol>
                <div style={{ marginTop: 12, paddingTop: 11, borderTop: `1px solid ${HAIR}`, fontSize: 12, color: MUTED }}>
                  <b>5 steps</b> for “In person”. Scheduling, Capacity and the new <b>Logistics</b> step (4th) are here because this method happens somewhere.
                </div>
                <div style={{ marginTop: 12, background: GROUND, border: `1px dashed ${HAIR}`, borderRadius: 6, padding: "11px 14px", fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>
                  The step list is generated from the delivery method. Nothing here is a fixed 4-step wizard.
                </div>
              </aside>

              <main style={{ minWidth: 0 }}>
                <div style={{ background: "#fff", border: `1px solid ${HAIR}`, borderRadius: 7 }}>
                  <div style={{ padding: "14px 22px", borderBottom: `1px solid ${HAIR}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{stepTitle}</h3>
                    <span style={{ display: "inline-block", fontSize: 11.5, padding: "2px 9px", borderRadius: 100, border: "1px solid #D9CDB2", background: "#FBF6EC", color: "#6B551F" }}>Draft · autosaved</span>
                    <span style={{ marginLeft: "auto", fontSize: 12, color: MUTED }}>Step {curStep + 1} of 5</span>
                  </div>
                  <div style={{ padding: "20px 22px" }}>{children}</div>
                  <div style={{ padding: "0 22px 20px" }}>
                    <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${HAIR}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      {footer}
                    </div>
                  </div>
                </div>
              </main>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = {
  width: "100%", padding: "9px 11px", border: `1px solid ${HAIR}`, borderRadius: 6,
  background: "#fff", color: INK, font: "inherit", fontSize: 13.5,
};
const fieldLabel: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 550, marginBottom: 5 };
const help: React.CSSProperties = { fontSize: 12, color: MUTED, marginTop: 5, lineHeight: 1.5 };

const METHODS: [string, string, boolean][] = [
  ["In person", "Place-anchored", true],
  ["Video call", "Live, remote", false],
  ["Phone call", "Live, remote", false],
  ["PDF guide", "Artifact", false],
  ["Voice notes", "Async lane", false],
  ["Async messaging", "Async lane", false],
  ["Hybrid", "In person + video", false],
];

export default function CreateBasics() {
  return (
    <ConsoleShell
      curStep={0}
      stepTitle="Basics"
      footer={
        <>
          <button style={{ font: "inherit", border: `1px solid ${ACCENT}`, background: ACCENT, color: "#fff", padding: "12px 22px", borderRadius: 6, cursor: "pointer", fontSize: 14.5, fontWeight: 550 }}>Save draft</button>
          <span style={{ marginLeft: "auto" }} />
          <span style={{ fontSize: 12, color: MUTED }}>Saving creates the listing. You can leave and come back — nothing is lost, and review has not started.</span>
        </>
      }
    >
      <div style={{ background: GROUND, border: `1px dashed ${HAIR}`, borderRadius: 6, padding: "11px 14px", fontSize: 12.5, color: MUTED, lineHeight: 1.5, marginBottom: 18 }}>
        <b style={{ color: INK }}>Screen 1 is the whole fast path.</b> Five fields, then a saved listing. Everything else can wait — and what waits is named for you afterwards.
        <Dot ghost>②</Dot>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <label style={fieldLabel}>What are you offering?</label>
          <select style={inp} defaultValue="Tea ceremony & cultural ritual">
            <option>Tea ceremony &amp; cultural ritual</option>
            <option>Something else — browse the catalog</option>
          </select>
          <div style={help}>Category: Arts &amp; Crafts Instruction</div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={fieldLabel}>Name it</label>
          <input style={inp} defaultValue="Morning Tea Ceremony in a Machiya Townhouse" />
          <div style={help}>Travelers see this first.</div>
        </div>
      </div>

      <div style={{ marginBottom: 16, marginTop: 6 }}>
        <label style={fieldLabel}>
          How do you deliver this?<Dot>①</Dot>
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 9 }}>
          {METHODS.map(([name, meta, on]) => (
            <button
              key={name}
              type="button"
              aria-pressed={on}
              style={{
                border: `1px solid ${on ? ACCENT : HAIR}`, borderRadius: 7,
                background: on ? SOFT : "#fff", padding: "11px 12px", cursor: "pointer",
                textAlign: "left", font: "inherit",
                boxShadow: on ? `inset 0 0 0 1px ${ACCENT}` : "none",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 2, color: INK }}>{name}</span>
              <span style={{ fontSize: 11.5, color: on ? ACCENT : MUTED, display: "block", lineHeight: 1.35 }}>{meta}</span>
            </button>
          ))}
        </div>
        <div style={help}>This is asked second, not buried mid-form — because the rest of the form is built from the answer.</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <label style={fieldLabel}>
            Price<Dot>④</Dot>
          </label>
          <div style={{ display: "flex", gap: 9 }}>
            <input style={{ ...inp, maxWidth: 120 }} defaultValue="$68" />
            <select style={{ ...inp, maxWidth: 190 }} defaultValue="per person">
              <option>per person</option>
              <option>per group</option>
              <option>per hour</option>
            </select>
          </div>
          <div style={help}>
            One price. Surcharges, deposits and cancellation live in <b>Pricing &amp; fees</b> after you save — none of them are required to go live.
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={fieldLabel}>One line about it</label>
          <textarea style={{ ...inp, resize: "vertical", minHeight: 64 }} defaultValue="A 90-minute seated tea ceremony in my family machiya in Gion, with matcha and seasonal wagashi." />
          <div style={help}>
            You can write the long version later. <span>95 characters</span> — the draft checklist asks for 140+ before review, and reads it from this field.
          </div>
        </div>
      </div>

      <div style={{ background: "#FBF6EC", border: "1px solid #D9C79A", color: "#6B551F", borderRadius: 6, padding: "11px 14px", fontSize: 12.5, lineHeight: 1.5, marginTop: 4 }}>
        <b style={{ fontWeight: 650 }}>Before you start:</b> listings are reviewed by our team before they go live — usually within 2 business days. Saving a draft costs you nothing and does not start the review.
      </div>
    </ConsoleShell>
  );
}
