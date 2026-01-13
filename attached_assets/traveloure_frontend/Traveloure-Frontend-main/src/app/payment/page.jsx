"use client"

import { useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { useDispatch, useSelector } from "react-redux"
import { walletRecharge } from "../redux-features/Itinerary/ItinerarySlice"

export default function PaymentPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const dispatch = useDispatch()
  const [selectedCredits, setSelectedCredits] = useState(300)
  const [customAmount, setCustomAmount] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  
  // Get loading state from Redux
  const loading = useSelector((state) => state.itinerary.loading)

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
      const credits = Math.floor(amount / 0.082) // Using 300 credits rate
      setSelectedCredits(credits)
    }
  }

  const handlePackageSelect = (pkg) => {
    setSelectedCredits(pkg.credits)
    setCustomAmount("")
  }

  const selectedPackage = creditPackages.find(pkg => pkg.credits === selectedCredits)
  const displayPrice = customAmount ? parseFloat(customAmount) : selectedPackage?.totalPrice || 25.00

  // Handle payment confirmation modal
  const handlePaymentClick = () => {
    if (!session?.backendData?.accessToken) {
      toast.error("Please login to make a payment")
      return
    }
    setShowConfirmModal(true)
  }

  // Handle payment API call
  const handlePayment = async () => {
    setShowConfirmModal(false)
    setIsProcessing(true)
    
    try {
      const result = await dispatch(walletRecharge({ 
        token: session.backendData.accessToken, 
        amount: displayPrice.toFixed(2) 
      })).unwrap()
      if (result && result.checkout_url) {
        toast.success(`Redirecting to payment checkout...`)
        // Redirect to Stripe checkout URL
        window.location.href = result.checkout_url
      } else {
        toast.error('Invalid payment response')
      }
    } catch (error) {
      console.error('Payment error:', error)
      // Error toast is handled in the Redux action
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCancelPayment = () => {
    setShowConfirmModal(false)
  }

    return (
    <div className="min-h-screen bg-gray-50">
   
     {/* Main Content Container */}
     <div className="max-w-7xl mx-auto p-3 sm:p-6">
       <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg overflow-hidden">
         <div className="flex lg:p-12 p-6">
           {/* Left Side - Image with Gradient - Hidden on mobile */}
           <div className="hidden lg:block lg:w-1/2 h-[600px] relative">
             <Image
               src="/payment-sideimg.png"
               alt="Payment Side Image"
               fill
               className="object-cover"
               style={{
                   borderTopLeftRadius: '14px',
                   borderBottomLeftRadius: '14px',
               }}
             />
           
             {/* Content Over Gradient */}
             <div className="absolute inset-0 flex flex-col justify-center px-12 text-white">
               <h1 className="text-4xl font-bold mb-4">
                 How Traveloure Credits Work
               </h1>
               <p className="text-lg leading-relaxed">
                 Experience personalized travel planning with insider knowledge 
                 from local experts, powered by advanced AI.
               </p>
             </div>
           </div>

           {/* Payment Form - Full width on mobile, half on desktop */}
           <div className="w-full lg:w-1/2 flex items-center justify-center">
             <div className="w-full max-w-md mx-auto">
            <div className="text-center mb-6 sm:mb-8">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
                Choose Your Credits
              </h2>
              <p className="text-sm sm:text-base text-gray-600">
                Select a package or enter custom amount
              </p>
            </div>

            {/* Credit Packages */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              {creditPackages.map((pkg) => (
                <button
                  key={pkg.credits}
                  onClick={() => handlePackageSelect(pkg)}
                  className={`text-center transition-all duration-300 flex-shrink-0 ${
                    selectedCredits === pkg.credits && !customAmount
                      ? 'bg-gradient-to-br from-[#F30131] to-[#BE35EB] text-white border-none transform scale-105 shadow-lg'
                      : 'bg-white border border-gray-200 hover:border-gray-300 shadow-sm text-gray-900'
                  }`}
                  style={{
                    width: '100%',
                    height: '130px',
                    borderRadius: '14px'
                  }}
                >
                  <div className="h-full flex flex-col justify-center items-center px-3">
                    <div className="font-bold text-sm lg:text-base mb-1">
                      {pkg.credits} Credits
                    </div>
                    <div className={`text-xs lg:text-sm mb-2 ${
                      selectedCredits === pkg.credits && !customAmount 
                        ? 'text-white/80' 
                        : 'text-gray-500'
                    }`}>
                      ${pkg.pricePerCredit.toFixed(3)}/Credit
                    </div>
                    <div className="font-semibold text-sm lg:text-base">
                      ${pkg.totalPrice.toFixed(2)}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* OR Divider */}
            <div className="relative text-center text-gray-500 mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="bg-gray-50 px-4 text-sm font-medium">OR</span>
              </div>
            </div>

            {/* Custom Amount and You will Get - Responsive Layout */}
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 mb-6">
              {/* Left Side - Custom Amount and You will Get */}
              <div className="w-full sm:w-1/2">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Enter Custom Amount:
                  </label>
                </div>
                <div className="mt-4 sm:mt-8">
                  <div className="text-sm text-gray-600 mb-2">You will Get:</div>
                </div>
              </div>

              {/* Right Side - Input and Credits Display */}
              <div className="w-full sm:w-1/2">
                <div className="relative mb-4">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                    $
                  </span>
                  <Input
                    type="number"
                    placeholder="Enter Amount"
                    value={customAmount}
                    onChange={(e) => handleCustomAmountChange(e.target.value)}
                    className="pl-8 border-gray-300 focus:border-[#FF385C] focus:ring-[#FF385C] h-11"
                  />
                </div>

                {/* You will Get Results */}
                <div className="bg-pink-50 rounded-lg p-4">
                  <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between mb-2">
                    <span className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-[#F30131] to-[#BE35EB] bg-clip-text text-transparent mb-1 sm:mb-0">
                      {selectedCredits} Credits
                    </span>
                    <span className="text-xs sm:text-sm text-gray-500">
                      ${(displayPrice / selectedCredits).toFixed(3)}/Credit
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Purchase Button */}
            <Button
              className="w-full bg-gradient-to-r from-[#F30131] to-[#BE35EB] hover:opacity-90 text-white py-3 sm:py-4 text-sm sm:text-base font-semibold rounded-xl h-auto disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handlePaymentClick}
              disabled={isProcessing || loading}
            >
              {(isProcessing || loading) ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Processing...</span>
                </div>
              ) : (
                <>
                  <span className="hidden sm:inline">Purchase {selectedCredits} Credits for ${displayPrice.toFixed(2)}</span>
                  <span className="sm:hidden">Buy {selectedCredits} Credits - ${displayPrice.toFixed(2)}</span>
                </>
              )}
            </Button>

            {/* Secure Payment */}
            <div className="text-center mt-4 sm:mt-6 text-xs sm:text-sm text-gray-500 flex items-center justify-center gap-2">
              {/* lock icon */}
              <Image src="/lock-icon.png" alt="lock" width={16} height={16} />
              Secure payment powered by Stripe
            </div>
              </div>
            </div>
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