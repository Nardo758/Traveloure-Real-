interface TravelloureLogoProps {
  collapsed?: boolean;
  className?: string;
  "data-testid"?: string;
}

export function TraveloureLogo({ collapsed, className, "data-testid": testId }: TravelloureLogoProps) {
  if (collapsed) {
    // Show just the paper-plane mark (left ~28% of the image) in a square crop
    return (
      <div
        className={`w-8 h-8 overflow-hidden flex-shrink-0 ${className ?? ""}`}
        aria-label="Traveloure"
        data-testid={testId}
      >
        <img
          src="/traveloure-logo.png"
          alt="Traveloure"
          style={{
            height: "100%",
            width: "auto",
            maxWidth: "none",
            objectFit: "cover",
            objectPosition: "left center",
          }}
        />
      </div>
    );
  }

  return (
    <img
      src="/traveloure-logo.png"
      alt="Traveloure"
      className={`h-7 w-auto object-contain ${className ?? ""}`}
      data-testid={testId}
    />
  );
}
