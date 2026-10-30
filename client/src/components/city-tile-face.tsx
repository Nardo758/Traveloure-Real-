/**
 * /experiences city tile media (row 250).
 *
 * Ruling 3 (step 8a) still holds: only Kyoto and Bogotá have credited photos.
 * The other six are typographic. The painted ground is that no-photo state, so
 * a city without a picture is not an empty box. A photo that fails to load
 * uses the same ground.
 */
import { useState } from "react";
import { FRAUNCES } from "@/components/company/company-page";
import type { CityPhoto } from "@/lib/experiences-entry";

export function CityTileFace({
  cityName,
  photo,
  failed = false,
}: {
  cityName: string;
  photo: CityPhoto | null;
  /** Test and parent override. A load error inside this face also flips the fallback. */
  failed?: boolean;
}) {
  const [errored, setErrored] = useState(false);
  const showPhoto = Boolean(photo) && !failed && !errored;

  if (!showPhoto) {
    return (
      <div
        className="flex aspect-[4/3] w-full items-center justify-center px-3"
        style={{ background: "var(--landing-tile-ground)" }}
        data-testid="city-tile-fallback"
        data-photo="none"
      >
        <span
          className="text-center text-[20px] font-semibold leading-tight"
          style={{ fontFamily: FRAUNCES, color: "var(--earn-card)" }}
        >
          {cityName}
        </span>
      </div>
    );
  }

  return (
    <div className="relative aspect-[4/3] w-full" data-photo="credited">
      <img
        src={photo!.src}
        alt={cityName}
        className="h-full w-full object-cover"
        loading="lazy"
        onError={() => setErrored(true)}
      />
      <span className="absolute bottom-0 right-0 bg-black/55 px-1 text-[9px] text-white">{photo!.credit}</span>
    </div>
  );
}
