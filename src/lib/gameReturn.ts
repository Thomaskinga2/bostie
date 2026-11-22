"use client";
// Where a game was opened from, so its Back button can go back there.
//
// The journey itself lives in the store (lib/store.ts) and is untouched by games. All
// this records is "this game screen was opened from the journey screen in this tab",
// which also tells us the browser's previous page is the journey.
import { useRouter } from "next/navigation";
import { useCallback, useSyncExternalStore } from "react";
import { useStore, type Journey } from "./store";

const KEY = "bostie-game-from";
const noop = () => () => {};

/** Call when a game is opened from the journey screen (or from anywhere else, to forget it). */
export function rememberGameOrigin(game: string | null) {
  try {
    if (game) sessionStorage.setItem(KEY, game);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode: Back simply goes to the games screen */
  }
}

export const activeJourney = (j: Journey | null) => (j && j.stage !== "complete" ? j : null);

/**
 * `fromJourney` is true on a game screen that was opened from an active journey.
 * `toJourney` returns there in one step without stacking up browser history.
 */
export function useGameReturn(path: string) {
  const router = useRouter();
  const journey = useStore((s) => activeJourney(s.journey));
  const origin = useSyncExternalStore(noop, () => {
    try {
      return sessionStorage.getItem(KEY);
    } catch {
      return null;
    }
  }, () => null);
  const direct = !!journey && origin === path;
  const toJourney = useCallback(() => {
    // Opened straight from the journey: the previous page IS the journey, so going back
    // leaves no extra history. Otherwise (opened from the games screen) move forward to it.
    if (direct && window.history.length > 1) router.back();
    else router.push("/journey");
  }, [direct, router]);
  return { journey, fromJourney: direct, toJourney };
}
