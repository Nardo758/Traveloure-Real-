// Create flow — Step 4 "Logistics" with the full map-authoring component.
// Faithful replication of docs/design/provider-console-mockup/mockup.html
// (flow shell ~988-1086, body_logistics ~2122-2151, map drawing ~4121-4329).

import { useState } from "react";

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

function Dot({ children, ghost, style }: { children: React.ReactNode; ghost?: boolean; style?: React.CSSProperties }) {
  return (
    <span
      className="ml-[6px] inline-flex h-[17px] w-[17px] items-center justify-center rounded-full text-[11px] align-middle"
      style={{
        background: ghost ? ACCENT_SOFT : ACCENT,
        color: ghost ? ACCENT : "#fff",
        border: ghost ? "1px solid #CBDAD7" : undefined,
        fontWeight: 600,
        lineHeight: 1,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/* ── map drawing (ports of baseMapSvg / connectorSvg / pinSvg) ───────── */

function BaseMapSvg({ seedShift = 0 }: { seedShift?: number }) {
  const vlines: React.ReactNode[] = [];
  for (let x = 30 + seedShift; x < 700; x += 58) {
    vlines.push(<line key={`v${x}`} x1={x} y1={0} x2={x - 30} y2={300} stroke="#E2E0D6" strokeWidth={8} />);
  }
  const hlines: React.ReactNode[] = [];
  for (let y = 28; y < 300; y += 44) {
    hlines.push(<line key={`h${y}`} x1={0} y1={y} x2={700} y2={y + 12} stroke="#E6E4DA" strokeWidth={5} />);
  }
  return (
    <svg className="block h-full w-full" viewBox="0 0 700 300" preserveAspectRatio="none" aria-hidden="true">
      <rect width="700" height="300" fill="#F2F1EB" />
      {vlines}
      {hlines}
      <path d="M0 224 C 150 196, 280 262, 440 212 S 650 168, 700 190 L700 300 L0 300 Z" fill="#E3E9E8" />
      <rect x="470" y="36" width="140" height="86" rx="7" fill="#E4E9DF" />
      <rect x="62" y="44" width="96" height="62" rx="6" fill="#EBE8DE" />
      <rect x="228" y="140" width="88" height="54" rx="6" fill="#EBE8DE" />
    </svg>
  );
}

function ConnectorSvg({ pts }: { pts: { x: number; y: number }[] }) {
  if (pts.length < 2) return <svg aria-hidden="true" />;
  return (
    <svg className="block h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {pts.slice(0, -1).map((p, i) => (
        <line
          key={i}
          x1={p.x}
          y1={p.y}
          x2={pts[i + 1].x}
          y2={pts[i + 1].y}
          stroke="#35605A"
          strokeWidth={1.6}
          strokeDasharray="5 4"
          vectorEffect="non-scaling-stroke"
          opacity={0.85}
        />
      ))}
    </svg>
  );
}

function PinSvg({ confirmed }: { confirmed: boolean }) {
  return confirmed ? (
    <svg width="26" height="34" viewBox="0 0 26 34" fill="none" aria-hidden="true">
      <path d="M13 33s11-12.4 11-20A11 11 0 102 13c0 7.6 11 20 11 20z" fill="#35605A" />
      <circle cx="13" cy="13" r="4.1" fill="#FAFAF8" />
    </svg>
  ) : (
    <svg width="26" height="34" viewBox="0 0 26 34" fill="none" aria-hidden="true">
      <path d="M13 33s11-12.4 11-20A11 11 0 102 13c0 7.6 11 20 11 20z" fill="#FAFAF8" stroke="#35605A" strokeWidth="2" strokeDasharray="4 3" />
      <circle cx="13" cy="13" r="3.6" fill="#35605A" opacity=".45" />
    </svg>
  );
}

/* ── small helpers ───────────────────────────────────────────────────── */

function LayerToggle({ on, disabled, label }: { on: boolean; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-disabled={disabled}
      className="flex w-full cursor-pointer items-center gap-[9px] border-none bg-transparent p-0 text-left text-[12.5px]"
      style={disabled ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
    >
      <span className="relative h-[17px] w-[30px] flex-[0_0_30px] rounded-full" style={{ background: on ? ACCENT : HAIR }}>
        <span
          className="absolute top-[2px] h-[13px] w-[13px] rounded-full bg-white"
          style={{ left: 2, boxShadow: "0 1px 2px rgba(0,0,0,.2)", transform: on ? "translateX(13px)" : undefined }}
        />
      </span>
      <span className="flex-1">{label}</span>
    </button>
  );
}

function LinkBtn({ children, muted, style }: { children: React.ReactNode; muted?: boolean; style?: React.CSSProperties }) {
  return (
    <button type="button" className="cursor-pointer border-none bg-transparent p-0 text-[13px] underline" style={{ color: muted ? MUTED : ACCENT, textUnderlineOffset: 2, fontWeight: 500, ...style }}>
      {children}
    </button>
  );
}

/* ── data for this frame's default state ─────────────────────────────── */

const PIN = { x: 44, y: 48 };
const STOPS: { name: string; x: number | null; y: number | null }[] = [
  { name: "Gion-Shijo station, north exit", x: 20, y: 66 },
  { name: "The machiya — Hanamikoji-dori", x: 47, y: 45 },
  { name: "Yasaka shrine tea garden", x: null, y: null },
];
const RADIUS_KM = 8;

/* ── the frame ───────────────────────────────────────────────────────── */

export default function CreateLogistics() {
  const [confirmedPin, setConfirmedPin] = useState(PIN);
  const [pendingPin, setPendingPin] = useState<{ x: number; y: number } | null>(null);
  const [placingPin, setPlacingPin] = useState(false);
  const located = STOPS.filter((s) => s.x !== null) as { name: string; x: number; y: number }[];
  const radiusPx = 34 + RADIUS_KM * 6.2; // 83.6
  const displayCoordinates = (point: { x: number; y: number }) => ({
    lat: (35.0037 + (48 - point.y) * 0.001).toFixed(4),
    lng: (135.7788 + (point.x - 44) * 0.001).toFixed(4),
  });
  const confirmedCoordinates = displayCoordinates(confirmedPin);

  const capline: React.CSSProperties = { fontSize: "11.5px", color: MUTED, lineHeight: 1.55, marginTop: 8 };
  const ghostSm: React.CSSProperties = { background: "transparent", color: INK, border: `1px solid ${HAIR}`, padding: "6px 11px", fontSize: "12.5px", borderRadius: 6, cursor: "pointer", fontWeight: 550, whiteSpace: "nowrap", flex: "0 0 auto" };

  return (
    <Shell crumbs={[{ label: "Workstation" }, { label: "New service" }, { label: "Step 4 · Logistics", now: true }]}>
      <button type="button" className="mb-[14px] inline-block cursor-pointer border-none bg-transparent text-[13px] underline" style={{ color: ACCENT, textUnderlineOffset: 2 }}>
        ← Back to “What are you building?”
      </button>

      <div className="grid items-start gap-[22px]" style={{ gridTemplateColumns: "236px minmax(0,1fr)" }}>
        <StepList current={3} />

        <main className="min-w-0">
          <div className="rounded-[7px]" style={{ background: PAPER, border: `1px solid ${HAIR}` }}>
            {/* card header */}
            <div className="flex flex-wrap items-center gap-[10px]" style={{ padding: "14px 22px", borderBottom: `1px solid ${HAIR}` }}>
              <h3 className="text-[15px] font-semibold">Logistics — where it happens</h3>
              <span className="inline-block rounded-full text-[11.5px]" style={{ padding: "2px 9px", border: "1px solid #D9CDB2", background: WARN_BG, color: WARN_INK }}>Draft · autosaved</span>
              <span className="ml-auto text-[12px]" style={{ color: MUTED }}>Step 4 of 5</span>
            </div>

            {/* step body */}
            <div style={{ padding: "20px 22px" }}>
              <div className="mb-[18px] rounded-[6px] text-[12.5px]" style={{ background: GROUND, border: `1px dashed ${HAIR}`, padding: "11px 14px", color: MUTED, lineHeight: 1.5 }}>
                <b style={{ color: INK }}>One card, one vocabulary.</b> Today this is six questions spread across two steps and a separate page: Meeting Point, map pin, Service Area, Pickup, Drop-off, and route stops. Here it is one canvas with one rail.
                <Dot ghost>③</Dot>
                <Dot ghost>⑨</Dot>
              </div>

              <div className="mb-[18px] rounded-[6px] text-[12.5px]" style={{ background: WARN_BG, border: `1px solid ${WARN_LINE}`, color: WARN_INK, padding: "11px 14px", lineHeight: 1.5 }}>
                <b style={{ fontWeight: 650 }}>Moved here by the Aug 12 ruling.</b> Map authoring is a creation job, not a catalog job. Catalog keeps a read-only traveler preview — this amends the earlier “Catalog is the map’s authoring home” posture. Nothing about the write rails changed: one confirm-gated pin, stops as an ordered replace-list.
              </div>

              <button type="button" aria-pressed={false} className="flex cursor-pointer items-center gap-[10px] border-none bg-transparent py-[10px] text-left">
                <span className="relative h-5 w-9 flex-[0_0_36px] rounded-full" style={{ background: HAIR }}>
                  <span className="absolute left-[2px] top-[2px] h-4 w-4 rounded-full" style={{ background: PAPER, boxShadow: "0 1px 2px rgba(0,0,0,.2)" }} />
                </span>
                <span className="text-[13px]" style={{ fontWeight: 550 }}>I collect travelers and drop them back</span>
              </button>
              <div className="text-[12px]" style={{ color: MUTED, margin: "-4px 0 14px", lineHeight: 1.5 }}>
                Off by default. Pickup is a <b style={{ color: INK }}>spatial</b> question, so it lives on this step. How long the transfer takes is temporal — that stays in Scheduling. One transport question, one vocabulary, one step.
              </div>
            </div>

            {/* author host — the map-authoring component */}
            <div style={{ padding: "0 22px 20px" }}>
              <div style={{ height: 1, background: HAIR, margin: "2px 0 18px" }} />
              <div className="grid items-start gap-4" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
                <div className="min-w-0">
                  <div
                    className="relative overflow-hidden rounded-[7px]"
                    style={{ border: `1px solid ${HAIR}`, background: "#F1F0EA", height: 520, cursor: placingPin ? "crosshair" : "default" }}
                    onClick={(event) => {
                      if (!placingPin) return;
                      const bounds = event.currentTarget.getBoundingClientRect();
                      setPendingPin({
                        x: Math.max(4, Math.min(96, ((event.clientX - bounds.left) / bounds.width) * 100)),
                        y: Math.max(6, Math.min(93, ((event.clientY - bounds.top) / bounds.height) * 100)),
                      });
                      setPlacingPin(false);
                    }}
                  >
                    <div className="absolute inset-0"><BaseMapSvg /></div>

                    {/* overlay */}
                    <div className="pointer-events-none absolute inset-0">
                      {/* service radius ring around the confirmed pin */}
                      <div
                        className="absolute rounded-full"
                        style={{
                          left: `${confirmedPin.x}%`,
                          top: `${confirmedPin.y}%`,
                          width: radiusPx,
                          height: radiusPx,
                          transform: "translate(-50%,-50%)",
                          border: `1px dashed ${ACCENT}`,
                          background: "rgba(53,96,90,.08)",
                        }}
                      />
                      {/* connectors between located stops */}
                      <div className="absolute inset-0"><ConnectorSvg pts={located} /></div>
                      {/* stop bubbles */}
                      {located.map((s, i) => (
                        <div key={s.name} className="absolute" style={{ left: `${s.x}%`, top: `${s.y}%`, transform: "translate(-50%,-50%)" }}>
                          <div
                            className="flex h-[23px] w-[23px] items-center justify-center rounded-full text-[11.5px] text-white"
                            style={{ background: ACCENT, fontWeight: 650, border: "2px solid #FAFAF8", boxShadow: "0 1px 3px rgba(0,0,0,.25)" }}
                          >
                            {i + 1}
                          </div>
                        </div>
                      ))}
                      {/* the meeting pin (confirmed) */}
                      <div className="absolute" style={{ left: `${confirmedPin.x}%`, top: `${confirmedPin.y}%`, transform: "translate(-50%,-100%)" }}>
                        <PinSvg confirmed />
                        <span
                          className="absolute left-1/2 top-full mt-[3px] whitespace-nowrap rounded-full text-[10.5px]"
                          style={{ transform: "translateX(-50%)", background: "rgba(255,255,255,.95)", border: `1px solid ${HAIR}`, padding: "1px 8px", color: INK }}
                        >
                          Meeting point
                        </span>
                      </div>
                      {pendingPin && (
                        <div className="absolute" style={{ left: `${pendingPin.x}%`, top: `${pendingPin.y}%`, transform: "translate(-50%,-100%)" }}>
                          <PinSvg confirmed={false} />
                          <span
                            className="absolute left-1/2 top-full mt-[3px] whitespace-nowrap rounded-full text-[10.5px]"
                            style={{ transform: "translateX(-50%)", background: "rgba(255,255,255,.95)", border: `1px dashed ${ACCENT}`, padding: "1px 8px", color: ACCENT }}
                          >
                            Pending confirmation
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="absolute bottom-[9px] right-[9px] rounded-full text-[11px]" style={{ background: "rgba(255,255,255,.94)", border: `1px solid ${HAIR}`, padding: "3px 10px", color: MUTED }}>
                      Map preview — illustrative
                    </div>
                    <div className="absolute bottom-[6px] left-[9px] text-[10.5px]" style={{ color: "#8A8A80" }}>© OpenStreetMap contributors</div>

                    {/* armbar */}
                    <div
                      className="absolute flex flex-wrap items-center gap-[10px] rounded-[6px] text-[12.5px]"
                      style={{ left: 12, right: 12, top: 12, background: "rgba(255,255,255,.97)", border: `1px solid ${HAIR}`, padding: "9px 12px", boxShadow: "0 1px 4px rgba(26,26,24,.08)" }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <span className="min-w-[170px] flex-1">{placingPin ? "Meeting-pin mode armed — click the map." : "Nothing armed. Pick a mode, then click the map."}</span>
                      <button type="button" style={ghostSm} onClick={() => { setPendingPin(null); setPlacingPin((value) => !value); }}>
                        {placingPin ? "Cancel placement" : "Place the meeting pin"}
                      </button>
                      <button type="button" style={ghostSm}>Place a stop</button>
                      {pendingPin && (
                        <div className="flex w-full items-center gap-2 rounded-[5px] text-[12px]" style={{ background: ACCENT_SOFT, border: "1px solid #BFD5D0", padding: "7px 9px", color: INK }}>
                          <span className="flex-1">New meeting pin selected. Confirm it to update the card below.</span>
                          <button type="button" style={{ ...ghostSm, color: "#fff", background: ACCENT, borderColor: ACCENT, padding: "5px 9px" }} onClick={() => { setConfirmedPin(pendingPin); setPendingPin(null); }}>
                            Confirm this location
                          </button>
                          <button type="button" style={{ ...ghostSm, padding: "5px 9px" }} onClick={() => setPendingPin(null)}>Cancel</button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={capline}>
                    A <b style={{ color: INK }}>bare map click does nothing</b> — placing anything needs an explicitly armed mode, so panning and zooming never drop a stray pin. 2 of 3 stops located; unlocated stops stay in the list and off the map. Straight dashed connectors are the visiting <b style={{ color: INK }}>sequence, not travel routing</b>.
                  </div>
                </div>

                {/* rail: three cards */}
                <aside className="grid items-start gap-3" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}>
                  {/* Meeting pin */}
                  <div className="rounded-[7px]" style={{ background: PAPER, border: `1px solid ${HAIR}` }}>
                    <div className="flex items-center gap-2" style={{ padding: "11px 14px", borderBottom: `1px solid ${HAIR}` }}>
                      <b className="flex-1 text-[13px] font-semibold">Meeting pin</b>
                      <span className="inline-block rounded-full text-[11.5px]" style={{ padding: "2px 9px", border: "1px solid #BFD5D0", background: ACCENT_SOFT, color: ACCENT }}>{pendingPin ? "Pending change" : "Confirmed"}</span>
                    </div>
                    <div style={{ padding: "12px 14px" }}>
                      <input
                        className="w-full rounded-[6px]"
                        style={{ padding: "9px 11px", border: `1px solid ${HAIR}`, background: PAPER, color: INK, font: "inherit", fontSize: "12.5px" }}
                        defaultValue="Hanamikoji-dori, Gion, Higashiyama-ku, Kyoto"
                        aria-label="Meeting point address"
                      />
                      <div style={capline}>
                        A typed address is never a location. The pin is saved only when you press <b style={{ color: INK }}>Confirm this location</b> — the same posture the live picker already uses.
                      </div>
                      <div className="mt-[10px] text-[12px]" style={{ color: ACCENT }}>Confirmed at {confirmedCoordinates.lat}, {confirmedCoordinates.lng}.</div>
                      <button type="button" style={{ ...ghostSm, marginTop: 8 }}>Remove pin</button>
                    </div>
                  </div>

                  {/* Layers */}
                  <div className="rounded-[7px]" style={{ background: PAPER, border: `1px solid ${HAIR}` }}>
                    <div className="flex items-center gap-2" style={{ padding: "11px 14px", borderBottom: `1px solid ${HAIR}` }}>
                      <b className="flex-1 text-[13px] font-semibold">Layers</b>
                    </div>
                    <div className="flex flex-col gap-3" style={{ padding: "12px 14px" }}>
                      <LayerToggle on label="Service radius" />
                      <div>
                        <div style={{ marginLeft: 39 }}>
                          <input type="range" min={0} max={30} defaultValue={RADIUS_KM} aria-label="Service radius" className="w-full" style={{ accentColor: ACCENT }} />
                        </div>
                        <div style={{ ...capline, margin: "4px 0 0 39px" }}>
                          Included free up to <b style={{ color: INK }}>{RADIUS_KM} km</b>. One radius, one label.
                        </div>
                      </div>
                      <LayerToggle on label="Route stops" />
                      <LayerToggle on={false} label="Travel-surcharge zones" />
                      <div style={{ ...capline, marginTop: 0 }}>
                        Zones are <b style={{ color: INK }}>display only</b> here — the amounts are set in{" "}
                        <LinkBtn style={{ fontSize: "11.5px" }}>Pricing &amp; fees →</LinkBtn>
                      </div>
                    </div>
                  </div>

                  {/* Route stops */}
                  <div className="rounded-[7px]" style={{ background: PAPER, border: `1px solid ${HAIR}` }}>
                    <div className="flex items-center gap-2" style={{ padding: "11px 14px", borderBottom: `1px solid ${HAIR}` }}>
                      <b className="flex-1 text-[13px] font-semibold">Route stops</b>
                      <span className="inline-block rounded-full text-[11.5px]" style={{ padding: "2px 9px", border: `1px solid ${HAIR}`, background: GROUND, color: MUTED }}>2 of 3 located</span>
                    </div>
                    <div style={{ padding: "12px 14px" }}>
                      <div>
                        {STOPS.map((s, i) => {
                          const on = s.x !== null;
                          const num = on ? STOPS.slice(0, i + 1).filter((t) => t.x !== null).length : null;
                          return (
                            <div key={s.name} className="flex items-center gap-2 py-2" style={{ borderBottom: i < STOPS.length - 1 ? `1px solid ${HAIR}` : "none" }}>
                              <span
                                className="flex h-[19px] w-[19px] flex-[0_0_19px] items-center justify-center rounded-full text-[10.5px]"
                                style={
                                  on
                                    ? { background: ACCENT, color: "#fff", fontWeight: 650 }
                                    : { background: WARN_BG, color: WARN_INK, border: `1px solid ${WARN_LINE}`, fontWeight: 650 }
                                }
                              >
                                {on ? num : "–"}
                              </span>
                              <input
                                className="min-w-0 flex-1 rounded-[4px] text-[12.5px]"
                                style={{ border: "1px solid transparent", background: "none", padding: "3px 5px", font: "inherit", color: INK }}
                                defaultValue={s.name}
                                aria-label="Stop name"
                              />
                              <LinkBtn style={{ fontSize: "11.5px" }}>{on ? "Move" : "Place on map"}</LinkBtn>
                              <LinkBtn muted style={{ fontSize: "11.5px" }}>Remove</LinkBtn>
                            </div>
                          );
                        })}
                      </div>
                      <button type="button" style={{ ...ghostSm, marginTop: 10 }}>+ Add a stop</button>
                      <div style={capline}>
                        Connectors are straight dashed lines — <b style={{ color: INK }}>sequence, not travel routing</b>. No distance or duration is invented between stops.
                      </div>
                    </div>
                  </div>
                </aside>
              </div>
            </div>

            {/* flow footer */}
            <div style={{ padding: "0 22px 20px" }}>
              <div className="flex flex-wrap items-center gap-[10px]" style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${HAIR}` }}>
                <button type="button" className="cursor-pointer rounded-[6px] text-[13.5px]" style={{ background: "transparent", color: INK, border: `1px solid ${HAIR}`, padding: "9px 16px", fontWeight: 550 }}>← Back</button>
                <button type="button" className="cursor-pointer rounded-[6px] text-[13.5px] text-white" style={{ background: INK, border: `1px solid ${INK}`, padding: "9px 16px", fontWeight: 550 }}>Next: Review &amp; submit →</button>
                <span className="ml-auto" />
                <span className="text-[12px]" style={{ color: MUTED }}>Autosaved. Closing this tab keeps everything.</span>
              </div>
            </div>
          </div>
        </main>
      </div>
    </Shell>
  );
}
