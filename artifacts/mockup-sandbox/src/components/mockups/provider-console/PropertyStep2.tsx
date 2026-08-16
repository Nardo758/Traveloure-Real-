// Property wizard — Step 2: The rooms
// Lists existing rooms and gaps per room:
//   • The Tatami Room — no photos, no amenities tagged
//   • Engawa Suite — no base price set
//   • Kura Studio — complete (reference / happy path)
// "+ Add room" drawer mock shown collapsed

const ACC = "#35605A";
const INK = "#1A1A18";
const MUT = "#7A7A72";
const HAIR = "#E8E8E2";
const GRD = "#FAFAF8";
const PAPER = "#FFFFFF";
const WARN_BG = "#FBF6EC";
const WARN_LINE = "#D9C79A";
const WARN_INK = "#6B551F";
const ERR_BG = "#FDF3F2";
const ERR_LINE = "#F5C6C2";
const ERR_INK = "#B84235";
const OK_BG = "#F0FDF4";
const OK_LINE = "#BBF7D0";
const OK_INK = "#166534";

export function PropertyStep2() {
  return (
    <Shell step={2} title="The rooms" subtitle="Each bookable unit in your property — name it, describe it, price it, photo it.">

      <Stepper active={2} />

      {/* Room 1 — No photos, no amenities */}
      <RoomCard
        name="The Tatami Room"
        type="Standard room · 2 guests"
        price="¥180 / night"
        issues={[
          { sev: "error", msg: "No photos — travelers can't see what they're booking. Add at least 3 room photos.", cta: "Upload photos →" },
          { sev: "warn",  msg: "No description — rooms with a description convert better and answer questions before they're asked.", cta: "Add description →" },
        ]}
        fields={[
          { label: "Name",     value: "The Tatami Room",      ok: true  },
          { label: "Type",     value: "Standard room",        ok: true  },
          { label: "Capacity", value: "2 guests",             ok: true  },
          { label: "Base price",value:"¥180 / night",        ok: true  },
          { label: "Photos",   value: "0 uploaded",          ok: false },
          { label: "Description", value: "—",               ok: false },
        ]}
      />

      {/* Room 2 — No base price */}
      <RoomCard
        name="Engawa Suite"
        type="Suite · 2 guests · engawa porch"
        price=""
        issues={[
          { sev: "error", msg: "No base price — a room without a price can't be booked. Set a nightly rate to continue.", cta: "Set price →" },
        ]}
        fields={[
          { label: "Name",      value: "Engawa Suite",   ok: true  },
          { label: "Type",      value: "Suite",          ok: true  },
          { label: "Capacity",  value: "2 guests",       ok: true  },
          { label: "Base price",value: "Not set",        ok: false },
          { label: "Photos",    value: "4 uploaded",     ok: true  },
          { label: "Description", value: "Present",     ok: true  },
        ]}
      />

      {/* Room 3 — Complete / happy path */}
      <RoomCard
        name="Kura Studio"
        type="Studio · 1 guest · converted kura"
        price="¥135 / night"
        issues={[]}
        complete
        fields={[
          { label: "Name",      value: "Kura Studio",    ok: true },
          { label: "Type",      value: "Studio",         ok: true },
          { label: "Capacity",  value: "1 guest",        ok: true },
          { label: "Base price",value: "¥135 / night",  ok: true },
          { label: "Photos",    value: "6 uploaded",     ok: true },
          { label: "Description", value: "Present",     ok: true },
        ]}
      />

      {/* + Add room CTA */}
      <div style={{ border: `1px dashed ${HAIR}`, borderRadius: 8, background: PAPER, padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <p style={{ fontSize: 13.5, fontWeight: 600, color: INK, margin: "0 0 3px" }}>Add another room</p>
          <p style={{ fontSize: 12.5, color: MUT, margin: 0 }}>Each room type, suite or dormitory bed is a separate bookable unit.</p>
        </div>
        <button style={{ fontSize: 13, fontWeight: 600, padding: "9px 18px", borderRadius: 7, border: `1px solid ${ACC}`, background: "transparent", color: ACC, cursor: "pointer" }}>
          + Add room
        </button>
      </div>

      {/* Footer nav */}
      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 4 }}>
        <Btn>← Back</Btn>
        <Btn accent>Next: Review →</Btn>
      </div>

    </Shell>
  );
}

// ── Room card ────────────────────────────────────────────────────────────────

function RoomCard({ name, type, price, issues, complete, fields }: {
  name: string; type: string; price: string; issues: { sev: "error"|"warn"; msg: string; cta: string }[];
  complete?: boolean; fields: { label: string; value: string; ok: boolean }[];
}) {
  return (
    <div style={{ border: `1px solid ${complete ? OK_LINE : issues.some(i => i.sev==="error") ? ERR_LINE : WARN_LINE}`, borderRadius: 8, background: PAPER, overflow: "hidden", marginBottom: 14 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid ${HAIR}`, gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>{name}</span>
            {complete
              ? <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: OK_BG, border: `1px solid ${OK_LINE}`, color: OK_INK }}>✓ Complete</span>
              : <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: issues.some(i=>i.sev==="error") ? ERR_BG : WARN_BG, border: `1px solid ${issues.some(i=>i.sev==="error") ? ERR_LINE : WARN_LINE}`, color: issues.some(i=>i.sev==="error") ? ERR_INK : WARN_INK }}>
                  {issues.length} issue{issues.length > 1 ? "s" : ""}
                </span>
            }
          </div>
          <span style={{ fontSize: 12, color: MUT }}>{type}{price ? ` · ${price}` : ""}</span>
        </div>
        <button style={{ fontSize: 12.5, padding: "6px 13px", borderRadius: 6, border: `1px solid ${HAIR}`, background: GRD, color: INK, cursor: "pointer" }}>Edit</button>
      </div>

      {/* Field status grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 0, borderBottom: issues.length > 0 ? `1px solid ${HAIR}` : "none" }}>
        {fields.map((f, i) => (
          <div key={f.label} style={{ padding: "9px 12px", borderRight: i < fields.length - 1 ? `1px solid ${HAIR}` : "none", display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: MUT, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{f.label}</span>
            <span style={{ fontSize: 11.5, color: f.ok ? INK : ERR_INK, display: "flex", alignItems: "center", gap: 4 }}>
              {f.ok ? "" : "✕ "}{f.value}
            </span>
          </div>
        ))}
      </div>

      {/* Issue alerts */}
      {issues.map((issue, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "10px 14px", borderTop: i > 0 ? `1px solid ${HAIR}` : "none", background: issue.sev === "error" ? ERR_BG : WARN_BG }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ fontSize: 12, color: issue.sev === "error" ? ERR_INK : WARN_INK, flexShrink: 0 }}>{issue.sev === "error" ? "✕" : "⚠"}</span>
            <span style={{ fontSize: 12.5, color: issue.sev === "error" ? ERR_INK : WARN_INK, lineHeight: 1.5 }}>{issue.msg}</span>
          </div>
          <button style={{ fontSize: 12, fontWeight: 600, color: issue.sev === "error" ? ERR_INK : WARN_INK, background: "none", border: `1px solid ${issue.sev === "error" ? ERR_LINE : WARN_LINE}`, borderRadius: 5, padding: "5px 11px", cursor: "pointer", whiteSpace: "nowrap" as const, flexShrink: 0 }}>
            {issue.cta}
          </button>
        </div>
      ))}
    </div>
  );
}

// ── shared primitives (same as Step 1) ───────────────────────────────────────

function Shell({ step, title, subtitle, children }: { step: number; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div style={{ background: GRD, minHeight: "100vh", fontFamily: "-apple-system,BlinkMacSystemFont,'Inter',sans-serif", color: INK }}>
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "32px 28px" }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: MUT, textTransform: "uppercase" as const, letterSpacing: "0.07em", margin: "0 0 4px" }}>
          New property · Step {step} of 3
        </p>
        <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em", margin: "0 0 6px" }}>{title}</h1>
        <p style={{ fontSize: 13, color: MUT, margin: "0 0 28px", lineHeight: 1.55, maxWidth: "62ch" }}>{subtitle}</p>
        {children}
      </div>
    </div>
  );
}

function Stepper({ active }: { active: number }) {
  const steps = ["The property", "The rooms", "Review"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 28, borderRadius: 8, background: PAPER, border: `1px solid ${HAIR}`, overflow: "hidden" }}>
      {steps.map((s, i) => {
        const n = i + 1;
        const isActive = n === active;
        const isDone = n < active;
        return (
          <div key={s} style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderRight: i < steps.length - 1 ? `1px solid ${HAIR}` : "none", background: isActive ? "#EDF2F1" : PAPER }}>
            <span style={{ width: 20, height: 20, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0, background: isActive ? ACC : isDone ? ACC : HAIR, color: isActive || isDone ? "#fff" : MUT }}>
              {isDone ? "✓" : n}
            </span>
            <span style={{ fontSize: 12.5, fontWeight: isActive ? 600 : 400, color: isActive ? ACC : isDone ? INK : MUT }}>{s}</span>
          </div>
        );
      })}
    </div>
  );
}

function Btn({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <button style={{ fontSize: 13, fontWeight: 600, padding: "9px 20px", borderRadius: 7, cursor: "pointer", border: `1px solid ${accent ? ACC : HAIR}`, background: accent ? ACC : PAPER, color: accent ? "#fff" : INK, fontFamily: "inherit" }}>
      {children}
    </button>
  );
}
