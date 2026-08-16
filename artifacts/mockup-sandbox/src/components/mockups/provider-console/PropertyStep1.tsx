// Property wizard — Step 1: The property
// Per reference: pin-first location (confirm-gated pin, not address geocoding),
// guest visibility (approximate area before booking / exact pin after),
// check-in/check-out/minimum stay, house rules.

const ACC = "#35605A";
const INK = "#1A1A18";
const MUT = "#7A7A72";
const HAIR = "#E8E8E2";
const GRD = "#FAFAF8";
const PAPER = "#FFFFFF";
const WARN_BG = "#FBF6EC";
const WARN_LINE = "#D9C79A";
const WARN_INK = "#6B551F";

export function PropertyStep1() {
  return (
    <Shell step={1} title="The property" subtitle="Tell us about the place itself — name, type, where it is, and what makes it worth staying in.">

      <Stepper active={1} />

      {/* ── Identity ── */}
      <FormSection title="Identity">
        <Field label="Property name" required hint="The name travelers will see on listings and receipts.">
          <Input value="Machiya Kikuya" />
        </Field>
        <Field label="Property type" required hint="Determines which filters and categories your property appears under.">
          <Select value="Machiya (traditional townhouse)" />
        </Field>
        <Field label="Short headline" hint="62 / 80 chars">
          <Input value="A restored 1920s machiya in the heart of Gion, Kyoto." />
        </Field>
      </FormSection>

      {/* ── Photos ── */}
      <FormSection title="Photos">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ aspectRatio: "4/3", background: HAIR, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, opacity: 0.5 }}>
              🖼️
            </div>
          ))}
          <div style={{ aspectRatio: "4/3", border: `2px dashed ${HAIR}`, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, color: MUT, cursor: "pointer" }}>
            + Add
          </div>
        </div>
        <p style={{ fontSize: 11.5, color: MUT, margin: 0, lineHeight: 1.5 }}>
          Property photos are the building and the shared spaces. Each room carries its own photos on the next step.
        </p>
      </FormSection>

      {/* ── WHERE IS IT — confirm-gated pin ── */}
      <div style={{ background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 8, padding: "18px 20px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: MUT, textTransform: "uppercase" as const, letterSpacing: "0.07em", margin: 0 }}>Where is it</p>
          <span style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 9px", borderRadius: 999, border: `1px solid ${WARN_LINE}`, background: WARN_BG, color: WARN_INK, letterSpacing: "0.03em" }}>
            ● PROPOSED — GAP #1 · RATIFY OR AMEND
          </span>
        </div>

        {/* Rationale strip */}
        <div style={{ border: `1px dashed ${HAIR}`, borderRadius: 6, background: GRD, padding: "10px 14px", fontSize: 12, color: MUT, lineHeight: 1.55, marginBottom: 12 }}>
          This is the <strong style={{ color: INK }}>same confirm-gated pin</strong> the create flow uses on its Logistics step — arm, click, confirm — mounted here rather than invented anew. One sanctioned location write, reused: there is no second way to place a coordinate on this platform.
        </div>

        {/* Arm bar */}
        <div style={{ border: `1px solid ${HAIR}`, borderBottom: "none", borderRadius: "7px 7px 0 0", background: PAPER, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontSize: 12.5, color: MUT }}>Nothing armed. Arm the pin, then click the map.</span>
          <button style={{ fontSize: 12.5, fontWeight: 600, padding: "7px 14px", borderRadius: 6, border: `1px solid ${ACC}`, background: "transparent", color: ACC, cursor: "pointer", whiteSpace: "nowrap" as const }}>
            Place the property pin
          </button>
        </div>

        {/* Map placeholder */}
        <div style={{ position: "relative", border: `1px solid ${HAIR}`, borderRadius: "0 0 7px 7px", height: 210, background: "#F2F0EA", overflow: "hidden" }}>
          {/* faux street grid */}
          <div style={{ position: "absolute", inset: 0, opacity: 0.6 }}>
            <div style={{ position: "absolute", top: "30%", left: 0, right: 0, height: 10, background: "#E8E4DA" }} />
            <div style={{ position: "absolute", top: "62%", left: 0, right: 0, height: 7, background: "#E8E4DA" }} />
            <div style={{ position: "absolute", left: "25%", top: 0, bottom: 0, width: 9, background: "#E8E4DA" }} />
            <div style={{ position: "absolute", left: "58%", top: 0, bottom: 0, width: 7, background: "#E8E4DA" }} />
            <div style={{ position: "absolute", left: "78%", top: "10%", width: 60, height: 45, background: "#DCE8DC", borderRadius: 4 }} />
            <div style={{ position: "absolute", left: "36%", top: "40%", width: 80, height: 55, background: "#E2DED4", borderRadius: 3 }} />
          </div>
          <span style={{ position: "absolute", left: 10, bottom: 8, fontSize: 10, color: MUT }}>© OpenStreetMap contributors</span>
          <span style={{ position: "absolute", right: 10, bottom: 8, fontSize: 10, color: MUT, background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 4, padding: "2px 8px" }}>
            Map preview — illustrative
          </span>
        </div>

        <p style={{ fontSize: 11.5, color: MUT, margin: "10px 0 0", lineHeight: 1.5 }}>
          A <strong style={{ color: INK }}>bare map click does nothing</strong> — the same gate as the flow's Logistics step. Nothing is stored until you confirm, and no coordinate is ever derived from the address line.
        </p>
      </div>

      {/* ── Two-column: Property pin | What guests see ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 14, marginBottom: 16 }}>

        {/* Property pin card */}
        <div style={{ background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 8, padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>Property pin</span>
            <span style={{ fontSize: 10.5, padding: "2px 9px", borderRadius: 999, border: `1px solid ${HAIR}`, background: GRD, color: MUT }}>Not placed</span>
          </div>

          <Field label="Address / directions line" hint="(optional)">
            <Input value="" placeholder="e.g. Shimbashi-dori, Gion" />
          </Field>

          <p style={{ fontSize: 11.5, color: MUT, margin: "8px 0 0", lineHeight: 1.55 }}>
            Display text — <strong style={{ color: INK }}>shown to guests</strong>. The pin is what places you on the map; we never guess coordinates from text. Japanese addresses geocode poorly <em>(chōme-banchi-gō, not street-and-number)</em>, so the pin is authoritative and this line is prose beside it.
          </p>

          <div style={{ marginTop: 12, background: WARN_BG, border: `1px solid ${WARN_LINE}`, borderRadius: 6, padding: "9px 12px", fontSize: 12, color: WARN_INK, lineHeight: 1.5 }}>
            <strong>Not yet locatable.</strong> A property with no pin is on no map — and neither are its rooms, which inherit it.
          </div>
        </div>

        {/* What guests see before booking */}
        <div style={{ background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 8, padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>What guests see before booking</span>
            <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 999, border: `1px solid ${WARN_LINE}`, background: WARN_BG, color: WARN_INK, whiteSpace: "nowrap" as const }}>
              ● Proposed — gap #1 · ratify or amend
            </span>
          </div>

          {/* Toggle */}
          <div style={{ display: "inline-flex", border: `1px solid ${HAIR}`, borderRadius: 6, overflow: "hidden", marginBottom: 12 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, padding: "5px 12px", background: ACC, color: "#fff" }}>Before booking</span>
            <span style={{ fontSize: 11.5, padding: "5px 12px", background: PAPER, color: MUT, cursor: "pointer" }}>After booking</span>
          </div>

          {/* Before/After panels */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {/* Before */}
            <div style={{ border: `1.5px solid ${ACC}`, borderRadius: 7, padding: "10px 12px" }}>
              <p style={{ fontSize: 11.5, fontWeight: 600, color: INK, margin: "0 0 8px" }}>Before booking</p>
              {/* mini-map with circle */}
              <div style={{ position: "relative", height: 84, background: "#F2F0EA", borderRadius: 5, marginBottom: 8, overflow: "hidden" }}>
                <div style={{ position: "absolute", top: "40%", left: 0, right: 0, height: 6, background: "#E8E4DA" }} />
                <div style={{ position: "absolute", left: "30%", top: 0, bottom: 0, width: 6, background: "#E8E4DA" }} />
                <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 54, height: 54, borderRadius: 999, border: `2px dashed ${MUT}`, background: "rgba(53,96,90,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 8, color: MUT, textAlign: "center" as const, lineHeight: 1.2 }}>approximate<br/>area</span>
                </div>
                <span style={{ position: "absolute", left: 4, bottom: 3, fontSize: 8, color: MUT }}>© OpenStreetMap contributors</span>
              </div>
              <p style={{ fontSize: 11, color: INK, margin: 0, lineHeight: 1.5 }}>
                <strong>Approximate area — exact location after booking.</strong>{" "}
                <span style={{ color: MUT }}>A neighbourhood circle, not the pin. The traveler can tell it is Gion; they cannot tell which machiya.</span>
              </p>
            </div>

            {/* After */}
            <div style={{ border: `1px solid ${HAIR}`, borderRadius: 7, padding: "10px 12px" }}>
              <p style={{ fontSize: 11.5, fontWeight: 600, color: INK, margin: "0 0 8px" }}>After booking is confirmed</p>
              <div style={{ position: "relative", height: 84, background: "#F2F0EA", borderRadius: 5, marginBottom: 8, overflow: "hidden" }}>
                <div style={{ position: "absolute", top: "40%", left: 0, right: 0, height: 6, background: "#E8E4DA" }} />
                <div style={{ position: "absolute", left: "55%", top: 0, bottom: 0, width: 6, background: "#E8E4DA" }} />
                <span style={{ position: "absolute", left: "50%", top: "38%", transform: "translate(-50%,-50%)", fontSize: 20, color: ACC }}>📍</span>
                <span style={{ position: "absolute", left: "50%", top: "72%", transform: "translateX(-50%)", fontSize: 8, background: INK, color: "#fff", borderRadius: 3, padding: "2px 6px", whiteSpace: "nowrap" as const }}>exact address</span>
                <span style={{ position: "absolute", left: 4, bottom: 3, fontSize: 8, color: MUT }}>© OpenStreetMap contributors</span>
              </div>
              <p style={{ fontSize: 11, color: MUT, margin: 0, lineHeight: 1.5 }}>
                The exact pin, plus your directions line if you wrote one. Released by the confirmed booking — not by an enquiry, and not by a page view.
              </p>
            </div>
          </div>

          <p style={{ fontSize: 11, color: MUT, margin: "10px 0 0", lineHeight: 1.5 }}>
            Inspecting the <strong style={{ color: INK }}>pre-booking</strong> view. Both states are drawn above so the trade is visible, not just described. Circle size is illustrative — it is not a measured radius.
          </p>
        </div>
      </div>

      {/* ── Check-in / Check-out / Minimum stay ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div style={{ background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 8, padding: "14px 16px" }}>
          <Field label="Check-in from" required>
            <Input value="15:00" />
          </Field>
        </div>
        <div style={{ background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 8, padding: "14px 16px" }}>
          <Field label="Check-out by" required>
            <Input value="11:00" />
          </Field>
        </div>
        <div style={{ background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 8, padding: "14px 16px" }}>
          <Field label="Minimum stay">
            <Select value="2 nights" />
          </Field>
        </div>
      </div>

      {/* ── House rules ── */}
      <FormSection title="House rules">
        <textarea
          defaultValue="Shoes off at the genkan. No smoking anywhere inside. Quiet after 22:00 — the walls are paper, literally."
          rows={3}
          style={{ ...inputStyle(), resize: "vertical" as const, lineHeight: 1.6 }}
        />
      </FormSection>

      {/* Footer nav */}
      <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 4 }}>
        <Btn accent>Next: The rooms →</Btn>
      </div>

    </Shell>
  );
}

// ── shared primitives ────────────────────────────────────────────────────────

function Shell({ step, title, subtitle, children }: { step: number; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div style={{ background: GRD, minHeight: "100vh", fontFamily: "-apple-system,BlinkMacSystemFont,'Inter',sans-serif", color: INK }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 28px" }}>
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
    <div style={{ display: "flex", marginBottom: 28, borderRadius: 8, background: PAPER, border: `1px solid ${HAIR}`, overflow: "hidden" }}>
      {steps.map((s, i) => {
        const n = i + 1;
        const isActive = n === active;
        const isDone = n < active;
        return (
          <div key={s} style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderRight: i < steps.length - 1 ? `1px solid ${HAIR}` : "none", background: isActive ? "#EDF2F1" : PAPER }}>
            <span style={{ width: 20, height: 20, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0, background: isActive || isDone ? ACC : HAIR, color: isActive || isDone ? "#fff" : MUT }}>
              {isDone ? "✓" : n}
            </span>
            <span style={{ fontSize: 12.5, fontWeight: isActive ? 600 : 400, color: isActive ? ACC : isDone ? INK : MUT }}>{s}</span>
          </div>
        );
      })}
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 8, padding: "18px 20px", marginBottom: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: MUT, textTransform: "uppercase" as const, letterSpacing: "0.07em", margin: 0 }}>{title}</p>
      {children}
    </div>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
        <span style={{ fontSize: 12.5, fontWeight: 550, color: INK }}>{label}</span>
        {required && <span style={{ color: "#C0392B", fontSize: 12 }}>*</span>}
        {hint && <span style={{ fontSize: 11.5, color: MUT }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Input({ value, placeholder }: { value?: string; placeholder?: string }) {
  return (
    <input defaultValue={value} placeholder={placeholder} style={inputStyle()} />
  );
}

function Select({ value }: { value: string }) {
  return (
    <select defaultValue={value} style={inputStyle()}>
      <option>{value}</option>
    </select>
  );
}

function inputStyle(): React.CSSProperties {
  return { fontSize: 13, padding: "8px 10px", borderRadius: 6, border: `1px solid ${HAIR}`, background: GRD, color: INK, width: "100%", boxSizing: "border-box" as const, fontFamily: "inherit" };
}

function Btn({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <button style={{ fontSize: 13, fontWeight: 600, padding: "9px 20px", borderRadius: 7, cursor: "pointer", border: `1px solid ${accent ? ACC : HAIR}`, background: accent ? ACC : PAPER, color: accent ? "#fff" : INK, fontFamily: "inherit" }}>
      {children}
    </button>
  );
}
