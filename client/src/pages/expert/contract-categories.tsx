/**
 * Contract Categories — expert console page that lists real contracts
 * fetched from GET /api/expert/contracts/recent (experts.routes.ts).
 *
 * Data shape returned by getRecentExpertContracts:
 *   id, title, client (tripTo), value (amount), status, isPaid, createdAt
 */
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ExpertLayout } from "@/components/expert/expert-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, CheckCircle, Clock, XCircle, DollarSign } from "lucide-react";

interface ExpertContract {
  id: string;
  title: string;
  client: string;
  value: string;
  status: string | null;
  isPaid: boolean | null;
  createdAt: string | null;
}

const STATUS_MAP: Record<string, { label: string; className: string; Icon: React.ElementType }> = {
  pending:     { label: "Pending",     className: "bg-yellow-100 text-yellow-700", Icon: Clock },
  active:      { label: "Active",      className: "bg-green-100 text-green-700",   Icon: CheckCircle },
  completed:   { label: "Completed",   className: "bg-blue-100 text-blue-700",     Icon: CheckCircle },
  cancelled:   { label: "Cancelled",   className: "bg-red-100 text-red-700",       Icon: XCircle },
  signed:      { label: "Signed",      className: "bg-green-100 text-green-700",   Icon: CheckCircle },
  draft:       { label: "Draft",       className: "bg-gray-100 text-gray-600",     Icon: FileText },
  sent:        { label: "Sent",        className: "bg-blue-100 text-blue-700",     Icon: Clock },
  negotiating: { label: "Negotiating", className: "bg-orange-100 text-orange-700", Icon: Clock },
  disputed:    { label: "Disputed",    className: "bg-red-100 text-red-700",       Icon: XCircle },
};

function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? "pending";
  const cfg = STATUS_MAP[s] ?? { label: s, className: "bg-gray-100 text-gray-600", Icon: FileText };
  const { label, className, Icon } = cfg;
  return (
    <Badge className={`${className} border-0 flex items-center gap-1 w-fit`}>
      <Icon className="w-3 h-3" />
      {label}
    </Badge>
  );
}

function formatAmount(val: string | null | undefined): string {
  const n = parseFloat(val ?? "");
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default function ExpertContractCategories() {
  const { data: contracts = [], isLoading } = useQuery<ExpertContract[]>({
    queryKey: ["/api/expert/contracts/recent"],
  });

  // Derived stats
  const totalValue = contracts.reduce((sum, c) => sum + (parseFloat(c.value) || 0), 0);
  const paidCount  = contracts.filter((c) => c.isPaid).length;
  const activeCount = contracts.filter((c) => c.status === "active" || c.status === "signed").length;
  const pendingCount = contracts.filter((c) => c.status === "pending").length;

  return (
    <ExpertLayout title="Contracts">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" data-testid="text-contracts-title">
            Contracts
          </h1>
          <p className="text-gray-600">All service contracts associated with your account</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border border-gray-200" data-testid="stat-total">
            <CardContent className="p-4 text-center">
              {isLoading ? (
                <Skeleton className="h-8 w-16 mx-auto mb-1" />
              ) : (
                <p className="text-3xl font-bold text-gray-900">{contracts.length}</p>
              )}
              <p className="text-sm text-gray-600">Total Contracts</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="stat-active">
            <CardContent className="p-4 text-center">
              {isLoading ? (
                <Skeleton className="h-8 w-16 mx-auto mb-1" />
              ) : (
                <p className="text-3xl font-bold text-green-600">{activeCount}</p>
              )}
              <p className="text-sm text-gray-600">Active</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="stat-pending">
            <CardContent className="p-4 text-center">
              {isLoading ? (
                <Skeleton className="h-8 w-16 mx-auto mb-1" />
              ) : (
                <p className="text-3xl font-bold text-yellow-600">{pendingCount}</p>
              )}
              <p className="text-sm text-gray-600">Pending</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200" data-testid="stat-paid">
            <CardContent className="p-4 text-center">
              {isLoading ? (
                <Skeleton className="h-8 w-24 mx-auto mb-1" />
              ) : (
                <p className="text-3xl font-bold text-blue-600">
                  {formatAmount(String(totalValue))}
                </p>
              )}
              <p className="text-sm text-gray-600">Total Value ({paidCount} paid)</p>
            </CardContent>
          </Card>
        </div>

        {/* Contract list */}
        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Contract List
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            )}

            {!isLoading && contracts.length === 0 && (
              <div className="text-center py-12" data-testid="empty-contracts">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="font-medium text-gray-700">No contracts yet</p>
                <p className="text-sm text-gray-500 mt-1">
                  Contracts appear here once a traveler books a service with you.
                </p>
              </div>
            )}

            {!isLoading && contracts.length > 0 && (
              <div className="divide-y divide-gray-100">
                {contracts.map((contract) => (
                  <div
                    key={contract.id}
                    className="py-4 flex items-center justify-between gap-4"
                    data-testid={`contract-${contract.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-gray-900 truncate">{contract.title}</p>
                        <StatusBadge status={contract.status} />
                        {contract.isPaid && (
                          <Badge className="bg-green-100 text-green-700 border-0 flex items-center gap-1">
                            <DollarSign className="w-3 h-3" /> Paid
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">
                        Destination: <span className="text-gray-700">{contract.client || "—"}</span>
                        {contract.createdAt && (
                          <span className="ml-3 text-gray-400">
                            {format(new Date(contract.createdAt), "MMM d, yyyy")}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-gray-900">{formatAmount(contract.value)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ExpertLayout>
  );
}
