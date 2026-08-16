// Workstation — Gap states
// What a provider sees before they've built anything:
//   • Bundle tile locked (needs 2+ approved+active services, currently has 1)
//   • Property tile available but empty
//   • No bundles yet — empty state
//   • No properties yet — empty state
//   • Ideas rail: new provider, no approved services yet
//   • Warn box on the locked Bundle tile explaining the gate

const ACC = "#35605A";
const INK = "#1A1A18";
const MUT = "#7A7A72";
const HAIR = "#E8E8E2";
const GRD = "#FAFAF8";
const PAPER = "#FFFFFF";
const WARN_BG = "#FBF6EC";
const WARN_LINE = "#D9C79A";
const WARN_INK = "#6B551F";
const LOCK_BG = "#F5F5F3";

export function WorkstationGaps() {
  return (
    <div style={{ background: GRD, minHeight: "100vh", fontFamily: "-apple-system,BlinkMacSystemFont,'Inter',sans-serif", color: INK }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 28px" }}>

        {/* Page header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 22 }}>🔧</span>
            <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em", margin: 0 }}>Workstation</h1>
          </div>
          <p style={{ fontSize: 13, color: MUT, margin: 0, maxWidth: "70ch", lineHeight: 1.55 }}>
            One door for building what you sell — a single service to start, then bundles and properties as your offering grows.
          </p>
        </div>

        {/* ── GAP 1: Creation door tiles — Bundle locked ── */}
        <GroupLabel>Create</GroupLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 6 }}>

          {/* Single service — available */}
          <DoorTile icon="🎫" title="Single service" cta="Create a service →" ctaColor={ACC}>
            A tour, experience, guide, call — anything you sell as a standalone offering.
          </DoorTile>

          {/* Bundle — LOCKED */}
          <div style={{
            border: `1px dashed ${HAIR}`, borderRadius: 7, background: LOCK_BG, padding: 20,
            textAlign: "left", minHeight: 172, display: "flex", flexDirection: "column",
            opacity: 0.88, cursor: "not-allowed",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 20 }}>📦</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: MUT, background: HAIR, borderRadius: 4, padding: "2px 7px", letterSpacing: "0.04em" }}>
                🔒 LOCKED
              </span>
            </div>
            <h4 style={{ fontSize: 15, fontWeight: 650, margin: "12px 0 5px", color: MUT }}>Bundle</h4>
            <p style={{ fontSize: 12.5, color: MUT, lineHeight: 1.5, margin: 0 }}>
              Group two or more of your approved services into one bookable package.
            </p>
            {/* Progress bar — 1 of 2 */}
            <div style={{ marginTop: "auto", paddingTop: 14 }}>
              <div style={{ height: 5, borderRadius: 100, background: HAIR, overflow: "hidden", marginBottom: 5 }}>
                <div style={{ height: "100%", width: "50%", background: MUT, borderRadius: 100 }} />
              </div>
              <span style={{ fontSize: 11.5, color: MUT }}>1 of 2 approved services needed</span>
            </div>
            {/* Warn box */}
            <div style={{ marginTop: 10, background: WARN_BG, border: `1px solid ${WARN_LINE}`, borderRadius: 5, padding: "7px 10px", fontSize: 12, color: WARN_INK, lineHeight: 1.5 }}>
              Get your <strong>Gion Evening Food Walk</strong> approved, then add one more service — bundles unlock automatically.
            </div>
          </div>

          {/* Property — available */}
          <DoorTile icon="🏘️" title="Property" cta="Create a property →" ctaColor={ACC}>
            A guesthouse, villa or lodging — add the property then define room types with nightly rates.
          </DoorTile>
        </div>

        <Divider />

        {/* ── GAP 2: No bundles yet ── */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <GroupLabel tight>Your bundles</GroupLabel>
            <span style={{ fontSize: 12.5, color: MUT, opacity: 0.5 }}>+ New bundle</span>
          </div>
          <EmptyCard
            icon="📦"
            headline="No bundles yet"
            body="Bundle two or more of your approved services to give travellers a curated package at a single price — unlocks once you have 2+ approved listings."
            ctaDisabled
            ctaLabel="Bundle unlocks at 2 approved services"
          />
        </div>

        {/* ── GAP 3: No properties yet ── */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <GroupLabel tight>Your properties</GroupLabel>
            <button style={linkBtn()}>+ New property</button>
          </div>
          <EmptyCard
            icon="🏘️"
            headline="No properties yet"
            body="Add a guesthouse, villa or room — each property can have multiple room types, each priced per night. A property goes through the same approval queue as any service."
            ctaLabel="Create your first property →"
          />
        </div>

        <Divider />

        {/* ── GAP 4: New provider ideas rail — no service categories registered ── */}
        <div>
          <GroupLabel>Start from what you do</GroupLabel>
          <p style={{ fontSize: 12.5, color: MUT, margin: "-4px 0 14px", lineHeight: 1.5 }}>
            Pick a category and we'll pre-fill the service form with a suggested name, description and pricing template.
          </p>

          {/* Status context for a brand-new provider */}
          <div style={{
            background: WARN_BG, border: `1px solid ${WARN_LINE}`, borderRadius: 7,
            padding: "12px 16px", marginBottom: 16, display: "flex", gap: 10, alignItems: "flex-start",
          }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>⚠</span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: WARN_INK, margin: "0 0 3px" }}>
                Your first service is under review
              </p>
              <p style={{ fontSize: 12.5, color: WARN_INK, margin: 0, lineHeight: 1.5 }}>
                <strong>Gion Evening Food Walk</strong> was submitted 2 days ago. Once approved it counts toward your bundle threshold and unlocks the ideas suggestions specific to your registered categories.
              </p>
            </div>
          </div>

          {/* Category grid — faded since not yet in context */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 9, opacity: 0.55 }}>
            {[
              ["📷","Photography & Video"],["🚗","Transportation"],["🍳","Food & Culinary"],
              ["🗺️","Tours & Experiences"],["🌿","Health & Wellness"],["✨","Beauty & Styling"],
              ["🎉","Events & Celebrations"],["🙋","Personal Assistance"],["🗣️","Language & Translation"],
              ["👶","Childcare & Family"],["🏠","Lodging"],["🎵","Music & Performance"],
              ["🎨","Arts & Crafts"],["📚","Cultural & Educational"],["🍽️","Restaurants & Dining"],["📍","Local Expertise"],
            ].map(([icon, label]) => (
              <div key={label as string} style={{
                border: `1px solid ${HAIR}`, borderRadius: 6, background: PAPER,
                padding: "11px 13px", display: "flex", alignItems: "center", gap: 8,
              }}>
                <span style={{ fontSize: 15 }}>{icon}</span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: INK, lineHeight: 1.3 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

// ── primitives ──────────────────────────────────────────────────────────────

function GroupLabel({ children, tight }: { children: React.ReactNode; tight?: boolean }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 600, color: MUT, textTransform: "uppercase" as const, letterSpacing: "0.07em", margin: tight ? 0 : "0 0 12px" }}>
      {children}
    </p>
  );
}

function Divider() {
  return <div style={{ height: 1, background: HAIR, margin: "0 0 28px" }} />;
}

function DoorTile({ icon, title, children, cta, ctaColor }: {
  icon: string; title: string; children: React.ReactNode; cta: string; ctaColor: string;
}) {
  return (
    <div style={{ border: `1px solid ${HAIR}`, borderRadius: 7, background: PAPER, padding: 20, textAlign: "left" as const, minHeight: 172, display: "flex", flexDirection: "column" }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <h4 style={{ fontSize: 15, fontWeight: 650, margin: "12px 0 5px", color: INK }}>{title}</h4>
      <p style={{ fontSize: 12.5, color: MUT, lineHeight: 1.5, margin: 0 }}>{children}</p>
      <span style={{ marginTop: "auto", paddingTop: 14, fontSize: 12.5, color: ctaColor, fontWeight: 550 }}>{cta}</span>
    </div>
  );
}

function EmptyCard({ icon, headline, body, ctaLabel, ctaDisabled }: {
  icon: string; headline: string; body: string; ctaLabel: string; ctaDisabled?: boolean;
}) {
  return (
    <div style={{ border: `1px dashed ${HAIR}`, borderRadius: 8, background: PAPER, padding: "28px 24px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" as const, gap: 8 }}>
      <span style={{ fontSize: 28, opacity: 0.4 }}>{icon}</span>
      <p style={{ fontSize: 14, fontWeight: 600, color: INK, margin: 0 }}>{headline}</p>
      <p style={{ fontSize: 12.5, color: MUT, margin: 0, maxWidth: "52ch", lineHeight: 1.6 }}>{body}</p>
      <button style={{
        marginTop: 6, fontSize: 12.5, fontWeight: 550, padding: "8px 16px", borderRadius: 6, cursor: ctaDisabled ? "not-allowed" : "pointer",
        border: `1px solid ${ctaDisabled ? HAIR : ACC}`,
        background: ctaDisabled ? GRD : "transparent",
        color: ctaDisabled ? MUT : ACC,
        opacity: ctaDisabled ? 0.7 : 1,
      }}>
        {ctaLabel}
      </button>
    </div>
  );
}

function linkBtn(): React.CSSProperties {
  return { fontSize: 12.5, color: ACC, background: "none", border: "none", cursor: "pointer", fontWeight: 550, fontFamily: "inherit" };
}
