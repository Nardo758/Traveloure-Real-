// Create flow — Step 5 "Review & submit".
// Faithful replication of docs/design/provider-console-mockup/mockup.html
// (flow shell ~988-1086, body_review ~2401-2449). In-person flow, pin confirmed,
// free travel to 8 km, 3 route stops with 2 located, no cover photo yet.

const INK = "#1A1A18";
const MUTED = "#7A7A72";
const HAIR = "#E8E8E2";
const GROUND = "#FAFAF8";
const PAPER = "#FFFFFF";
const ACCENT = "#35605A";
const ACCENT_SOFT = "#EDF2F1";
const WARN_BG = "#FBF6EC";
const WARN_LINE = "#D9C79A";
const WARN_INK = "#6B551F";
const AMBER = "#8A6A22";

/* ── shared shell pieces ─────────────────────────────────────────────── */

function BrandGlobe() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke={ACCENT} strokeWidth="1.7" />
      <path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" stroke={ACCENT} strokeWidth="1.5" />
    </svg>
  );
}

function NavItem({ gl, label, on, proposed, newdot }: { gl: string; label: string; on?: boolean; proposed?: boolean; newdot?: string }) {
  return (
    <button
      type="button"
      className="flex w-full cursor-pointer items-center gap-[9px] rounded-[5px] px-2 py-[7px] text-left text-[13px]"
      style={{
        color: on ? ACCENT : INK,
        background: on ? ACCENT_SOFT : "none",
        fontWeight: on ? 600 : 400,
        border: proposed ? "1px dashed #BFD5D0" : "1px solid transparent",
        boxShadow: on ? "inset 0 0 0 1px #CBDAD7" : undefined,
      }}
    >
      <span className="w-[15px] flex-[0_0_15px] text-center text-[12px]" style={{ color: on ? ACCENT : MUTED }}>{gl}</span>
      {label}
      {newdot && (
        <span
          className="ml-auto flex h-[15px] w-[15px] items-center justify-center rounded-full text-[9px]"
          style={{ background: ACCENT_SOFT, border: "1px solid #CBDAD7", color: ACCENT }}
          title="proposed new nav entry"
        >
          {newdot}
        </span>
      )}
    </button>
  );
}

function Shell({ crumbs, children }: { crumbs: { label: string; now?: boolean }[]; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen" style={{ gridTemplateColumns: "216px minmax(0,1fr)", background: GROUND, color: INK, fontFamily: 'system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif', fontSize: 14, lineHeight: 1.5 }}>
      <aside className="sticky top-0 flex h-screen flex-col overflow-y-auto" style={{ background: PAPER, borderRight: `1px solid ${HAIR}`, padding: "16px 12px" }}>
        <div className="flex items-center gap-[9px] pb-[18px] pl-2 pr-2 pt-[2px] text-[15px]" style={{ fontWeight: 650, letterSpacing: "-.01em" }}>
          <BrandGlobe />
          Traveloure
        </div>
        <nav>
          <div className="px-2 pb-[5px] pt-[14px] text-[10.5px] font-semibold uppercase" style={{ letterSpacing: ".07em", color: MUTED }}>Work</div>
          <NavItem gl="◇" label="Dashboard" />
          <NavItem gl="▤" label="Calendar" />
          <NavItem gl="✉" label="Inbox" />
          <NavItem gl="⚒" label="Workstation" on />
          <div className="px-2 pb-[5px] pt-[14px] text-[10.5px] font-semibold uppercase" style={{ letterSpacing: ".07em", color: MUTED }}>Business</div>
          <NavItem gl="▦" label="Catalog" />
          <NavItem gl="↗" label="Distribute" proposed newdot="⑧" />
          <NavItem gl="☺" label="Customers" />
          <NavItem gl="↑" label="Performance" />
          <NavItem gl="$" label="Money" />
          <div className="px-2 pb-[5px] pt-[14px] text-[10.5px] font-semibold uppercase" style={{ letterSpacing: ".07em", color: MUTED }}>Account</div>
          <NavItem gl="⚙" label="Settings" />
          <NavItem gl="▣" label="Playbook" />
        </nav>
        <div className="mt-auto px-2 pb-1 pt-[14px] text-[11px]" style={{ borderTop: `1px solid ${HAIR}`, color: MUTED, lineHeight: 1.5 }}>
          Provider console — proposed structure.<br />
          <b style={{ color: INK }}>Distribute</b> is the one new entry.
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <div className="flex flex-wrap items-center gap-3" style={{ background: PAPER, borderBottom: `1px solid ${HAIR}`, padding: "11px 26px" }}>
          <span className="flex h-[29px] w-[29px] flex-[0_0_29px] items-center justify-center rounded-full text-[11px]" style={{ background: ACCENT_SOFT, border: "1px solid #CBDAD7", color: ACCENT, fontWeight: 650 }} aria-hidden="true">AT</span>
          <span>
            <b className="block text-[13.5px]" style={{ fontWeight: 650, lineHeight: 1.25 }}>Aiko Tanaka</b>
            <span className="block text-[12px]" style={{ color: MUTED, lineHeight: 1.3 }}>Machiya Kikuya · Gion, Kyoto · Provider</span>
          </span>
          <span className="ml-auto rounded-full text-[10.5px] uppercase" style={{ letterSpacing: ".06em", color: MUTED, border: `1px solid ${HAIR}`, padding: "3px 11px", background: GROUND }}>Mock — not connected to live data</span>
          <button type="button" className="cursor-pointer whitespace-nowrap rounded-[6px] text-[12.5px]" style={{ background: "transparent", color: INK, border: `1px solid ${HAIR}`, padding: "6px 11px", fontWeight: 550 }}>Mock notes</button>
        </div>

        <div style={{ background: PAPER, borderBottom: `1px solid ${HAIR}`, padding: "9px 26px", fontSize: "12.5px" }}>
          <div className="flex flex-wrap items-center gap-[7px]" style={{ color: MUTED }}>
            {crumbs.map((c, i) => (
              <span key={c.label} className="flex items-center gap-[7px]">
                {i > 0 && <span style={{ color: "#C4C4BC" }}>›</span>}
                {c.now ? (
                  <span style={{ color: INK, fontWeight: 600 }}>{c.label}</span>
                ) : (
                  <button type="button" className="cursor-pointer text-[12.5px] underline" style={{ background: "none", border: "none", padding: 0, color: ACCENT, textUnderlineOffset: 2 }}>{c.label}</button>
                )}
              </span>
            ))}
          </div>
        </div>

        <div className="w-full" style={{ padding: "22px 26px 76px", maxWidth: 1180 }}>{children}</div>
      </div>
    </div>
  );
}

/* ── step list (in-person flow) ──────────────────────────────────────── */

const IN_PERSON_STEPS = ["Basics", "Scheduling", "Capacity", "Logistics", "Review & submit"];

function StepList({ current }: { current: number }) {
  return (
    <aside className="sticky top-4 rounded-[7px] p-[14px]" style={{ background: PAPER, border: `1px solid ${HAIR}` }}>
      <h5 className="mb-3 text-[11px] font-semibold uppercase" style={{ letterSpacing: ".07em", color: MUTED }}>Steps</h5>
      <ol className="list-none">
        {IN_PERSON_STEPS.map((label, i) => {
          const cur = i === current;
          const done = i < current;
          return (
            <li
              key={label}
              className="flex cursor-pointer items-start gap-[10px] rounded-[6px] px-[6px] py-2 text-[13px]"
              style={{
                color: cur || done ? INK : MUTED,
                fontWeight: cur ? 600 : 400,
                background: cur ? ACCENT_SOFT : "transparent",
              }}
            >
              <span
                className="flex h-5 w-5 flex-[0_0_20px] items-center justify-center rounded-full text-[11px]"
                style={{
                  border: `1px solid ${cur ? ACCENT : done ? INK : HAIR}`,
                  background: cur ? ACCENT : done ? INK : PAPER,
                  color: cur || done ? "#fff" : undefined,
                }}
              >
                {done ? "✓" : i + 1}
              </span>
              <span>{label}</span>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 pt-[11px] text-[12px]" style={{ borderTop: `1px solid ${HAIR}`, color: MUTED }}>
        <b>5 steps</b> for “In person”. Scheduling, Capacity and the new <b>Logistics</b> step (4th) are here because this method happens somewhere.
      </div>
      <div className="mt-3 rounded-[6px] text-[11.5px]" style={{ background: GROUND, border: `1px dashed ${HAIR}`, padding: "11px 14px", color: MUTED, lineHeight: 1.5 }}>
        The step list is generated from the delivery method. Nothing here is a fixed 4-step wizard.
      </div>
    </aside>
  );
}

/* ── summary rows ────────────────────────────────────────────────────── */

function SumRow({ k, v, last }: { k: React.ReactNode; v: React.ReactNode; last?: boolean }) {
  return (
    <div className="flex flex-wrap gap-[14px] py-[9px] text-[13px]" style={{ borderBottom: last ? "none" : `1px solid ${HAIR}` }}>
      <div className="w-[180px] flex-[0_0_180px]" style={{ color: MUTED }}>{k}</div>
      <div className="min-w-[200px] flex-1">{v}</div>
    </div>
  );
}

/* ── the frame ───────────────────────────────────────────────────────── */

export default function CreateReview() {
  return (
    <Shell crumbs={[{ label: "Workstation" }, { label: "New service" }, { label: "Step 5 · Review & submit", now: true }]}>
      <button type="button" className="mb-[14px] inline-block cursor-pointer border-none bg-transparent text-[13px] underline" style={{ color: ACCENT, textUnderlineOffset: 2 }}>
        ← Back to “What are you building?”
      </button>

      <div className="grid items-start gap-[22px]" style={{ gridTemplateColumns: "236px minmax(0,1fr)" }}>
        <StepList current={4} />

        <main className="min-w-0">
          <div className="rounded-[7px]" style={{ background: PAPER, border: `1px solid ${HAIR}` }}>
            {/* card header */}
            <div className="flex flex-wrap items-center gap-[10px]" style={{ padding: "14px 22px", borderBottom: `1px solid ${HAIR}` }}>
              <h3 className="text-[15px] font-semibold">Review &amp; submit</h3>
              <span className="inline-block rounded-full text-[11.5px]" style={{ padding: "2px 9px", border: "1px solid #D9CDB2", background: WARN_BG, color: WARN_INK }}>Draft · autosaved</span>
              <span className="ml-auto text-[12px]" style={{ color: MUTED }}>Step 5 of 5</span>
            </div>

            {/* step body */}
            <div style={{ padding: "20px 22px" }}>
              <div className="rounded-[7px]" style={{ background: PAPER }}>
                <SumRow
                  k="Offering"
                  v={
                    <>
                      Tea ceremony &amp; cultural ritual{" "}
                      <span className="inline-block rounded-full text-[11.5px]" style={{ marginLeft: 6, padding: "2px 9px", border: `1px solid ${HAIR}`, background: GROUND, color: MUTED }}>
                        Arts &amp; Crafts Instruction
                      </span>
                    </>
                  }
                />
                <SumRow k="Name" v="Morning Tea Ceremony in a Machiya Townhouse" />
                <SumRow
                  k="Delivery"
                  v={
                    <>
                      In person <span style={{ color: MUTED }}>· Place-anchored</span>
                    </>
                  }
                />
                <SumRow
                  k="Price"
                  v={
                    <>
                      $68 per person <span style={{ color: MUTED }}>· surcharges and deposit not set (optional)</span>
                    </>
                  }
                />
                <SumRow
                  k={
                    <>
                      Where <span style={{ color: MUTED }}>· step 4, Logistics</span>
                    </>
                  }
                  v="Hanamikoji-dori, Gion, Kyoto · pin confirmed · free travel to 8 km"
                />
                <SumRow
                  k="Route stops"
                  v={
                    <>
                      3 stops · 2 of 3 located <span style={{ color: AMBER }}>· unlocated stops will not appear on the map</span>
                    </>
                  }
                />
                <SumRow k="Cover photo" v={<span style={{ color: AMBER }}>Not added yet</span>} last />
              </div>

              <div className="rounded-[6px] text-[12.5px]" style={{ marginTop: 18, background: WARN_BG, border: `1px solid ${WARN_LINE}`, color: WARN_INK, padding: "11px 14px", lineHeight: 1.5 }}>
                <b style={{ fontWeight: 650 }}>What happens when you submit.</b> Our team reviews the listing before it goes live — usually within 2 business days. Until then it stays a draft on your Catalog and no traveler can see or book it. You can keep editing while it waits.
              </div>

              <div className="flex flex-wrap items-center gap-[10px]" style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="cursor-pointer rounded-[6px] text-[14.5px] text-white"
                  style={{ background: ACCENT, border: `1px solid ${ACCENT}`, padding: "12px 22px", fontWeight: 550 }}
                >
                  Submit for review
                  <span
                    className="ml-[6px] inline-flex h-[17px] w-[17px] items-center justify-center rounded-full align-middle text-[11px]"
                    style={{ background: "#fff", color: ACCENT, fontWeight: 600, lineHeight: 1 }}
                  >
                    ⑤
                  </span>
                </button>
                <button
                  type="button"
                  className="cursor-pointer rounded-[6px] text-[13.5px]"
                  style={{ background: "transparent", color: INK, border: `1px solid ${HAIR}`, padding: "9px 16px", fontWeight: 550 }}
                >
                  Save and finish later
                </button>
                <span className="text-[12.5px]" style={{ color: MUTED }}>Nothing here says “Publish” — because clicking it does not publish anything.</span>
              </div>

              <div className="rounded-[6px] text-[12.5px]" style={{ marginTop: 16, background: GROUND, border: `1px dashed ${HAIR}`, padding: "11px 14px", color: MUTED, lineHeight: 1.5 }}>
                There is no disabled button and no red asterisk on this screen. If something is missing, it is listed by name on the listing home checklist, and you can still submit — review will tell you if it is not enough.
              </div>
            </div>

            {/* flow footer — on review the Next button is hidden */}
            <div style={{ padding: "0 22px 20px" }}>
              <div className="flex flex-wrap items-center gap-[10px]" style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${HAIR}` }}>
                <button type="button" className="cursor-pointer rounded-[6px] text-[13.5px]" style={{ background: "transparent", color: INK, border: `1px solid ${HAIR}`, padding: "9px 16px", fontWeight: 550 }}>← Back</button>
                <span className="ml-auto" />
              </div>
            </div>
          </div>
        </main>
      </div>
    </Shell>
  );
}
