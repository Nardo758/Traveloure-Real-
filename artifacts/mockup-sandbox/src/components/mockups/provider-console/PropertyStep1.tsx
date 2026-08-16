// Property wizard — Step 1: The Property
// Shows property-level fields: name, type, location, description, cover photos
// Gap states: description thin, no photos uploaded yet, address missing postcode

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
    <Shell step={1} title="The property" subtitle="Tell us about the place itself — name, type, location, and what makes it worth staying in.">

      {/* Progress stepper */}
      <Stepper active={1} />

      {/* ── Section: Identity ── */}
      <FormSection title="Identity">
        <Field label="Property name" required hint="The name travelers will see on listings and receipts.">
          <Input value="Machiya Kikuya" />
        </Field>

        <Field label="Property type" required hint="Determines which filters and categories your property appears under.">
          <Select value="Machiya (traditional townhouse)" />
        </Field>

        <Field label="Short headline" hint="One sentence shown on browse cards. 80 characters max." warn="62 / 80 chars">
          <Input value="A restored 1920s machiya in the heart of Gion, Kyoto." />
        </Field>
      </FormSection>

      {/* ── Section: Location ── */}
      <FormSection title="Location">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Street address" required>
            <Input value="285 Gion-machi Minamigawa" />
          </Field>
          <Field label="City" required>
            <Input value="Kyoto" />
          </Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Prefecture / region" required>
            <Input value="Kyoto Prefecture" />
          </Field>
          <Field label="Postcode" required missing="Missing — needed for tax paperwork">
            <Input value="" placeholder="e.g. 605-0074" />
          </Field>
        </div>
        <Field label="Country">
          <Select value="Japan" />
        </Field>
      </FormSection>

      {/* ── Section: Description ── */}
      <FormSection title="Description">
        <Field
          label="Full description"
          required
          warn="Thin — 47 words. Travelers convert better with 100+ words describing layout, neighbourhood feel and what makes this different."
        >
          <textarea
            defaultValue="Machiya Kikuya is a restored Meiji-era townhouse in Gion. Three rooms, each with tatami floors and garden views."
            rows={4}
            style={{ ...inputStyle(), resize: "vertical" as const, lineHeight: 1.6 }}
          />
        </Field>
        <Field label="House rules" hint="Quiet hours, check-in procedure, smoking, pets — anything guests need to know.">
          <textarea
            placeholder="e.g. Quiet after 22:00. Check-in from 15:00. No smoking indoors. …"
            rows={3}
            style={{ ...inputStyle(), resize: "vertical" as const, lineHeight: 1.6 }}
          />
        </Field>
      </FormSection>

      {/* ── Section: Photos ── */}
      <FormSection title="Photos">
        <div style={{ marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 12.5, color: INK, fontWeight: 550 }}>
              Property photos <span style={{ color: "#C0392B" }}>*</span>
            </span>
            <span style={{ fontSize: 11.5, color: MUT }}>0 / 5 minimum</span>
          </div>
          {/* Empty upload zone */}
          <div style={{ border: `2px dashed ${HAIR}`, borderRadius: 8, background: GRD, padding: "36px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 28, opacity: 0.35 }}>🖼️</span>
            <p style={{ fontSize: 13, color: MUT, margin: 0, textAlign: "center" as const }}>
              Drag photos here or <span style={{ color: ACC, cursor: "pointer" }}>browse files</span>
            </p>
            <p style={{ fontSize: 11.5, color: MUT, margin: 0 }}>JPG or PNG · at least 1200 × 800 · 5 MB max per file</p>
          </div>
          {/* Warn */}
          <div style={{ marginTop: 8, background: WARN_BG, border: `1px solid ${WARN_LINE}`, borderRadius: 5, padding: "7px 11px", fontSize: 12, color: WARN_INK }}>
            ⚠ No photos yet — a listing without photos has a 90 % lower booking rate. Add at least 5 before submitting.
          </div>
        </div>
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

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 8, padding: "18px 20px", marginBottom: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: MUT, textTransform: "uppercase" as const, letterSpacing: "0.07em", margin: 0 }}>{title}</p>
      {children}
    </div>
  );
}

function Field({ label, required, hint, warn, missing, children }: { label: string; required?: boolean; hint?: string; warn?: string; missing?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
        <span style={{ fontSize: 12.5, fontWeight: 550, color: INK }}>{label}</span>
        {required && <span style={{ color: "#C0392B", fontSize: 12 }}>*</span>}
        {hint && !warn && <span style={{ fontSize: 11.5, color: MUT, marginLeft: "auto" }}>{hint}</span>}
        {warn && <span style={{ fontSize: 11.5, color: WARN_INK, marginLeft: "auto" }}>{warn}</span>}
      </div>
      {children}
      {missing && (
        <span style={{ fontSize: 12, color: "#C0392B" }}>✕ {missing}</span>
      )}
    </div>
  );
}

function Input({ value, placeholder }: { value?: string; placeholder?: string }) {
  return (
    <input
      defaultValue={value}
      placeholder={placeholder}
      style={{ ...inputStyle(), borderColor: !value ? "#F5C6C2" : HAIR }}
    />
  );
}

function Select({ value }: { value: string }) {
  return (
    <select defaultValue={value} style={{ ...inputStyle() }}>
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
