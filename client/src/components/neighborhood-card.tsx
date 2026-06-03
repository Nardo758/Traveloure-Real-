import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Sparkles, Briefcase } from "lucide-react";

interface NeighborhoodCardProps {
  name: string;
  slug: string;
  gemCount: number;
  serviceCount: number;
  description?: string | null;
  isFeatured?: boolean;
}

export function NeighborhoodCard({
  name,
  slug,
  gemCount,
  serviceCount,
  description,
  isFeatured,
}: NeighborhoodCardProps) {
  const totalItems = gemCount + serviceCount;

  return (
    <Card className="hover:shadow-lg transition-shadow cursor-pointer">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              {name}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{slug}</p>
          </div>
          {isFeatured && <Badge variant="secondary">Featured</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <div>
              <p className="text-2xl font-bold">{gemCount}</p>
              <p className="text-xs text-muted-foreground">Hidden Gems</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-blue-500" />
            <div>
              <p className="text-2xl font-bold">{serviceCount}</p>
              <p className="text-xs text-muted-foreground">Services</p>
            </div>
          </div>
        </div>
        {totalItems === 0 && (
          <p className="text-xs text-muted-foreground italic border-t pt-2">
            Phase 4 network fill will populate this neighborhood.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
