// Generates supabase/seed.sql (catalogue rows) from the app's own data, so the
// database can never drift from the code. Idempotent: safe to run on every deploy.
//   node scripts/build-seed.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { GAME_STATIONS, LANDMARKS, NEIGHBORHOODS, PLACES } from "../src/data/places.ts";

const net = JSON.parse(readFileSync(new URL("../src/data/network.json", import.meta.url), "utf8"));
const engine = readFileSync(new URL("../src/lib/gamification.ts", import.meta.url), "utf8");

// --- same rules as src/lib/network.ts and src/lib/gamification.ts ----------
const lineOf = Object.fromEntries(net.routes.map((r) => [r.id, r.line]));
const endpoints = {};
for (const p of net.patterns) (endpoints[p.route] ??= new Set()).add(p.stops[0]).add(p.stops.at(-1));
const stations = net.stations.map((s) => ({
  ...s,
  lines: [...new Set(s.routes.map((r) => lineOf[r]))],
  terminal: s.routes.every((r) => endpoints[r]?.has(s.id)),
}));
const km = (a, b) => {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
const nearest = (p) => stations.reduce((best, s) => (km(p, s) < km(p, best) ? s : best));
const parkStreet = stations.find((s) => s.id === "place-pktrm");

const stamps = [
  ...stations.map((s) => ({
    id: `station:${s.id}`, kind: "station", ref: s.id, name: s.name,
    ...(s.terminal
      ? { rarity: "rare", rule: "End-of-line terminal: ride a line all the way out." }
      : s.lines.length > 1
        ? { rarity: "uncommon", rule: "Transfer hub serving two or more lines." }
        : { rarity: "common", rule: "Station on a single line." }),
  })),
  ...LANDMARKS.map((l) => {
    const outer = km(l, parkStreet) > 1.5;
    return {
      id: `landmark:${l.id}`, kind: "landmark", ref: l.id, name: l.name, rarity: outer ? "epic" : "rare",
      rule: outer ? "Photo-verified landmark more than 1.5 km from Park Street." : "Photo-verified landmark in the downtown core.",
    };
  }),
  { id: "set:four-lines", kind: "set", ref: "four-lines", name: "Four Colours", rarity: "epic", rule: "Collect a station on each of the Red, Orange, Blue and Green lines." },
  { id: "set:freedom-trail", kind: "set", ref: "freedom-trail", name: "Freedom Trail", rarity: "legendary", rule: `Verify all ${LANDMARKS.filter((l) => l.freedomTrail).length} Freedom Trail landmarks.` },
  { id: "set:red-line", kind: "set", ref: "red-line", name: "Crimson Completionist", rarity: "legendary", rule: `Collect all ${stations.filter((s) => s.lines.includes("Red")).length} Red Line stations.` },
];

// Source of truth: ACHIEVEMENTS and CHALLENGES in src/lib/gamification.ts (which
// Node cannot import: it uses "@/" aliases). The check below fails the build if
// these lists drift from it.
const achievements = [
  ["first-ride", "First Ride", "Complete your first guided journey.", 50],
  ["first-discovery", "First Discovery", "Verify your first historical landmark.", 50],
  ["red-line-explorer", "Red Line Explorer", "Collect 5 Red Line stations.", 100],
  ["boston-historian", "Boston Historian", "Verify 5 historical landmarks.", 150],
  ["guess-champion", "Guess Boston Champion", "Win 5 Guess Boston rounds.", 120],
  ["sharp-eye", "Sharp Eye", "Win a round without using a hint.", 40],
  ["weekend-explorer", "Weekend Explorer", "Collect a station or landmark on a weekend.", 60],
  ["transfer-pro", "Transfer Pro", "Collect 3 transfer hubs.", 80],
  ["master-commuter", "Master Commuter", "Complete 5 guided journeys.", 200],
  ["on-a-roll", "On a Roll", "Reach a 3-day streak.", 60],
];
const challenges = [
  ["new-station", "New Stop", "Collect a station you have never visited.", 30, 1],
  ["landmark-hunter", "Landmark Hunter", "Verify a historical landmark with the scanner.", 60, 1],
  ["three-rounds", "Know Your City", "Finish 3 Guess Boston rounds.", 50, 3],
  ["red-three", "Seeing Red", "Collect 3 Red Line stations.", 70, 3],
  ["guided-journey", "Door to Door", "Complete a guided journey from start to finish.", 50, 1],
  ["no-hints", "No Peeking", "Win a Guess Boston round without hints.", 40, 1],
];

const inEngine = (label) =>
  [...engine.matchAll(new RegExp(`\\{ id: "([^"]+)", ${label}: "[^"]+", description: "[^"]+", xp: (\\d+)`, "g"))]
    .map((m) => `${m[1]}=${m[2]}`).sort().join(",");
const mine = (rows) => rows.map((r) => `${r[0]}=${r[3]}`).sort().join(",");
for (const [name, label, rows] of [["ACHIEVEMENTS", "name", achievements], ["CHALLENGES", "title", challenges]]) {
  if (!inEngine(label) || inEngine(label) !== mine(rows)) {
    console.error(`${name} in scripts/build-seed.mjs no longer match src/lib/gamification.ts\n  engine: ${inEngine(label)}\n  seed:   ${mine(rows)}`);
    process.exit(1);
  }
}

// --- SQL ---------------------------------------------------------------------
const q = (v) =>
  v === null || v === undefined ? "null"
  : typeof v === "number" || typeof v === "boolean" ? String(v)
  : Array.isArray(v) ? `array[${v.map(q).join(", ")}]::text[]`
  : `'${String(v).replaceAll("'", "''")}'`;

const upsert = (table, cols, rows) =>
  `insert into public.${table} (${cols.join(", ")}) values\n` +
  rows.map((r) => `  (${r.map(q).join(", ")})`).join(",\n") +
  `\non conflict (id) do update set ${cols.slice(1).map((c) => `${c} = excluded.${c}`).join(", ")};\n`;

const sql = [
  "-- GENERATED by scripts/build-seed.mjs from src/data. Do not edit by hand.",
  "-- Idempotent: every statement is an upsert on the primary key.\n",
  upsert("stations", ["id", "name", "lat", "lng", "municipality", "lines", "is_terminal"],
    stations.map((s) => [s.id, s.name, s.lat, s.lng, s.municipality, s.lines, s.terminal])),
  upsert("landmarks", ["id", "name", "lat", "lng", "neighborhood", "year", "summary", "station_id", "freedom_trail"],
    LANDMARKS.map((l) => [l.id, l.name, l.lat, l.lng, l.neighborhood, l.year ?? null, l.summary, nearest(l).id, !!l.freedomTrail])),
  upsert("stamps", ["id", "kind", "ref_id", "name", "rarity", "rule"],
    stamps.map((s) => [s.id, s.kind, s.ref, s.name, s.rarity, s.rule])),
  upsert("achievements", ["id", "name", "description", "xp"], achievements),
  upsert("challenges", ["id", "title", "description", "xp", "goal", "source"], challenges.map((c) => [...c, "template"])),
  upsert("game_locations", ["id", "kind", "name", "aliases", "lat", "lng", "difficulty", "station_id", "summary"],
    PLACES.map((p) => [p.id, p.kind, p.name, p.aliases, p.lat, p.lng, p.difficulty, p.stationId ?? nearest(p).id, p.summary])),
].join("\n");

writeFileSync(new URL("../supabase/seed.sql", import.meta.url), sql);
console.log(
  `seed.sql: ${stations.length} stations, ${LANDMARKS.length} landmarks, ${stamps.length} stamps, ` +
  `${achievements.length} achievements, ${challenges.length} challenges, ${PLACES.length} game locations ` +
  `(${GAME_STATIONS.length} stations, ${NEIGHBORHOODS.length} neighborhoods)`,
);
