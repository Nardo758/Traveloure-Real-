import { useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CreditCard,
  DollarSign,
  Plus,
  Download,
  Clock,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownLeft,
  Sparkles,
  Gift,
  Calendar,
  Receipt,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";

const creditPackages = [
  { id: 1, credits: 50, price: 49, popular: false },
  { id: 2, credits: 100, price: 89, popular: true, savings: "11%" },
  { id: 3, credits: 250, price: 199, popular: false, savings: "20%" },
  { id: 4, credits: 500, price: 349, popular: false, savings: "30%" },
];

const transactions = [
  {
    id: 1,
    type: "purchase",
    description: "Credit Package Purchase",
    amount: 100,
    credits: 100,
    date: new Date("2026-01-02"),
    status: "completed",
  },
  {
    id: 2,
    type: "spent",
    description: "AI Itinerary Generation - Tokyo Trip",
    amount: 0,
    credits: -15,
    date: new Date("2026-01-01"),
    status: "completed",
  },
  {
    id: 3,
    type: "spent",
    description: "Expert Consultation - 30 min",
    amount: 0,
    credits: -25,
    date: new Date("2025-12-28"),
    status: "completed",
  },
  {
    id: 4,
    type: "bonus",
    description: "New Year Bonus Credits",
    amount: 0,
    credits: 20,
    date: new Date("2025-12-25"),
    status: "completed",
  },
  {
    id: 5,
    type: "spent",
    description: "Restaurant Booking - Paris",
    amount: 0,
    credits: -10,
    date: new Date("2025-12-20"),
    status: "completed",
  },
  {
    id: 6,
    type: "purchase",
    description: "Credit Package Purchase",
    amount: 49,
    credits: 50,
    date: new Date("2025-12-15"),
    status: "completed",
  },
];

const paymentMethods = [
  { id: 1, type: "visa", last4: "4242", expiry: "12/27", isDefault: true },
  { id: 2, type: "mastercard", last4: "8888", expiry: "06/26", isDefault: false },
];

const invoices = [
  { id: "INV-2026-001", date: new Date("2026-01-02"), amount: 89, status: "paid" },
  { id: "INV-2025-012", date: new Date("2025-12-15"), amount: 49, status: "paid" },
  { id: "INV-2025-011", date: new Date("2025-11-20"), amount: 199, status: "paid" },
];

export default function CreditsBillingPage() {
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null);
  const currentBalance = 150;
  const monthlySpent = 50;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-[#111827] dark:text-white" data-testid="text-page-title">
              Credits & Billing
            </h1>
            <p className="text-[#6B7280] mt-1">Manage your credits and payment methods</p>
          </div>
          <Button className="bg-[#FF385C] hover:bg-[#E23350]" data-testid="button-buy-credits">
            <Plus className="w-4 h-4 mr-2" />
            Buy Credits
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-gradient-to-br from-[#FF385C] to-[#E23350] text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Sparkles className="w-6 h-6" />
                </div>
                <Badge className="bg-white/20 text-white">Active</Badge>
              </div>
              <p className="text-white/80 text-sm">Current Balance</p>
              <p className="text-4xl font-bold mt-1" data-testid="text-credit-balance">{currentBalance}</p>
              <p className="text-white/80 text-sm mt-1">credits available</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <ArrowDownLeft className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
              <p className="text-[#6B7280] text-sm">This Month Spent</p>
              <p className="text-3xl font-bold text-[#111827] dark:text-white mt-1" data-testid="text-monthly-spent">
                {monthlySpent}
              </p>
              <p className="text-[#6B7280] text-sm mt-1">credits used</p>
              <Progress value={33} className="mt-3 h-2" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <Gift className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <p className="text-[#6B7280] text-sm">Bonus Credits</p>
              <p className="text-3xl font-bold text-[#111827] dark:text-white mt-1" data-testid="text-bonus-credits">20</p>
              <p className="text-[#6B7280] text-sm mt-1">earned this month</p>
              <Button variant="ghost" className="mt-2 p-0 h-auto text-[#FF385C]" data-testid="link-earn-more">
                Earn more <ArrowUpRight className="w-3 h-3 ml-1" />
              </Button>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="packages" className="space-y-6">
          <TabsList className="bg-gray-100 dark:bg-gray-800">
            <TabsTrigger value="packages" data-testid="tab-packages">Credit Packages</TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">Transaction History</TabsTrigger>
            <TabsTrigger value="payment" data-testid="tab-payment">Payment Methods</TabsTrigger>
            <TabsTrigger value="invoices" data-testid="tab-invoices">Invoices</TabsTrigger>
          </TabsList>

          <TabsContent value="packages">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {creditPackages.map((pkg) => (
                <Card
                  key={pkg.id}
                  className={`relative cursor-pointer transition-all ${
                    selectedPackage === pkg.id
                      ? "ring-2 ring-[#FF385C] border-[#FF385C]"
                      : "hover:shadow-md"
                  } ${pkg.popular ? "border-[#FF385C]" : ""}`}
                  onClick={() => setSelectedPackage(pkg.id)}
                  data-testid={`card-package-${pkg.credits}`}
                >
                  {pkg.popular && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#FF385C]">
                      Most Popular
                    </Badge>
                  )}
                  <CardContent className="p-6 text-center">
                    <div className="p-3 bg-[#FFE3E8] dark:bg-[#FF385C]/20 rounded-full w-fit mx-auto mb-4">
                      <Sparkles className="w-8 h-8 text-[#FF385C]" />
                    </div>
                    <p className="text-4xl font-bold text-[#111827] dark:text-white">{pkg.credits}</p>
                    <p className="text-[#6B7280] mb-4">credits</p>
                    <p className="text-2xl font-bold text-[#111827] dark:text-white">${pkg.price}</p>
                    {pkg.savings && (
                      <Badge variant="secondary" className="mt-2">
                        Save {pkg.savings}
                      </Badge>
                    )}
                    <Button
                      className={`w-full mt-4 ${
                        selectedPackage === pkg.id
                          ? "bg-[#FF385C] hover:bg-[#E23350]"
                          : "bg-gray-900 hover:bg-gray-800 dark:bg-gray-700"
                      }`}
                      data-testid={`button-select-${pkg.credits}`}
                    >
                      {selectedPackage === pkg.id ? "Selected" : "Select"}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
            {selectedPackage && (
              <div className="mt-6 flex justify-end">
                <Button className="bg-[#FF385C] hover:bg-[#E23350]" data-testid="button-checkout">
                  Proceed to Checkout
                  <ArrowUpRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <CardTitle className="text-lg">Transaction History</CardTitle>
                <Button variant="outline" size="sm" data-testid="button-export-history">
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {transactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
                      data-testid={`row-transaction-${tx.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`p-2 rounded-lg ${
                            tx.type === "purchase"
                              ? "bg-green-100 dark:bg-green-900/30"
                              : tx.type === "bonus"
                              ? "bg-purple-100 dark:bg-purple-900/30"
                              : "bg-gray-200 dark:bg-gray-700"
                          }`}
                        >
                          {tx.type === "purchase" ? (
                            <CreditCard className="w-5 h-5 text-green-600 dark:text-green-400" />
                          ) : tx.type === "bonus" ? (
                            <Gift className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                          ) : (
                            <ArrowUpRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-[#111827] dark:text-white">{tx.description}</p>
                          <p className="text-sm text-[#6B7280]">{format(tx.date, "MMM d, yyyy")}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p
                          className={`font-bold ${
                            tx.credits > 0 ? "text-green-600" : "text-[#111827] dark:text-white"
                          }`}
                        >
                          {tx.credits > 0 ? "+" : ""}
                          {tx.credits} credits
                        </p>
                        {tx.amount > 0 && <p className="text-sm text-[#6B7280]">${tx.amount}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payment">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-4">
                  <CardTitle className="text-lg">Saved Payment Methods</CardTitle>
                  <Button variant="outline" size="sm" data-testid="button-add-payment">
                    <Plus className="w-4 h-4 mr-2" />
                    Add New
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  {paymentMethods.map((method) => (
                    <div
                      key={method.id}
                      className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg"
                      data-testid={`card-payment-${method.last4}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                          <CreditCard className="w-6 h-6 text-[#6B7280]" />
                        </div>
                        <div>
                          <p className="font-medium text-[#111827] dark:text-white capitalize">
                            {method.type} ending in {method.last4}
                          </p>
                          <p className="text-sm text-[#6B7280]">Expires {method.expiry}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {method.isDefault && (
                          <Badge variant="secondary">Default</Badge>
                        )}
                        <Button variant="ghost" size="sm" data-testid={`button-edit-payment-${method.last4}`}>
                          Edit
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Billing Address</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <p className="font-medium text-[#111827] dark:text-white">John Doe</p>
                    <p className="text-[#6B7280] mt-1">123 Main Street</p>
                    <p className="text-[#6B7280]">San Francisco, CA 94105</p>
                    <p className="text-[#6B7280]">United States</p>
                    <Button variant="outline" size="sm" className="mt-4" data-testid="button-edit-billing">
                      Edit Address
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="invoices">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Invoices</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {invoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
                      data-testid={`row-invoice-${invoice.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-2 bg-gray-200 dark:bg-gray-700 rounded-lg">
                          <Receipt className="w-5 h-5 text-[#6B7280]" />
                        </div>
                        <div>
                          <p className="font-medium text-[#111827] dark:text-white">{invoice.id}</p>
                          <p className="text-sm text-[#6B7280]">{format(invoice.date, "MMMM d, yyyy")}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-bold text-[#111827] dark:text-white">${invoice.amount}</p>
                          <Badge variant="secondary" className="bg-green-100 text-green-700">
                            {invoice.status}
                          </Badge>
                        </div>
                        <Button variant="ghost" size="icon" data-testid={`button-download-${invoice.id}`}>
                          <Download className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
