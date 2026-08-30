interface ActionItem {
  text: string;
  urgent: boolean;
  client?: string;
  type: string;
}

export function ActionItemsList({ items }: { items: ActionItem[] }) {
  const urgentCount = items.filter((a) => a.urgent).length;
  return (
    <div className="bg-secondary rounded-xl p-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide mb-2.5">
        Action Items
        {urgentCount > 0 && (
          <span className="ml-1.5 bg-[#E85D55] text-white text-[10px] font-bold rounded-full px-1.5 py-px">
            {urgentCount}
          </span>
        )}
      </h4>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div
            key={i}
            className={`px-2.5 py-2 rounded-lg cursor-pointer ${
              item.urgent ? "bg-amber-50 text-amber-700 font-semibold" : "bg-background"
            }`}
          >
            <div className="text-[11px] leading-relaxed">{item.text}</div>
            {item.client && (
              <div className="text-[10px] text-muted-foreground mt-0.5">{item.client}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
