"use client";
// Local-first guest state. Everything a judge does persists in localStorage with no
// sign-up; when Supabase is configured the same progress is mirrored there (lib/sync.ts).
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AiMeta } from "./contracts";
import {
  applyEvent, diffRewards, emptyProgress, settle, type GameEvent, type JourneyEvent, type Progress,
} from "./gamification";
import type { LatLng } from "./geo";
import { planRoute, STATION, type Plan } from "./network";

export type Stage =
  | "planning" | "walking" | "waiting" | "boarding" | "traveling" | "transferring" | "arriving" | "exploring" | "complete";

export type Journey = {
  id: string;
  plan: Plan;
  /** Demo journeys use simulated arrivals and a simulated position. Always labelled. */
  demo: boolean;
  stage: Stage;
  /** Index into plan.legs. */
  leg: number;
  /** While traveling: index (within the leg's stops) of the station the train is heading to. */
  stop: number;
  startedAt: number;
};

export type Celebration = { id: string; kind: "stamp" | "achievement" | "challenge" | "level"; ref: string };

export type AiEvent = {
  id: string;
  at: number;
  meta: AiMeta;
  /** The validated structured output, exactly as the app consumed it. */
  output: unknown;
  /** What deterministic code did with that output. */
  action: string;
};

export const DEMO_ROUTE = { from: "place-harsq", to: "place-pktrm" };

type State = Progress & {
  name: string;
  guestId: string;
  onboarded: boolean;
  demo: boolean;
  saved: string[];
  journey: Journey | null;
  geo: LatLng | null;
  geoStatus: "idle" | "asking" | "granted" | "denied" | "unavailable";
  celebrations: Celebration[];
  ai: AiEvent[];
  showcase: boolean;

  /** Records an event through the idempotent reward engine and queues reveals. */
  reward: (e: GameEvent) => void;
  startChallenge: (id: string) => void;
  toggleSaved: (id: string) => void;
  dismissCelebration: () => void;
  logAi: (meta: AiMeta | null | undefined, output: unknown, action: string) => void;
  setShowcase: (open: boolean) => void;
  setName: (name: string) => void;
  onboard: (demo: boolean) => void;
  setDemo: (demo: boolean) => void;
  resetAll: () => void;
  requestLocation: () => void;

  startJourney: (from: string, to: string) => boolean;
  advanceJourney: () => void;
  endJourney: () => void;
};

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const NEXT: Partial<Record<Stage, Stage>> = {
  planning: "walking", walking: "waiting", waiting: "boarding", boarding: "traveling", arriving: "exploring",
};

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...emptyProgress(),
      name: "Explorer",
      guestId: uid(),
      onboarded: false,
      demo: false,
      saved: [],
      journey: null,
      geo: null,
      geoStatus: "idle",
      celebrations: [],
      ai: [],
      showcase: false,

      reward: (e) => {
        const s = get();
        const before: Progress = { events: s.events, xp: s.xp, achievements: s.achievements, challenges: s.challenges };
        const after = applyEvent(before, e);
        if (after === before) return; // duplicate: nothing granted, nothing to celebrate
        const d = diffRewards(before, after);
        const celebrations: Celebration[] = [
          ...d.stamps.map((ref) => ({ id: uid(), kind: "stamp" as const, ref })),
          ...d.achievements.map((ref) => ({ id: uid(), kind: "achievement" as const, ref })),
          ...d.challenges.map((ref) => ({ id: uid(), kind: "challenge" as const, ref })),
          ...(d.levelUp ? [{ id: uid(), kind: "level" as const, ref: String(d.levelUp.level) }] : []),
        ];
        set({ ...after, celebrations: [...s.celebrations, ...celebrations] });
      },

      startChallenge: (id) => {
        const s = get();
        if (s.challenges[id]) return;
        const now = Date.now();
        set(settle({ events: s.events, xp: s.xp, achievements: s.achievements, challenges: { ...s.challenges, [id]: { startedAt: now } } }, now));
      },

      toggleSaved: (id) =>
        set((s) => ({ saved: s.saved.includes(id) ? s.saved.filter((x) => x !== id) : [...s.saved, id] })),
      dismissCelebration: () => set((s) => ({ celebrations: s.celebrations.slice(1) })),
      logAi: (meta, output, action) => {
        if (!meta) return; // only real model calls are ever shown
        set((s) => ({ ai: [{ id: uid(), at: Date.now(), meta, output, action }, ...s.ai].slice(0, 30) }));
      },
      setShowcase: (showcase) => set({ showcase }),
      setName: (name) => set({ name: name.trim().slice(0, 24) || "Explorer" }),
      onboard: (demo) => set({ onboarded: true, demo }),
      setDemo: (demo) => set({ demo }),
      resetAll: () =>
        set((s) => ({ ...emptyProgress(), saved: [], journey: null, celebrations: [], ai: [], onboarded: true, demo: s.demo })),

      requestLocation: () => {
        if (typeof navigator === "undefined" || !navigator.geolocation) return set({ geoStatus: "unavailable" });
        set({ geoStatus: "asking" });
        navigator.geolocation.getCurrentPosition(
          (pos) => set({ geo: { lat: pos.coords.latitude, lng: pos.coords.longitude }, geoStatus: "granted" }),
          (err) => set({ geoStatus: err.code === err.PERMISSION_DENIED ? "denied" : "unavailable" }),
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
        );
      },

      startJourney: (from, to) => {
        const plan = planRoute(from, to);
        if (!plan) return false;
        set({ journey: { id: uid(), plan, demo: get().demo, stage: "planning", leg: 0, stop: 1, startedAt: Date.now() } });
        return true;
      },

      advanceJourney: () => {
        const { journey: j, reward } = get();
        if (!j) return;
        const leg = j.plan.legs[j.leg];
        const via = j.demo ? "demo" : "ride";
        const now = Date.now();
        if (j.stage === "waiting") reward({ t: "station", id: leg.from, at: now, via });
        if (j.stage === "traveling") {
          reward({ t: "station", id: leg.stops[j.stop], at: now, via });
          const lastStop = j.stop === leg.stops.length - 1;
          const lastLeg = j.leg === j.plan.legs.length - 1;
          return set({
            journey: lastStop ? { ...j, stage: lastLeg ? "arriving" : "transferring" } : { ...j, stop: j.stop + 1 },
          });
        }
        if (j.stage === "transferring") return set({ journey: { ...j, stage: "waiting", leg: j.leg + 1, stop: 1 } });
        if (j.stage === "exploring") {
          const e: JourneyEvent = {
            t: "journey", id: j.id, from: j.plan.from, to: j.plan.to, at: now, demo: j.demo,
            stops: j.plan.legs.reduce((n, l) => n + l.stops.length - 1, 0),
            lines: [...new Set(j.plan.legs.map((l) => l.line))],
            minutes: j.plan.minutes, km: j.plan.km,
          };
          reward(e);
          return set({ journey: { ...j, stage: "complete" } });
        }
        const next = NEXT[j.stage];
        if (next) set({ journey: { ...j, stage: next } });
      },

      endJourney: () => set({ journey: null }),
    }),
    {
      name: "tquest-v1",
      // Reveal queue, GPS fix and panel state are per-session and never persisted.
      partialize: (s) => ({
        events: s.events, xp: s.xp, achievements: s.achievements, challenges: s.challenges, name: s.name,
        guestId: s.guestId, onboarded: s.onboarded, demo: s.demo, saved: s.saved, journey: s.journey, ai: s.ai,
      }),
    },
  ),
);

/** Where the player currently "is": real GPS, or the journey position in demo mode. */
export function useWhere(): { at: LatLng | null; source: "gps" | "simulated" | null } {
  const demo = useStore((s) => s.demo);
  const journey = useStore((s) => s.journey);
  const geo = useStore((s) => s.geo);
  if (demo) {
    const leg = journey?.plan.legs[journey.leg];
    const id = !journey || !leg
      ? DEMO_ROUTE.from
      : ["arriving", "exploring", "complete", "transferring"].includes(journey.stage)
        ? leg.to
        : journey.stage === "traveling"
          ? leg.stops[journey.stop - 1]
          : leg.from;
    return { at: STATION[id], source: "simulated" };
  }
  return geo ? { at: geo, source: "gps" } : { at: null, source: null };
}
