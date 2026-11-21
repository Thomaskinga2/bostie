// Deterministic rules: rewards, levels, streaks, routing, scoring. No browser, no network.
import { expect, test } from "@playwright/test";
import { aliasMatch, candidatePool, findByAlias, scoreMap, scoreText, skillTier } from "../src/lib/game";
import {
  applyEvent, CHALLENGE, derive, emptyProgress, levelFor, settle, STAMP, streakFor, totalXp, XP, type GameEvent, type RoundEvent,
} from "../src/lib/gamification";
import { planRoute, STATION, STATIONS } from "../src/lib/network";
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
