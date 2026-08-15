import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Landmark, Camera, Utensils, ShoppingBag, Trees, AlertCircle, Plus } from "lucide-react";

interface PointOfInterest {
  id: string;
  type: string;
  name: string;
  category: string;
  rank: number;
  geoCode: {
    latitude: number;
    longitude: number;
  };
  tags?: string[];
}

interface AmadeusPOIsProps {
  latitude: number;
  longitude: number;
  radius?: number;
  categories?: string[];
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
    latitude?: number;
    longitude?: number;
  }) => void;
}

const categoryIcons: Record<string, any> = {
  SIGHTS: Landmark,
  NIGHTLIFE: Camera,
  RESTAURANT: Utensils,
  SHOPPING: ShoppingBag,
  BEACH_PARK: Trees,
};

const categoryLabels: Record<string, string> = {
  SIGHTS: "Sights & Attractions",
  NIGHTLIFE: "Nightlife",
  RESTAURANT: "Restaurants",
  SHOPPING: "Shopping",
  BEACH_PARK: "Parks & Beaches",
};

export function AmadeusPOIs({
  latitude,
  longitude,
  radius = 5,
  categories,
  className = "",
  onAddToCart
}: AmadeusPOIsProps) {
  const queryUrl = `/api/amadeus/pois?latitude=${latitude}&longitude=${longitude}&radius=${radius}${categories ? `&categories=${categories.join(',')}` : ''}`;
  
  const { data: pois, isLoading, isError } = useQuery<PointOfInterest[]>({
    queryKey: [queryUrl],
    enabled: !!(latitude && longitude),
  });

  const handleAddToCart = (poi: PointOfInterest) => {
    if (onAddToCart) {
      onAddToCart({
        id: `poi-${poi.id}`,
        type: "activity",
        name: poi.name,
        price: 0,
        quantity: 1,
        provider: "Amadeus POI",
        details: `${categoryLabels[poi.category] || poi.category} - Rank #${poi.rank}`,
        isExternal: false,
        latitude: poi.geoCode.latitude,
        longitude: poi.geoCode.longitude,
      });
    }
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className={className}>
        <CardContent className="p-6 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Unable to load points of interest. Please try again later.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!pois || pois.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="p-6 text-center">
          <MapPin className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            No points of interest found in this area.
          </p>
        </CardContent>
      </Card>
    );
  }

  const groupedPOIs = pois.reduce((acc, poi) => {
    const cat = poi.category || 'OTHER';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(poi);
    return acc;
  }, {} as Record<string, PointOfInterest[]>);

  return (
    <Card className={className} data-testid="card-amadeus-pois">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg" data-testid="title-amadeus-pois">
          <MapPin className="h-5 w-5 text-primary" />
          Points of Interest
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {Object.entries(groupedPOIs).map(([category, categoryPOIs]) => {
          const Icon = categoryIcons[category] || Landmark;
          return (
            <div key={category}>
              <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Icon className="h-4 w-4" />
                {categoryLabels[category] || category}
              </h4>
              <div className="space-y-2">
                {categoryPOIs.slice(0, 5).map((poi) => (
                  <div
                    key={poi.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover-elevate"
                    data-testid={`poi-item-${poi.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{poi.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">
                          Rank #{poi.rank}
                        </Badge>
                        {poi.tags?.slice(0, 2).map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    {onAddToCart && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleAddToCart(poi)}
                        data-testid={`button-add-poi-${poi.id}`}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
