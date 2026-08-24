import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users,
  Building2,
  Wallet,
  AlertTriangle,
  CheckCircle,
  Clock,
  DollarSign,
  UserCheck,
  Utensils,
  Bell,
  RefreshCw,
  CalendarClock,
  Zap,
  User,
  Mail,
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { TemporalAnchorManager } from "./temporal-anchor-manager";
import { ScheduleValidator } from "./schedule-validator";
import { EnergyBudgetDisplay } from "./energy-budget-display";

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
  maybe: number;
  responseRate: number;
}

interface PaymentStats {
  totalOwed: number;
  totalPaid: number;
  totalOutstanding: number;
  paidCount: number;
  unpaidCount: number;
  collectionRate: number;
}

interface DietaryRequirements {
  restrictions: { name: string; count: number }[];
  accessibilityNeeds: { name: string; count: number }[];
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
  amount: number;
  percentage: number;
  transactionCount: number;
}

interface AlertSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  unacknowledged: number;
}

interface Participant {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  dietaryRestrictions: string[];
  accessibilityNeeds: string[];
  amountOwed: string | number;
  amountPaid: string | number;
  paymentStatus: string;
}

export function TripLogisticsDashboard({
  tripId,
  tripName = "Trip",
  budget = 0,
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

  const { data: participantList, isLoading: loadingParticipantList } = useQuery<Participant[]>({
    queryKey: [`/api/trips/${tripId}/participants`],
    enabled: !!tripId,
  });

  const isLoading = loadingParticipants || loadingPayments || loadingContracts || loadingBudget || loadingAlerts;

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/participants/stats`] });
    queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/participants/payment-stats`] });
    queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/contracts/stats`] });
    queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/budget/summary?budget=${budget}`] });
    queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/budget/categories`] });
    queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/participants/dietary`] });
    queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/alerts/summary`] });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold" data-testid="text-trip-logistics-title">
            Logistics Dashboard
          </h2>
          <p className="text-muted-foreground text-sm">
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
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Critical alert banner */}
      {alertSummary && alertSummary.critical > 0 && (
        <Card className="border-red-500 bg-red-50 dark:bg-red-900/20" data-testid="card-critical-alerts">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                {alertSummary.critical} critical alert{alertSummary.critical > 1 ? "s" : ""} require immediate attention.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI summary row — always visible */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Participants */}
        <Card data-testid="card-participant-summary" className="bg-muted/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Participants</span>
            </div>
            {loadingParticipants ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-3xl font-bold mb-1">{participantStats?.total ?? 0}</div>
                <div className="flex gap-3 text-xs">
                  <span className="text-green-600 flex items-center gap-0.5">
                    <UserCheck className="w-3 h-3" /> {participantStats?.confirmed ?? 0}
                  </span>
                  <span className="text-amber-600 flex items-center gap-0.5">
                    <Clock className="w-3 h-3" /> {participantStats?.pending ?? 0}
                  </span>
                </div>
                {participantStats && (
                  <Progress value={participantStats.responseRate} className="h-1 mt-2" />
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Payments */}
        <Card data-testid="card-payment-collection" className="bg-muted/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-green-500" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Payments</span>
            </div>
            {loadingPayments ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-3xl font-bold mb-1">
                  ${(paymentStats?.totalPaid ?? 0).toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground mb-1">
                  of ${(paymentStats?.totalOwed ?? 0).toLocaleString()} owed
                </div>
                <Progress value={paymentStats?.collectionRate ?? 0} className="h-1" />
              </>
            )}
          </CardContent>
        </Card>

        {/* Contracts */}
        <Card data-testid="card-vendor-contracts" className="bg-muted/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-4 h-4 text-purple-500" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contracts</span>
            </div>
            {loadingContracts ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <>
                <div className="text-3xl font-bold mb-1">{contractStats?.activeContracts ?? 0}</div>
                <div className="flex gap-2 text-xs">
                  <span className="text-muted-foreground">${(contractStats?.totalValue ?? 0).toLocaleString()} total</span>
                </div>
                <div className="flex gap-1.5 mt-1.5">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {contractStats?.pendingPayments ?? 0} pending
                  </Badge>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-green-600">
                    {contractStats?.completedPayments ?? 0} done
                  </Badge>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card data-testid="card-active-alerts" className="bg-muted/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Bell className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Alerts</span>
            </div>
            {loadingAlerts ? (
              <Skeleton className="h-8 w-12" />
            ) : alertSummary && alertSummary.total > 0 ? (
              <>
                <div className="text-3xl font-bold mb-1">{alertSummary.total}</div>
                <div className="flex gap-1.5">
                  {alertSummary.critical > 0 && (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                      {alertSummary.critical} critical
                    </Badge>
                  )}
                  {alertSummary.unacknowledged > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {alertSummary.unacknowledged} unread
                    </Badge>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 text-green-600 mt-1">
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm font-medium">All clear</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabbed detail sections */}
      <Tabs defaultValue="budget" className="w-full" data-testid="tabs-logistics">
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="budget" data-testid="tab-budget">
            <Wallet className="w-3.5 h-3.5 mr-1.5" />
            Budget
          </TabsTrigger>
          <TabsTrigger value="people" data-testid="tab-people">
            <Users className="w-3.5 h-3.5 mr-1.5" />
            People
          </TabsTrigger>
          <TabsTrigger value="planning" data-testid="tab-planning">
            <CalendarClock className="w-3.5 h-3.5 mr-1.5" />
            Planning
          </TabsTrigger>
        </TabsList>

        {/* Budget tab */}
        <TabsContent value="budget" className="mt-4">
          <Card data-testid="card-budget-overview">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="w-4 h-4 text-green-500" />
                Budget Overview
              </CardTitle>
              <CardDescription>Track spending against your planned budget</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingBudget || loadingCategories ? (
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : budgetSummary ? (
                <div className="space-y-5">
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-4xl font-bold">
                        ${(budgetSummary.totalSpent ?? 0).toLocaleString()}
                      </div>
                      <div className="text-sm text-muted-foreground mt-0.5">
                        of ${(budgetSummary.totalBudget ?? 0).toLocaleString()} budget
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-2xl font-bold ${(budgetSummary.remaining ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                        ${Math.abs(budgetSummary.remaining ?? 0).toLocaleString()}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {(budgetSummary.remaining ?? 0) >= 0 ? "remaining" : "over budget"}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="text-muted-foreground">Budget used</span>
                      <span className="font-medium">{Math.round(budgetSummary.percentUsed ?? 0)}%</span>
                    </div>
                    <Progress
                      value={Math.min(budgetSummary.percentUsed ?? 0, 100)}
                      className={`h-2.5 ${(budgetSummary.percentUsed ?? 0) > 100 ? "[&>div]:bg-red-500" : ""}`}
                    />
                  </div>

                  {categoryBreakdown && categoryBreakdown.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-3">By Category</h4>
                      <div className="space-y-2.5">
                        {categoryBreakdown.slice(0, 6).map((cat) => (
                          <div key={cat.category}>
                            <div className="flex items-center justify-between text-sm mb-1">
                              <span className="capitalize text-foreground">{cat.category.replace(/_/g, " ")}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">${(cat.amount ?? 0).toLocaleString()}</span>
                                <span className="text-xs font-medium w-8 text-right">{cat.percentage}%</span>
                              </div>
                            </div>
                            <Progress value={cat.percentage} className="h-1.5" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-muted-foreground text-sm py-6 text-center">No budget data yet</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* People tab */}
        <TabsContent value="people" className="mt-4">
          <div className="space-y-4">
          {/* Who's Going roster */}
          <Card data-testid="card-whos-going">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                Who's Going
              </CardTitle>
              <CardDescription>Full participant roster</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingParticipantList ? (
                <div className="space-y-2">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : participantList && participantList.length > 0 ? (
                <div className="divide-y divide-border">
                  {participantList.map((p) => {
                    const statusConfig: Record<string, { label: string; className: string }> = {
                      confirmed: { label: "Confirmed", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
                      pending:   { label: "Pending",   className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
                      invited:   { label: "Invited",   className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
                      declined:  { label: "Declined",  className: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
                      maybe:     { label: "Maybe",     className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
                    };
                    const sc = statusConfig[p.status] ?? { label: p.status, className: "bg-muted text-muted-foreground" };
                    return (
                      <div key={p.id} className="flex items-center justify-between py-3 gap-3" data-testid={`row-participant-${p.id}`}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <span className="text-xs font-semibold text-primary">
                              {(p.name || "?").charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate" data-testid={`text-participant-name-${p.id}`}>{p.name}</div>
                            {p.email && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                                <Mail className="w-3 h-3 shrink-0" />{p.email}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {p.dietaryRestrictions && p.dietaryRestrictions.length > 0 && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-orange-600 border-orange-300 hidden sm:flex">
                              {p.dietaryRestrictions[0]}{p.dietaryRestrictions.length > 1 ? ` +${p.dietaryRestrictions.length - 1}` : ""}
                            </Badge>
                          )}
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${sc.className}`}>
                            {sc.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-muted-foreground text-sm py-6 text-center">No participants added yet</div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Participant breakdown */}
            <Card data-testid="card-participant-detail">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-500" />
                  Participant Breakdown
                </CardTitle>
                <CardDescription>RSVP status and response rate</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingParticipants ? (
                  <Skeleton className="h-24 w-full" />
                ) : participantStats ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: "Confirmed", value: participantStats.confirmed, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/20" },
                        { label: "Pending", value: participantStats.pending, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-900/20" },
                        { label: "Declined", value: participantStats.declined, color: "text-red-500", bg: "bg-red-50 dark:bg-red-900/20" },
                        { label: "Maybe", value: participantStats.maybe, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-900/20" },
                      ].map((item) => (
                        <div key={item.label} className={`rounded-lg p-3 ${item.bg}`}>
                          <div className={`text-xl font-bold ${item.color}`}>{item.value}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{item.label}</div>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="text-muted-foreground">Response rate</span>
                        <span className="font-medium">{participantStats.responseRate}%</span>
                      </div>
                      <Progress value={participantStats.responseRate} className="h-2" />
                    </div>
                  </div>
                ) : (
                  <div className="text-muted-foreground text-sm py-6 text-center">No participants added yet</div>
                )}
              </CardContent>
            </Card>

            {/* Dietary & Accessibility */}
            <Card data-testid="card-dietary-accessibility">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Utensils className="w-4 h-4 text-orange-500" />
                  Dietary & Accessibility
                </CardTitle>
                <CardDescription>Special requirements for your group</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingDietary ? (
                  <Skeleton className="h-24 w-full" />
                ) : dietaryReqs ? (
                  <div className="space-y-4">
                    {dietaryReqs.restrictions.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Dietary Restrictions</h4>
                        <div className="flex flex-wrap gap-2">
                          {dietaryReqs.restrictions.map((r, i) => (
                            <Badge key={i} variant="secondary">
                              {r.name} &times; {r.count}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {dietaryReqs.accessibilityNeeds.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Accessibility Needs</h4>
                        <div className="flex flex-wrap gap-2">
                          {dietaryReqs.accessibilityNeeds.map((n, i) => (
                            <Badge key={i} variant="outline" className="border-blue-400 text-blue-600 dark:text-blue-400">
                              {n.name} &times; {n.count}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {dietaryReqs.restrictions.length === 0 && dietaryReqs.accessibilityNeeds.length === 0 && (
                      <div className="text-muted-foreground text-sm py-6 text-center">No special requirements recorded</div>
                    )}
                  </div>
                ) : (
                  <div className="text-muted-foreground text-sm py-6 text-center">No dietary data available</div>
                )}
              </CardContent>
            </Card>
          </div>
          </div>
        </TabsContent>

        {/* Planning tab */}
        <TabsContent value="planning" className="mt-4">
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div data-testid="section-temporal-anchors">
                <TemporalAnchorManager tripId={tripId} />
              </div>
              <div className="space-y-4">
                <div data-testid="section-schedule-validator">
                  <ScheduleValidator tripId={tripId} />
                </div>
                <div data-testid="section-energy-budget">
                  <EnergyBudgetDisplay tripId={tripId} />
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
