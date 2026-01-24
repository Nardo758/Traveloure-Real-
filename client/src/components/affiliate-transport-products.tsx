import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Train, Bus, Ship, ExternalLink, Clock, MapPin } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface AffiliateProduct {
  id: string;
  partnerId: string;
  name: string;
  description: string | null;
  price: string | null;
  currency: string;
  productUrl: string;
  affiliateUrl: string;
  imageUrl: string | null;
  category: string;
  city: string | null;
  duration: string | null;
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

export function AffiliateTransportProducts({
  destination,
  origin,
  className = "",
  onAddToCart
}: AffiliateTransportProductsProps) {
  const { data: products, isLoading
  } = useQuery<AffiliateProduct[]>({
    queryKey: ["/api/affiliate/products", { category: "transportation" }],
    enabled: true
  });

  const trackClick = useMutation({
    mutationFn: async (productId: string) => {
      await apiRequest("POST", "/api/affiliate/track-click", { productId });
    }
  });

  const handleBookNow = (product: AffiliateProduct) => {
    trackClick.mutate(product.id);
    window.open(product.affiliateUrl, '_blank', 'noopener,noreferrer');
  };

  const handleAddToCart = (product: AffiliateProduct) => {
    trackClick.mutate(product.id);
    if (onAddToCart) {
      onAddToCart({
        id: `affiliate-${product.id}`,
        type: "transportation",
        name: product.name,
        price: parseFloat(product.price || "0"),
        quantity: 1,
        provider: "12Go Asia",
        details: product.description || undefined,
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
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex gap-4">
                <Skeleton className="w-16 h-16 rounded" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const transportProducts = products?.filter(p => 
    p.category === "transportation" || 
    p.name.toLowerCase().includes('train') ||
    p.name.toLowerCase().includes('bus') ||
    p.name.toLowerCase().includes('ferry')
  ) || [];

  if (transportProducts.length === 0) {
    return null;
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
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950">
                    <Icon className="h-6 w-6 text-blue-600" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm mb-1 truncate">{product.name}</h4>
                    {product.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                        {product.description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {product.city && (
                        <Badge variant="secondary" className="text-xs">
                          <MapPin className="h-3 w-3 mr-1" />
                          {product.city}
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

                  <div className="flex flex-col items-end gap-2">
                    {product.price && (
                      <div className="text-right">
                        <span className="text-lg font-bold">
                          ${parseFloat(product.price).toFixed(0)}
                        </span>
                        <span className="text-xs text-muted-foreground ml-1">
                          {product.currency}
                        </span>
                      </div>
                    )}
                    <div className="flex gap-2">
                      {onAddToCart && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAddToCart(product)}
                          data-testid={`button-add-transport-${product.id}`}
                        >
                          Add
                        </Button>
                      )}
                      <Button
                        size="sm"
                        onClick={() => handleBookNow(product)}
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
