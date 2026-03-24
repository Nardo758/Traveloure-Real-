import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Download, ChevronDown, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface TripExportButtonProps {
  shareToken: string;
  className?: string;
}

export function TripExportButton({ shareToken, className }: TripExportButtonProps) {
  const handleDownload = (format: "kml" | "gpx") => {
    const url = `/api/itinerary-share/${shareToken}/export/${format}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `traveloure-itinerary.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <TooltipProvider>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={`gap-2 ${className || ""}`}
            data-testid="button-export-trip"
          >
            <Download className="h-4 w-4" />
            Export to Maps
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem
            onClick={() => handleDownload("kml")}
            className="flex items-start gap-2 py-2"
            data-testid="button-export-kml"
          >
            <span className="text-base mt-0.5">🗺️</span>
            <div>
              <div className="font-medium text-sm">Google Maps Layer (KML)</div>
              <div className="text-xs text-muted-foreground">Import into Google My Maps</div>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleDownload("gpx")}
            className="flex items-start gap-2 py-2"
            data-testid="button-export-gpx"
          >
            <span className="text-base mt-0.5">🍎</span>
            <div>
              <div className="font-medium text-sm">Apple Maps / GPS (GPX)</div>
              <div className="text-xs text-muted-foreground">Open in Apple Maps, Gaia GPS, or any GPS app</div>
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <div className="px-3 py-2">
            <p className="text-xs text-muted-foreground">
              💡 KML Tip: Open <strong>maps.google.com/mymaps</strong> → Import → Select the KML file to see all stops as a custom layer.
            </p>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
}
