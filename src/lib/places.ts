import wiki from "@/data/wiki.json";
import { LANDMARKS, PLACES, type Place } from "@/data/places";
import { distanceKm, type LatLng } from "./geo";
import { nearestStation, STATION, type Station } from "./network";

export { LANDMARKS, PLACES, type Place };

export type Photo = { src: string; width: number; height: number; credit: string; license: string; source: string };

export const PLACE: Record<string, Place> = Object.fromEntries(PLACES.map((p) => [p.id, p]));
export const photoOf = (id: string): Photo | undefined => (wiki as Record<string, Photo>)[id];

export const stationFor = (p: Place): Station =>
  (p.stationId && STATION[p.stationId]) || nearestStation(p).station;

export function nearbyLandmarks(from: LatLng, limit = 6): { place: Place; km: number }[] {
  return LANDMARKS.map((place) => ({ place, km: distanceKm(from, place) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, limit);
}

export const landmarksNearStation = (stationId: string, maxKm = 0.9) =>
  nearbyLandmarks(STATION[stationId], 20).filter((l) => l.km <= maxKm);
