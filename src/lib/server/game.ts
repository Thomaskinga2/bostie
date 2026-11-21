import "server-only";
import { normalize } from "@/lib/game";
import { walkMinutes, distanceKm } from "@/lib/geo";
import { routeLabel } from "@/lib/network";
import { stationFor, type Place } from "@/lib/places";

/** Transit facts computed from the network snapshot: Gemini restates, never invents them. */
export function transitFacts(p: Place) {
  const s = stationFor(p);
  const km = distanceKm(p, s);
  return {
    nearestStation: s.name,
    lines: [...new Set(s.routes.map(routeLabel))],
    walkFromStation: p.kind === "station" ? "it is the station" : `about ${walkMinutes(km)} min walk`,
  };
}

export const groundTruth = (p: Place) => ({
  name: p.name,
  kind: p.kind,
  neighborhood: p.neighborhood,
  year: p.year ?? null,
  referenceNotes: p.summary,
  visualCues: p.cues,
  transit: transitFacts(p),
});

/** True if text gives the answer away: used to veto model output before it reaches the player. */
export function leaksAnswer(text: string, p: Place): boolean {
  const t = ` ${normalize(text)} `;
  return [p.name, ...p.aliases].some((a) => {
    const n = normalize(a);
    return n.length >= 4 && t.includes(` ${n} `);
  });
}
