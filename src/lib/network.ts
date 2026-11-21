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
  /** Where the trains to take are headed, in the MBTA's own words, e.g. "Ashmont/Braintree". See legInfo(). */
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

/** Per route, indexed by MBTA direction_id: the direction's name and where it ends. */
const DIRECTIONS: Record<string, { names: string[]; destinations: string[] }> = Object.fromEntries(
  raw.routes.map((r) => [r.id, { names: r.directionNames, destinations: r.directionDestinations }]),
);
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

/** Stop patterns of `route` that call at both stations (the Red Line has one per branch). */
const patternsVia = (route: string, a: string, b: string) => PATTERNS.filter((p) => p.route === route && p.stops.includes(a) && p.stops.includes(b));
/** The far end of a pattern in a direction (patterns are stored in direction 0 order). */
const terminal = (p: { stops: string[] }, direction: number) => STATION[direction === 0 ? p.stops[p.stops.length - 1] : p.stops[0]].name;

const or = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}` : (xs[0] ?? ""));

/**
 * Everything a rider needs to board the right train for a leg, from MBTA data:
 * every route that makes the trip (Park Street to Kenmore is Green B, C or D), the
 * MBTA direction, and the destination shown on the train.
 */
export function legInfo(leg: Pick<Leg, "route" | "from" | "to">) {
  const direction = legDirection(leg.route, leg.from, leg.to);
  const line = lineOf(leg.route);
  const routes = raw.routes
    .map((r) => r.id)
    .filter((r) => lineOf(r) === line && patternsVia(r, leg.from, leg.to).length > 0 && legDirection(r, leg.from, leg.to) === direction);
  const destinations = routes.map((r) => {
    const all = PATTERNS.filter((p) => p.route === r);
    const via = patternsVia(r, leg.from, leg.to);
    // A branching line (Red): name only the branches that reach the stop, unless all do.
    return all.length > 1 && via.length < all.length ? via.map((p) => terminal(p, direction)).join("/") : (DIRECTIONS[r]?.destinations[direction] ?? terminal(via[0], direction));
  });
  const label = routes.length > 1 && line === "Green" ? `Green Line ${or(routes.map((r) => r.slice(6)))}` : routeLabel(leg.route);
  return {
    direction,
    /** "Southbound", "Westbound", "Inbound" */
    directionName: (DIRECTIONS[leg.route]?.names[direction] ?? "").replace(/^(North|South|East|West)$/, "$1bound"),
    routes,
    /** "Green Line B, C or D" */
    label,
    toward: or([...new Set(destinations)]),
  };
}

/**
 * Whether a departing train actually makes this leg: right line, right direction, and
 * a train that gets as far as the stop: the right branch, and not one ending early.
 * A headsign we cannot place at all is kept rather than hidden.
 */
export function servesLeg(leg: Pick<Leg, "route" | "from" | "to">, train: { route: string; direction: number; headsign: string }): boolean {
  const info = legInfo(leg);
  if (!info.routes.includes(train.route) || train.direction !== info.direction) return false;
  const named = PATTERNS.filter((p) => p.route === train.route && p.stops.includes(leg.from) && terminal(p, train.direction) === train.headsign);
  if (named.length) return named.some((p) => p.stops.includes(leg.to));
  // A train ending early (headsign "Broadway" during shuttle work): it must get at least as far as the stop.
  for (const p of patternsVia(train.route, leg.from, leg.to)) {
    const end = p.stops.findIndex((id) => STATION[id].name === train.headsign);
    if (end >= 0) return train.direction === 0 ? end >= p.stops.indexOf(leg.to) : end <= p.stops.indexOf(leg.to);
  }
  return true;
}

export type PlanOptions = {
  /** Minutes a change of line "costs" during the search. Raise it to prefer fewer changes. */
  transferPenalty?: number;
  /** Stations to steer changes away from, to surface a genuinely different route. */
  avoidTransfersAt?: string[];
};

/** Dijkstra over (station, route) states: minimises ride time plus a transfer penalty. */
export function planRoute(fromId: string, toId: string, opts: PlanOptions = {}): Plan | null {
  if (!STATION[fromId] || !STATION[toId] || fromId === toId) return null;
  const penalty = opts.transferPenalty ?? TRANSFER_MIN;
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
    for (const r2 of STATION[s].routes) if (r2 !== r) relax(key(s, r2), best + penalty + (opts.avoidTransfersAt?.includes(s) ? 12 : 0));
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
    l.toward = legInfo(l).toward;
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

export type RouteOption = { plan: Plan; tag: "Fastest" | "Fewest changes" | "Alternative" | "From Google" };

/** Same trains in the same order: Green branches sharing a trunk count as one route. */
export const signature = (p: Plan) => p.legs.map((l) => `${l.line}:${l.from}>${l.to}`).join("|");

/**
 * Up to three distinct ways to make a trip: the fastest, one that prefers fewer changes,
 * and one that changes somewhere else. Alternatives much slower than the best are dropped.
 */
export function routeOptions(fromId: string, toId: string): RouteOption[] {
  const best = planRoute(fromId, toId);
  if (!best) return [];
  const out: RouteOption[] = [{ plan: best, tag: "Fastest" }];
  const add = (plan: Plan | null, tag: RouteOption["tag"]) => {
    if (plan && plan.minutes <= best.minutes * 1.5 + 6 && !out.some((o) => signature(o.plan) === signature(plan))) out.push({ plan, tag });
  };
  const calm = planRoute(fromId, toId, { transferPenalty: 15 });
  add(calm, calm && calm.legs.length < best.legs.length ? "Fewest changes" : "Alternative");
  add(planRoute(fromId, toId, { avoidTransfersAt: best.legs.slice(0, -1).map((l) => l.to) }), "Alternative");
  return out;
}

/** Minutes on foot for a straight-line distance: 4.8 km/h with a 1.3 detour factor (same as geo.walkMinutes). */
export const walkFor = (km: number) => Math.max(1, Math.round(((km * 1.3) / 4.8) * 60));

/** The last step of a trip to somewhere that is not a station (or, as `walkFrom`, the first step from one). */
export type WalkTo = { name: string; address: string; lat: number; lng: number; minutes: number; km: number };

/**
 * Best way to reach an arbitrary point by rapid transit: among the stations near it,
 * the one with the lowest total of train time from `fromId` plus the walk at the far end.
 * Returns null when no station is within a sensible walk.
 */
export function bestStationFor(fromId: string, point: LatLng, maxWalkKm = 2.5): { station: Station; plan: Plan | null; walkKm: number; walkMinutes: number; totalMinutes: number } | null {
  const near = STATIONS.map((station) => ({ station, km: distanceKm(point, station) }))
    .filter((c) => c.km <= maxWalkKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, 5);
  let best: ReturnType<typeof bestStationFor> = null;
  for (const c of near) {
    const plan = c.station.id === fromId ? null : planRoute(fromId, c.station.id);
    if (c.station.id !== fromId && !plan) continue;
    // Same walking estimate as geo.walkMinutes: 4.8 km/h with a 1.3 detour factor.
    const walk = Math.max(1, Math.round(((c.km * 1.3) / 4.8) * 60));
    const total = (plan?.minutes ?? 0) + walk;
    if (!best || total < best.totalMinutes) best = { station: c.station, plan, walkKm: c.km, walkMinutes: walk, totalMinutes: total };
  }
  return best;
}

/** One instruction in a trip. `leg` is the index of the train it belongs to. */
export type TripStep = { kind: "walk" | "board" | "ride" | "change"; title: string; detail: string; minutes: number | null; leg: number; color?: string };

/**
 * The whole trip as ordered instructions: walk in, then for each train board it, ride it
 * and (between trains) change, then walk out.
 */
export function tripSteps(plan: Plan, walkInMin: number | null, walkTo?: Pick<WalkTo, "name" | "minutes">, walkFrom?: string): TripStep[] {
  const steps: TripStep[] = [];
  const last = plan.legs.length - 1;
  if (walkInMin && (walkInMin > 1 || walkFrom)) steps.push({ kind: "walk", leg: 0, minutes: walkInMin, title: `Walk to ${STATION[plan.from].name}`, detail: walkFrom ? `From ${walkFrom}.` : "Go to the platform shown in the next step." });
  plan.legs.forEach((leg, i) => {
    const info = legInfo(leg);
    const color = LINES[leg.line].color;
    const n = leg.stops.length - 1;
    steps.push({ kind: "board", leg: i, minutes: null, color, title: `Board the ${info.label}`, detail: `${info.directionName} platform, toward ${info.toward}.` });
    steps.push({ kind: "ride", leg: i, minutes: leg.minutes, color, title: `Ride ${n} stop${n > 1 ? "s" : ""} to ${STATION[leg.to].name}`, detail: i === last ? "Get off here: this is your stop." : "Get off here to change trains." });
    if (i < last) {
      const next = legInfo(plan.legs[i + 1]);
      steps.push({ kind: "change", leg: i, minutes: TRANSFER_MIN, title: `Change at ${STATION[leg.to].name}`, detail: `Stay inside the station and follow signs for the ${next.label}, ${next.directionName.toLowerCase()} toward ${next.toward}.` });
    }
  });
  if (walkTo) steps.push({ kind: "walk", leg: last, minutes: walkTo.minutes, title: `Walk to ${walkTo.name}`, detail: `From ${STATION[plan.to].name} station.` });
  return steps;
}

/**
 * A Plan from a list of train rides given as stop positions (how Google describes a
 * transit route). Returns null unless every ride is between two stations on one of our
 * rapid-transit routes, so a bus or Commuter Rail route is never passed off as guidable.
 */
export function planFromStops(rides: { from: LatLng; to: LatLng; lineName?: string }[]): Plan | null {
  const legs: Leg[] = [];
  let km = 0;
  for (const ride of rides) {
    const [a, b] = [nearestStation(ride.from), nearestStation(ride.to)];
    if (a.km > 0.3 || b.km > 0.3 || a.station.id === b.station.id) return null;
    const [from, to] = [a.station.id, b.station.id];
    const routes = raw.routes.map((r) => r.id).filter((r) => patternsVia(r, from, to).length > 0);
    const route = routes.find((r) => ride.lineName?.includes(LINES[lineOf(r)].name)) ?? routes[0];
    if (!route) return null;
    const p = patternsVia(route, from, to)[0];
    const [i, j] = [p.stops.indexOf(from), p.stops.indexOf(to)];
    const stops = i < j ? p.stops.slice(i, j + 1) : p.stops.slice(j, i + 1).reverse();
    let minutes = 0;
    for (let n = 0; n < stops.length - 1; n++) {
      minutes += rideMinutes(route, stops[n], stops[n + 1]);
      km += distanceKm(STATION[stops[n]], STATION[stops[n + 1]]);
    }
    legs.push({ route, line: lineOf(route), from, to, stops, toward: legInfo({ route, from, to }).toward, minutes: Math.round(minutes) });
  }
  // The rides must connect inside a station for the journey screens to follow them.
  if (!legs.length || legs.some((l, n) => n > 0 && legs[n - 1].to !== l.from)) return null;
  return { from: legs[0].from, to: legs[legs.length - 1].to, legs, km, minutes: legs.reduce((m, l) => m + l.minutes, 0) + (legs.length - 1) * TRANSFER_MIN };
}
