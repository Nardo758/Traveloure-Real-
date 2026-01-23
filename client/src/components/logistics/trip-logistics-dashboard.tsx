import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { 
  Users, 
  Building2, 
  Wallet,
  ShieldAlert,
  Route,
  AlertTriangle,
  CheckCircle,
  Clock,
  DollarSign,
  UserCheck,
  UserX,
  Utensils,
  Bell,
  Calendar,
  RefreshCw
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";

interface TripLogisticsDashboardProps {
  tripId: string;
  tripName?: string;
  budget?: number;
  destination?: string;
}

interface ParticipantStats {
  total: number;
  confirmed: number;
  pending: number;
  declined: number;
  rsvpProgress: number;
}

interface PaymentStats {
  totalParticipants: number;
  totalExpected: number;
  totalCollected: number;
  fullyPaid: number;
  partiallyPaid: number;
  unpaid: number;
  collectionProgress: number;
}

interface DietaryRequirements {
  restrictions: string[];
  accessibilityNeeds: string[];
  specialNotes: string[];
}

interface ContractStats {
  totalContracts: number;
  activeContracts: number;
  totalValue: number;
  totalPaid: number;
  totalRemaining: number;
  completedPayments: number;
  pendingPayments: number;
}

interface BudgetSummary {
  totalBudget: number;
  totalSpent: number;
  remaining: number;
  percentUsed: number;
  transactionCount: number;
}

interface CategoryBreakdown {
  category: string;
  total: number;
  percentage: number;
}

interface AlertSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  unacknowledged: number;
}

export function TripLogisticsDashboard({ 
  tripId, 
  tripName = "Trip",
  budget = 0,
  destination = "destination"
}: TripLogisticsDashboardProps) {
  
  const { data: participantStats, isLoading: loadingParticipants } = useQuery<ParticipantStats>({
    queryKey: [`/api/trips/${tripId}/participants/stats`],
    enabled: !!tripId,
  });

  const { data: paymentStats, isLoading: loadingPayments } = useQuery<PaymentStats>({
    queryKey: [`/api/trips/${tripId}/participants/payment-stats`],
    enabled: !!tripId,
  });

  const { data: dietaryReqs, isLoading: loadingDietary } = useQuery<DietaryRequirements>({
    queryKey: [`/api/trips/${tripId}/participants/dietary`],
    enabled: !!tripId,
  });

  const { data: contractStats, isLoading: loadingContracts } = useQuery<ContractStats>({
    queryKey: [`/api/trips/${tripId}/contracts/stats`],
    enabled: !!tripId,
  });

  const { data: budgetSummary, isLoading: loadingBudget } = useQuery<BudgetSummary>({
    queryKey: [`/api/trips/${tripId}/budget/summary?budget=${budget}`],
    enabled: !!tripId,
  });

  const { data: categoryBreakdown, isLoading: loadingCategories } = useQuery<CategoryBreakdown[]>({
    queryKey: [`/api/trips/${tripId}/budget/categories`],
    enabled: !!tripId,
  });

  const { data: alertSummary, isLoading: loadingAlerts } = useQuery<AlertSummary>({
    queryKey: [`/api/trips/${tripId}/alerts/summary`],
    enabled: !!tripId,
  });

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}`] });
  };

  const isLoading = loadingParticipants || loadingPayments || loadingContracts || loadingBudget || loadingAlerts;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold" data-testid="text-trip-logistics-title">
            Logistics Dashboard
          </h2>
          <p className="text-muted-foreground">
            Real-time planning intelligence for {tripName}
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm"
          onClick={refreshAll}
          disabled={isLoading}
          data-testid="button-refresh-logistics"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="card-participant-summary">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-500" />
              Participants
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingParticipants ? (
              <Skeleton className="h-16 w-full" />
            ) : participantStats ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-3xl font-bold">{participantStats.total}</span>
                  <div className="text-right text-sm">
                    <div className="flex items-center gap-1 text-green-600">
                      <UserCheck className="w-3 h-3" />
                      {participantStats.confirmed} confirmed
                    </div>
                    <div className="flex items-center gap-1 text-amber-600">
                      <Clock className="w-3 h-3" />
                      {participantStats.pending} pending
                    </div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span>RSVP Progress</span>
                    <span>{participantStats.rsvpProgress}%</span>
                  </div>
                  <Progress value={participantStats.rsvpProgress} className="h-2" />
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">No participants yet</div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-payment-collection">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-500" />
              Payment Collection
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingPayments ? (
              <Skeleton className="h-16 w-full" />
            ) : paymentStats ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-3xl font-bold">
                    ${paymentStats.totalCollected.toLocaleString()}
                  </span>
                  <div className="text-right text-sm text-muted-foreground">
                    of ${paymentStats.totalExpected.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span>Collection Progress</span>
                    <span>{paymentStats.collectionProgress}%</span>
                  </div>
                  <Progress value={paymentStats.collectionProgress} className="h-2" />
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">No payments tracked</div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-vendor-contracts">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building2 className="w-4 h-4 text-purple-500" />
              Vendor Contracts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingContracts ? (
              <Skeleton className="h-16 w-full" />
            ) : contractStats ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-3xl font-bold">{contractStats.activeContracts}</span>
                  <div className="text-right text-sm">
                    <div className="text-muted-foreground">
                      ${contractStats.totalValue.toLocaleString()} total
                    </div>
                    <div className="text-green-600">
                      ${contractStats.totalPaid.toLocaleString()} paid
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline" className="text-xs">
                    {contractStats.pendingPayments} pending
                  </Badge>
                  <Badge variant="outline" className="text-xs text-green-600">
                    {contractStats.completedPayments} complete
                  </Badge>
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">No contracts yet</div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-active-alerts">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-500" />
              Active Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingAlerts ? (
              <Skeleton className="h-16 w-full" />
            ) : alertSummary && alertSummary.total > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-3xl font-bold">{alertSummary.total}</span>
                  <div className="flex flex-col gap-1">
                    {alertSummary.critical > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        {alertSummary.critical} critical
                      </Badge>
                    )}
                    {alertSummary.unacknowledged > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {alertSummary.unacknowledged} unread
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm">No active alerts</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card data-testid="card-budget-overview">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Wallet className="w-5 h-5 text-green-500" />
              Budget Overview
            </CardTitle>
            <CardDescription>Track spending against your planned budget</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingBudget || loadingCategories ? (
              <div className="space-y-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : budgetSummary ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-3xl font-bold">
                      ${budgetSummary.totalSpent.toLocaleString()}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      of ${budgetSummary.totalBudget.toLocaleString()} budget
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-2xl font-bold ${budgetSummary.remaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${Math.abs(budgetSummary.remaining).toLocaleString()}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {budgetSummary.remaining >= 0 ? 'remaining' : 'over budget'}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Budget Used</span>
                    <span>{Math.round(budgetSummary.percentUsed)}%</span>
                  </div>
                  <Progress 
                    value={Math.min(budgetSummary.percentUsed, 100)} 
                    className={`h-3 ${budgetSummary.percentUsed > 100 ? '[&>div]:bg-red-500' : ''}`}
                  />
                </div>
                {categoryBreakdown && categoryBreakdown.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Spending by Category</h4>
                    {categoryBreakdown.slice(0, 5).map(cat => (
                      <div key={cat.category} className="flex items-center justify-between text-sm">
                        <span className="capitalize">{cat.category.replace('_', ' ')}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">${cat.total.toLocaleString()}</span>
                          <Badge variant="outline" className="text-xs">
                            {cat.percentage}%
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">No budget data available</div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-dietary-accessibility">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Utensils className="w-5 h-5 text-orange-500" />
              Dietary & Accessibility
            </CardTitle>
            <CardDescription>Special requirements for your group</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingDietary ? (
              <Skeleton className="h-32 w-full" />
            ) : dietaryReqs ? (
              <div className="space-y-4">
                {dietaryReqs.restrictions.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Dietary Restrictions</h4>
                    <div className="flex flex-wrap gap-2">
                      {dietaryReqs.restrictions.map((restriction, idx) => (
                        <Badge key={idx} variant="secondary">
                          {restriction}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {dietaryReqs.accessibilityNeeds.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Accessibility Needs</h4>
                    <div className="flex flex-wrap gap-2">
                      {dietaryReqs.accessibilityNeeds.map((need, idx) => (
                        <Badge key={idx} variant="outline" className="border-blue-500 text-blue-600">
                          {need}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {dietaryReqs.restrictions.length === 0 && dietaryReqs.accessibilityNeeds.length === 0 && (
                  <div className="text-muted-foreground text-sm">
                    No special requirements recorded
                  </div>
                )}
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">No dietary data available</div>
            )}
          </CardContent>
        </Card>
      </div>

      {alertSummary && alertSummary.critical > 0 && (
        <Card className="border-red-500 bg-red-50 dark:bg-red-900/20" data-testid="card-critical-alerts">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
              <div>
                <p className="font-medium text-red-800 dark:text-red-200">
                  Critical Alerts Require Attention
                </p>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                  You have {alertSummary.critical} critical alert{alertSummary.critical > 1 ? 's' : ''} that require immediate action.
                  Please review and acknowledge these alerts to ensure smooth trip execution.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
