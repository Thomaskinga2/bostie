// A rider's day and their heat map, derived from what Bostie already records.
// Pure functions: no storage, no clock. Everything here stays on the device.
import { LANDMARKS } from "@/data/places";
import { dayKey, type GameEvent, type XpTx } from "./gamification";
import { distanceKm, type LatLng } from "./geo";
import { planRoute, STATION } from "./network";
import type { TrailPoint } from "./store";

/** "all" or one local calendar day (YYYY-MM-DD, see dayKey). */
export type Range = "all" | string;
const inRange = (at: number, range: Range) => range === "all" || dayKey(at) === range;
const LANDMARK = Object.fromEntries(LANDMARKS.map((l) => [l.id, l]));

export function dayRecap(events: GameEvent[], xp: XpTx[], trail: TrailPoint[], day: string) {
  const today = events.filter((e) => dayKey(e.at) === day);
  const journeys = today.flatMap((e) => (e.t === "journey" ? [e] : []));
  const points = trail.filter((p) => dayKey(p.at) === day);
  let trailKm = 0;
  for (const seg of trailSegments(points, "all")) for (let i = 1; i < seg.length; i++) trailKm += distanceKm(seg[i - 1], seg[i]);
  const times = [...today.map((e) => e.at), ...points.map((p) => p.at)];
  return {
    day,
    stations: today.flatMap((e) => (e.t === "station" && STATION[e.id] ? [{ id: e.id, name: STATION[e.id].name, at: e.at }] : [])),
    landmarks: today.flatMap((e) => (e.t === "landmark" && LANDMARK[e.id] ? [{ id: e.id, name: LANDMARK[e.id].name, at: e.at }] : [])),
    journeys,
    rounds: today.filter((e) => e.t === "round").length,
    rideKm: journeys.reduce((n, j) => n + j.km, 0),
    trailKm,
    xp: xp.filter((t) => dayKey(t.at) === day).reduce((n, t) => n + t.amount, 0),
    start: times.length ? Math.min(...times) : null,
    end: times.length ? Math.max(...times) : null,
    active: today.length > 0 || points.length > 0,
  };
}
export type DayRecap = ReturnType<typeof dayRecap>;

export type HeatPoint = { lat: number; lng: number; weight: number };

/**
 * Where the rider has been, weighted by how often. Stations count once when first
 * collected and again for every journey that passed through them; landmarks count
 * more, because finding one is the point; GPS trail points add a little each.
 */
export function heatPoints(events: GameEvent[], trail: TrailPoint[], range: Range): HeatPoint[] {
  const weight = new Map<string, number>();
  const add = (id: string, w: number) => weight.set(id, (weight.get(id) ?? 0) + w);
  for (const e of events) {
    if (!inRange(e.at, range)) continue;
    if (e.t === "station") add(e.id, 1);
    else if (e.t === "landmark") add(`lm:${e.id}`, 3);
    else if (e.t === "journey") for (const leg of planRoute(e.from, e.to)?.legs ?? []) for (const id of leg.stops) add(id, 1);
  }
  const out: HeatPoint[] = [];
  for (const [id, w] of weight) {
    const p: LatLng | undefined = id.startsWith("lm:") ? LANDMARK[id.slice(3)] : STATION[id];
    if (p) out.push({ lat: p.lat, lng: p.lng, weight: w });
  }
  // Thin the trail so a long walk does not drown out everything else.
  const pts = trail.filter((p) => inRange(p.at, range));
  const every = Math.max(1, Math.ceil(pts.length / 400));
  for (let i = 0; i < pts.length; i += every) out.push({ lat: pts[i].lat, lng: pts[i].lng, weight: 0.5 });
  return out;
}

/** Longest silence, and farthest jump, that still counts as one continuous path. */
export const GAP_MINUTES = 10;
export const GAP_KM = 2;

/** The trail as drawable paths, broken wherever the signal was lost (typically underground). */
export function trailSegments(trail: TrailPoint[], range: Range): LatLng[][] {
  const segments: LatLng[][] = [];
  let prev: TrailPoint | null = null;
  for (const p of trail) {
    if (!inRange(p.at, range)) continue;
    const joined = prev && p.at - prev.at <= GAP_MINUTES * 60_000 && distanceKm(prev, p) <= GAP_KM;
    if (joined) segments[segments.length - 1].push({ lat: p.lat, lng: p.lng });
    else segments.push([{ lat: p.lat, lng: p.lng }]);
    prev = p;
  }
  return segments.filter((s) => s.length > 1);
}
