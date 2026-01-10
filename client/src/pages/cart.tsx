import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation, useSearch } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { 
  ShoppingCart, 
  Trash2, 
  Plus, 
  Minus, 
  CreditCard, 
  ArrowLeft, 
  Calendar, 
  MapPin,
  Wand2,
  Sparkles,
  Clock,
  DollarSign,
  CheckCircle,
  Loader2,
  AlertTriangle
} from "lucide-react";
import { format } from "date-fns";

interface CartItem {
  id: string;
  serviceId: string;
  quantity: number;
  scheduledDate: string | null;
  notes: string | null;
  service: {
    id: string;
    serviceName: string;
    price: string;
    location: string | null;
    shortDescription: string | null;
    userId: string;
    serviceType: string | null;
    providerName: string | null;
  } | null;
}

interface CartData {
  items: CartItem[];
  subtotal: string;
  platformFee: string;
  total: string;
  itemCount: number;
}

interface Recommendation {
  type: string;
  title: string;
  description: string;
  impact: string;
  potentialSavings: number | null;
}

interface ScheduleItem {
  time: string;
  activity: string;
  location: string;
  notes: string;
}

interface OptimizationResult {
  overallScore: number;
  summary: string;
  recommendations: Recommendation[];
  optimizedSchedule: ScheduleItem[];
  estimatedTotal: {
    original: number;
    optimized: number;
    savings: number;
  };
  warnings: string[];
}

type FlowStep = "cart" | "itinerary" | "payment";

export default function CartPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const [flowStep, setFlowStep] = useState<FlowStep>("cart");
  const [generating, setGenerating] = useState(false);
  const [optimizationResult, setOptimizationResult] = useState<OptimizationResult | null>(null);

  // Check for step query param and stored optimization result on mount
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const step = params.get("step");
    
    if (step === "itinerary" || step === "payment") {
      // Try to load optimization result from session storage
      const stored = sessionStorage.getItem("optimizationResult");
      if (stored) {
        try {
          const result = JSON.parse(stored);
          setOptimizationResult(result);
          sessionStorage.removeItem("optimizationResult");
          setFlowStep(step as FlowStep);
        } catch (e) {
          console.error("Failed to parse stored optimization result");
          // Fallback to cart step if parsing fails
          setFlowStep("cart");
          toast({ 
            variant: "destructive", 
            title: "Unable to load optimization results",
            description: "Please generate itinerary again"
          });
        }
      } else {
        // No optimization result stored, fall back to cart step
        setFlowStep("cart");
        toast({ 
          title: "Optimization required",
          description: "Please click 'Generate Itinerary' to see your optimized plan"
        });
      }
    }
  }, [searchString, toast]);

  const { data: cart, isLoading } = useQuery<CartData>({
    queryKey: ["/api/cart"],
    enabled: !!user,
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({ id, quantity }: { id: string; quantity: number }) => {
      return apiRequest("PATCH", `/api/cart/${id}`, { quantity });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Failed to update item" });
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/cart/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({ title: "Item removed from cart" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Failed to remove item" });
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/checkout", {});
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-bookings"] });
      toast({ title: "Booking created!", description: "Your services have been booked." });
      setLocation("/bookings");
    },
    onError: () => {
      toast({ variant: "destructive", title: "Checkout failed" });
    },
  });

  const [creatingComparison, setCreatingComparison] = useState(false);

  const createComparison = async () => {
    if (!cart || cart.items.length === 0) return;
    setCreatingComparison(true);
    
    let experienceContext;
    const storedContext = sessionStorage.getItem("experienceContext");
    if (storedContext) {
      try {
        experienceContext = JSON.parse(storedContext);
      } catch (e) {
        console.error("Failed to parse experience context");
      }
    }

    // Build baseline items with all necessary info for AI optimization
    const baselineItems = cart.items.map(item => ({
      name: item.service?.serviceName || "Service",
      category: item.service?.serviceType || "service",
      price: item.service?.price || "0",
      provider: item.service?.providerName || "Provider",
      location: item.service?.location || "",
      description: item.service?.shortDescription || ""
    }));
    
    try {
      const response = await apiRequest("POST", "/api/itinerary-comparisons", {
        title: experienceContext?.title || "My Trip",
        destination: experienceContext?.destination || cart.items[0]?.service?.location || "Paris, France",
        startDate: experienceContext?.startDate || new Date().toISOString().split('T')[0],
        endDate: experienceContext?.endDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        budget: cart.total,
        travelers: experienceContext?.travelers || 2,
        baselineItems // Include items so backend auto-generates AI alternatives
      });
      
      const comparison = await response.json();
      // Navigate immediately - AI generation happens in background
      setLocation(`/itinerary-comparison/${comparison.id}`);
    } catch (error: any) {
      console.error("Failed to create comparison:", error);
      toast({ 
        variant: "destructive", 
        title: "Failed to generate itinerary",
        description: error?.message || "Please try again"
      });
    } finally {
      setCreatingComparison(false);
    }
  };

  const generateItinerary = async () => {
    if (!cart || cart.items.length === 0) return;
    setGenerating(true);
    
    // Try to get experience context from session storage
    let experienceContext;
    const storedContext = sessionStorage.getItem("experienceContext");
    if (storedContext) {
      try {
        experienceContext = JSON.parse(storedContext);
      } catch (e) {
        console.error("Failed to parse experience context");
      }
    }
    
    // Build request payload with context or fallback values
    const payload = {
      experienceType: experienceContext?.experienceType || "General",
      destination: experienceContext?.destination || cart.items[0]?.service?.location || "Unknown",
      startDate: experienceContext?.startDate,
      endDate: experienceContext?.endDate,
      selectedServices: experienceContext?.selectedServices || cart.items.map(item => ({
        name: item.service?.serviceName,
        provider: "Provider",
        price: parseFloat(item.service?.price || "0"),
        category: "service"
      })),
      preferences: {}
    };
    
    try {
      const response = await fetch("/api/ai/optimize-experience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        const result = await response.json();
        setOptimizationResult(result);
        setFlowStep("itinerary");
      } else {
        toast({ variant: "destructive", title: "Failed to generate itinerary" });
      }
    } catch (error) {
      console.error("Failed to generate itinerary:", error);
      toast({ variant: "destructive", title: "Failed to generate itinerary" });
    } finally {
      setGenerating(false);
    }
  };

  const proceedToPayment = () => {
    setFlowStep("payment");
  };

  if (authLoading) {
    return (
      <Layout>
        <div className="container py-8 max-w-4xl mx-auto">
          <Skeleton className="h-10 w-48 mb-6" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Layout>
    );
  }

  if (!user) {
    return (
      <Layout>
        <div className="container py-8 max-w-4xl mx-auto text-center">
          <ShoppingCart className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold mb-2">Your Cart</h1>
          <p className="text-muted-foreground mb-6">Please sign in to view your cart</p>
          <Button asChild data-testid="button-sign-in">
            <Link href="/api/login">Sign In</Link>
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container py-8 max-w-5xl mx-auto">
        {/* Flow Steps Indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${flowStep === "cart" ? "bg-[#FF385C] text-white" : "bg-muted"}`}>
            <ShoppingCart className="w-4 h-4" />
            <span className="text-sm font-medium">Cart</span>
          </div>
          <div className="w-8 h-px bg-border" />
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${flowStep === "itinerary" ? "bg-[#FF385C] text-white" : "bg-muted"}`}>
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">Itinerary</span>
          </div>
          <div className="w-8 h-px bg-border" />
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${flowStep === "payment" ? "bg-[#FF385C] text-white" : "bg-muted"}`}>
            <CreditCard className="w-4 h-4" />
            <span className="text-sm font-medium">Payment</span>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => {
              if (flowStep === "cart") {
                window.history.back();
              } else if (flowStep === "itinerary") {
                setFlowStep("cart");
              } else {
                setFlowStep("itinerary");
              }
            }}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            {flowStep === "cart" && "Your Cart"}
            {flowStep === "itinerary" && "Your Optimized Itinerary"}
            {flowStep === "payment" && "Complete Payment"}
          </h1>
          {cart && cart.itemCount > 0 && flowStep === "cart" && (
            <Badge variant="secondary" data-testid="badge-item-count">{cart.itemCount} items</Badge>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !cart || cart.items.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ShoppingCart className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">Your cart is empty</h2>
              <p className="text-muted-foreground mb-6">Browse our services and add something you like</p>
              <Button asChild data-testid="button-browse-services">
                <Link href="/discover">Browse Services</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Step 1: Cart View */}
            {flowStep === "cart" && (
              <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2 space-y-4">
                  {cart.items.map((item) => (
                    <Card key={item.id} data-testid={`card-cart-item-${item.id}`}>
                      <CardContent className="p-4">
                        <div className="flex gap-4">
                          <div className="flex-1">
                            <h3 className="font-semibold" data-testid={`text-service-name-${item.id}`}>
                              {item.service?.serviceName || "Unknown Service"}
                            </h3>
                            {item.service?.shortDescription && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {item.service.shortDescription}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
                              {item.service?.location && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {item.service.location}
                                </span>
                              )}
                              {item.scheduledDate && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {format(new Date(item.scheduledDate), "PPP")}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-lg" data-testid={`text-price-${item.id}`}>
                              ${parseFloat(item.service?.price || "0").toFixed(2)}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => updateItemMutation.mutate({ id: item.id, quantity: Math.max(1, (item.quantity || 1) - 1) })}
                                disabled={item.quantity <= 1 || updateItemMutation.isPending}
                                data-testid={`button-decrease-${item.id}`}
                              >
                                <Minus className="w-3 h-3" />
                              </Button>
                              <span className="w-8 text-center" data-testid={`text-quantity-${item.id}`}>
                                {item.quantity || 1}
                              </span>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => updateItemMutation.mutate({ id: item.id, quantity: (item.quantity || 1) + 1 })}
                                disabled={updateItemMutation.isPending}
                                data-testid={`button-increase-${item.id}`}
                              >
                                <Plus className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-end mt-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => removeItemMutation.mutate(item.id)}
                            disabled={removeItemMutation.isPending}
                            data-testid={`button-remove-${item.id}`}
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Remove
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="lg:col-span-1 space-y-4">
                  <Card className="sticky top-4">
                    <CardHeader>
                      <CardTitle>Order Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span data-testid="text-subtotal">${cart.subtotal}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Platform Fee (20%)</span>
                        <span data-testid="text-platform-fee">${cart.platformFee}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-bold text-lg">
                        <span>Total</span>
                        <span data-testid="text-total">${cart.total}</span>
                      </div>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-3">
                      <div className="w-full p-3 rounded-lg bg-gradient-to-r from-[#FF385C]/10 to-purple-500/10 border border-[#FF385C]/20">
                        <div className="flex items-start gap-2 mb-2">
                          <Sparkles className="w-4 h-4 text-[#FF385C] mt-0.5 flex-shrink-0" />
                          <div>
                            <h4 className="text-sm font-medium">Generate Your Itinerary</h4>
                            <p className="text-xs text-muted-foreground mt-1">
                              See your selections organized into an itinerary, plus AI-optimized alternatives that could save you money or time.
                            </p>
                          </div>
                        </div>
                        <Button
                          className="w-full bg-[#FF385C] hover:bg-[#E23350]"
                          size="lg"
                          onClick={createComparison}
                          disabled={creatingComparison}
                          data-testid="button-generate-itinerary-comparison"
                        >
                          {creatingComparison ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Sparkles className="w-4 h-4 mr-2" />
                          )}
                          {creatingComparison ? "Creating..." : "Generate Itinerary"}
                        </Button>
                      </div>
                      <Separator />
                      <Button
                        variant="outline"
                        className="w-full"
                        size="lg"
                        onClick={() => setFlowStep("payment")}
                        data-testid="button-skip-to-payment"
                      >
                        <CreditCard className="w-4 h-4 mr-2" />
                        Proceed to Payment
                      </Button>
                    </CardFooter>
                  </Card>
                </div>
              </div>
            )}

            {/* Step 2: Itinerary & Optimized Plans */}
            {flowStep === "itinerary" && (
              <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2 space-y-6">
                  {/* Optimization Score */}
                  {optimizationResult && (
                    <>
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-[#FF385C]" />
                            Optimization Score
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center gap-4">
                            <div className="text-4xl font-bold text-[#FF385C]">
                              {optimizationResult.overallScore}%
                            </div>
                            <div className="flex-1">
                              <div className="h-3 bg-muted rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-[#FF385C] transition-all"
                                  style={{ width: `${optimizationResult.overallScore}%` }}
                                />
                              </div>
                            </div>
                          </div>
                          {optimizationResult.summary && (
                            <p className="mt-4 text-muted-foreground">{optimizationResult.summary}</p>
                          )}
                          {optimizationResult.estimatedTotal.savings > 0 && (
                            <div className="mt-4 flex items-center gap-2 text-green-600 dark:text-green-400">
                              <DollarSign className="w-4 h-4" />
                              <span>Potential savings: ${optimizationResult.estimatedTotal.savings}</span>
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      {/* Recommendations */}
                      {optimizationResult.recommendations.length > 0 && (
                        <Card>
                          <CardHeader>
                            <CardTitle>AI Recommendations</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <ul className="space-y-3">
                              {optimizationResult.recommendations.map((rec, i) => (
                                <li key={i} className="flex items-start gap-3">
                                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                                  <div>
                                    <div className="font-medium">{rec.title}</div>
                                    <div className="text-sm text-muted-foreground">{rec.description}</div>
                                    {rec.potentialSavings && rec.potentialSavings > 0 && (
                                      <span className="text-xs text-green-600">Save ${rec.potentialSavings}</span>
                                    )}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </CardContent>
                        </Card>
                      )}

                      {/* Optimized Schedule */}
                      {optimizationResult.optimizedSchedule.length > 0 && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                              <Clock className="w-5 h-5" />
                              Optimized Schedule
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-4">
                              {optimizationResult.optimizedSchedule.map((item, i) => (
                                <div key={i} className="flex items-start gap-4 p-3 bg-muted/50 rounded-lg">
                                  <div className="text-sm font-medium text-muted-foreground w-16">
                                    {item.time}
                                  </div>
                                  <div className="flex-1">
                                    <div className="font-medium">{item.activity}</div>
                                    <div className="text-sm text-muted-foreground">{item.location}</div>
                                    {item.notes && <div className="text-xs text-muted-foreground mt-1">{item.notes}</div>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </>
                  )}
                </div>

                <div className="lg:col-span-1">
                  <Card className="sticky top-4">
                    <CardHeader>
                      <CardTitle>Ready to Book?</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span>${cart.subtotal}</span>
                      </div>
                      {optimizationResult && optimizationResult.estimatedTotal.savings > 0 && (
                        <div className="flex justify-between text-green-600">
                          <span>Savings</span>
                          <span>-${optimizationResult.estimatedTotal.savings}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Platform Fee (20%)</span>
                        <span>${cart.platformFee}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-bold text-lg">
                        <span>Total</span>
                        <span>${(parseFloat(cart.total) - (optimizationResult?.estimatedTotal?.savings || 0)).toFixed(2)}</span>
                      </div>
                    </CardContent>
                    <CardFooter className="flex-col gap-3">
                      <Button
                        className="w-full bg-[#FF385C] hover:bg-[#E23350]"
                        size="lg"
                        onClick={proceedToPayment}
                        data-testid="button-proceed-payment"
                      >
                        <CreditCard className="w-4 h-4 mr-2" />
                        Proceed to Payment
                      </Button>
                      {optimizationResult?.warnings && optimizationResult.warnings.length > 0 && (
                        <div className="w-full p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-amber-700 dark:text-amber-300">
                              {optimizationResult.warnings[0]}
                            </div>
                          </div>
                        </div>
                      )}
                    </CardFooter>
                  </Card>
                </div>
              </div>
            )}

            {/* Step 3: Payment */}
            {flowStep === "payment" && (
              <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2 space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Payment Method</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="border rounded-lg p-4 flex items-center gap-4 bg-muted/30">
                        <CreditCard className="w-8 h-8 text-muted-foreground" />
                        <div className="flex-1">
                          <div className="font-medium">Credit / Debit Card</div>
                          <div className="text-sm text-muted-foreground">Secure payment via Stripe</div>
                        </div>
                        <Badge variant="secondary">Selected</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Your payment information is processed securely. We do not store your card details.
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Order Review</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {cart.items.map((item) => (
                          <div key={item.id} className="flex justify-between items-center py-2 border-b last:border-0">
                            <div>
                              <div className="font-medium">{item.service?.serviceName}</div>
                              <div className="text-sm text-muted-foreground">Qty: {item.quantity}</div>
                            </div>
                            <div className="font-medium">
                              ${(parseFloat(item.service?.price || "0") * item.quantity).toFixed(2)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="lg:col-span-1">
                  <Card className="sticky top-4">
                    <CardHeader>
                      <CardTitle>Complete Booking</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span>${cart.subtotal}</span>
                      </div>
                      {optimizationResult && optimizationResult.estimatedTotal.savings > 0 && (
                        <div className="flex justify-between text-green-600">
                          <span>Savings</span>
                          <span>-${optimizationResult.estimatedTotal.savings}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Platform Fee (20%)</span>
                        <span>${cart.platformFee}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-bold text-lg">
                        <span>Total</span>
                        <span>${(parseFloat(cart.total) - (optimizationResult?.estimatedTotal?.savings || 0)).toFixed(2)}</span>
                      </div>
                    </CardContent>
                    <CardFooter>
                      <Button
                        className="w-full bg-[#FF385C] hover:bg-[#E23350]"
                        size="lg"
                        onClick={() => checkoutMutation.mutate()}
                        disabled={checkoutMutation.isPending}
                        data-testid="button-complete-booking"
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        {checkoutMutation.isPending ? "Processing..." : "Complete Booking"}
                      </Button>
                    </CardFooter>
                  </Card>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
