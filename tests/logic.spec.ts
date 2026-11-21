// Deterministic rules: rewards, levels, streaks, routing, scoring. No browser, no network.
import { expect, test } from "@playwright/test";
import { aliasMatch, candidatePool, findByAlias, scoreMap, scoreText, skillTier } from "../src/lib/game";
import {
  applyEvent, CHALLENGE, derive, emptyProgress, levelFor, settle, STAMP, streakFor, totalXp, XP, type GameEvent, type RoundEvent,
} from "../src/lib/gamification";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DISCOVER } from "../src/data/discover";
import { recommend } from "../src/lib/discover";
import { ACCEPTED, FARE_SOURCES } from "../src/data/fares";
import { commuterRailFare, formatFare, journeyFare, quoteFare } from "../src/lib/fares";
import { GUIDE_STEPS, TOUR } from "../src/lib/guide";
import { planRoute, routeOptions, STATION, STATIONS } from "../src/lib/network";
import { PLACE } from "../src/lib/places";

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
  test("a Guess Boston round counts, so nobody has to travel to keep a streak", () => {
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

test.describe("Guess Boston rules", () => {
  test("alias matching forgives case, punctuation, articles and suffixes", () => {
    expect(aliasMatch(PLACE["state-house"], "The State House, Boston")).toBe(true);
    expect(aliasMatch(PLACE["kings-chapel"], "king's chapel")).toBe(true);
    expect(aliasMatch(PLACE["stn-park-street"], "Park St. station")).toBe(true);
    expect(aliasMatch(PLACE["state-house"], "old state house")).toBe(false);
    expect(aliasMatch(PLACE["state-house"], "   ")).toBe(false);
    expect(findByAlias("old ironsides")?.id).toBe("uss-constitution");
  });
  test("scoring is deterministic: hints and misses cost, speed pays, wrong scores zero", () => {
    expect(scoreText({ correct: true, wrong: 0, hints: 0, seconds: 0 })).toBe(1200);
    expect(scoreText({ correct: true, wrong: 1, hints: 2, seconds: 60 })).toBe(500);
    expect(scoreText({ correct: true, wrong: 2, hints: 3, seconds: 999 })).toBe(150);
    expect(scoreText({ correct: false, wrong: 3, hints: 0, seconds: 5 })).toBe(0);
    expect(scoreMap({ km: 0, hints: 0, seconds: 0 })).toEqual({ score: 1200, correct: true });
    expect(scoreMap({ km: 5, hints: 0, seconds: 0 }).correct).toBe(false);
    expect(scoreMap({ km: 0.2, hints: 0, seconds: 30 }).score).toBeGreaterThan(scoreMap({ km: 1, hints: 0, seconds: 30 }).score);
  });
  test("difficulty rises with recent scores and the pool respects mode and repeats", () => {
    const r = (score: number): RoundEvent => ({ t: "round", id: String(Math.random()), place: "x", mode: "mix", correct: score > 0, score, hints: 0, at: T0 });
    expect(skillTier([])).toBe(1);
    expect(skillTier([r(1100), r(900), r(1000)])).toBe(3);
    expect(skillTier([r(0), r(600), r(500)])).toBe(1);
    expect(skillTier([r(500), r(600), r(500)])).toBe(2);
    const pool = candidatePool("station", 1, ["stn-park-street"]);
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every((p) => p.kind === "station" && p.id !== "stn-park-street")).toBe(true);
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
