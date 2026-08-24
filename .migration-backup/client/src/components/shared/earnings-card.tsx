export function EarningsCard({
  monthTotal,
  weekTotal,
  pendingPayout,
  commissionRate,
}: {
  monthTotal: number;
  weekTotal: number;
  pendingPayout: number;
  commissionRate: number;
}) {
  return (
    <div className="bg-secondary rounded-xl p-4 space-y-3">
      <div className="flex justify-between items-center">
        <h4 className="text-xs font-semibold uppercase tracking-wide">Earnings</h4>
        <span className="text-[10px] text-[#2E8B8B] cursor-pointer">Details →</span>
      </div>
      <div className="flex gap-2">
        <div className="flex-1 bg-background rounded-lg p-3 text-center">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">This Month</div>
          <div className="text-lg font-bold text-emerald-700">${monthTotal.toLocaleString()}</div>
        </div>
        <div className="flex-1 bg-background rounded-lg p-3 text-center">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">This Week</div>
          <div className="text-lg font-bold">${weekTotal.toLocaleString()}</div>
        </div>
      </div>
      <div className="flex justify-between items-center bg-background rounded-lg px-3 py-2 text-xs">
        <span className="text-muted-foreground">Pending Payout</span>
        <span className="font-bold">${pendingPayout.toLocaleString()}</span>
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>Your commission: {commissionRate}%</span>
        <span className="text-[#E8B339] cursor-pointer">Request Payout →</span>
      </div>
    </div>
  );
}
