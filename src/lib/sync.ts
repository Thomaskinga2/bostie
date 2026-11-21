"use client";
// Optional cloud mirror. With no Supabase env vars this file does nothing and the
// app runs purely on localStorage. With them, a guest is signed in anonymously
// (no e-mail, no sign-up screen) and local progress is mirrored through the
// idempotent public.sync_progress() function (supabase/migrations/0001_init.sql).
//
// ponytail: one-directional (local → Supabase). There is no pull or merge, so
// progress does not follow a player to another device, and "Reset demo" leaves the
// cloud copy untouched (the ledger is append-only). Add a pull_progress rpc and a
// merge step when real accounts matter.
import { useEffect } from "react";
import { dayKey, derive, streakFor, type GameEvent, type Progress } from "./gamification";
import { useStore } from "./store";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const supabaseEnabled = !!url && !!anonKey;

type Mirrored = Progress & { name: string; saved: string[] };
const WATCHED = ["events", "xp", "achievements", "challenges", "saved", "name"] as const;

/** The jsonb argument of sync_progress. Timestamps stay unix ms; SQL converts them. */
export function buildPayload(s: Mirrored, now: number) {
  const d = derive(s.events);
  const streak = streakFor(s.events, now);
  const only = <T extends GameEvent["t"]>(t: T) => s.events.filter((e): e is Extract<GameEvent, { t: T }> => e.t === t);
  return {
    name: s.name,
    xp: s.xp,
    stamps: Object.entries(d.stamps).map(([id, at]) => {
      const ref = id.slice(id.indexOf(":") + 1);
      return { id, at, source: d.stations.get(ref)?.via ?? d.landmarks.get(ref)?.verification ?? "collection" };
    }),
    achievements: Object.entries(s.achievements).map(([id, at]) => ({ id, at })),
    challenges: Object.entries(s.challenges).map(([id, c]) => ({ id, startedAt: c.startedAt, completedAt: c.completedAt ?? null })),
    saved: s.saved,
    journeys: only("journey").map((j) => ({
      id: j.id, from: j.from, to: j.to, stops: j.stops, minutes: Math.round(j.minutes), km: j.km, lines: j.lines, demo: j.demo, at: j.at,
    })),
    rounds: only("round").map((r) => ({ id: r.id, place: r.place, mode: r.mode, correct: r.correct, score: Math.round(r.score), hints: r.hints, at: r.at })),
    streak: {
      current: streak.current,
      best: streak.best,
      lastDay: s.events.length ? dayKey(Math.max(...s.events.map((e) => e.at))) : null,
    },
  };
}

/** Mount once (e.g. in AppShell). Never throws, never blocks rendering. */
export function useSupabaseSync() {
  useEffect(() => {
    if (!supabaseEnabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe = () => {};

    (async () => {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(url!, anonKey!);
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
      }
      if (stopped) return;

      const push = async () => {
        const { error } = await supabase.rpc("sync_progress", { payload: buildPayload(useStore.getState(), Date.now()) });
        if (error) console.warn("[sync] Supabase mirror failed; progress is still saved on this device.", error.message);
      };
      const schedule = () => {
        clearTimeout(timer);
        timer = setTimeout(() => void push().catch((e) => console.warn("[sync]", e)), 1500);
      };
      unsubscribe = useStore.subscribe((state, prev) => {
        if (WATCHED.some((k) => state[k] !== prev[k])) schedule();
      });
      schedule(); // mirror whatever was earned before this session connected
    })().catch((e) => console.warn("[sync] Supabase is unavailable; running local-only.", e?.message ?? e));

    return () => {
      stopped = true;
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);
}
