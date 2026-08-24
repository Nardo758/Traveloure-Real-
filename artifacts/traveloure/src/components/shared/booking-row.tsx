import { StatusPill } from "./status-pill";

export function BookingRow({
  date, time, service, client, referredBy, amount, status, pickup, dropoff, notes,
}: {
  date: string; time?: string; service: string; client: string;
  referredBy?: string; amount: number; status: string;
  pickup?: string; dropoff?: string; notes?: string;
}) {
  return (
    <div className="bg-secondary rounded-xl p-3.5 border-l-[3px]"
      style={{ borderColor: status === "confirmed" ? "#2E8B8B" : "#E8B339" }}>
      <div className="flex justify-between items-center mb-1.5">
        <div className="flex items-center gap-2.5">
          {time && (
            <div className="bg-[#1E3A5F] text-white rounded-lg px-2 py-1 text-[11px] font-bold">{time}</div>
          )}
          <div>
            <div className="text-[13px] font-semibold">{service}</div>
            <div className="text-[11px] text-muted-foreground">
              {client}
              {referredBy && referredBy !== "Direct" && (
                <span className="text-[#2E8B8B] ml-1">via {referredBy}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-emerald-700">${amount}</span>
          <StatusPill status={status} />
        </div>
      </div>
      {(pickup || dropoff) && (
        <div className="flex gap-1.5 flex-wrap mt-1">
          {pickup && <span className="text-[10px] text-muted-foreground bg-background px-2 py-0.5 rounded">📍 {pickup}</span>}
          {pickup && dropoff && <span className="text-[10px] text-muted-foreground">→</span>}
          {dropoff && <span className="text-[10px] text-muted-foreground bg-background px-2 py-0.5 rounded">🏁 {dropoff}</span>}
        </div>
      )}
      {notes && (
        <div className="text-[10px] text-blue-700 bg-blue-50 rounded px-2 py-1 mt-1.5">📝 {notes}</div>
      )}
    </div>
  );
}
