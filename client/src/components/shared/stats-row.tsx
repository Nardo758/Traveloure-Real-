interface StatItem {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}

export function StatsRow({ items }: { items: StatItem[] }) {
  return (
    <div className="flex gap-2.5 mb-4">
      {items.map((item, i) => (
        <div key={i} className="flex-1 bg-secondary rounded-xl p-3.5 text-center">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
            {item.label}
          </div>
          <div className="text-xl font-bold" style={item.color ? { color: item.color } : undefined}>
            {item.value}
          </div>
          {item.sub && (
            <div className="text-[11px] text-muted-foreground mt-0.5">{item.sub}</div>
          )}
        </div>
      ))}
    </div>
  );
}
