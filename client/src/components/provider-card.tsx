import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, MapPin, DollarSign, Plus } from "lucide-react";

interface ProviderCardProps {
  id: string;
  name: string;
  type: "hotel" | "activity";
  rating?: string | number;
  reviewCount?: number;
  price?: string;
  description?: string;
  image?: string;
  aiScore: number;
  aiReasons: string[];
  location?: string;
  onAddToExperience?: (id: string, type: string) => void;
}

export function ProviderCard({
  id,
  name,
  type,
  rating,
  reviewCount,
  price,
  description,
  image,
  aiScore,
  aiReasons,
  location,
  onAddToExperience,
}: ProviderCardProps) {
  const typeLabel = type === "hotel" ? "Accommodation" : "Activity";
  const normalizedScore = Math.round(aiScore);

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow flex flex-col h-full">
      {image && (
        <div className="h-32 bg-muted overflow-hidden">
          <img src={image} alt={name} className="w-full h-full object-cover" />
        </div>
      )}
      <CardHeader className="pb-3">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base line-clamp-2">{name}</CardTitle>
            <Badge variant="outline" className="shrink-0">
              {typeLabel}
            </Badge>
          </div>
          {location && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="w-3 h-3" />
              {location}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-3">
        {description && <p className="text-sm text-muted-foreground line-clamp-2">{description}</p>}

        <div className="flex items-center gap-3 text-sm">
          {rating && (
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              <span className="font-semibold">{rating}</span>
              {reviewCount && <span className="text-muted-foreground">({reviewCount})</span>}
            </div>
          )}
          {price && (
            <div className="flex items-center gap-1 ml-auto">
              <DollarSign className="w-4 h-4 text-green-600" />
              <span className="font-semibold">{price}</span>
            </div>
          )}
        </div>

        {aiReasons && aiReasons.length > 0 && (
          <div className="text-xs space-y-1">
            <p className="text-muted-foreground font-medium">Why recommended:</p>
            <ul className="list-disc list-inside space-y-0.5">
              {aiReasons.slice(0, 2).map((reason, idx) => (
                <li key={idx} className="text-muted-foreground truncate">
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center gap-2 mt-auto pt-2 border-t">
          <div className="flex-1">
            <div className="text-xs text-muted-foreground">AI Score</div>
            <div className="text-lg font-bold text-primary">{normalizedScore}%</div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => onAddToExperience?.(id, type)}
          >
            <Plus className="w-3 h-3" />
            Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
