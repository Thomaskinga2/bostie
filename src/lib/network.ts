// Deterministic MBTA rapid-transit network + route planner.
// The MBTA V3 API has no trip-planning endpoint, so routes are computed here from
// the station/stop-order snapshot in src/data/network.json (built from the API by
// scripts/build-network.mjs). Ride times are ESTIMATES from distance, never live data.
import raw from "@/data/network.json";
import { distanceKm, type LatLng } from "./geo";

export type LineId = "Red" | "Orange" | "Blue" | "Green" | "Mattapan";

export type Station = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  municipality: string;
  accessible: boolean;
  routes: string[];
  lines: LineId[];
  terminal: boolean;
};

export type Leg = {
  route: string;
  line: LineId;
  from: string;
  to: string;
  /** Station ids from boarding to alighting, inclusive. */
  stops: string[];
  /** Headsign-style direction, e.g. "Ashmont/Braintree". */
  toward: string;
  minutes: number;
};

export type Plan = { from: string; to: string; legs: Leg[]; minutes: number; km: number };

export const LINES: Record<LineId, { id: LineId; name: string; color: string; text: string }> = {
  Red: { id: "Red", name: "Red Line", color: "#DA291C", text: "#FFFFFF" },
  Orange: { id: "Orange", name: "Orange Line", color: "#ED8B00", text: "#FFFFFF" },
  Blue: { id: "Blue", name: "Blue Line", color: "#003DA5", text: "#FFFFFF" },
  Green: { id: "Green", name: "Green Line", color: "#00843D", text: "#FFFFFF" },
  Mattapan: { id: "Mattapan", name: "Mattapan Trolley", color: "#DA291C", text: "#FFFFFF" },
};
export const MAIN_LINES: LineId[] = ["Red", "Orange", "Blue", "Green"];

const routeLine = Object.fromEntries(raw.routes.map((r) => [r.id, r.line as LineId]));
export const lineOf = (route: string): LineId => routeLine[route] ?? "Red";
export const routeLabel = (route: string) =>
  route.startsWith("Green-") ? `Green Line ${route.slice(6)}` : LINES[lineOf(route)].name;

export const PATTERNS = raw.patterns as { route: string; name: string; stops: string[] }[];

// route -> its end-of-line stations
const endpoints: Record<string, Set<string>> = {};
for (const p of PATTERNS) {
  const set = (endpoints[p.route] ??= new Set());
  set.add(p.stops[0]).add(p.stops[p.stops.length - 1]);
}

export const STATIONS: Station[] = raw.stations.map((s) => ({
  ...s,
  lines: [...new Set(s.routes.map(lineOf))],
  // A terminal is a station where every service calling there ends its run.
  terminal: s.routes.every((r) => endpoints[r]?.has(s.id)),
}));
export const STATION: Record<string, Station> = Object.fromEntries(STATIONS.map((s) => [s.id, s]));

export const stationsOnLine = (line: LineId) => STATIONS.filter((s) => s.lines.includes(line));

export function nearestStation(p: LatLng): { station: Station; km: number } {
  let best = STATIONS[0];
  let bestKm = Infinity;
  for (const s of STATIONS) {
    const d = distanceKm(p, s);
    if (d < bestKm) [best, bestKm] = [s, d];
  }
  return { station: best, km: bestKm };
}

// --- graph ---------------------------------------------------------------

const TRANSFER_MIN = 4;
/** Average speed incl. acceleration; surface Green Line branches are much slower. */
const speedKmh = (route: string) => (route.startsWith("Green") || route === "Mattapan" ? 17 : 34);
export const rideMinutes = (route: string, a: string, b: string) =>
  (distanceKm(STATION[a], STATION[b]) / speedKmh(route)) * 60 + 0.6;

// adjacency[route][station] = neighbouring stations on that route
const adjacency: Record<string, Record<string, Set<string>>> = {};
for (const p of PATTERNS) {
  const adj = (adjacency[p.route] ??= {});
  for (let i = 0; i < p.stops.length - 1; i++) {
    const [a, b] = [p.stops[i], p.stops[i + 1]];
    (adj[a] ??= new Set()).add(b);
    (adj[b] ??= new Set()).add(a);
  }
}

function toward(route: string, stops: string[]): string {
  const names = new Set<string>();
  for (const p of PATTERNS.filter((p) => p.route === route)) {
    const i = p.stops.indexOf(stops[0]);
    const j = p.stops.indexOf(stops[stops.length - 1]);
    if (i < 0 || j < 0) continue;
    names.add(STATION[j > i ? p.stops[p.stops.length - 1] : p.stops[0]].name);
  }
  return [...names].join("/");
}

/** Dijkstra over (station, route) states: minimises ride time plus a transfer penalty. */
export function planRoute(fromId: string, toId: string): Plan | null {
  if (!STATION[fromId] || !STATION[toId] || fromId === toId) return null;
  const key = (s: string, r: string) => `${s}|${r}`;
  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const open = new Set<string>();
  for (const r of STATION[fromId].routes) {
    dist.set(key(fromId, r), 0);
    open.add(key(fromId, r));
  }
  let end: string | null = null;
  while (open.size) {
    let cur = "";
    let best = Infinity;
    for (const k of open) if (dist.get(k)! < best) [cur, best] = [k, dist.get(k)!];
    open.delete(cur);
    const [s, r] = cur.split("|");
    if (s === toId) {
      end = cur;
      break;
    }
    const relax = (k: string, cost: number) => {
      if (cost < (dist.get(k) ?? Infinity)) {
        dist.set(k, cost);
        prev.set(k, cur);
        open.add(k);
      }
    };
    for (const n of adjacency[r]?.[s] ?? []) relax(key(n, r), best + rideMinutes(r, s, n));
    for (const r2 of STATION[s].routes) if (r2 !== r) relax(key(s, r2), best + TRANSFER_MIN);
  }
  if (!end) return null;

  const path: string[] = [];
  for (let k: string | undefined = end; k; k = prev.get(k)) path.unshift(k);
  const legs: Leg[] = [];
  for (const k of path) {
    const [s, r] = k.split("|");
    const last = legs[legs.length - 1];
    if (last && last.route === r) last.stops.push(s);
    else legs.push({ route: r, line: lineOf(r), from: s, to: s, stops: [s], toward: "", minutes: 0 });
  }
  const riding = legs.filter((l) => l.stops.length > 1);
  let km = 0;
  for (const l of riding) {
    l.to = l.stops[l.stops.length - 1];
    l.toward = toward(l.route, l.stops);
    for (let i = 0; i < l.stops.length - 1; i++) {
      l.minutes += rideMinutes(l.route, l.stops[i], l.stops[i + 1]);
      km += distanceKm(STATION[l.stops[i]], STATION[l.stops[i + 1]]);
    }
    l.minutes = Math.round(l.minutes);
  }
  if (!riding.length) return null;
  return {
    from: fromId,
    to: toId,
    legs: riding,
    km,
    minutes: riding.reduce((m, l) => m + l.minutes, 0) + (riding.length - 1) * TRANSFER_MIN,
  };
}

/** MBTA direction_id for a ride on `route` from one station to another (patterns are stored in direction 0 order). */
export function legDirection(route: string, from: string, to: string): 0 | 1 {
  for (const p of PATTERNS) {
    if (p.route !== route) continue;
    const [i, j] = [p.stops.indexOf(from), p.stops.indexOf(to)];
    if (i >= 0 && j >= 0) return j > i ? 0 : 1;
  }
  return 0;
}
