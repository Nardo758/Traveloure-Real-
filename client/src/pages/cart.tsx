import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ShoppingCart, Trash2, Plus, Minus, CreditCard, ArrowLeft, Calendar, MapPin } from "lucide-react";
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
  } | null;
}

interface CartData {
  items: CartItem[];
  subtotal: string;
  platformFee: string;
  total: string;
  itemCount: number;
}

export default function CartPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

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
      <div className="container py-8 max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" asChild data-testid="button-back">
            <Link href="/discover">
              <ArrowLeft className="w-5 h-5" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Your Cart</h1>
          {cart && cart.itemCount > 0 && (
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

            <div className="lg:col-span-1">
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
                <CardFooter>
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => checkoutMutation.mutate()}
                    disabled={checkoutMutation.isPending}
                    data-testid="button-checkout"
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    {checkoutMutation.isPending ? "Processing..." : "Proceed to Checkout"}
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
