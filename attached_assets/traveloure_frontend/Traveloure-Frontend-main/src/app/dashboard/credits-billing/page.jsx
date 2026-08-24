"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { AppSidebar } from "../../../components/app-sidebar"
import { Button } from "../../../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card"
import { Input } from "../../../components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog"
import { Navbar } from "../../../components/help-me-decide/navbar"
import { useSelector, useDispatch } from "react-redux"
import { useSession } from "next-auth/react"
import { walletRecharge, getWalletTransactions } from "../../redux-features/Itinerary/ItinerarySlice"
import { userProfile } from "../../redux-features/auth/auth"
import { toast } from "sonner"
import Image from "next/image"
import { Menu, X, Home, CreditCard, Plus, Download, Calendar, DollarSign, RefreshCw } from "lucide-react"
import { format } from "date-fns"

export default function CreditsBillingPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)
  const [activeTab, setActiveTab] = useState("purchase")
  const [selectedCredits, setSelectedCredits] = useState(300)
  const [customAmount, setCustomAmount] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [transactions, setTransactions] = useState([])
  const [loadingTransactions, setLoadingTransactions] = useState(false)

  const dispatch = useDispatch()
  const { data: session } = useSession()
  const token = session?.backendData?.accessToken
  const router = useRouter()
  const loading = useSelector((state) => state.itinerary.loading)
  const walletTransactions = useSelector((state) => state.itinerary.walletTransactions || [])
  const transactionsLoading = useSelector((state) => state.itinerary.transactionsLoading || false)
  const transactionsHasMore = useSelector((state) => state.itinerary.transactionsHasMore || false)
  const transactionsPage = useSelector((state) => state.itinerary.transactionsPage || 1)

  const userinfo = useSelector((state) => {
    const profile = state?.auth?.profile?.data?.[0] || {}
    return profile
  })

  useEffect(() => {
    if (token) {
      dispatch(userProfile({ token }))
      // Load first page of transactions
      dispatch(getWalletTransactions({ token, page: 1, limit: 10, append: false }))
    }
  }, [token, dispatch])

  // Transform API data to match UI format
  useEffect(() => {
    if (walletTransactions && walletTransactions.length > 0) {
      const transformedTransactions = walletTransactions.map((tx) => {
        // Handle different possible API response structures
        const amount = tx.amount || tx.total_amount || tx.price || 0
        const credits = tx.credits || tx.credit_amount || tx.credit || 0
        const date = tx.created_at || tx.date || tx.timestamp || tx.created_date || new Date().toISOString()
        const type = tx.transaction_type || tx.type || (amount > 0 ? "purchase" : "usage")
        const status = tx.status || tx.payment_status || "completed"
        const paymentMethod = tx.payment_method || tx.payment_gateway || "Stripe"
        const description = tx.description || tx.purpose || tx.reason || ""

        return {
          id: tx.id || tx.transaction_id,
          type: type.toLowerCase(),
          credits: type.toLowerCase() === "purchase" ? credits : -Math.abs(credits),
          amount: parseFloat(amount),
          status: status.toLowerCase(),
          date: date,
          payment_method: paymentMethod,
          description: description,
          invoice_url: tx.invoice_url || tx.receipt_url || null,
        }
      })
      
      // Sort by date (newest first)
      transformedTransactions.sort((a, b) => new Date(b.date) - new Date(a.date))
      setTransactions(transformedTransactions)
    } else {
      setTransactions([])
    }
  }, [walletTransactions])

  const creditPackages = [
    {
      credits: 100,
      pricePerCredit: 0.10,
      totalPrice: 10.00
    },
    {
      credits: 300,
      pricePerCredit: 0.082,
      totalPrice: 25.00
    },
    {
      credits: 625,
      pricePerCredit: 0.08,
      totalPrice: 50.00
    }
  ]

  const handleCustomAmountChange = (value) => {
    setCustomAmount(value)
    if (value) {
      const amount = parseFloat(value)
      const credits = Math.floor(amount / 0.082)
      setSelectedCredits(credits)
    }
  }

  const handlePackageSelect = (pkg) => {
    setSelectedCredits(pkg.credits)
    setCustomAmount("")
  }

  const selectedPackage = creditPackages.find(pkg => pkg.credits === selectedCredits)
  const displayPrice = customAmount ? parseFloat(customAmount) : selectedPackage?.totalPrice || 25.00

  const handlePaymentClick = () => {
    if (!session?.backendData?.accessToken) {
      toast.error("Please login to make a payment")
      return
    }
    setShowConfirmModal(true)
  }

  const handlePayment = async () => {
    setShowConfirmModal(false)
    setIsProcessing(true)
    
    try {
      const result = await dispatch(walletRecharge({ 
        token: session.backendData.accessToken, 
        amount: displayPrice.toFixed(2) 
      })).unwrap()
      
      if (result && result.checkout_url) {
        toast.success("Redirecting to payment checkout...")
        // Refresh transactions after successful payment initiation
        dispatch(getWalletTransactions({ token: session.backendData.accessToken }))
        window.location.href = result.checkout_url
      } else {
        toast.error("Invalid payment response")
      }
    } catch (error) {
      console.error("Payment error:", error)
      toast.error(error.message || "Payment failed")
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCancelPayment = () => {
    setShowConfirmModal(false)
  }

  const handleDownloadInvoice = (transactionId) => {
    const transaction = transactions.find(tx => tx.id === transactionId)
    if (transaction?.invoice_url) {
      // Open invoice URL in new tab
      window.open(transaction.invoice_url, '_blank')
    } else {
      // If no invoice URL, show info message
      toast.info("Invoice download feature coming soon")
    }
  }

  const handleLoadMore = () => {
    if (token && transactionsHasMore && !transactionsLoading) {
      const nextPage = transactionsPage + 1
      dispatch(getWalletTransactions({ token, page: nextPage, limit: 10, append: true }))
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64 bg-white shadow-xl">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold text-gray-900">Menu</h2>
              <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <AppSidebar onItemClick={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main Layout */}
      <div className="lg:grid lg:grid-cols-12 lg:gap-0 min-h-screen">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block lg:col-span-2 bg-white border-r border-gray-200">
          <AppSidebar />
        </div>

        {/* Main Content */}
        <div className="lg:col-span-10 p-4 lg:p-6">
          <div className="max-w-7xl mx-auto">
            {/* Mobile Menu Button */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden mb-4 border border-gray-300"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>

            {/* Home Icon with Tooltip - Hidden on Mobile */}
            <div className="absolute top-0 right-0 z-10 lg:hidden">
              <div
                className="relative"
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
              >
                <Home 
                  onClick={() => router.push("/")} 
                  className="h-9 w-9 text-gray-600 hover:text-gray-900 bg-white border shadow-sm border-gray-200 pr-[8px] p-[4px] pl-[8px] cursor-pointer transition-colors rounded-full"
                />
                {showTooltip && (
                  <div className="absolute left-full ml-2 top-1/2 transform -translate-y-1/2 z-50">
                    <div className="bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                      Home
                      <div className="absolute bottom-full mb-2 w-0 h-0 border-l-0 border-r-4 border-t-2 border-b-2 border-transparent border-r-gray-900"></div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Page Header */}
            <div className="mb-4">
              <h1 className="text-lg md:text-xl font-semibold text-gray-900">Credits & Billing</h1>
              <p className="text-xs text-gray-500 mt-0.5">Manage your credits and billing history</p>
            </div>

            {/* Current Credits Card - More Compact */}
            <Card className="mb-4 border border-gray-200 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Image 
                      src="/coins-icon.png" 
                      alt="Credits" 
                      width={24}
                      height={24}
                      className="h-6 w-6 flex-shrink-0"
                      unoptimized
                    />
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Current Balance</p>
                      <h2 className="text-xl font-semibold text-gray-900">
                        {userinfo.credits || 0} <span className="text-sm font-normal text-gray-600">Credits</span>
                      </h2>
                    </div>
                  </div>
                  <Button
                    onClick={() => {
                      setActiveTab("purchase")
                      setTimeout(() => {
                        document.getElementById("purchase-credits")?.scrollIntoView({ behavior: "smooth" })
                      }, 100)
                    }}
                    size="sm"
                    className="bg-gradient-to-r from-[#F30131] to-[#BE35EB] hover:opacity-90 text-white"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Add Credits
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 h-9 bg-gray-100">
                <TabsTrigger value="purchase" className="text-xs sm:text-sm">Purchase Credits</TabsTrigger>
                <TabsTrigger value="history" className="text-xs sm:text-sm">Transaction History</TabsTrigger>
              </TabsList>

              <TabsContent value="purchase" id="purchase-credits">
                <Card className="mt-3 border border-gray-200 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold">Purchase Credits</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-4">
                      {/* Credit Packages */}
                      <div>
                        <p className="text-xs text-gray-600 mb-3">Select a package or enter custom amount</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {creditPackages.map((pkg) => (
                            <button
                              key={pkg.credits}
                              onClick={() => handlePackageSelect(pkg)}
                              className={`text-center transition-all duration-200 p-4 rounded-lg border ${
                                selectedCredits === pkg.credits && !customAmount
                                  ? 'bg-gradient-to-br from-[#F30131] to-[#BE35EB] text-white border-transparent shadow-md'
                                  : 'bg-white border-gray-200 hover:border-[#FF385C] hover:shadow-sm text-gray-900'
                              }`}
                            >
                              <div className="font-semibold text-lg mb-1">
                                {pkg.credits} Credits
                              </div>
                              <div className={`text-xs mb-1.5 ${
                                selectedCredits === pkg.credits && !customAmount 
                                  ? 'text-white/90' 
                                  : 'text-gray-500'
                              }`}>
                                ${pkg.pricePerCredit.toFixed(3)}/Credit
                              </div>
                              <div className={`font-semibold ${
                                selectedCredits === pkg.credits && !customAmount 
                                  ? 'text-white' 
                                  : 'text-gray-900'
                              }`}>
                                ${pkg.totalPrice.toFixed(2)}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* OR Divider */}
                      <div className="relative text-center text-gray-400">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-gray-200"></div>
                        </div>
                        <div className="relative flex justify-center">
                          <span className="bg-white px-3 text-xs font-medium">OR</span>
                        </div>
                      </div>

                      {/* Custom Amount */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1.5">
                            Enter Custom Amount
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">
                              $
                            </span>
                            <Input
                              type="number"
                              placeholder="Enter amount"
                              value={customAmount}
                              onChange={(e) => handleCustomAmountChange(e.target.value)}
                              className="pl-7 h-9 text-sm border-gray-300 focus:border-[#FF385C] focus:ring-[#FF385C]"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1.5">
                            You will Get
                          </label>
                          <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-lg p-3 border border-pink-100">
                            <div className="flex items-baseline justify-between">
                              <span className="text-lg font-semibold bg-gradient-to-r from-[#F30131] to-[#BE35EB] bg-clip-text text-transparent">
                                {selectedCredits} Credits
                              </span>
                              <span className="text-xs text-gray-600">
                                ${(displayPrice / selectedCredits).toFixed(3)}/Credit
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Purchase Button */}
                      <div className="flex justify-center">
                        <Button
                          className="bg-gradient-to-r from-[#F30131] to-[#BE35EB] hover:opacity-90 text-white py-2 px-6 text-sm font-medium rounded-lg h-auto disabled:opacity-50"
                          onClick={handlePaymentClick}
                          disabled={isProcessing || loading}
                        >
                          {(isProcessing || loading) ? (
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              <span>Processing...</span>
                            </div>
                          ) : (
                            `Purchase ${selectedCredits} Credits for $${displayPrice.toFixed(2)}`
                          )}
                        </Button>
                      </div>

                      {/* Secure Payment */}
                      <div className="text-center text-xs text-gray-500 flex items-center justify-center gap-1.5">
                        <Image src="/lock-icon.png" alt="lock" width={14} height={14} />
                        Secure payment powered by Stripe
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="history">
                <Card className="mt-3 border border-gray-200 shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base font-semibold">Transaction History</CardTitle>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (token) {
                            dispatch(getWalletTransactions({ token, page: 1, limit: 10, append: false }))
                            dispatch(userProfile({ token }))
                          }
                        }}
                        disabled={transactionsLoading}
                        className="flex items-center gap-1.5 h-8 text-xs"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${transactionsLoading ? 'animate-spin' : ''}`} />
                        Refresh
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {(loadingTransactions || transactionsLoading) ? (
                      <div className="flex justify-center items-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF385C]"></div>
                      </div>
                    ) : transactions.length === 0 ? (
                      <div className="text-center py-10 text-gray-500">
                        <CreditCard className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                        <p className="text-sm font-medium">No transactions yet</p>
                        <p className="text-xs mt-1 text-gray-400">Your purchase history will appear here</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {transactions.map((transaction) => (
                          <div
                            key={transaction.id}
                            className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-lg ${
                                transaction.type === "purchase" 
                                  ? "bg-green-50 text-green-600" 
                                  : "bg-blue-50 text-blue-600"
                              }`}>
                                {transaction.type === "purchase" ? (
                                  <Plus className="h-4 w-4" />
                                ) : (
                                  <DollarSign className="h-4 w-4" />
                                )}
                              </div>
                              <div>
                                <p className="font-medium text-sm text-gray-900">
                                  {transaction.type === "purchase" 
                                    ? `Purchased ${transaction.credits} Credits`
                                    : `Used ${Math.abs(transaction.credits)} Credits`}
                                </p>
                                <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {format(new Date(transaction.date), "MMM dd, yyyy")}
                                  </span>
                                  {transaction.payment_method && (
                                    <span className="text-gray-400">•</span>
                                  )}
                                  {transaction.payment_method && (
                                    <span>{transaction.payment_method}</span>
                                  )}
                                  {transaction.description && (
                                    <>
                                      <span className="text-gray-400">•</span>
                                      <span className="truncate max-w-[200px]">{transaction.description}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="text-right flex items-center gap-3">
                              <div>
                                {transaction.amount > 0 && (
                                  <p className="font-semibold text-sm text-gray-900">
                                    ${transaction.amount.toFixed(2)}
                                  </p>
                                )}
                                <p className={`text-xs font-medium ${
                                  transaction.type === "purchase" 
                                    ? "text-green-600" 
                                    : "text-blue-600"
                                }`}>
                                  {transaction.type === "purchase" ? "+" : ""}{transaction.credits} Credits
                                </p>
                              </div>
                              {transaction.type === "purchase" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => handleDownloadInvoice(transaction.id)}
                                >
                                  <Download className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                        
                        {/* Load More Button */}
                        {transactionsHasMore && (
                          <div className="flex justify-center pt-4 pb-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleLoadMore}
                              disabled={transactionsLoading}
                              className="flex items-center gap-2 h-8 text-xs"
                            >
                              {transactionsLoading ? (
                                <>
                                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                  Loading...
                                </>
                              ) : (
                                "Load More"
                              )}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Payment Confirmation Modal */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-gray-900">Confirm Payment</DialogTitle>
            <DialogDescription className="text-gray-600 mt-2">
              Are you sure you want to proceed with the payment?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-600">Credits:</span>
                <span className="font-semibold text-gray-900">{selectedCredits} Credits</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Amount:</span>
                <span className="font-semibold text-gray-900">${displayPrice.toFixed(2)}</span>
              </div>
            </div>
            <p className="text-sm text-gray-600 text-center">
              You will be redirected to a secure payment page to complete your purchase.
            </p>
          </div>
          <DialogFooter className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleCancelPayment}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handlePayment}
              className="flex-1 bg-gradient-to-r from-[#F30131] to-[#BE35EB] hover:from-[#D4002A] hover:to-[#A82FD8] text-white"
            >
              Yes, Proceed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

