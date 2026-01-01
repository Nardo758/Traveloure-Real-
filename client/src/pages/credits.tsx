import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DashboardLayout } from "@/components/dashboard-layout";
import { CreditCard, Zap, Gift, Clock, Check, Star } from "lucide-react";
import { motion } from "framer-motion";

const creditPackages = [
  { 
    id: 1, 
    credits: 50, 
    price: 9.99, 
    popular: false,
    features: ["50 AI queries", "Basic expert access", "Email support"]
  },
  { 
    id: 2, 
    credits: 150, 
    price: 24.99, 
    popular: true, 
    savings: "Save 17%",
    features: ["150 AI queries", "Priority expert access", "Chat support", "Itinerary exports"]
  },
  { 
    id: 3, 
    credits: 500, 
    price: 69.99, 
    popular: false, 
    savings: "Save 30%",
    features: ["500 AI queries", "VIP expert access", "Priority support", "Unlimited exports", "Early access to features"]
  },
];

const transactions = [
  { id: 1, type: "purchase", amount: 150, description: "Credit Package Purchase", date: "Dec 28, 2024" },
  { id: 2, type: "used", amount: -10, description: "AI Itinerary Generation - Tokyo", date: "Dec 27, 2024" },
  { id: 3, type: "used", amount: -5, description: "Expert Chat Session", date: "Dec 25, 2024" },
  { id: 4, type: "bonus", amount: 25, description: "Welcome Bonus", date: "Dec 20, 2024" },
];

export default function Credits() {
  const currentBalance = 150;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-8">
        <h1 className="text-2xl font-bold text-[#111827] dark:text-white" data-testid="text-page-title">
          Credits & Billing
        </h1>

        {/* Current Balance */}
        <Card className="bg-gradient-to-r from-[#FF385C] to-[#E23350] text-white border-0">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/80 mb-1">Current Balance</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold" data-testid="text-balance">{currentBalance}</span>
                  <span className="text-xl text-white/80">credits</span>
                </div>
              </div>
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                <Zap className="w-8 h-8" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Credit Packages */}
        <section>
          <h2 className="text-xl font-bold text-[#111827] dark:text-white mb-4">Buy Credits</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {creditPackages.map((pkg, i) => (
              <motion.div
                key={pkg.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <Card className={`border relative ${pkg.popular ? 'border-[#FF385C] shadow-lg' : 'border-[#E5E7EB]'}`} data-testid={`card-package-${pkg.id}`}>
                  {pkg.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-[#FF385C] text-white">Most Popular</Badge>
                    </div>
                  )}
                  <CardHeader className="text-center pt-8">
                    <div className="w-12 h-12 bg-[#FFE3E8] rounded-full flex items-center justify-center mx-auto mb-4">
                      <Gift className="w-6 h-6 text-[#FF385C]" />
                    </div>
                    <CardTitle className="text-3xl font-bold text-[#111827] dark:text-white">
                      {pkg.credits}
                    </CardTitle>
                    <CardDescription className="text-[#6B7280]">credits</CardDescription>
                    <div className="mt-4">
                      <span className="text-2xl font-bold text-[#111827] dark:text-white">${pkg.price}</span>
                      {pkg.savings && (
                        <Badge variant="secondary" className="ml-2 bg-green-100 text-green-600">
                          {pkg.savings}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3 mb-6">
                      {pkg.features.map((feature, j) => (
                        <li key={j} className="flex items-center gap-2 text-sm text-[#6B7280]">
                          <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <Button 
                      className={`w-full ${pkg.popular ? 'bg-[#FF385C] hover:bg-[#E23350] text-white' : ''}`}
                      variant={pkg.popular ? "default" : "outline"}
                      data-testid={`button-buy-${pkg.id}`}
                    >
                      Buy Now
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Transaction History */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-[#111827] dark:text-white">Transaction History</h2>
            <Button variant="ghost" className="text-[#FF385C]" data-testid="button-view-all-transactions">
              View All
            </Button>
          </div>
          <Card className="border border-[#E5E7EB]">
            <CardContent className="p-0">
              <div className="divide-y divide-[#E5E7EB]">
                {transactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between p-4" data-testid={`transaction-${tx.id}`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        tx.type === "purchase" ? "bg-green-100" :
                        tx.type === "bonus" ? "bg-purple-100" :
                        "bg-gray-100"
                      }`}>
                        {tx.type === "purchase" ? (
                          <CreditCard className="w-5 h-5 text-green-600" />
                        ) : tx.type === "bonus" ? (
                          <Star className="w-5 h-5 text-purple-600" />
                        ) : (
                          <Clock className="w-5 h-5 text-gray-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-[#111827] dark:text-white">{tx.description}</p>
                        <p className="text-sm text-[#6B7280]">{tx.date}</p>
                      </div>
                    </div>
                    <span className={`font-semibold ${
                      tx.amount > 0 ? "text-green-600" : "text-[#6B7280]"
                    }`}>
                      {tx.amount > 0 ? "+" : ""}{tx.amount} credits
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </DashboardLayout>
  );
}
