interface ActionItemsPanelProps {
  notifications: Array<{
    id: string | number;
    message?: string;
    type?: string;
    read?: boolean;
    tripId?: string | null;
  }>;
}

export function ActionItemsPanel({ notifications }: ActionItemsPanelProps) {
  const unread = notifications.filter((n) => !n.read).slice(0, 5);

  if (unread.length === 0) return null;

  return (
    <div
      className="bg-card border border-border rounded-xl p-3"
      data-testid="action-items-panel"
    >
      <div className="text-[11px] font-medium text-foreground mb-2">
        Action items
      </div>
      {unread.map((n, i) => (
        <div
          key={n.id}
          className="flex gap-1.5 py-1 items-start"
          data-testid={`action-item-${n.id}`}
        >
          <div
            className="w-[5px] h-[5px] rounded-full mt-[5px] flex-shrink-0"
            // L2 home-honesty (ledger `2026-09-07-home-honesty`): this used to branch on
            // `n.type === "urgent"` for a red dot — but no server code ever writes that type
            // (R-I(2) grepped every createNotification call site), so the red branch was
            // unreachable. One amber dot is the honest rendering.
            style={{ background: "#EF9F27" }}
          />
          <span className="text-[10px] text-foreground leading-snug">
            {n.message || n.type || "Action needed"}
          </span>
        </div>
      ))}
    </div>
  );
}
