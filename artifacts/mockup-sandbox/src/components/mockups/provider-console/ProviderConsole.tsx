// Provider Console UI mockup — Sidebar + Catalog
// Matches the ratified design: user identity at top of sidebar,
// teal active state, Distribute badge, health bar in right column.

export function ProviderConsole() {
  return (
    <div className="flex min-h-screen w-full" style={{ background: "#FAFAF8", fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif" }}>
      {/* ── SIDEBAR ── */}
      <aside style={{ width: 220, background: "#fff", borderRight: "1px solid #E8E8E2", display: "flex", flexDirection: "column", flexShrink: 0 }}>

        {/* Logo */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E8E8E2", minHeight: 56, display: "flex", alignItems: "center" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#1A1A18", letterSpacing: "-0.02em" }}>
            Travel<span style={{ color: "#35605A" }}>oure</span>
          </span>
        </div>

        {/* Identity card — now in the HEADER, below logo */}
        <div style={{ padding: "12px 16px", background: "#FAFAF8", borderBottom: "1px solid #E8E8E2", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg, #35605A, #1E3A5F)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
            AT
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A18", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              Aiko Tanaka
            </div>
            <div style={{ fontSize: 11, color: "#7A7A72", marginTop: 2, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              Machiya Kikuya · Provider
            </div>
          </div>
        </div>

        {/* Nav */}
        <div style={{ flex: 1, padding: "12px 10px", overflowY: "auto" }}>
          <NavGroup label="WORK">
            <NavItem icon="🏠" label="Dashboard" />
            <NavItem icon="📅" label="Calendar" />
            <NavItem icon="📬" label="Inbox" />
            <NavItem icon="🔧" label="Workstation" />
          </NavGroup>
          <NavGroup label="BUSINESS">
            <NavItem icon="⊞" label="Catalog" active />
            <NavItem icon="↗" label="Distribute" badge={6} />
            <NavItem icon="👥" label="Customers" />
            <NavItem icon="📈" label="Performance" />
            <NavItem icon="💵" label="Money" />
          </NavGroup>
          <NavGroup label="ACCOUNT">
            <NavItem icon="⚙" label="Settings" />
            <NavItem icon="📖" label="Playbook" />
          </NavGroup>
        </div>

        {/* Footer — just logout now */}
        <div style={{ padding: "12px 14px", borderTop: "1px solid #E8E8E2" }}>
          <button style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#7A7A72", background: "none", border: "none", cursor: "pointer", width: "100%", padding: "6px 10px", borderRadius: 6 }}>
            <span>↩</span> Sign out
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main style={{ flex: 1, padding: 24, overflowY: "auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 19, fontWeight: 700, color: "#1A1A18", letterSpacing: "-0.01em", margin: 0 }}>Catalog</h1>
            <p style={{ fontSize: 13, color: "#7A7A72", marginTop: 4, maxWidth: "70ch" }}>
              What you sell — 6 listings. Storefront, share kit and the promote feed now live on{" "}
              <span style={{ color: "#35605A", textDecoration: "underline", cursor: "pointer" }}>Distribute</span>; new listings are born on{" "}
              <span style={{ color: "#35605A", textDecoration: "underline", cursor: "pointer" }}>Workstation</span>.
            </p>
          </div>
          <button style={{ background: "#1A1A18", color: "#fff", border: "none", borderRadius: 6, padding: "9px 16px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            + Add New Service
          </button>
        </div>

        {/* Toolbar */}
        <div style={{ background: "#fff", border: "1px solid #E8E8E2", borderRadius: 7, padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#7A7A72" }}>🔍</span>
            <input
              defaultValue=""
              placeholder="Search your listings"
              style={{ border: "1px solid #E8E8E2", borderRadius: 6, padding: "7px 10px 7px 28px", fontSize: 13, width: 200, color: "#1A1A18", background: "#fff", outline: "none" }}
            />
          </div>
          <SegControl>
            <Seg active>All (6)</Seg>
            <Seg>Live (3)</Seg>
            <Seg>In review (1)</Seg>
            <Seg>Draft (2)</Seg>
          </SegControl>
          <div style={{ marginLeft: "auto" }}>
            <SegControl>
              <Seg active>List</Seg>
              <Seg>Map</Seg>
            </SegControl>
          </div>
        </div>

        {/* Listing rows */}
        <div style={{ background: "#fff", border: "1px solid #E8E8E2", borderRadius: 7, overflow: "hidden" }}>
          <ListingRow
            thumb={{ emoji: "🚶", bg: "#C9DDD6" }}
            name="Gion Evening Food Walk"
            meta="In person · Gion, Kyoto · $52 per person"
            status="live"
            storefront={true}
            availLink
            health={{ pct: 100, label: "Complete", color: "#35605A" }}
          />
          <ListingRow
            thumb={{ emoji: "🍵", bg: "#EDEBE3" }}
            name="Morning Tea Ceremony in a Machiya Townhouse"
            meta="In person · Gion, Kyoto · $68 per person"
            status="draft"
            storefront={false}
            health={{ pct: 60, label: "Needs a cover photo", color: "#C79A3C", labelColor: "#8A6620" }}
          />
          <ListingRow
            thumb={{ emoji: "📄", bg: "#D5E3E0" }}
            name="Tokyo Like a Local — 3-Day Neighbourhood Guide"
            meta="PDF guide · Instant delivery · $24"
            status="live"
            storefront={true}
            availLink
            health={{ pct: 100, label: "Complete", color: "#35605A" }}
          />
          <ListingRow
            thumb={{ emoji: "📞", bg: "#EDEBE3" }}
            name="Kyoto Trip Planning Call — 45 minutes"
            meta="Video call · 45 min · $40"
            status="review"
            storefront={false}
            health={{ pct: 100, label: "Complete", color: "#35605A" }}
          />
          <ListingRow
            thumb={{ emoji: "🏠", bg: "#EDEBE3" }}
            name="Machiya Kikuya — the Tatami Room"
            meta="Property room · nightly · $180 per night"
            status="draft"
            storefront={false}
            availLink
            health={{ pct: 40, label: "No dates published", color: "#C79A3C", labelColor: "#8A6620" }}
          />
          <ListingRow
            thumb={{ emoji: "🎌", bg: "#F0DDD9" }}
            name="Kimono Dressing & Gion Photo Walk"
            meta="In person · Higashiyama · $120 per group"
            status="live"
            storefront={true}
            health={{ pct: 75, label: "2 route stops unlocated", color: "#D97B6E", labelColor: "#B84235" }}
            last
          />
        </div>
      </main>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: "#AEAEA6", textTransform: "uppercase", letterSpacing: "1.2px", padding: "0 10px", marginBottom: 4 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function NavItem({ icon, label, active, badge }: { icon: string; label: string; active?: boolean; badge?: number }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 6, cursor: "pointer",
      fontSize: 13,
      background: active ? "rgba(53,96,90,0.08)" : "transparent",
      color: active ? "#35605A" : "#7A7A72",
      fontWeight: active ? 600 : 400,
    }}>
      <span style={{ fontSize: 14, opacity: active ? 1 : 0.7, width: 16, textAlign: "center" }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge != null && badge > 0 && (
        <span style={{
          minWidth: 18, height: 18, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 600, padding: "0 4px",
          background: active ? "rgba(53,96,90,0.15)" : "#E8E8E2",
          color: active ? "#35605A" : "#7A7A72",
        }}>
          {badge}
        </span>
      )}
    </div>
  );
}

function SegControl({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "inline-flex", border: "1px solid #E8E8E2", borderRadius: 6, overflow: "hidden" }}>
      {children}
    </div>
  );
}

function Seg({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <button style={{
      padding: "7px 13px", fontSize: 12.5, borderRight: "1px solid #E8E8E2", cursor: "pointer",
      border: "none", background: active ? "#1A1A18" : "#fff", color: active ? "#fff" : "#7A7A72",
      whiteSpace: "nowrap",
    }}>
      {children}
    </button>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <div style={{ width: 30, height: 16, borderRadius: 8, background: on ? "#35605A" : "#D1D1CB", position: "relative", flexShrink: 0, cursor: "pointer" }}>
      <div style={{ position: "absolute", width: 12, height: 12, background: "#fff", borderRadius: "50%", top: 2, [on ? "right" : "left"]: 2 }} />
    </div>
  );
}

function Pill({ status }: { status: "live" | "draft" | "review" }) {
  const map = {
    live:   { border: "#BFD5D0", bg: "#EDF2F1", color: "#35605A", label: "Live" },
    draft:  { border: "#D9CDB2", bg: "#FBF6EC", color: "#6B551F", label: "Draft" },
    review: { border: "#E8E8E2", bg: "#FAFAF8", color: "#7A7A72", label: "In review" },
  };
  const s = map[status];
  return (
    <span style={{ fontSize: 11.5, padding: "3px 9px", borderRadius: 999, border: `1px solid ${s.border}`, background: s.bg, color: s.color, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

interface ListingRowProps {
  thumb: { emoji: string; bg: string };
  name: string;
  meta: string;
  status: "live" | "draft" | "review";
  storefront: boolean;
  availLink?: boolean;
  health: { pct: number; label: string; color: string; labelColor?: string };
  last?: boolean;
}

function ListingRow({ thumb, name, meta, status, storefront, availLink, health, last }: ListingRowProps) {
  return (
    <div style={{ display: "flex", gap: 14, padding: "15px 18px", borderBottom: last ? "none" : "1px solid #E8E8E2", alignItems: "flex-start" }}>
      {/* Thumbnail */}
      <div style={{ width: 74, height: 56, borderRadius: 5, background: thumb.bg, border: "1px solid #E8E8E2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
        {thumb.emoji}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A18" }}>{name}</div>
        <div style={{ fontSize: 12.5, color: "#7A7A72", marginTop: 2 }}>{meta}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
          <Pill status={status} />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#7A7A72", cursor: "pointer" }}>
            <Toggle on={storefront} />
            Show on my storefront
          </label>
          {availLink && (
            <span style={{ fontSize: 12.5, color: "#1A1A18", textDecoration: "underline", textUnderlineOffset: 2, cursor: "pointer" }}>
              Availability →
            </span>
          )}
        </div>
      </div>

      {/* Right column — health bar TOP, then actions below */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0, minWidth: 130 }}>
        {/* Health bar at the very top of the right column */}
        <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, cursor: "pointer" }}>
          <div style={{ width: "100%", height: 4, background: "#E8E8E2", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ width: `${health.pct}%`, height: "100%", background: health.color, borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: 11.5, color: health.labelColor ?? health.color, textAlign: "right", lineHeight: 1.2 }}>
            {health.label}
          </span>
        </div>
        <span style={{ fontSize: 12.5, color: "#7A7A72", cursor: "pointer" }}>Edit</span>
        <span style={{ fontSize: 12.5, color: "#35605A", cursor: "pointer" }}>Promote this →</span>
      </div>
    </div>
  );
}
