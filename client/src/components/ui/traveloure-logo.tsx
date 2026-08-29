import { cn } from "@/lib/utils";

interface TraveloureLogoProps {
  collapsed?: boolean;
  className?: string;
  /** Monochrome variant (--earn-muted fill baked into the asset) — footer use per
   *  ruling 2026-08-28-chrome-alignment. Same geometry, different file. */
  mono?: boolean;
}

export function TraveloureLogo({ collapsed, className, mono }: TraveloureLogoProps) {
  const src = mono ? "/traveloure-logo-mono.svg" : "/traveloure-logo.svg";
  if (collapsed) {
    return (
      <div
        className={cn("w-8 h-8 overflow-hidden flex-shrink-0", className)}
        style={{ borderRadius: 6 }}
      >
        <img
          src={src}
          alt="Traveloure"
          width={1000}
          height={295}
          className="h-8 w-auto max-w-none"
          style={{ objectFit: "cover", objectPosition: "left center" }}
        />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt="Traveloure"
      width={1000}
      height={295}
      className={cn("h-7 w-auto object-contain", className)}
    />
  );
}
