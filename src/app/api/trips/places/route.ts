// Trips: search for a place to add by hand, with hours, price and a photo when Google has them.
import type { TripPlacesResponse } from "@/lib/contracts";
import { fail, rateLimited } from "@/lib/server/http";
import { searchTripPlaces } from "@/lib/server/places";

export async function GET(req: Request) {
  if (rateLimited(req, "trip-places", 30)) return fail(429, "rate_limited");
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 3) return fail(400, "too_short");
  try {
    const body: TripPlacesResponse = await searchTripPlaces(q, 6);
    return Response.json(body);
  } catch {
    return fail(502, "places_unavailable", "Place search is unavailable right now.");
  }
}
