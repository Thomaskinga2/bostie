// Guess Boston — deterministic rules. Gemini understands language and writes hints;
// answers, scoring, difficulty tiers and XP are all decided here, by code.
import type { RoundEvent } from "./gamification";
import { photoOf, PLACES, type Place } from "./places";

export type GameMode = "mix" | "landmark" | "station" | "neighborhood" | "map";

export const MODES: { id: GameMode; name: string; blurb: string }[] = [
  { id: "mix", name: "Classic", blurb: "Anything in the city. Name what you see." },
  { id: "landmark", name: "Landmarks", blurb: "Historic sites and icons." },
  { id: "station", name: "Stations", blurb: "Which MBTA stop is this?" },
  { id: "neighborhood", name: "Neighborhoods", blurb: "Read the streets." },
  { id: "map", name: "Pin Drop", blurb: "Skip the name. Drop a pin on the map." },
];

export const MAX_ATTEMPTS = 3;
export const MAX_HINTS = 3;
export const HINT_PENALTY = 150;
export const WRONG_PENALTY = 200;
/** A pin within this distance counts as a correct answer. */
export const PIN_CORRECT_KM = 0.35;

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(the|a|an) /, "")
    .replace(/ (in |of )?(boston|cambridge|ma|massachusetts)$/, "")
    .replace(/ (t )?(station|stop)$/, "")
    .trim();

export function aliasMatch(place: Place, guess: string): boolean {
  const g = normalize(guess);
  return g.length > 0 && [place.name, ...place.aliases].some((a) => normalize(a) === g);
}

/** Exact-alias entity resolution over the catalogue. Gemini handles everything fuzzier. */
export const findByAlias = (guess: string, pool: Place[] = PLACES) => pool.find((p) => aliasMatch(p, guess));

const timeBonus = (seconds: number) => Math.round(200 * Math.max(0, 1 - seconds / 60));

export function scoreText(r: { correct: boolean; wrong: number; hints: number; seconds: number }): number {
  if (!r.correct) return 0;
  return Math.max(100, 1000 - WRONG_PENALTY * r.wrong - HINT_PENALTY * r.hints + timeBonus(r.seconds));
}

export function scoreMap(r: { km: number; hints: number; seconds: number }): { score: number; correct: boolean } {
  const correct = r.km <= PIN_CORRECT_KM;
  const base = Math.round(1000 * Math.exp(-r.km / 0.8));
  const score = Math.max(0, base - HINT_PENALTY * r.hints + (correct ? timeBonus(r.seconds) : 0));
  return { score, correct };
}

/** Difficulty tier from the last four rounds: play well and the rounds get harder. */
export function skillTier(rounds: RoundEvent[]): 1 | 2 | 3 {
  const recent = rounds.slice(-4);
  if (recent.length < 2) return 1;
  const avg = recent.reduce((s, r) => s + r.score, 0) / recent.length;
  return avg >= 750 ? 3 : avg >= 400 ? 2 : 1;
}

/** Eligible next locations: right kind, has a licensed photo, not played recently, tier-appropriate. */
export function candidatePool(mode: GameMode, tier: 1 | 2 | 3, recent: string[]): Place[] {
  const kindOk = (p: Place) => mode === "mix" || mode === "map" || p.kind === mode;
  const all = PLACES.filter((p) => kindOk(p) && photoOf(p.id));
  const fresh = all.filter((p) => !recent.slice(-6).includes(p.id));
  const base = fresh.length ? fresh : all;
  const exact = base.filter((p) => p.difficulty === tier);
  if (exact.length >= 2) return exact;
  const upTo = base.filter((p) => p.difficulty <= tier);
  return upTo.length ? upTo : base;
}

export const pickRandom = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];
