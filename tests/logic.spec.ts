// Deterministic rules: rewards, levels, streaks, routing, scoring. No browser, no network.
import { expect, test } from "@playwright/test";
import { DAILY_PAID_PLAYS, GAMES, guessRound, paidPlaysLeft, PARKOUR_LEVELS, parkourQuestions, placeQuestion, playEvent, scoreMap, SUBJECTS } from "../src/lib/game";
import { FIGURES } from "../src/data/trivia";
import {
  applyEvent, CHALLENGE, dayKey, derive, playXp, emptyProgress, levelFor, settle, STAMP, streakFor, totalXp, XP, type GameEvent, type RoundEvent,
} from "../src/lib/gamification";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DISCOVER } from "../src/data/discover";
import { recommend } from "../src/lib/discover";
import { ACCEPTED, FARE_SOURCES } from "../src/data/fares";
import { commuterRailFare, formatFare, journeyFare, quoteFare } from "../src/lib/fares";
import { GUIDE_STEPS, TOUR } from "../src/lib/guide";
import { bestStationFor, legInfo, planFromStops, planRoute, routeOptions, servesLeg, STATION, STATIONS, tripSteps } from "../src/lib/network";
import { PLACE } from "../src/lib/places";
import { dayRecap, heatPoints, trailSegments } from "../src/lib/recap";
import type { Journey } from "../src/lib/store";
import { estimateAlert, getOffAlert } from "../src/lib/alerts";
import { autoSteps } from "../src/lib/tracking";

const DAY = 86_400_000;
const T0 = new Date(2026, 10, 18, 12).getTime(); // a Wednesday, local noon
const station = (id: string, at = T0): GameEvent => ({ t: "station", id, at, via: "ride" });

test.describe("reward engine", () => {
  test("the same event can never be rewarded twice", () => {
    const once = applyEvent(emptyProgress(), station("place-harsq"));
    const twice = applyEvent(once, station("place-harsq", T0 + 5000));
    expect(twice).toBe(once);
    expect(totalXp(twice.xp)).toBe(XP.station);
    expect(Object.keys(derive(twice.events).stamps)).toEqual(["station:place-harsq"]);
  });

  test("XP ledger keys are unique", () => {
    let p = emptyProgress();
    for (const id of ["place-harsq", "place-cntsq", "place-knncl", "place-chmnl", "place-pktrm", "place-harsq"]) p = applyEvent(p, station(id));
    const keys = p.xp.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("five Red Line stations earn Red Line Explorer exactly once", () => {
    let p = emptyProgress();
    for (const id of ["place-harsq", "place-cntsq", "place-knncl", "place-chmnl", "place-pktrm"]) p = applyEvent(p, station(id));
    expect(p.achievements["red-line-explorer"]).toBeTruthy();
    expect(totalXp(settle(settle(p, T0), T0).xp)).toBe(totalXp(p.xp));
    expect(totalXp(p.xp)).toBe(5 * XP.station + 100);
  });

  test("landmark XP depends on verification, and photo-only is reduced", () => {
    const near = applyEvent(emptyProgress(), { t: "landmark", id: "state-house", at: T0, verification: "nearby" });
    const photo = applyEvent(emptyProgress(), { t: "landmark", id: "state-house", at: T0, verification: "photo-only" });
    expect(near.xp[0].amount).toBe(XP.landmarkVerified);
    expect(photo.xp[0].amount).toBe(XP.landmarkPhotoOnly);
  });

  test("challenge progress counts only events after it was accepted", () => {
    let p = applyEvent(emptyProgress(), station("place-harsq", T0));
    p = settle({ ...p, challenges: { "red-three": { startedAt: T0 + 1000 } } }, T0 + 1000);
    for (const [i, id] of ["place-cntsq", "place-knncl"].entries()) p = applyEvent(p, station(id, T0 + 2000 + i));
    expect(p.challenges["red-three"].completedAt).toBeUndefined();
    p = applyEvent(p, station("place-chmnl", T0 + 5000));
    expect(p.challenges["red-three"].completedAt).toBeTruthy();
    expect(p.xp.filter((t) => t.key === "challenge:red-three")).toHaveLength(1);
    expect(p.xp.find((t) => t.key === "challenge:red-three")!.amount).toBe(CHALLENGE["red-three"].xp);
  });

  test("levels follow the configured thresholds", () => {
    expect(levelFor(0).level).toBe(1);
    expect(levelFor(99).level).toBe(1);
    expect(levelFor(100).level).toBe(2);
    expect(levelFor(250).level).toBe(3);
    expect(levelFor(175).progress).toBeCloseTo(0.5);
    expect(levelFor(1e6).next).toBeNull();
  });

  test("rarity comes from published rules, not from a model", () => {
    expect(STAMP["station:place-cntsq"].rarity).toBe("common"); // single line
    expect(STAMP["station:place-pktrm"].rarity).toBe("uncommon"); // Red + Green transfer
    expect(STAMP["station:place-alfcl"].rarity).toBe("rare"); // end of the line
    expect(STAMP["landmark:state-house"].rarity).toBe("rare"); // downtown core
    expect(STAMP["landmark:fenway-park"].rarity).toBe("epic"); // > 1.5 km out
    expect(STAMP["set:freedom-trail"].rarity).toBe("legendary");
    expect(STATION["place-gover"].terminal).toBe(false); // B/C end there, D/E run through
  });
});

test.describe("streaks", () => {
  test("consecutive days build a streak and one rest day is forgiven", () => {
    const events = [0, 1, 3, 4].map((d) => station(`s${d}`, T0 + d * DAY));
    const s = streakFor(events, T0 + 4 * DAY);
    expect(s.current).toBe(4);
    expect(s.activeToday).toBe(true);
  });
  test("two missed days end it, without erasing the best", () => {
    const events = [0, 1, 2].map((d) => station(`s${d}`, T0 + d * DAY));
    const s = streakFor(events, T0 + 6 * DAY);
    expect(s.current).toBe(0);
    expect(s.best).toBe(3);
  });
  test("a game round counts, so nobody has to travel to keep a streak", () => {
    const round: RoundEvent = { t: "round", id: "r1", place: "state-house", mode: "mix", correct: false, score: 0, hints: 0, at: T0 };
    expect(streakFor([round], T0).current).toBe(1);
  });
});

test.describe("route planner", () => {
  test("the demo route is four Red Line stops with no transfer", () => {
    const plan = planRoute("place-harsq", "place-pktrm")!;
    expect(plan.legs).toHaveLength(1);
    expect(plan.legs[0].stops).toEqual(["place-harsq", "place-cntsq", "place-knncl", "place-chmnl", "place-pktrm"]);
    expect(plan.legs[0].toward.split("/").sort()).toEqual(["Ashmont", "Braintree"]);
  });
  test("cross-line trips transfer at a real shared station", () => {
    const plan = planRoute("place-harsq", "place-aqucl")!; // Red → Blue
    expect(plan.legs.length).toBeGreaterThan(1);
    for (let i = 0; i < plan.legs.length - 1; i++) {
      expect(plan.legs[i].to).toBe(plan.legs[i + 1].from);
      expect(STATION[plan.legs[i].to].routes).toEqual(expect.arrayContaining([plan.legs[i].route, plan.legs[i + 1].route]));
    }
    expect(plan.legs.at(-1)!.to).toBe("place-aqucl");
  });
  test("every station can reach Park Street", () => {
    for (const s of STATIONS) if (s.id !== "place-pktrm") expect(planRoute(s.id, "place-pktrm"), s.name).not.toBeNull();
  });
  test("same or unknown stations give no route", () => {
    expect(planRoute("place-harsq", "place-harsq")).toBeNull();
    expect(planRoute("place-harsq", "nope")).toBeNull();
  });
});

test.describe("Bostie's Favourite rules", () => {
  /** A repeatable stand-in for Math.random. */
  const seeded = (seed = 7) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  test("there are exactly three games", () => {
    expect(GAMES.map((g) => g.name)).toEqual(["Bostie Guessing", "Bostie Drawing", "Bostie Parkour"]);
  });

  test("a question has four different answers, one of them right, the others the same kind of place", () => {
    for (const id of ["state-house", "stn-park-street", "nbh-back-bay"]) {
      const q = placeQuestion(PLACE[id], seeded());
      expect(new Set(q.options).size).toBe(4);
      expect(q.options.filter((o) => o === q.answer)).toHaveLength(1);
      expect(q.answer).toBe(PLACE[id].name);
      const kinds = q.options.map((o) => Object.values(PLACE).find((p) => p.name === o)!.kind);
      expect(new Set(kinds).size).toBe(1);
    }
  });

  test("a round is five different places from every category, and avoids the ones just played", () => {
    const first = guessRound([], seeded(3));
    expect(first).toHaveLength(5);
    expect(new Set(first.map((q) => q.id)).size).toBe(5);
    const second = guessRound(first.map((q) => q.id), seeded(3));
    expect(second.some((q) => first.some((f) => f.id === q.id))).toBe(false);
    const kinds = new Set(Array.from({ length: 12 }, (_, n) => guessRound([], seeded(n + 1))).flat().map((q) => PLACE[q.id].kind));
    expect([...kinds].sort()).toEqual(["landmark", "neighborhood", "station"]);
  });

  test("a pin scores by distance and only counts as correct close to the spot", () => {
    expect(scoreMap(0)).toEqual({ points: 100, correct: true });
    expect(scoreMap(5).correct).toBe(false);
    expect(scoreMap(0.2).points).toBeGreaterThan(scoreMap(1).points);
  });

  test("Parkour has 3, 5, 7 and 10 obstacles, each with its own question", () => {
    expect(PARKOUR_LEVELS.map((l) => l.obstacles)).toEqual([3, 5, 7, 10]);
    for (const { obstacles } of PARKOUR_LEVELS) {
      const qs = parkourQuestions(obstacles, seeded(obstacles));
      expect(qs).toHaveLength(obstacles);
      expect(new Set(qs.map((q) => q.id)).size).toBe(obstacles);
      for (const q of qs) expect(q.options.filter((o) => o === q.answer)).toHaveLength(1);
    }
    expect(parkourQuestions(10, seeded()).some((q) => q.id.startsWith("fig-"))).toBe(true);
    expect(parkourQuestions(10, seeded()).some((q) => q.photo)).toBe(true);
  });

  test("every question about a person has one answer, three different wrong ones and a source", () => {
    expect(FIGURES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(FIGURES.map((f) => f.id)).size).toBe(FIGURES.length);
    for (const f of FIGURES) {
      expect(new Set([f.answer, ...f.wrong]).size, f.id).toBe(4);
      expect(f.source, f.id).toMatch(/^https:\/\/en\.wikipedia\.org\/wiki\/\S+$/);
      expect(f.q.includes(f.answer), `${f.id} gives its answer away`).toBe(false);
    }
  });

  test("drawing subjects are landmarks with a photo, or symbols without one; no team mascots", () => {
    expect(SUBJECTS.filter((s) => s.photo).length).toBeGreaterThanOrEqual(15);
    expect(SUBJECTS.filter((s) => !s.photo).length).toBeGreaterThanOrEqual(5);
    for (const s of SUBJECTS) expect(s.cues.length, s.id).toBeGreaterThan(1);
    expect(SUBJECTS.some((s) => /wally|green monster|celtic|bruin|patriot|red sox/i.test(s.name))).toBe(false);
  });

  test("XP comes from the result, by fixed rules", () => {
    const play = (over: object) => ({ t: "play" as const, id: "x", game: "guess" as const, score: 0, won: false, hints: 0, paid: true, at: T0, ...over });
    expect(playXp(play({ score: 4 }))).toBe(20);
    expect([0, 1, 30, 60, 100].map((score) => playXp(play({ game: "draw", score })))).toEqual([0, 10, 20, 30, 40]);
    expect([0, 1, 2, 3].map((level) => playXp(play({ game: "parkour", won: true, level })))).toEqual([15, 30, 50, 80]);
    expect(playXp(play({ game: "parkour", won: false, level: 3 }))).toBe(5);
    expect(playXp(play({ score: 5, paid: false }))).toBe(0);
  });

  test("each game pays XP for five plays a day, then is free to play for nothing", () => {
    let p = emptyProgress();
    for (let n = 0; n < DAILY_PAID_PLAYS + 2; n++) p = applyEvent(p, playEvent(p.events, { game: "guess", score: 5, won: true, hints: 1 }, T0 + n * 1000));
    expect(p.events.filter((e) => e.t === "play" && e.paid)).toHaveLength(DAILY_PAID_PLAYS);
    expect(paidPlaysLeft(p.events, "guess", T0 + 60_000)).toBe(0);
    expect(p.xp.filter((t) => t.key.startsWith("play:")).reduce((n, t) => n + t.amount, 0)).toBe(DAILY_PAID_PLAYS * 25);
    expect(paidPlaysLeft(p.events, "draw", T0)).toBe(DAILY_PAID_PLAYS); // the limit is per game
    expect(paidPlaysLeft(p.events, "guess", T0 + DAY)).toBe(DAILY_PAID_PLAYS); // and resets the next day
    expect(new Set(p.xp.map((t) => t.key)).size).toBe(p.xp.length);
    expect(derive(p.events).stats).toMatchObject({ rounds: DAILY_PAID_PLAYS + 2, correct: DAILY_PAID_PLAYS + 2 });
  });
});

test.describe("judge guide", () => {
  const read = (dir: string): string =>
    readdirSync(dir, { withFileTypes: true })
      .map((f) => (f.isDirectory() ? read(join(dir, f.name)) : /\.tsx?$/.test(f.name) && f.name !== "guide.ts" ? readFileSync(join(dir, f.name), "utf8") : ""))
      .join("\n");
  const source = read(join(__dirname, "../src"));

  test("every highlight has a feature tagged for it, and every scene is declared by a screen", () => {
    for (const [scene, spots] of Object.entries(TOUR)) {
      expect(source, `no screen declares data-scene "${scene}"`).toContain(`"${scene}"`);
      expect(spots.length, scene).toBeGreaterThan(0);
      expect(new Set(spots.map((s) => s.target)).size, `${scene} repeats a target`).toBe(spots.length);
      for (const spot of spots) {
        expect(source, `${scene}: nothing carries data-tour="${spot.target}"`).toContain(`data-tour="${spot.target}"`);
        expect(spot.body.length, `${scene}/${spot.target} description is too long for a tip`).toBeLessThanOrEqual(190);
      }
    }
  });

  test("tip titles are unique and every checklist step names its buttons", () => {
    const titles = Object.values(TOUR).flat().map((s) => s.title);
    expect(new Set(titles).size).toBe(titles.length);
    for (const step of GUIDE_STEPS) expect(step.controls.length, step.id).toBeGreaterThan(0);
  });
});

test.describe("Explore Boston recommendations", () => {
  test("only catalogue places are recommended, and transit facts come from the planner", () => {
    const picks = recommend("place-harsq", ["history"], 2);
    expect(picks.length).toBeGreaterThan(5);
    for (const p of picks) {
      expect(PLACE[p.place.id], p.place.id).toBeTruthy();
      expect(STATION[p.stationId], p.place.id).toBeTruthy();
      const plan = planRoute("place-harsq", p.stationId);
      expect(p.rideMinutes).toBe(p.stationId === "place-harsq" ? 0 : plan!.minutes);
      expect(p.totalMinutes).toBe(p.rideMinutes + p.walkMinutes);
    }
  });
  test("budget filters and interests rank", () => {
    expect(recommend("place-pktrm", [], 0).every((p) => p.cost === 0)).toBe(true);
    expect(recommend("place-pktrm", ["sports"], 0).some((p) => p.place.id === "fenway-park")).toBe(false);
    const sporty = recommend("place-pktrm", ["sports"], 2);
    expect(sporty[0].place.id).toBe("fenway-park");
    expect(sporty[0].why).toContain("sports");
    const near = recommend("place-pktrm", [], 2);
    expect(near.map((p) => p.totalMinutes)).toEqual([...near.map((p) => p.totalMinutes)].sort((a, b) => a - b));
  });
  test("every landmark has interests and a budget tier", () => {
    for (const id of Object.keys(DISCOVER)) expect(PLACE[id]?.kind, id).toBe("landmark");
    expect(recommend("place-pktrm", [], 2)).toHaveLength(Object.keys(DISCOVER).length);
  });
});

// Prices below are MBTA's published one-way fares, read from mbta.com/fares on 2026-11-21.
// If these fail after a fare change, update src/data/fares.ts from the official pages.
test.describe("MBTA fares", () => {
  test("subway: one fare, adult and reduced", () => {
    expect(quoteFare([{ mode: "subway" }]).totalCents).toBe(240);
    expect(quoteFare([{ mode: "subway" }], "reduced").totalCents).toBe(110);
    expect(quoteFare([{ mode: "subway" }]).status).toBe("exact");
    expect(formatFare(240)).toBe("$2.40");
  });

  test("bus: local bus fare, adult and reduced", () => {
    expect(quoteFare([{ mode: "bus" }]).totalCents).toBe(170);
    expect(quoteFare([{ mode: "bus" }], "reduced").totalCents).toBe(85);
  });

  test("transfers: tap pays only the highest fare; cash pays every segment", () => {
    const busThenSubway = quoteFare([{ mode: "bus" }, { mode: "subway" }]);
    expect(busThenSubway.totalCents).toBe(240); // not 170 + 240
    expect(busThenSubway.lines.map((l) => l.chargedCents)).toEqual([0, 240]);
    expect(quoteFare([{ mode: "subway" }, { mode: "bus" }, { mode: "bus" }]).totalCents).toBe(240);
    expect(quoteFare([{ mode: "bus" }, { mode: "bus" }]).totalCents).toBe(170);
    expect(quoteFare([{ mode: "bus" }, { mode: "subway" }], "adult", "cash").totalCents).toBe(410);
    expect(quoteFare([{ mode: "subway" }, { mode: "subway" }], "adult", "cash").notes.join(" ")).toContain("Cash fares do not include");
  });

  test("a trip longer than the two-hour window is an estimate, not a promise", () => {
    expect(quoteFare([{ mode: "bus" }, { mode: "subway" }], "adult", "tap", 150).status).toBe("estimate");
    expect(quoteFare([{ mode: "bus" }, { mode: "subway" }], "adult", "tap", 60).status).toBe("exact");
  });

  test("Commuter Rail: zone fares are exact, interzone fares are flagged as estimates", () => {
    expect(commuterRailFare("1A", "1A", "adult")).toEqual({ cents: 240, assumed: false });
    expect(commuterRailFare("1A", "3", "adult").cents).toBe(800);
    expect(commuterRailFare("8", "1A", "reduced").cents).toBe(600);
    expect(commuterRailFare("1A", "10", "adult").cents).toBe(1325);
    const inter = quoteFare([{ mode: "commuter_rail", fromZone: "3", toZone: "5" }]);
    expect(inter.totalCents).toBe(350); // Interzone 3
    expect(inter.status).toBe("estimate");
  });

  test("Commuter Rail tickets never include a free transfer", () => {
    const q = quoteFare([{ mode: "commuter_rail", fromZone: "4", toZone: "1A" }, { mode: "subway" }]);
    expect(q.totalCents).toBe(875 + 240);
    expect(q.notes.join(" ")).toContain("do not include transfers");
  });

  test("ferry: priced by route, pooled with subway only as the highest fare", () => {
    expect(quoteFare([{ mode: "ferry", service: "inner_harbor" }]).totalCents).toBe(240);
    expect(quoteFare([{ mode: "ferry", service: "hingham_hull" }], "reduced").totalCents).toBe(485);
    expect(quoteFare([{ mode: "ferry", service: "hingham_hull" }, { mode: "subway" }]).totalCents).toBe(975);
  });

  test("missing or unsupported data is reported, never guessed", () => {
    for (const q of [
      quoteFare([]),
      quoteFare([{ mode: "commuter_rail", fromZone: "1A", toZone: "12" }]),
      quoteFare([{ mode: "ferry", service: "salem" }]),
      quoteFare([{ mode: "subway" }, { mode: "ferry", service: "nope" }]),
    ]) {
      expect(q.status).toBe("unavailable");
      expect(q.totalCents).toBeNull();
    }
    expect(formatFare(null)).toBe("Unavailable");
  });

  test("payment guidance lists only what each service accepts", () => {
    expect(ACCEPTED.subway).toEqual(expect.arrayContaining(["contactless", "wallet", "charliecard", "charlieticket", "cash"]));
    expect(ACCEPTED.subway).not.toContain("mticket");
    expect(ACCEPTED.commuter_rail).toEqual(["mticket", "charlieticket"]); // no contactless, no CharlieCard
    expect(ACCEPTED.ferry).not.toContain("charliecard");
    // One method for the whole trip: a subway + Commuter Rail trip has only the CharlieTicket in common.
    expect(quoteFare([{ mode: "subway" }, { mode: "commuter_rail", fromZone: "1A", toZone: "2" }]).accepted).toEqual(["charlieticket"]);
    expect(quoteFare([{ mode: "ferry", service: "east_boston" }]).accepted).not.toContain("cash"); // East Boston ferry takes no cash
    for (const url of Object.values(FARE_SOURCES)) expect(url).toMatch(/^https:\/\/www\.mbta\.com\/fares/);
  });

  test("planned journeys: any number of subway legs costs one subway fare", () => {
    const direct = planRoute("place-harsq", "place-pktrm")!;
    expect(journeyFare(direct).totalCents).toBe(240);
    const changes = planRoute("place-harsq", "place-aqucl")!;
    expect(changes.legs.length).toBeGreaterThan(1);
    const q = journeyFare(changes);
    expect(q.totalCents).toBe(240);
    expect(q.lines.filter((l) => l.chargedCents === 0)).toHaveLength(changes.legs.length - 1);
    expect(journeyFare(changes, "reduced").totalCents).toBe(110);
    for (const s of STATIONS) if (s.id !== "place-pktrm") expect(journeyFare(planRoute(s.id, "place-pktrm")!).totalCents, s.name).toBe(240);
  });

  test("route options are distinct, valid and led by the fastest", () => {
    for (const [from, to] of [["place-harsq", "place-pktrm"], ["place-harsq", "place-aqucl"], ["place-kencl", "place-wondl"], ["place-forhl", "place-alfcl"]]) {
      const options = routeOptions(from, to);
      expect(options.length).toBeGreaterThanOrEqual(1);
      expect(options[0].tag).toBe("Fastest");
      expect(Math.min(...options.map((o) => o.plan.minutes))).toBe(options[0].plan.minutes);
      const seen = new Set(options.map((o) => o.plan.legs.map((l) => `${l.line}:${l.from}>${l.to}`).join("|")));
      expect(seen.size).toBe(options.length);
      for (const o of options) {
        expect(o.plan.from).toBe(from);
        expect(o.plan.legs.at(-1)!.to).toBe(to);
        for (let i = 0; i < o.plan.legs.length - 1; i++) expect(o.plan.legs[i].to).toBe(o.plan.legs[i + 1].from);
      }
    }
    expect(routeOptions("place-harsq", "place-harsq")).toEqual([]);
  });
});

test.describe("routing to an address or place", () => {
  const MFA = { lat: 42.3394573, lng: -71.093897 };
  test("picks the station with the lowest total of ride plus walk", () => {
    const best = bestStationFor("place-harsq", MFA)!;
    expect(best.plan!.from).toBe("place-harsq");
    expect(best.plan!.legs.at(-1)!.to).toBe(best.station.id);
    expect(best.walkKm).toBeLessThan(1);
    expect(best.totalMinutes).toBe(best.plan!.minutes + best.walkMinutes);
    // No other nearby station gives a quicker door-to-door trip.
    for (const s of STATIONS) {
      const km = Math.hypot((s.lat - MFA.lat) * 111, (s.lng - MFA.lng) * 82);
      const plan = planRoute("place-harsq", s.id);
      if (km < 1.5 && plan) expect(plan.minutes + Math.round(((km * 1.3) / 4.8) * 60), s.name).toBeGreaterThanOrEqual(best.totalMinutes - 1);
    }
  });
  test("a place beside the starting station needs no train, and a remote one has no route", () => {
    const nextDoor = bestStationFor("place-pktrm", { lat: STATION["place-pktrm"].lat + 0.0005, lng: STATION["place-pktrm"].lng });
    expect(nextDoor!.plan).toBeNull();
    expect(nextDoor!.station.id).toBe("place-pktrm");
    expect(bestStationFor("place-pktrm", { lat: 42.43, lng: -71.29 })).toBeNull(); // nowhere near a station
  });
});

test.describe("automatic tracking", () => {
  const plan = planRoute("place-harsq", "place-pktrm")!;
  const at = (id: string) => ({ lat: STATION[id].lat, lng: STATION[id].lng });
  const j = (over: Partial<Journey>): Journey => ({ id: "j", plan, demo: false, stage: "walking", leg: 0, stop: 1, startedAt: 0, tracking: "auto", ...over });
  const far = { lat: 42.40, lng: -71.20 };

  test("reaching the boarding station ends the walk; being elsewhere does not", () => {
    expect(autoSteps(j({ stage: "walking" }), at("place-harsq"))).toBe(1);
    expect(autoSteps(j({ stage: "walking" }), far)).toBe(0);
  });
  test("leaving the station means the rider is on the train", () => {
    expect(autoSteps(j({ stage: "waiting" }), at("place-harsq"))).toBe(0);
    expect(autoSteps(j({ stage: "waiting" }), at("place-cntsq"))).toBeGreaterThan(0);
  });
  test("a fix at a later stop catches up on stops missed underground", () => {
    expect(autoSteps(j({ stage: "traveling", stop: 1 }), at("place-cntsq"))).toBe(1);
    expect(autoSteps(j({ stage: "traveling", stop: 1 }), at("place-chmnl"))).toBe(3); // Central, Kendall, Charles
    expect(autoSteps(j({ stage: "traveling", stop: 1 }), far)).toBe(0); // between stations: wait
    expect(autoSteps(j({ stage: "traveling", stop: 3 }), at("place-cntsq"))).toBe(0); // never goes backwards
  });
  test("a journey to a place completes on reaching it, and plain journeys wait for the rider", () => {
    const walkTo = { name: "X", address: "", lat: 42.3587, lng: -71.0638, minutes: 4, km: 0.3 };
    expect(autoSteps(j({ stage: "exploring", walkTo }), walkTo)).toBe(1);
    expect(autoSteps(j({ stage: "exploring", walkTo }), at("place-pktrm"))).toBe(0);
    expect(autoSteps(j({ stage: "exploring" }), at("place-pktrm"))).toBe(0);
    expect(autoSteps(j({ stage: "planning" }), at("place-harsq"))).toBe(0);
    expect(autoSteps(j({ stage: "complete" }), at("place-pktrm"))).toBe(0);
  });
});

test.describe("day recap and heat map", () => {
  const day = dayKey(T0);
  const events: GameEvent[] = [
    station("place-harsq"),
    station("place-pktrm", T0 + 60_000),
    { t: "landmark", id: "state-house", at: T0 + 120_000, verification: "simulated" },
    { t: "journey", id: "j1", from: "place-harsq", to: "place-pktrm", stops: 4, lines: ["Red"], minutes: 9, km: 4.2, demo: false, at: T0 + 180_000 },
    { t: "journey", id: "j2", from: "place-harsq", to: "place-pktrm", stops: 4, lines: ["Red"], minutes: 9, km: 4.2, demo: false, at: T0 + 240_000 },
    station("place-alfcl", T0 - DAY),
  ];
  const step = (i: number, at: number) => ({ lat: 42.36 + i * 0.0005, lng: -71.06, at });
  // Two short walks, separated by a long silence underground and a jump across town.
  const trail = [step(0, T0), step(1, T0 + 30_000), step(2, T0 + 60_000), { lat: 42.39, lng: -71.12, at: T0 + 30 * 60_000 }, { lat: 42.3905, lng: -71.12, at: T0 + 31 * 60_000 }];

  test("a day counts only that day's places, distance and XP", () => {
    const r = dayRecap(events, [{ key: "a", amount: 25, at: T0 }, { key: "b", amount: 10, at: T0 - DAY }] as never, trail, day);
    expect(r.stations.map((s) => s.id)).toEqual(["place-harsq", "place-pktrm"]);
    expect(r.landmarks.map((l) => l.id)).toEqual(["state-house"]);
    expect(r.journeys).toHaveLength(2);
    expect(r.rideKm).toBeCloseTo(8.4);
    expect(r.xp).toBe(25);
    expect(r.active).toBe(true);
    expect(dayRecap(events, [], [], dayKey(T0 + 5 * DAY)).active).toBe(false);
  });

  test("places visited more often are hotter, and Today leaves out other days", () => {
    const at = (id: string, pts = heatPoints(events, [], "all")) => pts.find((p) => p.lat === STATION[id].lat && p.lng === STATION[id].lng)?.weight ?? 0;
    expect(at("place-harsq")).toBe(3); // collected once, ridden through twice
    expect(at("place-cntsq")).toBe(2); // only passed through
    expect(at("place-alfcl")).toBe(1);
    expect(at("place-alfcl", heatPoints(events, [], day))).toBe(0);
    expect(heatPoints(events, [], "all").some((p) => p.weight === 3 && p.lat === PLACE["state-house"].lat)).toBe(true);
  });

  test("the trail is broken where the signal was lost, never joined by a straight line", () => {
    const segs = trailSegments(trail, "all");
    expect(segs.map((s) => s.length)).toEqual([3, 2]);
    expect(trailSegments([step(0, T0)], "all")).toEqual([]); // a single point is not a path
    expect(dayRecap([], [], trail, day).trailKm).toBeGreaterThan(0.1);
    expect(dayRecap([], [], trail, day).trailKm).toBeLessThan(0.3); // the cross-town jump is not counted
  });
});

test.describe("directions and trains for a leg", () => {
  const leg = (a: string, b: string) => planRoute(a, b)!.legs[0];
  const pt = (id: string) => ({ lat: STATION[id].lat, lng: STATION[id].lng });

  test("destinations and direction names are the MBTA's own", () => {
    expect(legInfo(leg("place-harsq", "place-pktrm"))).toMatchObject({ direction: 0, directionName: "Southbound", toward: "Ashmont/Braintree", label: "Red Line" });
    expect(legInfo(leg("place-pktrm", "place-harsq"))).toMatchObject({ direction: 1, directionName: "Northbound", toward: "Alewife" });
    expect(legInfo(leg("place-pktrm", "place-smmnl")).toward).toBe("Ashmont"); // past the split: one branch only
    expect(legInfo(leg("place-pktrm", "place-qnctr")).toward).toBe("Braintree");
    expect(legInfo(leg("place-state", "place-aqucl"))).toMatchObject({ directionName: "Eastbound", toward: "Wonderland" });
  });

  test("a Green Line trunk trip lists every branch that makes it", () => {
    const west = legInfo(leg("place-pktrm", "place-kencl"));
    expect(west.routes).toEqual(["Green-B", "Green-C", "Green-D"]);
    expect(west.label).toBe("Green Line B, C or D");
    expect(west.toward).toBe("Boston College, Cleveland Circle or Riverside");
    expect(legInfo(leg("place-pktrm", "place-hsmnl")).routes).toEqual(["Green-E"]);
  });

  test("only trains that reach the stop count as departures", () => {
    const shawmut = leg("place-pktrm", "place-smmnl");
    const red = (headsign: string, direction = 0) => ({ route: "Red", direction, headsign });
    expect(servesLeg(shawmut, red("Ashmont"))).toBe(true);
    expect(servesLeg(shawmut, red("Braintree"))).toBe(false);
    expect(servesLeg(shawmut, red("Alewife", 1))).toBe(false);
    expect(servesLeg(shawmut, red("Broadway"))).toBe(false); // ends early, before Shawmut
    expect(servesLeg(leg("place-harsq", "place-pktrm"), red("Broadway"))).toBe(true); // ends early, but past Park Street
    expect(servesLeg(shawmut, red("Special"))).toBe(true); // unplaceable headsign: shown, not hidden
    expect(servesLeg(leg("place-harsq", "place-pktrm"), red("Braintree"))).toBe(true); // before the split either branch works
    const kenmore = leg("place-pktrm", "place-kencl");
    expect(servesLeg(kenmore, { route: "Green-C", direction: 0, headsign: "Cleveland Circle" })).toBe(true);
    expect(servesLeg(kenmore, { route: "Green-E", direction: 0, headsign: "Heath Street" })).toBe(false);
    expect(servesLeg(kenmore, { route: "Orange", direction: 0, headsign: "Forest Hills" })).toBe(false);
  });

  test("a trip reads as ordered instructions: walk, board, ride, change, walk", () => {
    const plan = planRoute("place-harsq", "place-aqucl")!;
    const steps = tripSteps(plan, 5, { name: "New England Aquarium", minutes: 3 });
    expect(steps.map((s) => s.kind)).toEqual(["walk", ...plan.legs.flatMap((_, i) => (i < plan.legs.length - 1 ? ["board", "ride", "change"] : ["board", "ride"])), "walk"]);
    expect(steps[0].title).toBe("Walk to Harvard");
    expect(steps[1]).toMatchObject({ title: "Board the Red Line", detail: "Southbound platform, toward Ashmont/Braintree." });
    expect(steps.at(-1)).toMatchObject({ title: "Walk to New England Aquarium", minutes: 3 });
    expect(steps.find((s) => s.kind === "change")!.detail).toMatch(/follow signs for the .+ toward /);
    expect(tripSteps(plan, null)[0].kind).toBe("board"); // no walk known: start at the platform
  });

  test("a rail route described by stop positions becomes a plan; anything else does not", () => {
    const plan = planFromStops([{ from: pt("place-harsq"), to: pt("place-pktrm"), lineName: "Red Line" }, { from: pt("place-pktrm"), to: pt("place-kencl"), lineName: "Green Line C" }])!;
    expect(plan.legs.map((l) => l.line)).toEqual(["Red", "Green"]);
    expect(plan.legs[0].stops).toEqual(planRoute("place-harsq", "place-pktrm")!.legs[0].stops);
    expect(planFromStops([{ from: { lat: 42.40, lng: -71.20 }, to: pt("place-pktrm") }])).toBeNull(); // a bus stop
    expect(planFromStops([{ from: pt("place-harsq"), to: pt("place-kencl") }])).toBeNull(); // no single line links them
    expect(planFromStops([{ from: pt("place-harsq"), to: pt("place-pktrm") }, { from: pt("place-kencl"), to: pt("place-hymnl") }])).toBeNull(); // rides do not connect
  });
});

test.describe("get-off alerts", () => {
  const plan = planRoute("place-harsq", "place-aqucl")!; // Red, then Orange, then Blue
  const j = (over: Partial<Journey>): Journey => ({ id: "j", plan, demo: false, stage: "traveling", leg: 0, stop: 1, startedAt: 0, ...over });
  const lastStop = plan.legs[0].stops.length - 1;

  test("the rider is warned when their stop is next, and again on arriving, once each", () => {
    expect(getOffAlert(j({ stop: 1 }), j({ stop: 2 }))).toBeNull(); // still stops to go
    const next = getOffAlert(j({ stop: lastStop - 1 }), j({ stop: lastStop }))!;
    expect(next.title).toBe("Next stop: Downtown Crossing");
    expect(next.body).toContain("to change to the Orange Line");
    expect(getOffAlert(j({ stop: lastStop }), j({ stop: lastStop }))).toBeNull(); // nothing moved: not repeated
    const here = getOffAlert(j({ stop: lastStop }), j({ stage: "transferring", stop: lastStop }))!;
    expect(here.title).toBe("This is Downtown Crossing");
    expect(here.tag).not.toBe(next.tag);
  });

  test("a one-stop ride warns as soon as the rider is on board, and the last leg says nothing about changing", () => {
    const short = planRoute("place-harsq", "place-cntsq")!;
    const a = getOffAlert({ ...j({ stage: "boarding" }), plan: short }, { ...j({ stage: "traveling", stop: 1 }), plan: short })!;
    expect(a).toMatchObject({ title: "Next stop: Central", body: "Get ready to get off." });
    expect(getOffAlert(j({ stage: "waiting" }), j({ stage: "boarding" }))).toBeNull();
    expect(getOffAlert(j({ id: "old" }), j({ id: "new", stop: lastStop }))).toBeNull(); // a different journey is not a step
  });

  test("with no position to go on, the warning is timed from when the rider boarded", () => {
    const boardedAt = 1_000_000;
    const due = estimateAlert(j({ boardedAt }))!;
    expect(due.at).toBe(boardedAt + (plan.legs[0].minutes - 1) * 60_000); // one minute before the estimated arrival
    expect(due.title).toBe("Almost at Downtown Crossing");
    expect(due.body).toMatch(/By the timetable/); // says it is an estimate
    expect(estimateAlert(j({}))).toBeNull(); // never boarded
    expect(estimateAlert(j({ boardedAt, stage: "waiting" }))).toBeNull();
  });
});
