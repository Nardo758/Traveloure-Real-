import { StatusPill } from "./status-pill";

interface Transaction {
  date: string; client: string; service: string;
  gross: number; commissionRate: number; earnings: number;
  status: "paid" | "pending" | "processing";
}

export function TransactionTable({ transactions }: { transactions: Transaction[] }) {
  return (
    <div className="rounded-xl border overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-secondary">
          <tr>
            {["Date", "Client", "Service", "Gross", "Rate", "Earnings", "Status"].map((h) => (
              <th key={h} className="text-left px-3 py-2 font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {transactions.map((t, i) => (
            <tr key={i} className="border-t">
              <td className="px-3 py-2">{t.date}</td>
              <td className="px-3 py-2">{t.client}</td>
              <td className="px-3 py-2">{t.service}</td>
              <td className="px-3 py-2 font-medium">${t.gross}</td>
              <td className="px-3 py-2">{t.commissionRate}%</td>
              <td className="px-3 py-2 font-bold text-emerald-700">${t.earnings}</td>
              <td className="px-3 py-2"><StatusPill status={t.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
