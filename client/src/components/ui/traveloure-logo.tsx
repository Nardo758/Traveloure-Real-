import { cn } from "@/lib/utils";

interface TraveloureLogoProps {
  collapsed?: boolean;
  className?: string;
}

export function TraveloureLogo({ collapsed, className }: TraveloureLogoProps) {
  if (collapsed) {
    return (
      <div
        className={cn("w-8 h-8 overflow-hidden flex-shrink-0", className)}
        style={{ borderRadius: 6 }}
      >
        <img
          src="/traveloure-logo.png"
          alt="Traveloure"
          className="h-8 w-auto max-w-none"
          style={{ objectFit: "cover", objectPosition: "left center" }}
        />
      </div>
    );
  }

  return (
    <img
      src="/traveloure-logo.png"
      alt="Traveloure"
      className={cn("h-7 w-auto object-contain", className)}
    />
  );
}
