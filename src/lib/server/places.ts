import "server-only";
// Place lookups shared by Ride search and Trips: Google Places API (New) when
// GOOGLE_MAPS_API_KEY is set, otherwise Photon (OpenStreetMap). Both only say WHERE a
// place is and what Google publishes about it; nothing here comes from a model.
import type { PlaceHit, TripPlace } from "@/lib/contracts";

/** Greater Boston, roughly the reach of the rapid-transit network. */
export const BOX = { south: 42.18, west: -71.3, north: 42.46, east: -70.95 };
export const CENTER = { lat: 42.3601, lng: -71.0589 };
export const inBox = (p: { lat: number; lng: number }) => p.lat >= BOX.south && p.lat <= BOX.north && p.lng >= BOX.west && p.lng <= BOX.east;

export async function google(q: string, key: string): Promise<PlaceHit[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location",
    },
    body: JSON.stringify({
      textQuery: q,
      maxResultCount: 6,
      locationBias: { circle: { center: { latitude: CENTER.lat, longitude: CENTER.lng }, radius: 20_000 } },
    }),
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Google Places ${res.status}`);
  const data = (await res.json()) as {
    places?: { id: string; displayName?: { text: string }; formattedAddress?: string; location?: { latitude: number; longitude: number } }[];
  };
  return (data.places ?? [])
    .filter((p) => p.location && p.displayName?.text)
    .map((p) => ({ id: `g:${p.id}`, name: p.displayName!.text, address: p.formattedAddress ?? "", lat: p.location!.latitude, lng: p.location!.longitude }));
}

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: { osm_id?: number; osm_key?: string; osm_value?: string; name?: string; housenumber?: string; street?: string; city?: string; district?: string; locality?: string };
};

export async function photon(q: string): Promise<PlaceHit[]> {
  const url = new URL("https://photon.komoot.io/api/");
  url.search = new URLSearchParams({
    q, limit: "10", lang: "en", lat: String(CENTER.lat), lon: String(CENTER.lng),
    bbox: [BOX.west, BOX.south, BOX.east, BOX.north].join(","),
  }).toString();
  const res = await fetch(url, { headers: { "User-Agent": "BostieApp/1.0 (MBTA exploration demo)" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!res.ok) throw new Error(`Photon ${res.status}`);
  const data = (await res.json()) as { features?: PhotonFeature[] };
  return (data.features ?? [])
    // Transit stops are already in the station list.
    .filter((f) => f.properties.osm_key !== "railway" && f.properties.osm_key !== "public_transport" && f.properties.osm_value !== "bus_stop")
    .map((f) => {
      const p = f.properties;
      const street = [p.housenumber, p.street].filter(Boolean).join(" ");
      const name = p.name ?? street;
      const address = [p.name ? street : "", p.city ?? p.district ?? p.locality ?? ""].filter(Boolean).join(", ");
      return { id: `o:${p.osm_id ?? name}`, name, address, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] };
    })
    .filter((h) => h.name);
}


// --- Trips: places with the details an itinerary needs -------------------------

type GPlace = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  priceLevel?: string;
  priceRange?: { startPrice?: { units?: string }; endPrice?: { units?: string } };
  primaryTypeDisplayName?: { text: string };
  editorialSummary?: { text: string };
  photos?: { name: string }[];
  regularOpeningHours?: {
    weekdayDescriptions?: string[];
    periods?: { open?: { day: number; hour: number; minute: number }; close?: { day: number; hour: number; minute: number } }[];
  };
};
const PRICE: Record<string, 0 | 1 | 2 | 3 | 4> = { PRICE_LEVEL_FREE: 0, PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4 };
const DETAIL_FIELDS = ["id", "displayName", "formattedAddress", "location", "rating", "priceLevel", "priceRange", "primaryTypeDisplayName", "editorialSummary", "photos", "regularOpeningHours"].map((f) => `places.${f}`).join(",");

function toTripPlace(p: GPlace): TripPlace {
  const periods = (p.regularOpeningHours?.periods ?? []).flatMap((x) => {
    if (!x.open) return [];
    const open = x.open.hour * 60 + x.open.minute;
    // No closing time means open around the clock; a close on the next day runs past midnight.
    const close = x.close ? ((x.close.day - x.open.day + 7) % 7) * 1440 + x.close.hour * 60 + x.close.minute : open + 1440 * 7;
    return [{ day: x.open.day, open, close }];
  });
  const [low, high] = [Number(p.priceRange?.startPrice?.units), Number(p.priceRange?.endPrice?.units)];
  return {
    id: `g:${p.id}`,
    name: p.displayName!.text,
    address: p.formattedAddress ?? "",
    lat: p.location!.latitude,
    lng: p.location!.longitude,
    category: p.primaryTypeDisplayName?.text ?? null,
    rating: typeof p.rating === "number" ? p.rating : null,
    priceLevel: p.priceLevel && p.priceLevel in PRICE ? PRICE[p.priceLevel] : null,
    priceRange: Number.isFinite(low) && Number.isFinite(high) ? { low, high } : null,
    hours: p.regularOpeningHours ? { week: p.regularOpeningHours.weekdayDescriptions ?? [], periods } : null,
    photo: p.photos?.[0]?.name ?? null,
    summary: p.editorialSummary?.text ?? null,
    provider: "google",
  };
}

/** Places matching `q` in Greater Boston, with opening hours, price and a photo when Google has them. */
export async function searchTripPlaces(q: string, limit = 5): Promise<{ provider: "google" | "openstreetmap"; places: TripPlace[] }> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    // OpenStreetMap knows where things are, not when they open or what they cost.
    const hits = (await photon(q)).filter(inBox).slice(0, limit);
    return { provider: "openstreetmap", places: hits.map((h) => ({ ...h, category: null, rating: null, priceLevel: null, priceRange: null, hours: null, photo: null, summary: null, provider: "openstreetmap" })) };
  }
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "content-type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": DETAIL_FIELDS },
    body: JSON.stringify({ textQuery: q, maxResultCount: Math.min(8, limit + 2), locationBias: { circle: { center: { latitude: CENTER.lat, longitude: CENTER.lng }, radius: 20_000 } } }),
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Google Places ${res.status}`);
  const data = (await res.json()) as { places?: GPlace[] };
  console.log("[trips-debug] fields:", Object.keys(data.places?.[0] ?? {}).join(","), "| photos:", JSON.stringify(data.places?.[0]?.photos?.[0] ?? null).slice(0, 160)); // TEMP
  const places = (data.places ?? []).filter((p) => p.location && p.displayName?.text).map(toTripPlace).filter(inBox).slice(0, limit);
  return { provider: "google", places };
}

// ponytail: per-instance memory cache, so re-verifying the same name in one session is free.
const found = new Map<string, { at: number; place: TripPlace | null }>();

/**
 * Checks that a place named by Gemini (or seen in a video) really exists in Greater Boston.
 * Returns the real place, or null: an unverified name never reaches an itinerary.
 */
export async function verifyPlace(name: string): Promise<TripPlace | null> {
  const k = name.trim().toLowerCase();
  const hit = found.get(k);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.place;
  let place: TripPlace | null = null;
  try {
    place = (await searchTripPlaces(/boston|cambridge|somerville|brookline/i.test(name) ? name : `${name}, Boston`, 1)).places[0] ?? null;
  } catch {
    return null; // lookup down: treat as unverified, and do not cache the miss
  }
  found.set(k, { at: Date.now(), place });
  if (found.size > 800) found.clear();
  return place;
}
