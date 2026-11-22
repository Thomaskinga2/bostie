// Bostie's Favourite: the rules of the three games. Everything here is decided by code:
// which answer is right, the score, and whether a play still earns XP today. Gemini only
// writes hint wording (Guessing) and gives an opinion on a drawing (Drawing).
import { FIGURES, SYMBOLS } from "@/data/trivia";
import { dayKey, type GameEvent, type GameId, type PlayEvent } from "./gamification";
import { photoOf, PLACE, PLACES, type Place } from "./places";

export type { GameId };

/** `photo` is a catalogue place that pictures the game; `about` says how it is played. */
export const GAMES: { id: GameId; name: string; about: string; photo: string; href: string }[] = [
  { id: "guess", name: "Bostie Guessing", about: "See a photo of Boston and pick what it is from four answers.", photo: "state-house", href: "/play/guess" },
  { id: "draw", name: "Bostie Drawing", about: "Draw a Boston landmark or symbol. Gemini says how close you got.", photo: "nbh-north-end", href: "/play/draw" },
  { id: "parkour", name: "Bostie Parkour", about: "Bostie runs through Boston. Answer in 6 seconds so he clears each obstacle.", photo: "custom-house", href: "/play/parkour" },
];

/** A pin within this distance counts as a correct answer. */
export const PIN_CORRECT_KM = 0.35;
export const ROUND_LENGTH = 5;
export const POINTS = { correct: 100, withHint: 50 };

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

/** Points for a pin on the map: full marks on the spot, fading with distance. */
export function scoreMap(km: number): { points: number; correct: boolean } {
  return { points: Math.round(POINTS.correct * Math.exp(-km / 0.8)), correct: km <= PIN_CORRECT_KM };
}

export type Rng = () => number;
export const pickRandom = <T,>(items: T[], rng: Rng = Math.random): T => items[Math.floor(rng() * items.length)];
export function shuffle<T>(items: T[], rng: Rng = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** One multiple-choice question. `photo` is a catalogue place id when the question shows a picture. */
export type Question = { id: string; prompt: string; photo?: string; options: string[]; answer: string; note?: string; source?: string };

const PLAYABLE = PLACES.filter((p) => photoOf(p.id));
const PROMPT: Record<Place["kind"], string> = { landmark: "What is this?", station: "Which T station is this?", neighborhood: "Which neighborhood is this?" };

/** A photo question: the place, plus three wrong names of the same kind where there are enough. */
export function placeQuestion(place: Place, rng: Rng = Math.random): Question {
  const same = shuffle(PLAYABLE.filter((p) => p.kind === place.kind && p.id !== place.id), rng);
  const others = shuffle(PLAYABLE.filter((p) => p.kind !== place.kind), rng);
  const wrong = [...same, ...others].slice(0, 3).map((p) => p.name);
  return { id: place.id, prompt: PROMPT[place.kind], photo: place.id, options: shuffle([place.name, ...wrong], rng), answer: place.name, note: place.summary };
}

/** A round of Bostie Guessing: distinct places from every category, avoiding the ones just played. */
export function guessRound(avoid: string[] = [], rng: Rng = Math.random, n = ROUND_LENGTH): Question[] {
  const fresh = PLAYABLE.filter((p) => !avoid.includes(p.id));
  const pool = fresh.length >= n ? fresh : PLAYABLE;
  return shuffle(pool, rng).slice(0, n).map((p) => placeQuestion(p, rng));
}

export const PARKOUR_LEVELS = [
  { name: "Easy", obstacles: 3 },
  { name: "Medium", obstacles: 5 },
  { name: "Hard", obstacles: 7 },
  { name: "Impossible", obstacles: 10 },
] as const;
export const PARKOUR_SECONDS = 6;

/** Questions for a Parkour run: Boston people and Guessing photos, mixed, none repeated. */
export function parkourQuestions(n: number, rng: Rng = Math.random): Question[] {
  const people = shuffle(FIGURES, rng).map((f): Question => ({ id: `fig-${f.id}`, prompt: f.q, options: shuffle([f.answer, ...f.wrong], rng), answer: f.answer, source: f.source }));
  const photos = shuffle(PLAYABLE, rng).map((p) => placeQuestion(p, rng));
  // Two people for every photo, so a run reads quickly at running speed.
  const out: Question[] = [];
  for (let i = 0; out.length < n; i++) out.push((i % 3 === 2 ? photos : people).shift() ?? people.shift() ?? photos.shift()!);
  return out;
}

/** What Bostie Drawing can ask for: catalogue landmarks (with a reference photo) and generic symbols (without). */
export type Subject = { id: string; name: string; cues: string[]; photo?: string };
export const SUBJECTS: Subject[] = [
  ...PLAYABLE.filter((p) => p.kind === "landmark").map((p) => ({ id: p.id, name: p.name, cues: p.cues, photo: p.id })),
  ...SYMBOLS,
];
export const SUBJECT: Record<string, Subject> = Object.fromEntries(SUBJECTS.map((s) => [s.id, s]));
export const nextSubject = (avoid: string[] = [], rng: Rng = Math.random) => pickRandom(SUBJECTS.filter((s) => !avoid.includes(s.id)).length ? SUBJECTS.filter((s) => !avoid.includes(s.id)) : SUBJECTS, rng);

/** Plays of one game that earn XP each local day. Later plays still work, for fun. */
export const DAILY_PAID_PLAYS = 5;
export const paidPlaysLeft = (events: GameEvent[], game: GameId, now: number) =>
  Math.max(0, DAILY_PAID_PLAYS - events.filter((e) => e.t === "play" && e.game === game && e.paid && dayKey(e.at) === dayKey(now)).length);

/** The event for a finished play, marked as paid or not from today's history. */
export function playEvent(events: GameEvent[], play: Omit<PlayEvent, "t" | "id" | "paid" | "at">, now: number): PlayEvent {
  return { t: "play", id: `${play.game}-${now.toString(36)}`, ...play, paid: paidPlaysLeft(events, play.game, now) > 0, at: now };
}

export const placeOf = (q: Question) => (q.photo ? PLACE[q.photo] : undefined);
