import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import {
  CreditCard,
  Lock,
  Shield,
  ArrowLeft,
  Check,
  MapPin,
  Calendar,
  Users,
  Sparkles,
  Gift,
  Loader2,
} from "lucide-react";
import { SiVisa, SiMastercard, SiApplepay, SiPaypal } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const paymentMethods = [
  { id: "card", label: "Credit/Debit Card", icons: [SiVisa, SiMastercard] },
  { id: "paypal", label: "PayPal", icons: [SiPaypal] },
  { id: "applepay", label: "Apple Pay", icons: [SiApplepay] },
];

export default function PaymentPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [isProcessing, setIsProcessing] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [agreeToTerms, setAgreeToTerms] = useState(false);

  // Fetch real cart items from API
  const { data: cartData, isLoading: cartLoading } = useQuery<any[]>({
    queryKey: ["/api/cart"],
  });

  const cartItems = (cartData || []).map((item: any) => ({
    id: item.id,
    name: item.service?.name || item.name || "Service",
    category: item.service?.categoryId || "Service",
    price: parseFloat(item.service?.basePrice || item.price || "0"),
    originalPrice: parseFloat(item.service?.basePrice || item.price || "0"),
  }));

  const subtotal = cartItems.reduce((sum: number, item: any) => sum + item.price, 0);
  const discount = promoDiscount;
  const serviceFee = subtotal > 0 ? 45 : 0;
  const total = subtotal - discount + serviceFee;

  // Use real promo code API
  const promoMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await apiRequest("POST", "/api/bookings/apply-promo", {
        code,
        amount: subtotal,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      setPromoApplied(true);
      setPromoDiscount(data.discount || subtotal * 0.1);
      toast({
        title: "Promo applied!",
        description: data.message || "Discount has been applied to your order.",
      });
    },
    onError: () => {
      toast({
        title: "Invalid code",
        description: "This promo code is not valid.",
        variant: "destructive",
      });
    },
  });

  const handleApplyPromo = () => {
    if (promoCode.trim()) {
      promoMutation.mutate(promoCode);
    }
  };

  const [cardDetails, setCardDetails] = useState({
    cardNumber: "",
    expiry: "",
    cvv: "",
    cardName: "",
  });

  const isCardValid = paymentMethod !== "card" || (
    cardDetails.cardNumber.length >= 16 &&
    cardDetails.expiry.length >= 5 &&
    cardDetails.cvv.length >= 3 &&
    cardDetails.cardName.length >= 2
  );

  const handlePayment = async () => {
    if (!agreeToTerms) {
      toast({
        title: "Please agree to terms",
        description: "You must agree to the terms and conditions to continue.",
        variant: "destructive",
      });
      return;
    }

    if (paymentMethod === "card" && !isCardValid) {
      toast({
        title: "Invalid card details",
        description: "Please enter valid card information.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    try {
      const res = await apiRequest("POST", "/api/bookings/process-cart", {
        cartItems: cartItems.map((item: any) => ({ id: item.id, quantity: 1 })),
        paymentMethod,
      });
      const result = await res.json();
      toast({
        title: "Payment successful!",
        description: result.message || "Your booking has been confirmed.",
      });
      setLocation("/bookings");
    } catch {
      toast({
        title: "Payment failed",
        description: "Please try again or contact support.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (cartLoading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-[#FF385C]" />
      </div>
    );
  }

  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex flex-col items-center justify-center gap-4">
        <h2 className="text-2xl font-bold text-[#111827]">Your cart is empty</h2>
        <p className="text-[#6B7280]">Add items to your cart before proceeding to payment.</p>
        <Link href="/cart"><Button>Go to Cart</Button></Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* Header */}
      <header className="bg-white border-b border-[#E5E7EB] sticky top-0 z-50">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="flex items-center justify-between h-16">
            <Link
              href="/cart"
              className="flex items-center gap-2 text-[#6B7280] hover:text-[#111827]"
              data-testid="link-back"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Cart
            </Link>
            <div className="flex items-center gap-2 text-sm text-[#6B7280]">
              <Lock className="w-4 h-4" />
              Secure Checkout
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 max-w-6xl py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Payment Form */}
          <div className="lg:col-span-2 space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <h1 className="text-2xl font-bold text-[#111827] mb-6">
                Complete Your Booking
              </h1>

              {/* Trip Summary */}
              <Card className="border-[#E5E7EB] mb-6">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg text-[#111827]">
                    Trip Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-6 text-sm">
                    <div className="flex items-center gap-2 text-[#6B7280]">
                      <MapPin className="w-4 h-4 text-[#FF385C]" />
                      Bali, Indonesia
                    </div>
                    <div className="flex items-center gap-2 text-[#6B7280]">
                      <Calendar className="w-4 h-4 text-[#FF385C]" />
                      Feb 15 - Feb 20, 2026
                    </div>
                    <div className="flex items-center gap-2 text-[#6B7280]">
                      <Users className="w-4 h-4 text-[#FF385C]" />
                      2 Travelers
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Payment Method */}
              <Card className="border-[#E5E7EB]">
                <CardHeader>
                  <CardTitle className="text-lg text-[#111827]">
                    Payment Method
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <RadioGroup
                    value={paymentMethod}
                    onValueChange={setPaymentMethod}
                    className="space-y-3"
                  >
                    {paymentMethods.map((method) => (
                      <div
                        key={method.id}
                        className={`flex items-center justify-between p-4 border rounded-lg cursor-pointer transition-colors ${
                          paymentMethod === method.id
                            ? "border-[#FF385C] bg-[#FFF5F7]"
                            : "border-[#E5E7EB] hover:border-[#FF385C]"
                        }`}
                        onClick={() => setPaymentMethod(method.id)}
                        data-testid={`radio-payment-${method.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <RadioGroupItem value={method.id} />
                          <span className="font-medium text-[#111827]">
                            {method.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {method.icons.map((Icon, idx) => (
                            <Icon
                              key={idx}
                              className="w-8 h-8 text-[#6B7280]"
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </RadioGroup>

                  {/* Card Details */}
                  {paymentMethod === "card" && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="space-y-4 pt-4 border-t border-[#E5E7EB]"
                    >
                      <div>
                        <Label htmlFor="cardNumber" className="text-[#374151]">
                          Card Number
                        </Label>
                        <div className="relative mt-2">
                          <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                          <Input
                            id="cardNumber"
                            placeholder="1234 5678 9012 3456"
                            value={cardDetails.cardNumber}
                            onChange={(e) => setCardDetails(prev => ({ ...prev, cardNumber: e.target.value.replace(/\D/g, '').slice(0, 16) }))}
                            className="pl-10 h-12 border-[#E5E7EB]"
                            data-testid="input-card-number"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="expiry" className="text-[#374151]">
                            Expiry Date
                          </Label>
                          <Input
                            id="expiry"
                            placeholder="MM/YY"
                            value={cardDetails.expiry}
                            onChange={(e) => setCardDetails(prev => ({ ...prev, expiry: e.target.value.slice(0, 5) }))}
                            className="mt-2 h-12 border-[#E5E7EB]"
                            data-testid="input-expiry"
                          />
                        </div>
                        <div>
                          <Label htmlFor="cvv" className="text-[#374151]">
                            CVV
                          </Label>
                          <Input
                            id="cvv"
                            placeholder="123"
                            value={cardDetails.cvv}
                            onChange={(e) => setCardDetails(prev => ({ ...prev, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                            className="mt-2 h-12 border-[#E5E7EB]"
                            data-testid="input-cvv"
                          />
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="cardName" className="text-[#374151]">
                          Name on Card
                        </Label>
                        <Input
                          id="cardName"
                          placeholder="John Doe"
                          value={cardDetails.cardName}
                          onChange={(e) => setCardDetails(prev => ({ ...prev, cardName: e.target.value }))}
                          className="mt-2 h-12 border-[#E5E7EB]"
                          data-testid="input-card-name"
                        />
                      </div>
                    </motion.div>
                  )}

                  {/* Billing Address */}
                  <div className="pt-4 border-t border-[#E5E7EB]">
                    <h3 className="font-medium text-[#111827] mb-4">
                      Billing Address
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <Label htmlFor="address" className="text-[#374151]">
                          Street Address
                        </Label>
                        <Input
                          id="address"
                          placeholder="123 Main St"
                          className="mt-2 h-12 border-[#E5E7EB]"
                          data-testid="input-address"
                        />
                      </div>
                      <div>
                        <Label htmlFor="city" className="text-[#374151]">
                          City
                        </Label>
                        <Input
                          id="city"
                          placeholder="New York"
                          className="mt-2 h-12 border-[#E5E7EB]"
                          data-testid="input-city"
                        />
                      </div>
                      <div>
                        <Label htmlFor="zip" className="text-[#374151]">
                          ZIP Code
                        </Label>
                        <Input
                          id="zip"
                          placeholder="10001"
                          className="mt-2 h-12 border-[#E5E7EB]"
                          data-testid="input-zip"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Terms */}
              <div className="flex items-start gap-3 p-4 bg-[#F3F4F6] rounded-lg">
                <Checkbox
                  id="terms"
                  checked={agreeToTerms}
                  onCheckedChange={(checked) =>
                    setAgreeToTerms(checked as boolean)
                  }
                  data-testid="checkbox-terms"
                />
                <label htmlFor="terms" className="text-sm text-[#6B7280]">
                  I agree to the{" "}
                  <Link href="/terms" className="text-[#FF385C] underline">
                    Terms & Conditions
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" className="text-[#FF385C] underline">
                    Privacy Policy
                  </Link>
                  . I understand that my booking is subject to the cancellation
                  policy of each service provider.
                </label>
              </div>
            </motion.div>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="sticky top-24"
            >
              <Card className="border-[#E5E7EB]">
                <CardHeader>
                  <CardTitle className="text-lg text-[#111827]">
                    Order Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Cart Items */}
                  <div className="space-y-3">
                    {cartItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start justify-between text-sm"
                      >
                        <div>
                          <div className="font-medium text-[#111827]">
                            {item.name}
                          </div>
                          <div className="text-[#6B7280]">{item.category}</div>
                        </div>
                        <div className="text-right">
                          {item.originalPrice > item.price && (
                            <div className="text-[#9CA3AF] line-through text-xs">
                              ${item.originalPrice}
                            </div>
                          )}
                          <div className="font-medium text-[#111827]">
                            ${item.price}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <Separator />

                  {/* Promo Code */}
                  <div>
                    <Label className="text-sm text-[#374151]">Promo Code</Label>
                    <div className="flex gap-2 mt-2">
                      <Input
                        placeholder="Enter code"
                        value={promoCode}
                        onChange={(e) => setPromoCode(e.target.value)}
                        disabled={promoApplied}
                        className="h-10 border-[#E5E7EB]"
                        data-testid="input-promo"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleApplyPromo}
                        disabled={promoApplied || !promoCode}
                        className="h-10"
                        data-testid="button-apply-promo"
                      >
                        {promoApplied ? <Check className="w-4 h-4" /> : "Apply"}
                      </Button>
                    </div>
                    {promoApplied && (
                      <Badge className="mt-2 bg-green-100 text-green-700">
                        <Gift className="w-3 h-3 mr-1" />
                        TRAVEL10 applied
                      </Badge>
                    )}
                  </div>

                  <Separator />

                  {/* Totals */}
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[#6B7280]">Subtotal</span>
                      <span className="text-[#111827]">${subtotal}</span>
                    </div>
                    {discount > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>Discount (10%)</span>
                        <span>-${discount.toFixed(0)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-[#6B7280]">Service Fee</span>
                      <span className="text-[#111827]">${serviceFee}</span>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-[#111827]">Total</span>
                    <span className="text-2xl font-bold text-[#FF385C]">
                      ${total.toFixed(0)}
                    </span>
                  </div>

                  {/* Pay Button */}
                  <Button
                    className="w-full h-12 bg-[#FF385C] hover:bg-[#E23350] text-white text-lg"
                    onClick={handlePayment}
                    disabled={isProcessing || !agreeToTerms || !isCardValid}
                    data-testid="button-pay-now"
                  >
                    {isProcessing ? (
                      "Processing..."
                    ) : (
                      <>
                        <Lock className="w-4 h-4 mr-2" />
                        Pay ${total.toFixed(0)}
                      </>
                    )}
                  </Button>

                  {/* Security Badge */}
                  <div className="flex items-center justify-center gap-2 text-xs text-[#6B7280]">
                    <Shield className="w-4 h-4" />
                    Secure payment powered by Stripe
                  </div>
                </CardContent>
              </Card>

              {/* AI Optimization Upsell */}
              <Card className="border-[#E5E7EB] mt-4 bg-gradient-to-r from-[#FFF5F7] to-white">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#FF385C] flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h4 className="font-medium text-[#111827] mb-1">
                        Optimize Your Trip?
                      </h4>
                      <p className="text-sm text-[#6B7280] mb-2">
                        Let AI arrange your activities for the best experience
                      </p>
                      <Link href="/optimize">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-[#FF385C] text-[#FF385C]"
                          data-testid="button-optimize"
                        >
                          Add for $29
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
