import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Wallet, 
  DollarSign, 
  TrendingUp, 
  TrendingDown,
  PieChart,
  Users,
  Globe,
  Calculator,
  Receipt,
  AlertCircle,
  CheckCircle,
  ArrowRight,
  CreditCard,
  Banknote,
  Split
} from "lucide-react";

export interface BudgetCategory {
  id: string;
  name: string;
  icon: string;
  allocated: number;
  spent: number;
  items: BudgetItem[];
}

export interface BudgetItem {
  id: string;
  name: string;
  amount: number;
  currency: string;
  convertedAmount: number;
  date: Date;
  paidBy?: string;
  splitAmong?: string[];
  isEstimate?: boolean;
  vendor?: string;
}

export interface PersonSplit {
  id: string;
  name: string;
  totalOwed: number;
  totalPaid: number;
  balance: number;
}

export interface CurrencyRate {
  code: string;
  symbol: string;
  rate: number;
  name: string;
}

interface BudgetIntelligenceProps {
  experienceId: string;
  experienceName: string;
  baseCurrency: string;
  totalBudget: number;
  categories: BudgetCategory[];
  personSplits: PersonSplit[];
  currencies: CurrencyRate[];
  regionalTipRates: Record<string, number>;
  onAddExpense?: (categoryId: string, item: Partial<BudgetItem>) => void;
  onRecordPayment?: (personId: string, amount: number) => void;
  onSettleUp?: (fromPersonId: string, toPersonId: string, amount: number) => void;
}

export function BudgetIntelligence({
  experienceName,
  baseCurrency,
  totalBudget,
  categories,
  personSplits,
  currencies,
  regionalTipRates,
}: BudgetIntelligenceProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedCurrency, setSelectedCurrency] = useState(baseCurrency);
  const [tipLocation, setTipLocation] = useState("usa");

  const totalAllocated = categories.reduce((sum, c) => sum + c.allocated, 0);
  const totalSpent = categories.reduce((sum, c) => sum + c.spent, 0);
  const remaining = totalBudget - totalSpent;
  const spentPercentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  const selectedCurrencyRate = currencies.find(c => c.code === selectedCurrency);
  const convertAmount = (amount: number) => {
    if (!selectedCurrencyRate) return amount;
    return amount * selectedCurrencyRate.rate;
  };

  const formatCurrency = (amount: number, currencyCode?: string) => {
    const code = currencyCode || selectedCurrency;
    const curr = currencies.find(c => c.code === code);
    return `${curr?.symbol || '$'}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const tipRate = regionalTipRates[tipLocation] || 0;

  const overBudgetCategories = categories.filter(c => c.spent > c.allocated);
  const underSpentCategories = categories.filter(c => c.spent < c.allocated * 0.5 && c.allocated > 0);

  const totalOwed = personSplits.reduce((sum, p) => sum + Math.max(0, p.balance), 0);
  const unsettledBalances = personSplits.filter(p => p.balance !== 0);

  return (
    <Card className="w-full" data-testid="card-budget-intelligence">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2" data-testid="text-budget-title">
            <Wallet className="h-5 w-5" />
            Budget Intelligence
          </CardTitle>
          <CardDescription data-testid="text-budget-description">
            Real-time spend tracking and cost splitting for {experienceName}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
            <SelectTrigger className="w-[120px]" data-testid="select-currency">
              <Globe className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencies.map(curr => (
                <SelectItem key={curr.code} value={curr.code} data-testid={`select-item-currency-${curr.code}`}>
                  {curr.symbol} {curr.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-4 mb-4">
          <Card data-testid="card-total-budget">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{formatCurrency(convertAmount(totalBudget))}</div>
              <p className="text-sm text-muted-foreground">Total Budget</p>
            </CardContent>
          </Card>
          <Card data-testid="card-total-spent">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-amber-600">{formatCurrency(convertAmount(totalSpent))}</div>
              <p className="text-sm text-muted-foreground">Spent</p>
            </CardContent>
          </Card>
          <Card data-testid="card-remaining">
            <CardContent className="pt-4">
              <div className={`text-2xl font-bold ${remaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(convertAmount(remaining))}
              </div>
              <p className="text-sm text-muted-foreground">Remaining</p>
            </CardContent>
          </Card>
          <Card data-testid="card-per-person">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">
                {formatCurrency(convertAmount(totalSpent / Math.max(1, personSplits.length)))}
              </div>
              <p className="text-sm text-muted-foreground">Per Person</p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-sm">
            <span>Budget Usage</span>
            <span className="font-medium">{Math.round(spentPercentage)}%</span>
          </div>
          <Progress 
            value={Math.min(100, spentPercentage)} 
            className={`h-3 ${spentPercentage > 100 ? '[&>div]:bg-red-500' : spentPercentage > 80 ? '[&>div]:bg-amber-500' : ''}`}
            data-testid="progress-budget" 
          />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4" data-testid="tabs-budget">
            <TabsTrigger value="overview" data-testid="tab-overview">
              <PieChart className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="splitting" data-testid="tab-splitting">
              <Split className="w-4 h-4 mr-2" />
              Splitting
            </TabsTrigger>
            <TabsTrigger value="currency" data-testid="tab-currency">
              <Globe className="w-4 h-4 mr-2" />
              Currency
            </TabsTrigger>
            <TabsTrigger value="tips" data-testid="tab-tips">
              <Calculator className="w-4 h-4 mr-2" />
              Tip Calculator
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            {overBudgetCategories.length > 0 && (
              <Card className="border-red-500 bg-red-50 dark:bg-red-900/20" data-testid="card-over-budget-warning">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-red-600">
                    <AlertCircle className="w-5 h-5" />
                    <span className="font-medium">Over Budget Alert</span>
                  </div>
                  <p className="text-sm mt-1">
                    {overBudgetCategories.map(c => c.name).join(", ")} {overBudgetCategories.length === 1 ? 'is' : 'are'} over budget
                  </p>
                </CardContent>
              </Card>
            )}

            <ScrollArea className="h-[300px]">
              <div className="space-y-3">
                {categories.map(category => {
                  const percentage = category.allocated > 0 ? (category.spent / category.allocated) * 100 : 0;
                  const isOver = category.spent > category.allocated;
                  
                  return (
                    <Card key={category.id} data-testid={`card-category-${category.id}`}>
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{category.name}</span>
                            {isOver && <Badge variant="destructive">Over Budget</Badge>}
                          </div>
                          <div className="text-right">
                            <span className="font-medium">{formatCurrency(convertAmount(category.spent))}</span>
                            <span className="text-muted-foreground"> / {formatCurrency(convertAmount(category.allocated))}</span>
                          </div>
                        </div>
                        <Progress 
                          value={Math.min(100, percentage)} 
                          className={`h-2 ${isOver ? '[&>div]:bg-red-500' : percentage > 80 ? '[&>div]:bg-amber-500' : ''}`}
                        />
                        {category.items.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {category.items.slice(0, 3).map(item => (
                              <div key={item.id} className="flex justify-between text-sm text-muted-foreground" data-testid={`row-expense-${item.id}`}>
                                <span data-testid={`text-expense-name-${item.id}`}>{item.name}</span>
                                <span data-testid={`text-expense-amount-${item.id}`}>{formatCurrency(convertAmount(item.convertedAmount))}</span>
                              </div>
                            ))}
                            {category.items.length > 3 && (
                              <p className="text-xs text-muted-foreground">+{category.items.length - 3} more items</p>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="splitting" className="space-y-4 mt-4">
            <Card data-testid="card-split-summary">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Cost Split Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {personSplits.map(person => (
                    <div 
                      key={person.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                      data-testid={`row-person-split-${person.id}`}
                    >
                      <div>
                        <p className="font-medium">{person.name}</p>
                        <div className="flex gap-4 text-sm text-muted-foreground">
                          <span>Owes: {formatCurrency(convertAmount(person.totalOwed))}</span>
                          <span>Paid: {formatCurrency(convertAmount(person.totalPaid))}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-lg font-bold ${person.balance > 0 ? 'text-red-600' : person.balance < 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                          {person.balance > 0 ? '+' : ''}{formatCurrency(convertAmount(person.balance))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {person.balance > 0 ? 'owes group' : person.balance < 0 ? 'owed by group' : 'settled'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {unsettledBalances.length > 0 && (
              <Card data-testid="card-settle-up">
                <CardHeader>
                  <CardTitle className="text-base">Settle Up Suggestions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {personSplits
                      .filter(p => p.balance > 0)
                      .map(debtor => {
                        const creditors = personSplits.filter(p => p.balance < 0);
                        return creditors.map(creditor => {
                          const transferAmount = Math.min(debtor.balance, Math.abs(creditor.balance));
                          if (transferAmount <= 0) return null;
                          return (
                            <div 
                              key={`${debtor.id}-${creditor.id}`}
                              className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                              data-testid={`row-settle-up-${debtor.id}-${creditor.id}`}
                            >
                              <div className="flex items-center gap-2">
                                <span data-testid={`text-settle-up-debtor-${debtor.id}`}>{debtor.name}</span>
                                <ArrowRight className="w-4 h-4" />
                                <span data-testid={`text-settle-up-creditor-${creditor.id}`}>{creditor.name}</span>
                              </div>
                              <Button 
                                variant="outline" 
                                size="sm"
                                data-testid={`button-settle-up-${debtor.id}-${creditor.id}`}
                              >
                                Pay {formatCurrency(convertAmount(transferAmount))}
                              </Button>
                            </div>
                          );
                        });
                      })}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="currency" className="space-y-4 mt-4">
            <Card data-testid="card-currency-converter">
              <CardHeader>
                <CardTitle className="text-base">Currency Converter</CardTitle>
                <CardDescription>Convert amounts between currencies</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">From {baseCurrency}</label>
                    <div className="text-2xl font-bold mt-1">
                      {formatCurrency(1000, baseCurrency)}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium">To {selectedCurrency}</label>
                    <div className="text-2xl font-bold mt-1">
                      {formatCurrency(convertAmount(1000))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-exchange-rates">
              <CardHeader>
                <CardTitle className="text-base">Exchange Rates</CardTitle>
                <CardDescription>Current rates relative to {baseCurrency}</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[200px]">
                  <div className="space-y-2">
                    {currencies.map(curr => (
                      <div 
                        key={curr.code}
                        className="flex items-center justify-between p-2 rounded-lg border"
                        data-testid={`row-currency-rate-${curr.code}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-lg" data-testid={`text-currency-symbol-${curr.code}`}>{curr.symbol}</span>
                          <div>
                            <p className="font-medium" data-testid={`text-currency-code-${curr.code}`}>{curr.code}</p>
                            <p className="text-xs text-muted-foreground">{curr.name}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium" data-testid={`text-currency-rate-${curr.code}`}>{curr.rate.toFixed(4)}</p>
                          <p className="text-xs text-muted-foreground">per 1 {baseCurrency}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tips" className="space-y-4 mt-4">
            <Card data-testid="card-tip-calculator">
              <CardHeader>
                <CardTitle className="text-base">Regional Tip Calculator</CardTitle>
                <CardDescription>Recommended tipping rates vary by location</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Select value={tipLocation} onValueChange={setTipLocation}>
                    <SelectTrigger data-testid="select-tip-location">
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="usa" data-testid="select-item-tip-usa">United States (15-20%)</SelectItem>
                      <SelectItem value="europe" data-testid="select-item-tip-europe">Europe (5-10%)</SelectItem>
                      <SelectItem value="uk" data-testid="select-item-tip-uk">United Kingdom (10-15%)</SelectItem>
                      <SelectItem value="japan" data-testid="select-item-tip-japan">Japan (0% - not expected)</SelectItem>
                      <SelectItem value="mexico" data-testid="select-item-tip-mexico">Mexico (10-15%)</SelectItem>
                      <SelectItem value="australia" data-testid="select-item-tip-australia">Australia (10%)</SelectItem>
                      <SelectItem value="canada" data-testid="select-item-tip-canada">Canada (15-20%)</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="p-4 rounded-lg bg-muted/50">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Recommended Tip</span>
                      <Badge variant="secondary" className="text-lg">
                        {tipRate}%
                      </Badge>
                    </div>
                    <Separator className="my-3" />
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>On $50 bill</span>
                        <span className="font-medium">{formatCurrency(50 * (tipRate / 100))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>On $100 bill</span>
                        <span className="font-medium">{formatCurrency(100 * (tipRate / 100))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>On $200 bill</span>
                        <span className="font-medium">{formatCurrency(200 * (tipRate / 100))}</span>
                      </div>
                    </div>
                  </div>

                  {tipRate === 0 && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                      <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium">Tipping Not Expected</p>
                        <p className="text-muted-foreground">In this region, tipping is not customary and may even be considered rude.</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
