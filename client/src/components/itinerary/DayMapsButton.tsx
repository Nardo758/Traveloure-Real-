import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Map, ChevronDown } from "lucide-react";
import { openInMaps, detectMapsPlatform } from "@/lib/maps-platform";

interface DayMapsButtonProps {
  dayNumber: number;
  googleUrl?: string;
  appleUrl?: string;
  appleWebUrl?: string;
  className?: string;
}

export function DayMapsButton({ dayNumber, googleUrl, appleUrl, appleWebUrl, className }: DayMapsButtonProps) {
  const hasUrls = googleUrl || appleUrl || appleWebUrl;

  if (!hasUrls) return null;

  const handleSmartOpen = () => {
    const platform = detectMapsPlatform();
    if (platform === "apple" && (appleUrl || appleWebUrl)) {
      openInMaps(appleUrl || appleWebUrl!);
    } else if (googleUrl) {
      openInMaps(googleUrl);
    }
  };

  return (
    <div className={className}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-xs"
            data-testid={`button-open-day-${dayNumber}-maps`}
          >
            <Map className="h-3.5 w-3.5" />
            Open Day {dayNumber} in Maps
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {googleUrl && (
            <DropdownMenuItem
              onClick={() => openInMaps(googleUrl)}
              data-testid={`button-google-maps-day-${dayNumber}`}
            >
              🗺️ Google Maps
            </DropdownMenuItem>
          )}
          {(appleUrl || appleWebUrl) && (
            <DropdownMenuItem
              onClick={() => openInMaps(appleUrl || appleWebUrl!)}
              data-testid={`button-apple-maps-day-${dayNumber}`}
            >
              🍎 Apple Maps
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
