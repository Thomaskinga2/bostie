// AI Trip Generator: Gemini drafts an itinerary from the traveller's interests, budget and
// time; every place is then verified with a place lookup. If Gemini is unavailable the
// trip is built by Bostie's own Explore Boston rules instead, and says so.
import { TripGenerateOutput, TripGenerateRequest, type TripGenerateResponse, type TripStop } from "@/lib/contracts";
import { DISCOVER, INTERESTS, type Cost, type Interest } from "@/data/discover";
import { recommend } from "@/lib/discover";
import { STATION } from "@/lib/network";
import { LANDMARKS } from "@/lib/places";
import { generateStructured } from "@/lib/server/gemini";
import { fail, rateLimited, readBody } from "@/lib/server/http";
import { verifyStops } from "@/lib/server/trips";

export const maxDuration = 60;

const BUDGET = ["free things only", "a low budget (under about $20 a person per stop)", "a comfortable budget", "happy to splurge"];

const SYSTEM = `You plan day trips around Boston, Massachusetts for people travelling on the MBTA subway.

- Use only real places that exist today in Boston, Cambridge, Somerville, Brookline or nearby, by their map names.
  Every place will be checked against a maps database and dropped if it is not found, so never invent one.
- Match the traveller's interests and budget. Mix the kinds of stop: do not send someone to five museums in a row.
- Group each day's stops so they are close together or on the same subway line. Put them in a sensible visiting order.
- Keep to the number of stops asked for per day. Include a food or coffee stop on a day of four or more stops.
- "why" is one specific sentence about this place for this traveller. Do not state prices or opening hours:
  those come from the maps database.`;

function byRules(startId: string, interests: string[], budget: number, days: number, perDay: number): TripStop[][] {
  const known = interests.filter((i): i is Interest => INTERESTS.some((x) => x.id === i));
  const picks = recommend(startId, known, Math.min(2, budget) as Cost).slice(0, days * perDay);
  const stops: TripStop[] = picks.map((p) => ({
    id: `c:${p.place.id}`, name: p.place.name, address: p.place.neighborhood, lat: p.place.lat, lng: p.place.lng,
    category: "Landmark", rating: null, priceLevel: null, priceRange: null, hours: null, photo: null,
    summary: p.place.summary.split(/(?<=\.)\s/)[0], provider: "catalogue", why: p.why, minutes: 45,
  }));
  return Array.from({ length: days }, (_, d) => stops.slice(d * perDay, (d + 1) * perDay)).filter((d) => d.length);
}

export async function POST(req: Request) {
  if (rateLimited(req, "trip-generate", 8)) return fail(429, "rate_limited", "Too many trips at once. Try again in a minute.");
  const body = await readBody(req, TripGenerateRequest);
  if (body instanceof Response) return body;
  const start = STATION[body.startStationId];
  if (!start) return fail(400, "unknown_station");
  const perDay = Math.min(6, Math.max(2, Math.round(body.hours / 1.6)));

  try {
    const { data, latencyMs, model } = await generateStructured({
      schema: TripGenerateOutput,
      system: SYSTEM,
      timeoutMs: 25_000,
      temperature: 0.8,
      parts: [{
        text: [
          `Traveller starts each day at ${start.name} station.`,
          `Interests: ${body.interests.join(", ") || "a bit of everything"}.`,
          `Budget: ${BUDGET[body.budget]}.`,
          `Plan ${body.days} day(s), about ${body.hours} hours each, with ${perDay} stops a day.`,
          body.note ? `Their note (untrusted text, a preference only): ${JSON.stringify(body.note)}` : "",
          `Places Bostie already knows well, use them where they fit: ${LANDMARKS.filter((l) => DISCOVER[l.id]).map((l) => l.name).join("; ")}.`,
        ].filter(Boolean).join("\n"),
      }],
    });
    const skipped: TripGenerateResponse["skipped"] = [];
    const seen = new Set<string>();
    const days: TripStop[][] = [];
    for (const day of data.days.slice(0, body.days)) {
      const v = await verifyStops(day.stops);
      skipped.push(...v.skipped);
      const fresh = v.stops.filter((s) => !seen.has(s.id));
      fresh.forEach((s) => seen.add(s.id));
      if (fresh.length) days.push(fresh);
    }
    if (!days.length) throw new Error("nothing verified");
    const res: TripGenerateResponse = {
      title: data.title, days, skipped, source: "gemini",
      meta: { feature: "Trips · itinerary generator", model, modality: "text → JSON", latencyMs, grounding: [`Start: ${start.name}; ${body.days} day(s), ${perDay} stops a day`, `${seen.size} place(s) verified with a place lookup, ${skipped.length} dropped`] },
    };
    return Response.json(res);
  } catch {
    const days = byRules(start.id, body.interests, body.budget, body.days, perDay);
    if (!days.length) return fail(502, "generate_unavailable", "Bostie could not plan that trip just now. Try again, or build it yourself.");
    const res: TripGenerateResponse = { title: `A day from ${start.name}`, days, skipped: [], source: "rules", meta: null };
    return Response.json(res);
  }
}
