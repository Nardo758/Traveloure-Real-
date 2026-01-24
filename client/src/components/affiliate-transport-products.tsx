import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Train, Bus, Ship, ExternalLink, Clock, MapPin, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface AffiliateProduct {
  id: string;
  partnerId: string;
  name: string;
  description: string | null;
  shortDescription: string | null;
  price: string | null;
  currency: string;
  productUrl: string;
  affiliateUrl: string;
  imageUrl: string | null;
  category: string;
  city: string | null;
  country: string | null;
  duration: string | null;
  location: string | null;
}

interface AffiliateTransportProductsProps {
  destination?: string;
  origin?: string;
  className?: string;
  onAddToCart?: (item: {
    id: string;
    type: string;
    name: string;
    price: number;
    quantity: number;
    provider: string;
    details?: string;
    isExternal: boolean;
    affiliateUrl: string;
  }) => void;
}

function formatPrice(price: string | null, currency: string): string {
  if (!price) return "View price";
  const numPrice = parseFloat(price);
  if (isNaN(numPrice)) return "View price";
  
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(numPrice);
  } catch {
    return `${currency} ${numPrice.toFixed(2)}`;
  }
}

export function AffiliateTransportProducts({
  destination,
  origin,
  className = "",
  onAddToCart
}: AffiliateTransportProductsProps) {
  const queryUrl = `/api/affiliate/products?category=transportation${destination ? `&city=${encodeURIComponent(destination)}` : ''}`;
  
  const { data: products, isLoading, isError } = useQuery<AffiliateProduct[]>({
    queryKey: [queryUrl],
  });

  const trackClick = useMutation({
    mutationFn: async (productId: string) => {
      try {
        await apiRequest("POST", "/api/affiliate/track-click", { productId });
      } catch (e) {
        console.warn("Click tracking failed, proceeding with booking", e);
      }
    }
  });

  const handleBookNow = async (product: AffiliateProduct) => {
    try {
      await trackClick.mutateAsync(product.id);
    } catch {
      // Continue even if tracking fails
    }
    window.open(product.affiliateUrl, '_blank', 'noopener,noreferrer');
  };

  const handleAddToCart = async (product: AffiliateProduct) => {
    try {
      await trackClick.mutateAsync(product.id);
    } catch {
      // Continue even if tracking fails
    }
    if (onAddToCart) {
      onAddToCart({
        id: `affiliate-${product.id}`,
        type: "transportation",
        name: product.name,
        price: parseFloat(product.price || "0"),
        quantity: 1,
        provider: "12Go Asia",
        details: product.description || product.shortDescription || undefined,
        isExternal: true,
        affiliateUrl: product.affiliateUrl
      });
    }
  };

  const getTransportIcon = (name: string) => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('train')) return Train;
    if (lowerName.includes('bus')) return Bus;
    if (lowerName.includes('ferry') || lowerName.includes('boat')) return Ship;
    return Train;
  };

  if (isLoading) {
    return (
      <div className={`space-y-3 ${className}`}>
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-5 w-24" />
        </div>
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex gap-4">
                <Skeleton className="w-12 h-12 rounded" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
                <Skeleton className="h-9 w-20" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Card className={className}>
        <CardContent className="p-6 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Unable to load transportation options. Please try again later.
          </p>
        </CardContent>
      </Card>
    );
  }

  const transportProducts = products?.filter(p => 
    p.category === "transportation" || 
    p.name.toLowerCase().includes('train') ||
    p.name.toLowerCase().includes('bus') ||
    p.name.toLowerCase().includes('ferry')
  ) || [];

  if (transportProducts.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex gap-1">
              <Train className="w-5 h-5 text-blue-600" />
              <Bus className="w-5 h-5 text-green-600" />
              <Ship className="w-5 h-5 text-cyan-600" />
            </div>
            <h3 className="font-semibold">Ground Transportation</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Book trains, buses, and ferries for your trip via 12Go Asia.
          </p>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => window.open(`https://12go.asia/en?affiliate_id=13805109${destination ? `&q=${encodeURIComponent(destination)}` : ''}`, '_blank')}
            data-testid="button-browse-12go"
          >
            Browse Transportation Options
            <ExternalLink className="h-4 w-4 ml-2" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Train className="h-5 w-5 text-blue-600" />
          Ground Transportation
        </h3>
        <Badge variant="outline" className="text-xs">
          Powered by 12Go
        </Badge>
      </div>

      <div className="grid gap-3">
        {transportProducts.map((product) => {
          const Icon = getTransportIcon(product.name);
          return (
            <Card key={product.id} className="hover-elevate" data-testid={`card-transport-${product.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950 shrink-0">
                    <Icon className="h-6 w-6 text-blue-600" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm mb-1">{product.name}</h4>
                    {(product.description || product.shortDescription) && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                        {product.description || product.shortDescription}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {(product.city || product.location) && (
                        <Badge variant="secondary" className="text-xs">
                          <MapPin className="h-3 w-3 mr-1" />
                          {product.city || product.location}
                        </Badge>
                      )}
                      {product.duration && (
                        <Badge variant="secondary" className="text-xs">
                          <Clock className="h-3 w-3 mr-1" />
                          {product.duration}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="text-right">
                      <span className="text-lg font-bold">
                        {formatPrice(product.price, product.currency)}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {onAddToCart && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAddToCart(product)}
                          disabled={trackClick.isPending}
                          data-testid={`button-add-transport-${product.id}`}
                        >
                          Add
                        </Button>
                      )}
                      <Button
                        size="sm"
                        onClick={() => handleBookNow(product)}
                        disabled={trackClick.isPending}
                        data-testid={`button-book-transport-${product.id}`}
                      >
                        Book
                        <ExternalLink className="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Click to view schedules and complete booking on 12Go.asia
      </p>
    </div>
  );
}
