import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { 
  FileText, 
  ArrowLeft, 
  Calendar, 
  DollarSign, 
  CheckCircle2, 
  Clock,
  User,
  Building,
  Download,
  Printer
} from "lucide-react";
import { format } from "date-fns";

interface Contract {
  id: string;
  userId: string;
  providerId: string;
  serviceId: string | null;
  contractType: string;
  status: string;
  terms: any;
  startDate: string | null;
  endDate: string | null;
  totalValue: string | null;
  platformFee: string | null;
  signedByUserAt: string | null;
  signedByProviderAt: string | null;
  createdAt: string;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Draft", variant: "secondary" },
  pending_signature: { label: "Pending Signature", variant: "outline" },
  active: { label: "Active", variant: "default" },
  completed: { label: "Completed", variant: "default" },
  cancelled: { label: "Cancelled", variant: "destructive" },
  expired: { label: "Expired", variant: "secondary" },
};

export default function ContractViewPage() {
  const { id } = useParams();

  const { data: contract, isLoading, error } = useQuery<Contract>({
    queryKey: ["/api/contracts", id],
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="container py-8 max-w-3xl mx-auto">
          <Skeleton className="h-8 w-48 mb-6" />
          <Card>
            <CardContent className="p-6 space-y-4">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  if (error || !contract) {
    return (
      <Layout>
        <div className="container py-8 max-w-3xl mx-auto text-center">
          <FileText className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold mb-2">Contract Not Found</h1>
          <p className="text-muted-foreground mb-6">The contract you're looking for doesn't exist or you don't have access.</p>
          <Button asChild data-testid="button-back-bookings">
            <Link href="/bookings">Back to Bookings</Link>
          </Button>
        </div>
      </Layout>
    );
  }

  const status = statusConfig[contract.status] || statusConfig.draft;

  return (
    <Layout>
      <div className="container py-8 max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" size="icon" asChild data-testid="button-back">
            <Link href="/bookings">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold" data-testid="text-contract-title">
              Contract Details
            </h1>
            <p className="text-sm text-muted-foreground">ID: {contract.id}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" data-testid="button-print">
              <Printer className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" data-testid="button-download">
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <Card className="mb-6">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="text-lg">Service Contract</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {contract.contractType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </p>
              </div>
              <Badge variant={status.variant} data-testid="badge-status">
                {status.label}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Calendar className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Created</p>
                  <p className="font-medium" data-testid="text-created-date">
                    {format(new Date(contract.createdAt), "PPP")}
                  </p>
                </div>
              </div>
              
              {contract.totalValue && (
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <DollarSign className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Value</p>
                    <p className="font-medium text-lg" data-testid="text-total-value">
                      ${parseFloat(contract.totalValue).toFixed(2)}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {(contract.startDate || contract.endDate) && (
              <>
                <Separator />
                <div className="grid sm:grid-cols-2 gap-4">
                  {contract.startDate && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Start Date</p>
                      <p className="font-medium" data-testid="text-start-date">
                        {format(new Date(contract.startDate), "PPP")}
                      </p>
                    </div>
                  )}
                  {contract.endDate && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">End Date</p>
                      <p className="font-medium" data-testid="text-end-date">
                        {format(new Date(contract.endDate), "PPP")}
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}

            <Separator />

            <div>
              <h3 className="font-semibold mb-3">Signatures</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                  <User className="w-5 h-5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Customer</p>
                    {contract.signedByUserAt ? (
                      <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                        <CheckCircle2 className="w-4 h-4" />
                        <span className="text-sm">Signed {format(new Date(contract.signedByUserAt), "PP")}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        <span className="text-sm">Pending</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                  <Building className="w-5 h-5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Provider</p>
                    {contract.signedByProviderAt ? (
                      <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                        <CheckCircle2 className="w-4 h-4" />
                        <span className="text-sm">Signed {format(new Date(contract.signedByProviderAt), "PP")}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        <span className="text-sm">Pending</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {contract.terms && Object.keys(contract.terms).length > 0 && (
              <>
                <Separator />
                <div>
                  <h3 className="font-semibold mb-3">Contract Terms</h3>
                  <div className="p-4 rounded-lg bg-muted/30 text-sm">
                    {contract.terms.autoGenerated && (
                      <p className="text-muted-foreground mb-2">
                        This contract was auto-generated upon checkout.
                      </p>
                    )}
                    {contract.terms.serviceName && (
                      <p><strong>Service:</strong> {contract.terms.serviceName}</p>
                    )}
                    {contract.terms.quantity && (
                      <p><strong>Quantity:</strong> {contract.terms.quantity}</p>
                    )}
                    {contract.terms.unitPrice && (
                      <p><strong>Unit Price:</strong> ${parseFloat(contract.terms.unitPrice).toFixed(2)}</p>
                    )}
                  </div>
                </div>
              </>
            )}

            {contract.platformFee && (
              <>
                <Separator />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Platform Fee (20%)</span>
                  <span>${parseFloat(contract.platformFee).toFixed(2)}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-3 flex-wrap">
          <Button variant="outline" asChild data-testid="button-back-bookings">
            <Link href="/bookings">Back to Bookings</Link>
          </Button>
          {contract.status === "pending_signature" && (
            <Button data-testid="button-sign">Sign Contract</Button>
          )}
        </div>
      </div>
    </Layout>
  );
}
