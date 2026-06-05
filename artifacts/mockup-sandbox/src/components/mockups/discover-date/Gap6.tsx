function Label({ children }: { children: string }) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      color: "#888",
      marginBottom: 10,
    }}>{children}</div>
  );
}

function Arrow() {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "6px 0",
      color: "#0F6E56",
      fontSize: 18,
      fontWeight: 700,
    }}>↓ Gap 6 changes this</div>
  );
}

function NBHeaderBefore() {
  return (
    <div style={{ background: "#fff", border: "0.5px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
      {/* Header row — current: name + trend, CTAs below on separate row */}
      <div style={{ padding: "12px 15px" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: "#E1F5EE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "#085041", flexShrink: 0 }}>📍</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 16, fontWeight: 500 }}>Arashiyama</span>
              <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 6, background: "#F1EFE8", color: "#444441", fontWeight: 500 }}>Neighborhood</span>
            </div>
            <div style={{ fontSize: 12, color: "#0F6E56", marginTop: 2 }}>Trending · 8 things to do</div>
          </div>
        </div>
        {/* CTAs on a separate row below — current behaviour */}
        <div style={{ display: "flex", gap: 7, marginTop: 10, paddingLeft: 56 }}>
          <button style={{ fontSize: 12, padding: "6px 12px", borderRadius: 7, border: "0.5px solid #d1d5db", background: "#fff", cursor: "pointer" }}>Explore Arashiyama</button>
          <button style={{ fontSize: 12, padding: "6px 12px", borderRadius: 7, border: "0.5px solid #d1d5db", background: "#fff", cursor: "pointer" }}>+ Add a day</button>
        </div>
      </div>
      <div style={{ background: "#f8f9fa", borderTop: "0.5px solid #e2e8f0", padding: "10px 14px" }}>
        <div style={{ fontSize: 11, color: "#bbb" }}>bento grid continues…</div>
      </div>
    </div>
  );
}

function NBHeaderAfter() {
  return (
    <div style={{ background: "#fff", border: "1.5px solid #9FE1CB", borderRadius: 12, overflow: "hidden" }}>
      {/* Header row — compact: everything inline including single CTA */}
      <div style={{ padding: "12px 15px", display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: "#E1F5EE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "#085041", flexShrink: 0 }}>📍</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 16, fontWeight: 500 }}>Arashiyama</span>
            <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 6, background: "#F1EFE8", color: "#444441", fontWeight: 500 }}>Neighborhood</span>
          </div>
          <div style={{ fontSize: 12, color: "#0F6E56", marginTop: 2 }}>Trending · 8 things to do</div>
        </div>
        {/* Single CTA inline — date-aware */}
        <button style={{ fontSize: 12, padding: "6px 12px", borderRadius: 7, border: "0.5px solid #d1d5db", background: "#fff", cursor: "pointer", flexShrink: 0 }}>Add a day</button>
      </div>
      <div style={{ background: "#f8f9fa", borderTop: "0.5px solid #e2e8f0", padding: "10px 14px" }}>
        <div style={{ fontSize: 11, color: "#bbb" }}>bento grid continues…</div>
      </div>
    </div>
  );
}

export function Gap6() {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: "#f5f5f5", minHeight: "100vh", padding: "16px 14px" }}>

      <div style={{ fontSize: 15, fontWeight: 600, color: "#111", marginBottom: 4 }}>Gap 6 — Neighbourhood header</div>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 20, lineHeight: 1.5 }}>
        The compact header only activates in date mode (once gap 2 is wired up). Outside of date mode it stays as-is.
      </div>

      <Label>Before (always — current)</Label>
      <NBHeaderBefore />

      <Arrow />

      <Label>After (date mode only)</Label>
      <NBHeaderAfter />

      <div style={{ marginTop: 20, background: "#fffbeb", border: "0.5px solid #fde68a", borderRadius: 10, padding: "10px 12px", fontSize: 12, color: "#92400e" }}>
        <b>Impact:</b> Two stacked CTAs → one inline "Add a day". The Explore link moves inside the bento grid header label. Only visible when <code>?date=</code> is set.
      </div>

    </div>
  );
}
