// Distribute — Section 5: Promote (posting opportunities with inline share actions)
// Real, review/open-slot-scoped nudges — no invented opportunities (§13)

const ACC = "#35605A";
const INK = "#1A1A18";
const MUT = "#7A7A72";
const HAIR = "#E8E8E2";
const GRD = "#FAFAF8";
const PAPER = "#FFFFFF";

const OPPORTUNITIES = [
  {
    id: "opp1",
    tag: "Seasonal",
    urgency: "3 weeks away",
    title: "Golden Week is coming (May 3–5)",
    body: "Golden Week is one of Japan's busiest travel periods. Post your Gion Food Walk now to capture early bookings from travellers planning ahead.",
    listing: "Gion Evening Food Walk",
    caption: `🎏 Golden Week in Kyoto — join my Gion Evening Food Walk and taste the city before the crowds descend.\n\nBook at traveloure.com/r/gion-fw-at`,
  },
  {
    id: "opp2",
    tag: "Event",
    urgency: "6 weeks away",
    title: "Cherry blossom season — Kyoto openings",
    body: "Sakura season is the most searched travel moment in Japan. Promote your Kimono Dressing & Gion Photo Walk while intent is at its peak.",
    listing: "Kimono Dressing & Gion Photo Walk",
    caption: `🌸 Cherry blossom season in Kyoto — capture the moment in a full kimono with a local photographer.\n\nBook at traveloure.com/r/kimono-gion`,
  },
  {
    id: "opp3",
    tag: "Open slot",
    urgency: "This Saturday",
    title: "You have an open slot this Saturday",
    body: "You have availability on Saturday 22 March that hasn't been booked yet. A quick post can fill it.",
    listing: "Kyoto Trip Planning Call",
    caption: `📅 Last-minute availability! Book a Kyoto planning call this Saturday and arrive with a personalised itinerary.\n\ntraveloure.com/r/kyoto-call`,
  },
];

export function DistributePromote() {
  return (
    <div style={{ background: GRD, minHeight: "100vh", fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif", color: INK, padding: "28px 28px" }}>
      <div style={{ maxWidth: 780, margin: "0 auto" }}>

        <h2 style={{ fontSize: 16, fontWeight: 700, color: INK, margin: "0 0 4px", letterSpacing: "-0.01em" }}>
          Distribute — Promote
        </h2>
        <p style={{ fontSize: 12.5, color: MUT, margin: "0 0 22px", lineHeight: 1.5 }}>
          Real posting nudges tied to seasons, events, and your open slots — each with ready-to-post copy and one-tap share actions.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {OPPORTUNITIES.map((opp) => (
            <div key={opp.id} style={{ background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: `1px solid ${HAIR}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                    <TagChip tag={opp.tag} />
                    <span style={{ fontSize: 11.5, color: MUT }}>{opp.urgency}</span>
                    <span style={{ fontSize: 11, color: MUT }}>·</span>
                    <span style={{ fontSize: 11, color: MUT, fontStyle: "italic" }}>{opp.listing}</span>
                  </div>
                  <p style={{ fontSize: 13.5, fontWeight: 600, color: INK, margin: 0 }}>{opp.title}</p>
                </div>
                <button style={{ fontSize: 11.5, color: MUT, background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}>Dismiss</button>
              </div>
              <div style={{ padding: "14px 18px" }}>
                <p style={{ fontSize: 12.5, color: MUT, margin: "0 0 12px", lineHeight: 1.5 }}>{opp.body}</p>
                <div style={{ background: GRD, border: `1px solid ${HAIR}`, borderRadius: 6, padding: "10px 12px", marginBottom: 12 }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: MUT, textTransform: "uppercase" as const, letterSpacing: "0.07em", margin: "0 0 6px" }}>
                    Ready-to-post caption
                  </p>
                  <p style={{ fontSize: 12.5, color: INK, margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap" as const }}>{opp.caption}</p>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                  <Btn>Copy caption + link</Btn>
                  <Btn>WhatsApp</Btn>
                  <Btn>Post to X</Btn>
                  <Btn accent>📸 Publish to Instagram</Btn>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16, borderRadius: 6, border: `1px dashed ${HAIR}`, background: GRD, padding: "10px 14px", fontSize: 12, color: MUT, lineHeight: 1.5 }}>
          <strong style={{ color: INK }}>Measurement stays on Performance.</strong>{" "}
          This page makes the asset and hands you the link; how it did is a question the analytics module answers.
        </div>

      </div>
    </div>
  );
}

function TagChip({ tag }: { tag: string }) {
  const map: Record<string, { bg: string; color: string; border: string }> = {
    Seasonal:    { bg: "#EDF2F1", color: ACC, border: "#BFD5D0" },
    Event:       { bg: "#F0F4FF", color: "#3352CC", border: "#C5D0F5" },
    "Open slot": { bg: "#FBF6EC", color: "#6B551F", border: "#D9C79A" },
  };
  const s = map[tag] ?? { bg: "#F5F5F3", color: MUT, border: HAIR };
  return (
    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, border: `1px solid ${s.border}`, background: s.bg, color: s.color, fontWeight: 600 }}>
      {tag}
    </span>
  );
}

function Btn({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <button style={{ fontSize: 12.5, padding: "7px 13px", borderRadius: 6, cursor: "pointer", border: `1px solid ${accent ? ACC : HAIR}`, background: accent ? ACC : PAPER, color: accent ? PAPER : INK, fontFamily: "inherit" }}>
      {children}
    </button>
  );
}
