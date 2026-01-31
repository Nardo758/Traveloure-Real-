import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { MapPin, X, Plane, Wand2, Trash2, Zap } from "lucide-react";
import { useTripQueue } from "@/contexts/TripQueueContext";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export function TripQueueIndicator() {
  const [, navigate] = useLocation();
  const { queuedCities, removeCity, clearQueue, queueCount } = useTripQueue();
  const [isOpen, setIsOpen] = useState(false);

  if (queueCount === 0) return null;

  const handlePlanTrip = () => {
    setIsOpen(false);
    const destinations = queuedCities.map(c => `${c.cityName}, ${c.country}`).join("; ");
    // Store destinations in sessionStorage for reliable retrieval in experience template
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('tripQueueDestinations', destinations);
    }
    navigate(`/experiences?destinations=${encodeURIComponent(destinations)}&multiCity=true`);
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          className="fixed bottom-6 right-6 z-50"
        >
          <Button
            size="lg"
            className="rounded-full shadow-lg h-14 px-5 gap-2"
            data-testid="button-trip-queue"
          >
            <Plane className="h-5 w-5" />
            <span className="font-medium">My Trip</span>
            <Badge 
              variant="secondary" 
              className="bg-white/20 text-white border-0 ml-1"
            >
              {queueCount}
            </Badge>
          </Button>
        </motion.div>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Plane className="h-5 w-5 text-primary" />
            Your Trip Queue
          </SheetTitle>
          <SheetDescription>
            {queueCount} {queueCount === 1 ? "destination" : "destinations"} selected for your trip
          </SheetDescription>
        </SheetHeader>
        
        <div className="mt-6 space-y-4">
          <ScrollArea className="h-[calc(100vh-320px)]">
            <AnimatePresence mode="popLayout">
              <div className="space-y-3 pr-4">
                {queuedCities.map((city, index) => (
                  <motion.div
                    key={city.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card className="overflow-hidden">
                      <div className="flex items-stretch">
                        <div className="w-20 h-20 flex-shrink-0 relative">
                          {city.imageUrl ? (
                            <img
                              src={city.imageUrl}
                              alt={city.cityName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                              <MapPin className="h-6 w-6 text-primary/30" />
                            </div>
                          )}
                          <div className="absolute top-1 left-1">
                            <Badge className="bg-primary/90 text-white border-0 text-xs px-1.5">
                              {index + 1}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex-1 p-3 flex flex-col justify-between">
                          <div>
                            <h4 className="font-medium text-sm">{city.cityName}</h4>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              {city.country}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                              <Zap className="h-3 w-3 mr-1" />
                              {city.pulseScore}
                            </Badge>
                            {city.avgHotelPrice && (
                              <span className="text-xs text-muted-foreground">
                                ~${city.avgHotelPrice}/night
                              </span>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-auto self-stretch rounded-none hover:bg-destructive/10"
                          onClick={() => removeCity(city.id)}
                          data-testid={`button-remove-${city.cityName.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          <X className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </AnimatePresence>
          </ScrollArea>

          <div className="border-t pt-4 space-y-3">
            <Button
              className="w-full"
              size="lg"
              onClick={handlePlanTrip}
              data-testid="button-plan-multi-city-trip"
            >
              <Wand2 className="h-4 w-4 mr-2" />
              Plan {queueCount > 1 ? "Multi-City" : ""} Trip with AI
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                clearQueue();
                setIsOpen(false);
              }}
              data-testid="button-clear-queue"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
