import { ProviderLayout } from "@/components/provider/provider-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DollarSign,
  CreditCard,
  ArrowRight,
  Download,
  Plus,
  Calendar,
  CheckCircle,
  Clock,
  AlertCircle,
} from "lucide-react";

interface Payout {
  id: string;
  amount: number;
  status: "completed" | "pending" | "processing";
  date: string;
  method: string;
}

interface BankAccount {
  id: string;
  accountName: string;
  accountNumber: string;
  routingNumber: string;
  isDefault: boolean;
}

export default function Payouts() {
  const [selectedPeriod, setSelectedPeriod] = useState("current");

  const { data: payouts } = useQuery<Payout[]>({
    queryKey: ["/api/provider/payouts"],
  });

  const { data: bankAccounts } = useQuery<BankAccount[]>({
    queryKey: ["/api/provider/bank-accounts"],
  });

  const pendingBalance = 2847.50;
  const totalEarnings = 12450.00;

  return (
    <ProviderLayout title="Payouts & Payments">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900" data-testid="text-title">
              Payouts & Payments
            </h2>
            <p className="text-gray-600 mt-1">Manage your earnings, bank accounts, and payment history</p>
          </div>
          <Button className="bg-[#FF385C] hover:bg-[#FF385C]/90" data-testid="button-request-payout">
            <DollarSign className="w-4 h-4 mr-2" /> Request Payout
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Pending Balance</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">${pendingBalance.toLocaleString()}</p>
                </div>
                <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
                  <Clock className="w-6 h-6 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Earnings</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">${totalEarnings.toLocaleString()}</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Commission Rate</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">15%</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <CreditCard className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Bank Accounts */}
          <Card className="lg:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-lg">Bank Accounts</CardTitle>
              <Button size="sm" data-testid="button-add-account">
                <Plus className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {(bankAccounts || []).length > 0 ? (
                (bankAccounts || []).map((account) => (
                  <div
                    key={account.id}
                    className={`p-3 rounded-lg border ${
                      account.isDefault
                        ? "border-green-200 bg-green-50"
                        : "border-gray-200 bg-white"
                    }`}
                    data-testid={`card-account-${account.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate">
                          {account.accountName}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          ••••{account.accountNumber.slice(-4)}
                        </p>
                      </div>
                      {account.isDefault && (
                        <Badge className="text-xs flex-shrink-0 bg-green-100 text-green-700">
                          Default
                        </Badge>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-6">
                  <CreditCard className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No bank accounts added</p>
                  <Button variant="outline" size="sm" className="mt-3 w-full" data-testid="button-add-first-account">
                    <Plus className="w-3 h-3 mr-1" /> Add Account
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payout History */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Payout History</CardTitle>
                <div className="flex gap-2">
                  <select
                    value={selectedPeriod}
                    onChange={(e) => setSelectedPeriod(e.target.value)}
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    data-testid="select-period"
                  >
                    <option value="current">Current Month</option>
                    <option value="last-month">Last Month</option>
                    <option value="last-3">Last 3 Months</option>
                    <option value="all">All Time</option>
                  </select>
                  <Button variant="outline" size="sm" data-testid="button-download-csv">
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {(payouts || []).length > 0 ? (
                  (payouts || []).map((payout) => (
                    <div
                      key={payout.id}
                      className="p-4 border border-gray-200 rounded-lg"
                      data-testid={`card-payout-${payout.id}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1">
                          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-green-100">
                            {payout.status === "completed" ? (
                              <CheckCircle className="w-5 h-5 text-green-600" />
                            ) : (
                              <Clock className="w-5 h-5 text-amber-600" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900">
                              ${payout.amount.toLocaleString()}
                            </p>
                            <p className="text-sm text-gray-600 mt-1 flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {new Date(payout.date).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <Badge
                          className={`text-xs flex-shrink-0 ${
                            payout.status === "completed"
                              ? "bg-green-100 text-green-700"
                              : payout.status === "processing"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {payout.status.charAt(0).toUpperCase() +
                            payout.status.slice(1)}
                        </Badge>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No payouts yet</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Payment Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Payment Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">How Payouts Work</h3>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li className="flex items-start gap-2">
                    <ArrowRight className="w-4 h-4 mt-0.5 text-[#FF385C] flex-shrink-0" />
                    Earnings accrue daily
                  </li>
                  <li className="flex items-start gap-2">
                    <ArrowRight className="w-4 h-4 mt-0.5 text-[#FF385C] flex-shrink-0" />
                    Request payout once minimum is reached
                  </li>
                  <li className="flex items-start gap-2">
                    <ArrowRight className="w-4 h-4 mt-0.5 text-[#FF385C] flex-shrink-0" />
                    Processing takes 2-3 business days
                  </li>
                  <li className="flex items-start gap-2">
                    <ArrowRight className="w-4 h-4 mt-0.5 text-[#FF385C] flex-shrink-0" />
                    Funds deposited to your bank account
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Commission Breakdown</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Gross Earnings</span>
                    <span className="font-semibold text-gray-900">${totalEarnings.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Platform Fee (15%)</span>
                    <span className="font-semibold text-gray-900">
                      -${(totalEarnings * 0.15).toLocaleString()}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-gray-200 flex items-center justify-between">
                    <span className="text-gray-600">Net Earnings</span>
                    <span className="font-semibold text-green-600">
                      ${(totalEarnings * 0.85).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ProviderLayout>
  );
}
