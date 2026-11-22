// Location search for the Ride screen: any address or place around Boston.
//
// Two providers behind one response shape:
//   - Google Places API (New) text search, when GOOGLE_MAPS_API_KEY is set (server-side key).
//   - Otherwise Photon, a keyless search over OpenStreetMap data.
// Either way this route only finds WHERE a place is. How to get there is worked out by
// Bostie's own MBTA planner, never by a model.
import { distanceKm } from "@/lib/geo";
import { fail, rateLimited } from "@/lib/server/http";
import { google, inBox, photon } from "@/lib/server/places";
import type { PlaceHit, PlacesResponse } from "@/lib/contracts";

// ponytail: per-instance memory cache, enough to absorb repeated typing in a demo.
const cache = new Map<string, { at: number; body: PlacesResponse }>();
const TTL = 10 * 60_000;

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
