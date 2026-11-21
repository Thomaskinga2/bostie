// Location search for the Ride screen: any address or place around Boston.
//
// Two providers behind one response shape:
//   - Google Places API (New) text search, when GOOGLE_MAPS_API_KEY is set (server-side key).
//   - Otherwise Photon, a keyless search over OpenStreetMap data.
// Either way this route only finds WHERE a place is. How to get there is worked out by
// Bostie's own MBTA planner, never by a model.
import { distanceKm } from "@/lib/geo";
import { fail, rateLimited } from "@/lib/server/http";
import type { PlaceHit, PlacesResponse } from "@/lib/contracts";

/** Greater Boston, roughly the reach of the rapid-transit network. */
const BOX = { south: 42.18, west: -71.3, north: 42.46, east: -70.95 };
const CENTER = { lat: 42.3601, lng: -71.0589 };
const inBox = (p: { lat: number; lng: number }) => p.lat >= BOX.south && p.lat <= BOX.north && p.lng >= BOX.west && p.lng <= BOX.east;

// ponytail: per-instance memory cache, enough to absorb repeated typing in a demo.
const cache = new Map<string, { at: number; body: PlacesResponse }>();
const TTL = 10 * 60_000;

async function google(q: string, key: string): Promise<PlaceHit[]> {
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

async function photon(q: string): Promise<PlaceHit[]> {
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

export async function GET(req: Request) {
  if (rateLimited(req, "places", 40)) return fail(429, "rate_limited");
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 3) return fail(400, "too_short");

  const key = process.env.GOOGLE_MAPS_API_KEY;
  const provider: PlacesResponse["provider"] = key ? "google" : "openstreetmap";
  const cacheKey = `${provider}:${q.toLowerCase()}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL) return Response.json(hit.body);

  try {
    const found = key ? await google(q, key) : await photon(q);
    // Keep results inside the service area, drop near-duplicates, nearest to downtown first among equals.
    const seen: PlaceHit[] = [];
    for (const h of found) {
      if (!Number.isFinite(h.lat) || !Number.isFinite(h.lng) || !inBox(h)) continue;
      if (seen.some((s) => s.name.toLowerCase() === h.name.toLowerCase() && distanceKm(s, h) < 0.3)) continue;
      seen.push(h);
    }
    const body: PlacesResponse = { provider, places: seen.slice(0, 5) };
    cache.set(cacheKey, { at: Date.now(), body });
    if (cache.size > 500) for (const [k, v] of cache) if (Date.now() - v.at > TTL) cache.delete(k);
    return Response.json(body);
  } catch (e) {
    console.warn(`[places] ${provider} search failed: ${(e as Error).message}`);
    return fail(502, "places_unavailable", "Place search is unavailable right now.");
  }
}
