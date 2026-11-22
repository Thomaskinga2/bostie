// Trips: saved itineraries and the arithmetic behind them. A self-contained module: its
// own store and storage key, no XP, no Passport. Routing reuses Bostie's MBTA planner;
// fares come from data/fares.ts through lib/fares.ts, never from a model.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { PASSES } from "@/data/fares";
import type { TripStop } from "./contracts";
import { journeyFare } from "./fares";
import { distanceKm, type LatLng } from "./geo";
import { bestStationFor, legInfo, nearestStation, STATION, walkFor, type Plan, type Station } from "./network";
import { PLACES } from "./places";

export type { TripStop };
/**
 * `key` identifies a stop inside its trip, so the same place can be visited twice.
 * `skipped` keeps a stop in the list but leaves it out of the day: no visit, no travel to it.
 */
export type Stop = TripStop & { key: string; skipped?: boolean };
export type Trip = {
  id: string;
  name: string;
  origin: "ai" | "import" | "manual";
  /** The station each day starts from. */
  startStationId: string;
  days: Stop[][];
  createdAt: number;
  updatedAt: number;
};

const uid = () => Math.random().toString(36).slice(2, 10);
export const asStop = (s: TripStop): Stop => ({ ...s, key: uid() });

// --- getting from one stop to the next ---------------------------------------

export type Leg =
  | { mode: "walk"; minutes: number; km: number }
  | { mode: "transit"; minutes: number; km: number; plan: Plan; from: Station; to: Station; walkIn: number; walkOut: number; fareCents: number | null; summary: string };

/** Further than this on foot and the subway is worth checking. */
const WALK_KM = 0.9;

/** The quicker of walking and the subway between two points, from Bostie's own network data. */
export function legBetween(a: LatLng, b: LatLng): Leg {
  const km = distanceKm(a, b);
  const walk: Leg = { mode: "walk", minutes: walkFor(km), km };
  if (km <= WALK_KM) return walk;
  const near = nearestStation(a);
  if (near.km > 1.5) return walk;
  const best = bestStationFor(near.station.id, b, 1.5);
  if (!best?.plan) return walk;
  const walkIn = walkFor(near.km);
  const minutes = walkIn + best.plan.minutes + best.walkMinutes;
  if (minutes >= walk.minutes) return walk;
  const lines = best.plan.legs.map((l) => legInfo(l).label).join(", then ");
  return {
    mode: "transit", minutes, km, plan: best.plan, from: near.station, to: best.station, walkIn, walkOut: best.walkMinutes,
    fareCents: journeyFare(best.plan).totalCents, summary: `${lines}: ${near.station.name} to ${best.station.name}`,
  };
}

/** A visiting order that keeps the day's travel short: nearest next, then untangled (2-opt). */
export function orderStops<T extends LatLng>(start: LatLng, stops: T[]): T[] {
  const left = [...stops];
  const out: T[] = [];
  let at: LatLng = start;
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i++) if (distanceKm(at, left[i]) < distanceKm(at, left[best])) best = i;
    at = left[best];
    out.push(...left.splice(best, 1));
  }
  const length = (r: T[]) => r.reduce((n, p, i) => n + distanceKm(i ? r[i - 1] : start, p), 0);
  // ponytail: 2-opt over straight-line distance; fine for a day of up to a dozen stops.
  for (let improved = true; improved; ) {
    improved = false;
    for (let i = 0; i < out.length - 1; i++)
      for (let j = i + 1; j < out.length; j++) {
        const swapped = [...out.slice(0, i), ...out.slice(i, j + 1).reverse(), ...out.slice(j + 1)];
        if (length(swapped) + 1e-9 < length(out)) {
          out.splice(0, out.length, ...swapped);
          improved = true;
        }
      }
  }
  return out;
}

/** Whether a place is open at a time: true, false, or null when Google has no hours for it. */
export function isOpenAt(hours: TripStop["hours"], day: number, minute: number): boolean | null {
  if (!hours?.periods.length) return null;
  return hours.periods.some((p) => {
    const start = p.day * 1440 + p.open;
    const at = day * 1440 + minute;
    // Compare within a wrapping week, so a Saturday-night closing time covers early Sunday.
    return [at, at + 7 * 1440].some((t) => t >= start && t < p.day * 1440 + p.close);
  });
}

export const DAY_START = 10 * 60; // itineraries are timed from 10:00
export type Timed = { stop: Stop; leg: Leg; arrive: number; leave: number; open: boolean | null };

/** A day laid out on the clock: how to reach each stop, when you get there, and whether it is open then. */
export function schedule(day: Stop[], startStationId: string, weekday: number, startAt = DAY_START): Timed[] {
  let at: LatLng = STATION[startStationId] ?? STATION["place-pktrm"];
  let clock = startAt;
  // Skipped stops are not visited, so the leg runs from the stop before to the stop after.
  return day.filter((s) => !s.skipped).map((stop) => {
    const leg = legBetween(at, stop);
    const arrive = clock + leg.minutes;
    clock = arrive + stop.minutes;
    at = stop;
    return { stop, leg, arrive, leave: clock, open: isOpenAt(stop.hours, weekday, arrive % 1440) };
  });
}

export const clock = (minute: number) => {
  const h = Math.floor(minute / 60) % 24;
  return `${h % 12 || 12}:${String(minute % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

/** What a day adds up to. Transit cost is exact (published fares); place costs only where Google lists a range. */
export function dayTotals(timed: Timed[]) {
  const rides = timed.filter((t) => t.leg.mode === "transit");
  const singles = rides.reduce((n, t) => n + ((t.leg.mode === "transit" && t.leg.fareCents) || 0), 0);
  const dayPass = PASSES[0].cents;
  const priced = timed.filter((t) => t.stop.priceRange);
  return {
    stops: timed.length,
    minutes: timed.length ? timed[timed.length - 1].leave - DAY_START : 0,
    walkKm: timed.reduce((n, t) => n + (t.leg.mode === "walk" ? t.leg.km : 0), 0),
    rides: rides.length,
    /** The cheaper of paying each ride and a 1-Day Pass. */
    transitCents: Math.min(singles, dayPass),
    passIsCheaper: singles > dayPass,
    placesLow: priced.reduce((n, t) => n + t.stop.priceRange!.low, 0),
    placesHigh: priced.reduce((n, t) => n + t.stop.priceRange!.high, 0),
    priced: priced.length,
    closed: timed.filter((t) => t.open === false).length,
  };
}

/** A Bostie catalogue photo for a place, when the place is one Bostie already knows. */
export function cataloguePhoto(p: { name: string; lat: number; lng: number }): string | null {
  const name = p.name.toLowerCase();
  const hit = PLACES.find((c) => distanceKm(c, p) < 0.12 && (c.name.toLowerCase() === name || name.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(name)));
  return hit?.id ?? null;
}

// --- for later: XP, achievements, Passport ---------------------------------------
// Trips reports what happens through this one hook and does nothing with it itself.
// A future integration assigns `tripHooks.onEvent`; nothing in Trips needs to change.
export type TripEvent =
  | { t: "trip-created"; tripId: string; origin: Trip["origin"]; stops: number }
  | { t: "stop-added"; tripId: string; placeId: string }
  | { t: "trip-optimized"; tripId: string; day: number }
  | { t: "leg-started"; tripId: string; placeId: string };
export const tripHooks: { onEvent?: (e: TripEvent) => void } = {};
export const emitTrip = (e: TripEvent) => tripHooks.onEvent?.(e);

// --- saved trips -----------------------------------------------------------------

type TripsState = {
  trips: Trip[];
  /** The trip open on the plan screen. */
  currentId: string | null;
  create: (t: { name: string; origin: Trip["origin"]; startStationId: string; days: TripStop[][] }) => string;
  open: (id: string | null) => void;
  update: (id: string, change: (t: Trip) => Trip) => void;
  remove: (id: string) => void;
};

export const useTrips = create<TripsState>()(
  persist(
    (set) => ({
      trips: [],
      currentId: null,
      create: (t) => {
        const now = Date.now();
        const trip: Trip = { id: uid(), name: t.name, origin: t.origin, startStationId: t.startStationId, days: t.days.length ? t.days.map((d) => d.map(asStop)) : [[]], createdAt: now, updatedAt: now };
        set((s) => ({ trips: [trip, ...s.trips].slice(0, 30), currentId: trip.id }));
        emitTrip({ t: "trip-created", tripId: trip.id, origin: trip.origin, stops: trip.days.flat().length });
        return trip.id;
      },
      open: (currentId) => set({ currentId }),
      update: (id, change) => set((s) => ({ trips: s.trips.map((t) => (t.id === id ? { ...change(t), updatedAt: Date.now() } : t)) })),
      remove: (id) => set((s) => ({ trips: s.trips.filter((t) => t.id !== id), currentId: s.currentId === id ? null : s.currentId })),
    }),
    { name: "bostie-trips-v1" },
  ),
);
