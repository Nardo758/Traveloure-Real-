// Provider Workstation mockup — the Product Builder ("one door for building")
// §17 creation ladder: Single Service · Bundle (unlocks at 2+ approved+active) · Property

const ACC = "#35605A";
const INK = "#1A1A18";
const MUT = "#7A7A72";
const HAIR = "#E8E8E2";
const GRD = "#FAFAF8";
const PAPER = "#FFFFFF";
const WARN_BG = "#FBF6EC";
const WARN_LINE = "#D9C79A";
const WARN_INK = "#6B551F";

const cats = [
  { label: "Photography & Video", icon: "📷" },
  { label: "Transportation", icon: "🚗" },
  { label: "Food & Culinary", icon: "🍳" },
  { label: "Tours & Experiences", icon: "🗺️" },
  { label: "Health & Wellness", icon: "🌿" },
  { label: "Beauty & Styling", icon: "✨" },
  { label: "Events & Celebrations", icon: "🎉" },
  { label: "Personal Assistance", icon: "🙋" },
  { label: "Language & Translation", icon: "🗣️" },
  { label: "Childcare & Family", icon: "👶" },
  { label: "Lodging", icon: "🏠" },
  { label: "Music & Performance", icon: "🎵" },
  { label: "Arts & Crafts", icon: "🎨" },
  { label: "Cultural & Educational", icon: "📚" },
  { label: "Restaurants & Dining", icon: "🍽️" },
  { label: "Local Expertise", icon: "📍" },
];

export function Workstation() {
  return (
    <div style={{ background: GRD, minHeight: "100vh", fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif", color: INK }}>
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

        {/* ── Door tiles ── */}
        <div style={{ marginBottom: 6 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: MUT, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>
            Create
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>

            {/* Single service — always available */}
            <button style={{ ...doorTile(), cursor: "pointer" }}>
              <span style={{ fontSize: 20 }}>🎫</span>
              <h4 style={{ fontSize: 15, fontWeight: 650, margin: "12px 0 5px", color: INK }}>Single service</h4>
              <p style={{ fontSize: 12.5, color: MUT, lineHeight: 1.5, margin: 0 }}>
                A tour, experience, guide, call — anything you sell as a standalone offering.
              </p>
              <span style={{ marginTop: "auto", paddingTop: 14, fontSize: 12.5, color: ACC, fontWeight: 550 }}>
                Create a service →
              </span>
            </button>

            {/* Bundle — unlocked (2+ eligible services in demo) */}
            <button style={{ ...doorTile(), cursor: "pointer" }}>
              <span style={{ fontSize: 20 }}>📦</span>
              <h4 style={{ fontSize: 15, fontWeight: 650, margin: "12px 0 5px", color: INK }}>Bundle</h4>
              <p style={{ fontSize: 12.5, color: MUT, lineHeight: 1.5, margin: 0 }}>
                Group two or more of your approved services into one bookable package.
              </p>
              <div style={{ marginTop: "auto", paddingTop: 14 }}>
                <ProgressBar pct={100} />
                <span style={{ fontSize: 12.5, color: ACC, fontWeight: 550, display: "block", marginTop: 6 }}>
                  Create a bundle →
                </span>
              </div>
            </button>

            {/* Property — available */}
            <button style={{ ...doorTile(), cursor: "pointer" }}>
              <span style={{ fontSize: 20 }}>🏘️</span>
              <h4 style={{ fontSize: 15, fontWeight: 650, margin: "12px 0 5px", color: INK }}>Property</h4>
              <p style={{ fontSize: 12.5, color: MUT, lineHeight: 1.5, margin: 0 }}>
                A guesthouse, villa or lodging — add the property then define room types with nightly rates.
              </p>
              <span style={{ marginTop: "auto", paddingTop: 14, fontSize: 12.5, color: ACC, fontWeight: 550 }}>
                Create a property →
              </span>
            </button>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: HAIR, margin: "28px 0" }} />

        {/* ── Existing bundles ── */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: MUT, textTransform: "uppercase", letterSpacing: "0.07em", margin: 0 }}>
              Your bundles
            </p>
            <button style={{ fontSize: 12.5, color: ACC, background: "none", border: "none", cursor: "pointer", fontWeight: 550 }}>
              + New bundle
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <BundleRow
              name="Kyoto Full-Day — Food Walk + Tea Ceremony"
              price="$110"
              status="approved"
              active
              components={["Gion Evening Food Walk", "Morning Tea Ceremony"]}
            />
            <BundleRow
              name="Capture Kyoto — Photo Walk + Guide"
              price="$160"
              status="pending"
              active={false}
              components={["Kimono Dressing & Gion Photo Walk", "Tokyo Like a Local Guide"]}
            />
          </div>
        </div>

        {/* ── Existing properties ── */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: MUT, textTransform: "uppercase", letterSpacing: "0.07em", margin: 0 }}>
              Your properties
            </p>
            <button style={{ fontSize: 12.5, color: ACC, background: "none", border: "none", cursor: "pointer", fontWeight: 550 }}>
              + New property
            </button>
          </div>

          <PropertyRow
            name="Machiya Kikuya"
            location="Gion, Kyoto"
            status="approved"
            rooms={[
              { name: "The Tatami Room", price: "$180/night", status: "draft" },
              { name: "The Garden Suite", price: "$240/night", status: "approved" },
            ]}
          />
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: HAIR, margin: "0 0 28px" }} />

        {/* ── Ideas grid ── */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: MUT, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>
            Start from what you do
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 9 }}>
            {cats.map((c) => (
              <button key={c.label} style={{
                border: `1px solid ${HAIR}`, borderRadius: 6, background: PAPER,
                padding: "11px 13px", textAlign: "left", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <span style={{ fontSize: 15 }}>{c.icon}</span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: INK, lineHeight: 1.3 }}>{c.label}</span>
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function doorTile(): React.CSSProperties {
  return {
    border: `1px solid ${HAIR}`,
    borderRadius: 7,
    background: PAPER,
    padding: 20,
    textAlign: "left",
    minHeight: 172,
    display: "flex",
    flexDirection: "column",
    fontFamily: "inherit",
    WebkitAppearance: "none",
    appearance: "none",
    width: "100%",
  };
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div style={{ height: 5, borderRadius: 100, background: HAIR, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: ACC, borderRadius: 100 }} />
    </div>
  );
}

function StatusChip({ status, active }: { status: string; active: boolean }) {
  if (status === "approved" && active) {
    return <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, border: `1px solid #BFD5D0`, background: "#EDF2F1", color: ACC }}>Active</span>;
  }
  if (status === "approved" && !active) {
    return <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, border: `1px solid ${HAIR}`, background: GRD, color: MUT }}>Paused</span>;
  }
  return <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, border: `1px solid ${WARN_LINE}`, background: WARN_BG, color: WARN_INK }}>In review</span>;
}

function BundleRow({ name, price, status, active, components }: {
  name: string; price: string; status: string; active: boolean; components: string[];
}) {
  return (
    <div style={{ border: `1px solid ${HAIR}`, borderRadius: 7, background: PAPER, padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 14 }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>{name}</span>
          <StatusChip status={status} active={active} />
        </div>
        <div style={{ fontSize: 12, color: MUT, marginBottom: 6 }}>{price}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
          {components.map(c => (
            <span key={c} style={{ fontSize: 11.5, color: MUT, background: GRD, border: `1px solid ${HAIR}`, borderRadius: 4, padding: "2px 7px" }}>
              {c}
            </span>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button style={{ fontSize: 12, color: MUT, background: "none", border: `1px solid ${HAIR}`, borderRadius: 5, padding: "5px 10px", cursor: "pointer" }}>Edit</button>
        <button style={{ fontSize: 12, color: MUT, background: "none", border: `1px solid ${HAIR}`, borderRadius: 5, padding: "5px 10px", cursor: "pointer" }}>
          {active ? "Pause" : "Activate"}
        </button>
      </div>
    </div>
  );
}

function PropertyRow({ name, location, status, rooms }: {
  name: string; location: string; status: string;
  rooms: { name: string; price: string; status: string }[];
}) {
  return (
    <div style={{ border: `1px solid ${HAIR}`, borderRadius: 7, background: PAPER, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${HAIR}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>🏘️</span>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>{name}</span>
              <StatusChip status={status} active />
            </div>
            <div style={{ fontSize: 12, color: MUT, marginTop: 2 }}>{location}</div>
          </div>
        </div>
        <button style={{ fontSize: 12, color: MUT, background: "none", border: `1px solid ${HAIR}`, borderRadius: 5, padding: "5px 10px", cursor: "pointer" }}>Edit property</button>
      </div>
      {rooms.map((r, i) => (
        <div key={r.name} style={{
          padding: "11px 16px 11px 40px",
          borderBottom: i < rooms.length - 1 ? `1px solid ${HAIR}` : "none",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: i % 2 === 0 ? PAPER : GRD,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: INK }}>{r.name}</span>
            {r.status === "approved"
              ? <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, border: `1px solid #BFD5D0`, background: "#EDF2F1", color: ACC }}>Live</span>
              : <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, border: `1px solid ${HAIR}`, background: GRD, color: MUT }}>Draft</span>
            }
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12.5, color: MUT }}>{r.price}</span>
            <button style={{ fontSize: 12, color: MUT, background: "none", border: `1px solid ${HAIR}`, borderRadius: 5, padding: "4px 9px", cursor: "pointer" }}>
              Availability
            </button>
            <button style={{ fontSize: 12, color: MUT, background: "none", border: `1px solid ${HAIR}`, borderRadius: 5, padding: "4px 9px", cursor: "pointer" }}>
              Edit room
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
