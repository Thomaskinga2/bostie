// Explore Boston: deterministic recommendations. Which places match, how long they take
// to reach and why they fit are all computed here from catalogue data and the route
// planner, so nothing about a destination or the way to it is ever made up.
import { COST_LABEL, DISCOVER, INTERESTS, type Cost, type Interest } from "@/data/discover";
import { journeyFare } from "./fares";
import { distanceKm, walkMinutes } from "./geo";
import { planRoute, STATION } from "./network";
import { LANDMARKS, stationFor, type Place } from "./places";

export type Pick = {
  place: Place;
  tags: Interest[];
  cost: Cost;
  stationId: string;
  /** Estimated minutes: train ride from the start, plus the walk from the station. */
  rideMinutes: number;
  walkMinutes: number;
  totalMinutes: number;
  transfers: number;
  /** One-way adult fare for the ride, in cents. null when it is a walk from the starting station. */
  fareCents: number | null;
  /** Interests of the visitor that this place matches. */
  matched: Interest[];
  why: string;
};

const label = (id: Interest) => INTERESTS.find((i) => i.id === id)!.label.toLowerCase();
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** Destinations within budget, best match first, then quickest to reach. */
export function recommend(fromId: string, interests: Interest[], maxCost: Cost): Pick[] {
  const from = STATION[fromId];
  return LANDMARKS.flatMap((place) => {
    const meta = DISCOVER[place.id];
    if (!meta || meta.cost > maxCost) return [];
    const station = stationFor(place);
    const plan = planRoute(fromId, station.id);
    const ride = station.id === fromId ? 0 : plan?.minutes;
    if (ride === undefined) return [];
    const walk = walkMinutes(distanceKm(place, station));
    const matched = meta.tags.filter((t) => interests.includes(t));
    const total = ride + walk;
    const reach = station.id === fromId ? `a ${walk} min walk from ${from.name}` : `about ${total} min from ${from.name}`;
    const why = matched.length
      ? `Matches your interest in ${list(matched.map(label))}. ${COST_LABEL[meta.cost]}, and ${reach}.`
      : `${COST_LABEL[meta.cost]}, and ${reach}.`;
    return [{ place, ...meta, stationId: station.id, rideMinutes: ride, walkMinutes: walk, totalMinutes: total, transfers: plan ? plan.legs.length - 1 : 0, fareCents: plan && ride > 0 ? journeyFare(plan).totalCents : null, matched, why }];
  }).sort((a, b) => b.matched.length - a.matched.length || a.totalMinutes - b.totalMinutes);
}
