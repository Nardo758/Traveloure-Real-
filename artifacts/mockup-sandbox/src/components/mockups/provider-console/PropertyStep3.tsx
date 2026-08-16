// Property wizard — Step 3: Review
// Full submission checklist — what's complete, what's missing, and why it matters.
// Submit is disabled until all required items are ✓.
// Shows 3 required blockers + 3 recommended gaps that don't block submission.

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

const PROPERTY_CHECKS = [
  { ok: true,  req: true,  label: "Property name",       detail: "Machiya Kikuya",                             fix: "" },
  { ok: true,  req: true,  label: "Property type",       detail: "Machiya (traditional townhouse)",            fix: "" },
  { ok: true,  req: true,  label: "Address",             detail: "285 Gion-machi Minamigawa, Kyoto",          fix: "" },
  { ok: false, req: true,  label: "Postcode",            detail: "Missing — needed for tax paperwork.",        fix: "Add postcode →" },
  { ok: false, req: false, label: "Cover photos",        detail: "0 of 5 minimum. Add photos before launch.", fix: "Upload photos →" },
  { ok: false, req: false, label: "Full description",    detail: "47 words — aim for 100+ to convert better.",fix: "Expand description →" },
  { ok: true,  req: false, label: "House rules",         detail: "Present",                                    fix: "" },
  { ok: true,  req: false, label: "Amenities",           detail: "6 selected — inherited by every room.",      fix: "" },
];

const ROOM_CHECKS = [
  {
    room: "The Tatami Room",
    checks: [
      { ok: true,  req: true,  label: "Name",        detail: "The Tatami Room",  fix: "" },
      { ok: true,  req: true,  label: "Base price",  detail: "¥180 / night",     fix: "" },
      { ok: false, req: true,  label: "Photos",      detail: "0 uploaded — required before listing can be reviewed.", fix: "Upload photos →" },
      { ok: false, req: false, label: "Description", detail: "Empty.",                                               fix: "Add description →" },
    ],
  },
  {
    room: "Engawa Suite",
    checks: [
      { ok: true,  req: true,  label: "Name",        detail: "Engawa Suite",     fix: "" },
      { ok: false, req: true,  label: "Base price",  detail: "Not set — required to enable booking.",              fix: "Set price →" },
      { ok: true,  req: true,  label: "Photos",      detail: "4 uploaded",        fix: "" },
      { ok: true,  req: false, label: "Description", detail: "Present",           fix: "" },
    ],
  },
  {
    room: "Kura Studio",
    checks: [
      { ok: true, req: true,  label: "Name",        detail: "Kura Studio",      fix: "" },
      { ok: true, req: true,  label: "Base price",  detail: "¥135 / night",     fix: "" },
      { ok: true, req: true,  label: "Photos",      detail: "6 uploaded",       fix: "" },
      { ok: true, req: false, label: "Description", detail: "Present",          fix: "" },
    ],
  },
];

const totalBlockers = [
  ...(PROPERTY_CHECKS.filter(c => !c.ok && c.req)),
  ...ROOM_CHECKS.flatMap(r => r.checks.filter(c => !c.ok && c.req).map(c => ({ ...c, room: r.room }))),
].length;

export function PropertyStep3() {
  return (
    <Shell step={3} title="Review" subtitle="Check every required field before submitting. Blockers must be resolved — recommended items can be added any time.">

      <Stepper active={3} />

      {/* Submission state banner */}
      {totalBlockers > 0 ? (
        <div style={{ background: ERR_BG, border: `1px solid ${ERR_LINE}`, borderRadius: 8, padding: "14px 18px", display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 20 }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>✕</span>
          <div>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: ERR_INK, margin: "0 0 3px" }}>
              {totalBlockers} required field{totalBlockers !== 1 ? "s" : ""} still missing
            </p>
            <p style={{ fontSize: 12.5, color: ERR_INK, margin: 0, lineHeight: 1.5 }}>
              Resolve all blockers below to enable the submit button. Recommended items don't block submission.
            </p>
          </div>
        </div>
      ) : (
        <div style={{ background: OK_BG, border: `1px solid ${OK_LINE}`, borderRadius: 8, padding: "14px 18px", display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 18, color: OK_INK }}>✓</span>
          <p style={{ fontSize: 13.5, fontWeight: 700, color: OK_INK, margin: 0 }}>All required fields complete — ready to submit</p>
        </div>
      )}

      {/* ── Property checks ── */}
      <ReviewSection title="Property" editLink="Edit property →">
        {PROPERTY_CHECKS.map(c => <CheckRow key={c.label} {...c} />)}
      </ReviewSection>

      {/* ── Room checks ── */}
      {ROOM_CHECKS.map(r => (
        <ReviewSection key={r.room} title={`Room — ${r.room}`} editLink="Edit room →">
          {r.checks.map(c => <CheckRow key={c.label} {...c} />)}
        </ReviewSection>
      ))}

      {/* ── What happens next ── */}
      <div style={{ background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 8, padding: "18px 20px", marginBottom: 20 }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: MUT, textTransform: "uppercase" as const, letterSpacing: "0.07em", margin: "0 0 10px" }}>What happens next</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            ["🔍", "Our team reviews the property within 2–3 business days."],
            ["📩", "You'll get an email when it's approved or if we need more information."],
            ["📅", "Once approved, go to Availability to publish date windows so travelers can book."],
          ].map(([icon, text]) => (
            <div key={text as string} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
              <span style={{ fontSize: 12.5, color: MUT, lineHeight: 1.5 }}>{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer nav */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Btn>← Back to rooms</Btn>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {totalBlockers > 0 && (
            <span style={{ fontSize: 12, color: ERR_INK }}>
              Resolve {totalBlockers} blocker{totalBlockers !== 1 ? "s" : ""} to unlock
            </span>
          )}
          <Btn accent disabled={totalBlockers > 0}>
            Submit for review {totalBlockers > 0 ? "🔒" : "→"}
          </Btn>
        </div>
      </div>

    </Shell>
  );
}

// ── primitives ───────────────────────────────────────────────────────────────

function ReviewSection({ title, editLink, children }: { title: string; editLink: string; children: React.ReactNode }) {
  return (
    <div style={{ background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", borderBottom: `1px solid ${HAIR}`, background: GRD }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: INK }}>{title}</span>
        <button style={{ fontSize: 12, color: ACC, background: "none", border: "none", cursor: "pointer" }}>{editLink}</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>{children}</div>
    </div>
  );
}

function CheckRow({ ok, req, label, detail, fix }: { ok: boolean; req: boolean; label: string; detail: string; fix: string }) {
  const bg = !ok && req ? ERR_BG : !ok && !req ? WARN_BG : PAPER;
  const border = !ok && req ? `1px solid ${ERR_LINE}` : !ok && !req ? `1px solid ${WARN_LINE}` : `1px solid ${HAIR}`;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 16px", borderBottom: border, background: bg, gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 120, flexShrink: 0 }}>
        <span style={{ fontSize: 13, color: ok ? OK_INK : req ? ERR_INK : WARN_INK }}>
          {ok ? "✓" : req ? "✕" : "⚠"}
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 550, color: ok ? INK : req ? ERR_INK : WARN_INK }}>
          {label}{req && !ok ? "" : ""}{!req && <span style={{ fontSize: 10.5, color: MUT, fontWeight: 400, marginLeft: 4 }}>recommended</span>}
        </span>
      </div>
      <span style={{ fontSize: 12.5, color: ok ? MUT : req ? ERR_INK : WARN_INK, flex: 1, lineHeight: 1.4 }}>{detail}</span>
      {fix && (
        <button style={{ fontSize: 12, fontWeight: 600, color: req ? ERR_INK : WARN_INK, background: "none", border: `1px solid ${req ? ERR_LINE : WARN_LINE}`, borderRadius: 5, padding: "4px 10px", cursor: "pointer", whiteSpace: "nowrap" as const, flexShrink: 0 }}>
          {fix}
        </button>
      )}
    </div>
  );
}

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
    <div style={{ display: "flex", marginBottom: 28, borderRadius: 8, background: PAPER, border: `1px solid ${HAIR}`, overflow: "hidden" }}>
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

function Btn({ children, accent, disabled }: { children: React.ReactNode; accent?: boolean; disabled?: boolean }) {
  return (
    <button disabled={disabled} style={{ fontSize: 13, fontWeight: 600, padding: "9px 20px", borderRadius: 7, cursor: disabled ? "not-allowed" : "pointer", border: `1px solid ${disabled ? HAIR : accent ? ACC : HAIR}`, background: disabled ? GRD : accent ? ACC : PAPER, color: disabled ? MUT : accent ? "#fff" : INK, fontFamily: "inherit", opacity: disabled ? 0.7 : 1 }}>
      {children}
    </button>
  );
}
