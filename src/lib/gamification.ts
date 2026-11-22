// Central gamification engine. Pure functions only: no React, no storage, no clock
// reads except the `now` you pass in. Everything a player owns (stamps, level,
// streak, line progress, stats) is DERIVED from two append-only logs:
//   events — what happened      xp — an idempotent ledger keyed by transaction id
// so a reward can never be granted twice and the passport can never disagree with history.
import { LANDMARKS } from "@/data/places";
import { distanceKm } from "./geo";
import { MAIN_LINES, STATION, STATIONS, stationsOnLine, type LineId } from "./network";

// --- events & ledger -------------------------------------------------------

export type StationEvent = { t: "station"; id: string; at: number; via: "ride" | "manual" | "demo" };
export type LandmarkEvent = { t: "landmark"; id: string; at: number; verification: "nearby" | "simulated" | "photo-only" };
export type RoundEvent = {
  t: "round"; id: string; place: string; mode: string; correct: boolean; score: number; hints: number; at: number;
};
export type JourneyEvent = {
  t: "journey"; id: string; from: string; to: string; stops: number; lines: LineId[]; minutes: number; km: number; demo: boolean; at: number;
};
export type GameId = "guess" | "draw" | "parkour";
/**
 * One finished play of a Bostie's Favourite game. `score` is correct answers (guess),
 * the drawing score 0 to 100 (draw) or obstacles cleared (parkour). `paid` is false once
 * the day's XP limit for that game is used up.
 */
export type PlayEvent = { t: "play"; id: string; game: GameId; score: number; won: boolean; hints: number; level?: number; paid: boolean; at: number };
export type GameEvent = StationEvent | LandmarkEvent | RoundEvent | JourneyEvent | PlayEvent;

export type XpTx = { key: string; amount: number; label: string; at: number };
export type ChallengeState = { startedAt: number; completedAt?: number };
export type Progress = {
  events: GameEvent[];
  xp: XpTx[];
  achievements: Record<string, number>;
  challenges: Record<string, ChallengeState>;
};
export const emptyProgress = (): Progress => ({ events: [], xp: [], achievements: {}, challenges: {} });

export const eventKey = (e: GameEvent) => `${e.t}:${e.id}`;

export const XP = {
  station: 40,
  landmarkVerified: 150,
  landmarkPhotoOnly: 75,
  journeyBase: 60,
  journeyPerStop: 10,
  roundMin: 5,
  guessPerCorrect: 5,
  /** Drawing score bands: 1+, 25+, 50+, 75+. */
  draw: [10, 20, 30, 40],
  /** A cleared Parkour run by difficulty; a failed run earns `parkourTry`. */
  parkourWin: [15, 30, 50, 80],
  parkourTry: 5,
} as const;

const GAME_NAME: Record<GameId, string> = { guess: "Bostie Guessing", draw: "Bostie Drawing", parkour: "Bostie Parkour" };
/** XP for a finished play. Zero once the day's limit for that game is reached. */
export function playXp(e: PlayEvent): number {
  if (!e.paid) return 0;
  if (e.game === "guess") return XP.guessPerCorrect * e.score;
  if (e.game === "draw") return e.score < 1 ? 0 : XP.draw[Math.min(3, Math.floor(e.score / 25))];
  return e.won ? XP.parkourWin[e.level ?? 0] : XP.parkourTry;
}

function xpForEvent(e: GameEvent): { amount: number; label: string } {
  switch (e.t) {
    case "station":
      return { amount: XP.station, label: `Station stamp · ${STATION[e.id]?.name ?? e.id}` };
    case "landmark": {
      const name = LANDMARKS.find((l) => l.id === e.id)?.name ?? e.id;
      return e.verification === "photo-only"
        ? { amount: XP.landmarkPhotoOnly, label: `Landmark (photo only) · ${name}` }
        : { amount: XP.landmarkVerified, label: `Landmark verified · ${name}` };
    }
    case "round":
      return { amount: Math.max(XP.roundMin, Math.round(e.score / 20)), label: "Guessing round" };
    case "play":
      return { amount: playXp(e), label: e.paid ? GAME_NAME[e.game] : `${GAME_NAME[e.game]} (daily XP limit reached)` };
    case "journey":
      return { amount: XP.journeyBase + XP.journeyPerStop * e.stops, label: "Journey completed" };
  }
}

export const totalXp = (xp: XpTx[]) => xp.reduce((sum, t) => sum + t.amount, 0);

// --- levels ----------------------------------------------------------------

export const LEVELS = [
  { xp: 0, title: "Newcomer" },
  { xp: 100, title: "Rider" },
  { xp: 250, title: "Commuter" },
  { xp: 450, title: "Explorer" },
  { xp: 700, title: "Wayfinder" },
  { xp: 1000, title: "Navigator" },
  { xp: 1400, title: "Local" },
  { xp: 1900, title: "Historian" },
  { xp: 2500, title: "Conductor" },
  { xp: 3200, title: "Trailblazer" },
  { xp: 4000, title: "Bostonian" },
  { xp: 5000, title: "Legend of the T" },
];

export function levelFor(xp: number) {
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].xp) i++;
  const floor = LEVELS[i].xp;
  const next = LEVELS[i + 1]?.xp ?? null;
  return {
    level: i + 1,
    title: LEVELS[i].title,
    floor,
    next,
    toNext: next === null ? 0 : next - xp,
    progress: next === null ? 1 : (xp - floor) / (next - floor),
  };
}

// --- stamps & rarity -------------------------------------------------------

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export const RARITIES: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"];

export type Stamp = {
  id: string;
  kind: "station" | "landmark" | "set";
  refId: string;
  name: string;
  subtitle: string;
  rarity: Rarity;
  /** The published requirement that earns this rarity. Never assigned by AI. */
  rule: string;
  line?: LineId;
};

const PARK_STREET = STATION["place-pktrm"];
const FREEDOM_TRAIL = LANDMARKS.filter((l) => l.freedomTrail);

const stationStamp = (id: string): Stamp => {
  const s = STATION[id];
  const [rarity, rule]: [Rarity, string] = s.terminal
    ? ["rare", "End-of-line terminal: ride a line all the way out."]
    : s.lines.length > 1
      ? ["uncommon", "Transfer hub serving two or more lines."]
      : ["common", "Station on a single line."];
  return { id: `station:${id}`, kind: "station", refId: id, name: s.name, subtitle: s.municipality, rarity, rule, line: s.lines[0] };
};

export const STAMPS: Stamp[] = [
  ...STATIONS.map((s) => stationStamp(s.id)),
  ...LANDMARKS.map((l): Stamp => {
    const outer = distanceKm(l, PARK_STREET) > 1.5;
    return {
      id: `landmark:${l.id}`,
      kind: "landmark",
      refId: l.id,
      name: l.name,
      subtitle: l.neighborhood,
      rarity: outer ? "epic" : "rare",
      rule: outer
        ? "Photo-verified landmark more than 1.5 km from Park Street."
        : "Photo-verified landmark in the downtown core.",
    };
  }),
  {
    id: "set:four-lines", kind: "set", refId: "four-lines", name: "Four Colours", subtitle: "Collection",
    rarity: "epic", rule: "Collect a station on each of the Red, Orange, Blue and Green lines.",
  },
  {
    id: "set:freedom-trail", kind: "set", refId: "freedom-trail", name: "Freedom Trail", subtitle: "Collection",
    rarity: "legendary", rule: `Verify all ${FREEDOM_TRAIL.length} Freedom Trail landmarks.`,
  },
  {
    id: "set:red-line", kind: "set", refId: "red-line", name: "Crimson Completionist", subtitle: "Collection",
    rarity: "legendary", rule: `Collect all ${stationsOnLine("Red").length} Red Line stations.`, line: "Red",
  },
];
export const STAMP: Record<string, Stamp> = Object.fromEntries(STAMPS.map((s) => [s.id, s]));

// --- derived state ---------------------------------------------------------

export function derive(events: GameEvent[]) {
  const stations = new Map<string, StationEvent>();
  const landmarks = new Map<string, LandmarkEvent>();
  const rounds: RoundEvent[] = [];
  const journeys: JourneyEvent[] = [];
  const plays: PlayEvent[] = [];
  for (const e of events) {
    if (e.t === "station") stations.set(e.id, e);
    else if (e.t === "landmark") landmarks.set(e.id, e);
    else if (e.t === "round") rounds.push(e);
    else if (e.t === "play") plays.push(e);
    else journeys.push(e);
  }

  const lines = Object.fromEntries(
    MAIN_LINES.map((line) => {
      const all = stationsOnLine(line);
      return [line, { have: all.filter((s) => stations.has(s.id)).length, total: all.length }];
    }),
  ) as Record<LineId, { have: number; total: number }>;

  /** stamp id -> unix ms it was earned */
  const stamps: Record<string, number> = {};
  for (const e of stations.values()) stamps[`station:${e.id}`] = e.at;
  for (const e of landmarks.values()) stamps[`landmark:${e.id}`] = e.at;
  const last = events.length ? events[events.length - 1].at : 0;
  if (MAIN_LINES.every((l) => lines[l].have > 0)) stamps["set:four-lines"] = last;
  if (FREEDOM_TRAIL.every((l) => landmarks.has(l.id))) stamps["set:freedom-trail"] = last;
  if (lines.Red.have === lines.Red.total) stamps["set:red-line"] = last;

  // Games played and won: the older one-photo rounds count alongside the three games.
  const games = rounds.length + plays.length;
  const correct = rounds.filter((r) => r.correct).length + plays.filter((p) => p.won).length;
  return {
    plays,
    stations,
    landmarks,
    rounds,
    journeys,
    lines,
    stamps,
    stats: {
      stations: stations.size,
      landmarks: landmarks.size,
      journeys: journeys.length,
      km: journeys.reduce((s, j) => s + j.km, 0),
      rounds: games,
      correct,
      accuracy: games ? correct / games : 0,
      bestScore: rounds.reduce((m, r) => Math.max(m, r.score), 0),
    },
  };
}
export type Derived = ReturnType<typeof derive>;

// --- streak ----------------------------------------------------------------

/** One policy everywhere: a "day" is the player's local calendar date. */
export const dayKey = (at: number) => {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dayNumber = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};

/**
 * Consecutive days with any meaningful activity (a ride, a scan OR a game round, so
 * nobody has to travel to keep a streak). One rest day between active days is
 * forgiven, so a service disruption or a day off never breaks a streak.
 */
export function streakFor(events: GameEvent[], now: number) {
  const days = [...new Set(events.map((e) => dayNumber(dayKey(e.at))))].sort((a, b) => a - b);
  const today = dayNumber(dayKey(now));
  let best = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && days[i] - days[i - 1] <= 2 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  const alive = days.length > 0 && today - days[days.length - 1] <= 2;
  return { current: alive ? run : 0, best, activeToday: days[days.length - 1] === today, activeDays: new Set(days), today };
}

// --- achievements ----------------------------------------------------------

export type Achievement = {
  id: string;
  name: string;
  description: string;
  xp: number;
  icon: string;
  /** [progress, goal] */
  check: (d: Derived, streak: number) => [number, number];
};

const isWeekend = (at: number) => [0, 6].includes(new Date(at).getDay());

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first-ride", name: "First Ride", description: "Complete your first guided journey.", xp: 50, icon: "train",
    check: (d) => [d.stats.journeys, 1] },
  { id: "first-discovery", name: "First Discovery", description: "Verify your first historical landmark.", xp: 50, icon: "camera",
    check: (d) => [d.stats.landmarks, 1] },
  { id: "red-line-explorer", name: "Red Line Explorer", description: "Collect 5 Red Line stations.", xp: 100, icon: "route",
    check: (d) => [d.lines.Red.have, 5] },
  { id: "boston-historian", name: "Boston Historian", description: "Verify 5 historical landmarks.", xp: 150, icon: "landmark",
    check: (d) => [d.stats.landmarks, 5] },
  { id: "guess-champion", name: "Bostie's Champion", description: "Win 5 games in Bostie's Favourite.", xp: 120, icon: "trophy",
    check: (d) => [d.stats.correct, 5] },
  { id: "sharp-eye", name: "Sharp Eye", description: "Win a Bostie Guessing round without using a hint.", xp: 40, icon: "eye",
    check: (d) => [d.rounds.some((r) => r.correct && r.hints === 0) || d.plays.some((p) => p.game === "guess" && p.won && p.hints === 0) ? 1 : 0, 1] },
  { id: "weekend-explorer", name: "Weekend Explorer", description: "Collect a station or landmark on a weekend.", xp: 60, icon: "sun",
    check: (d) => [[...d.stations.values(), ...d.landmarks.values()].some((e) => isWeekend(e.at)) ? 1 : 0, 1] },
  { id: "transfer-pro", name: "Transfer Pro", description: "Collect 3 transfer hubs.", xp: 80, icon: "shuffle",
    check: (d) => [[...d.stations.keys()].filter((id) => STATION[id]?.lines.length > 1).length, 3] },
  { id: "master-commuter", name: "Master Commuter", description: "Complete 5 guided journeys.", xp: 200, icon: "medal",
    check: (d) => [d.stats.journeys, 5] },
  { id: "on-a-roll", name: "On a Roll", description: "Reach a 3-day streak.", xp: 60, icon: "flame",
    check: (_d, streak) => [streak, 3] },
];

// --- challenges ------------------------------------------------------------

export type Challenge = {
  id: string;
  title: string;
  description: string;
  xp: number;
  goal: number;
  icon: string;
  /** "template" today; "ai" is reserved for Gemini-generated contextual challenges. */
  source: "template" | "ai";
  /** Progress counts only events after the player accepted the challenge. */
  measure: (since: GameEvent[]) => number;
};

export const CHALLENGES: Challenge[] = [
  { id: "new-station", title: "New Stop", description: "Collect a station you have never visited.", xp: 30, goal: 1, icon: "map-pin", source: "template",
    measure: (ev) => ev.filter((e) => e.t === "station").length },
  { id: "landmark-hunter", title: "Landmark Hunter", description: "Verify a historical landmark with the scanner.", xp: 60, goal: 1, icon: "camera", source: "template",
    measure: (ev) => ev.filter((e) => e.t === "landmark").length },
  { id: "three-rounds", title: "Know Your City", description: "Finish 3 games.", xp: 50, goal: 3, icon: "gamepad", source: "template",
    measure: (ev) => ev.filter((e) => e.t === "round").length },
  { id: "red-three", title: "Seeing Red", description: "Collect 3 Red Line stations.", xp: 70, goal: 3, icon: "route", source: "template",
    measure: (ev) => ev.filter((e) => e.t === "station" && STATION[e.id]?.lines.includes("Red")).length },
  { id: "guided-journey", title: "Door to Door", description: "Complete a guided journey from start to finish.", xp: 50, goal: 1, icon: "train", source: "template",
    measure: (ev) => ev.filter((e) => e.t === "journey").length },
  { id: "no-hints", title: "No Peeking", description: "Win a round without hints.", xp: 40, goal: 1, icon: "eye", source: "template",
    measure: (ev) => ev.filter((e) => e.t === "round" && e.correct && e.hints === 0).length },
];
export const CHALLENGE: Record<string, Challenge> = Object.fromEntries(CHALLENGES.map((c) => [c.id, c]));

export function challengeProgress(c: Challenge, state: ChallengeState | undefined, events: GameEvent[]) {
  if (!state) return 0;
  if (state.completedAt) return c.goal;
  return Math.min(c.goal, c.measure(events.filter((e) => e.at >= state.startedAt)));
}

// --- transactions ----------------------------------------------------------

const credit = (xp: XpTx[], key: string, amount: number, label: string, at: number) =>
  xp.some((t) => t.key === key) ? xp : [...xp, { key, amount, label, at }];

/** Grants any achievements / challenge rewards the current history has earned. Idempotent. */
export function settle(p: Progress, now: number): Progress {
  const d = derive(p.events);
  const streak = streakFor(p.events, now).current;
  let { xp } = p;
  const achievements = { ...p.achievements };
  const challenges = { ...p.challenges };
  for (const a of ACHIEVEMENTS) {
    const [have, goal] = a.check(d, streak);
    if (have >= goal && !achievements[a.id]) {
      achievements[a.id] = now;
      xp = credit(xp, `achievement:${a.id}`, a.xp, `Achievement · ${a.name}`, now);
    }
  }
  for (const c of CHALLENGES) {
    const state = challenges[c.id];
    if (state && !state.completedAt && challengeProgress(c, state, p.events) >= c.goal) {
      challenges[c.id] = { ...state, completedAt: now };
      xp = credit(xp, `challenge:${c.id}`, c.xp, `Challenge · ${c.title}`, now);
    }
  }
  return { ...p, xp, achievements, challenges };
}

/**
 * The single entry point for every reward. Recording the same event twice
 * (same type + id) is a no-op, so duplicate stamps and double XP are impossible.
 */
export function applyEvent(p: Progress, e: GameEvent): Progress {
  const key = eventKey(e);
  if (p.events.some((x) => eventKey(x) === key)) return p;
  const { amount, label } = xpForEvent(e);
  return settle({ ...p, events: [...p.events, e], xp: credit(p.xp, key, amount, label, e.at) }, e.at);
}

/** What changed between two snapshots: drives the reveal animations. */
export function diffRewards(before: Progress, after: Progress) {
  const [b, a] = [derive(before.events), derive(after.events)];
  const [lb, la] = [levelFor(totalXp(before.xp)), levelFor(totalXp(after.xp))];
  return {
    stamps: Object.keys(a.stamps).filter((id) => !(id in b.stamps)),
    achievements: Object.keys(after.achievements).filter((id) => !(id in before.achievements)),
    challenges: Object.keys(after.challenges).filter(
      (id) => after.challenges[id].completedAt && !before.challenges[id]?.completedAt,
    ),
    xp: totalXp(after.xp) - totalXp(before.xp),
    levelUp: la.level > lb.level ? la : null,
  };
}
