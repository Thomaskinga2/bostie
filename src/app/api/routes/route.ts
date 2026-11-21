// Other ways to make a trip, from the Google Routes API in transit mode (buses and
// Commuter Rail included). Optional: with no GOOGLE_MAPS_API_KEY, or if Google fails,
// this returns no routes and Bostie's own MBTA planner carries on alone.
// Google's fare field is deliberately not requested: prices come from data/fares.ts only.
import { z } from "zod";
import type { TransitRoute, TransitRoutesResponse, TransitStep } from "@/lib/contracts";
import { fail, rateLimited, readBody } from "@/lib/server/http";

const Point = z.object({ lat: z.number().min(41).max(44), lng: z.number().min(-73).max(-69) });
const Body = z.object({ from: Point, to: Point });

type GStop = { name?: string; location?: { latLng?: { latitude: number; longitude: number } } };
type GStep = {
  travelMode?: string;
  staticDuration?: string;
  distanceMeters?: number;
  transitDetails?: {
    stopDetails?: { departureStop?: GStop; arrivalStop?: GStop };
    headsign?: string;
    stopCount?: number;
    transitLine?: { name?: string; nameShort?: string; color?: string; vehicle?: { type?: string } };
  };
};
type GResponse = { routes?: { duration?: string; legs?: { steps?: GStep[] }[] }[] };

const minutes = (d?: string) => Math.round(parseFloat(d ?? "0") / 60);
const stop = (s?: GStop) => ({ name: s?.name ?? "", lat: s?.location?.latLng?.latitude ?? 0, lng: s?.location?.latLng?.longitude ?? 0 });

function simplify(route: NonNullable<GResponse["routes"]>[number]): TransitRoute {
  const steps: TransitStep[] = [];
  for (const s of (route.legs ?? []).flatMap((l) => l.steps ?? [])) {
    const t = s.transitDetails;
    if (t) {
      steps.push({
        kind: "transit", minutes: minutes(s.staticDuration), vehicle: t.transitLine?.vehicle?.type ?? "OTHER",
        line: t.transitLine?.nameShort || t.transitLine?.name || "Transit", lineName: t.transitLine?.name ?? "", color: t.transitLine?.color ?? null,
        headsign: t.headsign ?? "", stops: t.stopCount ?? 0, from: stop(t.stopDetails?.departureStop), to: stop(t.stopDetails?.arrivalStop),
      });
    } else {
      // Google splits one walk into many turns: fold them into a single step.
      const last = steps[steps.length - 1];
      const [m, metres] = [parseFloat(s.staticDuration ?? "0") / 60, s.distanceMeters ?? 0];
      if (last?.kind === "walk") Object.assign(last, { minutes: last.minutes + m, metres: last.metres + metres });
      else steps.push({ kind: "walk", minutes: m, metres });
    }
  }
  for (const s of steps) s.minutes = Math.round(s.minutes);
  return { minutes: minutes(route.duration), steps: steps.filter((s) => s.kind === "transit" || s.minutes >= 1) };
}

// ponytail: per-instance memory cache; times drift a few minutes inside the window, which is fine for comparing routes.
const cache = new Map<string, { at: number; body: TransitRoutesResponse }>();
const TTL = 5 * 60_000;

export async function POST(req: Request) {
  const body = await readBody(req, Body);
  if (body instanceof Response) return body;
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const none: TransitRoutesResponse = { provider: "none", routes: [] };
  if (!key) return Response.json(none);
  if (rateLimited(req, "routes", 20)) return fail(429, "rate_limited");

  const id = [body.from.lat, body.from.lng, body.to.lat, body.to.lng].map((n) => n.toFixed(4)).join(",");
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL) return Response.json(hit.body);
  try {
    const at = (p: z.infer<typeof Point>) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
    const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "routes.duration,routes.legs.steps.travelMode,routes.legs.steps.staticDuration,routes.legs.steps.distanceMeters,routes.legs.steps.transitDetails",
      },
      body: JSON.stringify({ origin: at(body.from), destination: at(body.to), travelMode: "TRANSIT", computeAlternativeRoutes: true }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Google Routes ${res.status}`);
    const data = (await res.json()) as GResponse;
    const out: TransitRoutesResponse = { provider: "google", routes: (data.routes ?? []).map(simplify).filter((r) => r.steps.some((s) => s.kind === "transit")) };
    cache.set(id, { at: Date.now(), body: out });
    if (cache.size > 500) cache.clear();
    return Response.json(out);
  } catch {
    // Not enabled on the key, over quota or down: alternatives are a bonus, so say nothing and return none.
    return Response.json(none);
  }
}
