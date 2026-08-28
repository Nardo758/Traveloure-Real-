export function getCityDiscoverHref(cityName: string): string {
  return `/discover/location/${encodeURIComponent(cityName)}`;
}