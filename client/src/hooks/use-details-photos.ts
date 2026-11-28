/**
 * V31 - the gallery for one place/item. The server already orders it (position 0 = cover), caps it at 8 and drops an
 * uncredited third-party row, so the hook adds no rule of its own.
 */
import { useQuery } from "@tanstack/react-query";
import type { DetailsPhoto } from "@/lib/details";

export function useDetailsPhotos(key: string | null | undefined, enabled = true) {
  const { data, isLoading } = useQuery<{ photos: DetailsPhoto[] }>({
    queryKey: ["/api/place-photos", key],
    enabled: enabled && !!key,
  });
  return { photos: data?.photos ?? [], loading: enabled && !!key && isLoading };
}
