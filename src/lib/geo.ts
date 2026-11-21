export type LatLng = { lat: number; lng: number };

export const BOSTON: LatLng = { lat: 42.3601, lng: -71.0689 };

export function distanceKm(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function formatDistance(km: number): string {
  return km < 1 ? `${Math.max(10, Math.round(km * 100) * 10)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

/** Walking time at 4.8 km/h, with a 1.3 detour factor for the street grid. */
export function walkMinutes(km: number): number {
  return Math.max(1, Math.round(((km * 1.3) / 4.8) * 60));
}
