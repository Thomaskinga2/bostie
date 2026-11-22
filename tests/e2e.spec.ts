// End-to-end flows with deterministic mocked APIs (no Gemini, MBTA or Wikimedia traffic).
// Runs twice: at phone size, and at desktop size inside the iPhone demo frame.
import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { FIGURES } from "../src/data/trivia";
import { guideStep, TIP, TOUR, type GuideStepId, type Scene } from "../src/lib/guide";
import { PLACE } from "../src/lib/places";

/** The button label the guide tells a judge to tap. The demo is driven by these, so the guide cannot drift from the app. */
const control = (id: GuideStepId, n = 0) => guideStep(id).controls[n];

// A valid 1x1 PNG: enough for the client-side downscale step.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const META = { feature: "mock", model: "mock-model", modality: "text → JSON", latencyMs: 12, grounding: ["mock grounding"] };

const scanOk = (id = "state-house", name = "Massachusetts State House") => ({
  result: {
    status: "recognized", landmarkId: id, landmarkName: name,
    candidates: [{ id, name, likelihood: "high", reason: "dome" }],
    visualEvidence: ["large gilded gold dome", "red brick Federal facade"],
    historicalSummary: "Designed by Charles Bulfinch and completed in 1798.",
    verification: "unlock", uncertaintyReason: null,
  },
  validation: {
    passed: true, landmarkId: id, verification: "simulated",
    checks: [{ name: "Known landmark", ok: true, detail: name }, { name: "Location", ok: true, detail: "Simulated demo position" }],
  },
  meta: { ...META, feature: "Landmark recognition", modality: "image + text → JSON" },
});

type Mocks = Partial<Record<"scan" | "hint" | "draw" | "predictions" | "alerts" | "places" | "routes", (route: Route) => unknown>>;

/** Stand-in location search: knows two real Boston places, nothing else. */
const PLACE_HITS = [
  { match: "museum", hit: { id: "o:1", name: "Museum of Fine Arts", address: "465 Huntington Avenue, Boston", lat: 42.3394573, lng: -71.093897 } },
  { match: "beacon", hit: { id: "o:2", name: "1217 Beacon Street", address: "Brookline", lat: 42.3431444, lng: -71.116364 } },
  { match: "nowhere", hit: { id: "o:3", name: "Nowhere Farm", address: "Lincoln", lat: 42.43, lng: -71.29 } },
];

async function mockApis(page: Page, over: Mocks = {}) {
  const json = (body: unknown, status = 200) => (route: Route) => route.fulfill({ status, json: body });
  await page.route("**/tile.openstreetmap.org/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: PNG, headers: { "access-control-allow-origin": "*" } }));
  await page.route("**/upload.wikimedia.org/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: PNG, headers: { "access-control-allow-origin": "*" } }));
  await page.route("**/api/mbta/predictions**", over.predictions ?? json({
    source: "live", fetchedAt: new Date().toISOString(), stop: "place-harsq",
    predictions: [{ id: "p1", route: "Red", headsign: "Ashmont", direction: 0, at: new Date(Date.now() + 4 * 60_000).toISOString(), status: null, platform: "Ashmont/Braintree", scheduled: false }],
  }));
  await page.route("**/api/routes", over.routes ?? json({ provider: "none", routes: [] }));
  await page.route("**/api/mbta/alerts", over.alerts ?? json({
    source: "live", fetchedAt: new Date().toISOString(),
    alerts: [{ id: "a1", header: "Red Line: shuttle buses replace service this weekend.", effect: "SHUTTLE", severity: 7, routes: ["Red"], url: null }],
  }));
  await page.route("**/api/places**", over.places ?? ((route) => {
    const q = (new URL(route.request().url()).searchParams.get("q") ?? "").toLowerCase();
    return route.fulfill({ json: { provider: "openstreetmap", places: PLACE_HITS.filter((p) => q.includes(p.match)).map((p) => p.hit) } });
  }));
  await page.route("**/api/scan", over.scan ?? json(scanOk()));
  await page.route("**/api/game/hint", over.hint ?? json({ hint: "It overlooks the oldest public park in America.", angle: "geography", source: "gemini", output: {}, meta: META }));
  await page.route("**/api/game/draw", over.draw ?? json({
    score: 82, recognizableFeatures: ["a round dome"], missingFeatures: ["the columns"], feedback: "MOCK FEEDBACK", source: "gemini", meta: { ...META, feature: "Bostie Drawing · sketch judge" },
  }));
}

/** Starts from a chosen persisted state instead of the welcome screen. */
async function seed(page: Page, state: Record<string, unknown> = {}) {
  await page.addInitScript((s) => {
    if (!localStorage.getItem("tquest-v1")) localStorage.setItem("tquest-v1", JSON.stringify({ state: s, version: 0 }));
  }, { onboarded: true, demo: true, name: "Tester", events: [], xp: [], achievements: {}, challenges: {}, saved: [], journey: null, ai: [], guestId: "t", tipsOff: true, ...state }); // on-screen tips are off unless a test asks for them
}

const store = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("tquest-v1")!).state);
const xpTotal = async (page: Page) => (await store(page)).xp.reduce((s: number, t: { amount: number }) => s + t.amount, 0);

/** Clicks through every queued reward reveal, returning the reward titles seen. */
async function dismissRewards(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Reward unlocked" });
  const seen: string[] = [];
  await page.waitForTimeout(250);
  while (await dialog.isVisible()) {
    seen.push(await dialog.getByRole("heading").innerText());
    await dialog.getByRole("button").click();
    await page.waitForTimeout(350);
  }
  return seen;
}

/** The right answer to the question on screen, looked up from the game's own data. */
async function answer(page: Page, correctly: boolean, group = page.getByRole("group", { name: "Answers" })): Promise<string> {
  const id = (await group.getAttribute("data-qid"))!;
  const right = id.startsWith("fig-") ? FIGURES.find((f) => `fig-${f.id}` === id)!.answer : PLACE[id].name;
  if (correctly) await group.getByRole("button", { name: right, exact: true }).click();
  else await group.getByRole("button").filter({ hasNotText: right }).first().click();
  return right;
}

const tipDialog = (page: Page) => page.getByRole("dialog", { name: "Tip" });

/** Reads and steps through every on-screen tip for the current screen, returning the titles shown. */
async function finishTips(page: Page) {
  const tip = tipDialog(page);
  const seen: string[] = [];
  for (;;) {
    try {
      await tip.waitFor({ state: "visible", timeout: 1500 });
    } catch {
      return seen;
    }
    seen.push(await tip.getByRole("heading").innerText());
    await tip.getByRole("button", { name: new RegExp(`^(${TIP.next}|${TIP.done})$`) }).click();
    await page.waitForTimeout(120);
  }
}

async function shot(page: Page, name: string) {
  const dir = `screenshots/${test.info().project.name}`; // kept between runs, git-ignored
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${name}.png` });
}

const noSidewaysScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

const upload = (page: Page) => page.locator('input[type="file"]').setInputFiles({ name: "landmark.png", mimeType: "image/png", buffer: PNG });

test("the full judge demo: plan, ride, play, scan, passport", async ({ page }) => {
  await mockApis(page);
  await page.goto("/");

  // Welcome → guided demo
  await expect(page.getByRole("heading", { name: "Make every ride an adventure." })).toBeVisible();
  await page.waitForTimeout(2600); // the train rolls in and the note is pencilled
  await shot(page, "01-welcome");
  await page.getByRole("button", { name: "Judging? Take the guided demo" }).click();

  // Train doors close over the screen and slide open onto the name step.
  await page.waitForTimeout(700);
  await shot(page, "01a-doors");
  await expect(page.getByRole("heading", { name: "What should we call you?" })).toBeVisible();
  await page.getByLabel("What should we call you?").fill("Judge");
  await page.waitForTimeout(1600); // let the drawing finish for the screenshot
  await shot(page, "01a-name");
  await page.getByRole("button", { name: "Continue" }).click();

  // Each screen highlights its features the first time it appears. Collect every tip shown.
  const tips: string[] = [];
  const readTips = async () => tips.push(...(await finishTips(page)));
  await expect(tipDialog(page).getByRole("heading", { name: TOUR.home[0].title })).toBeVisible();
  await page.waitForTimeout(300);
  await shot(page, "01b-tip-home");
  await readTips();

  // Home is the adventure map with its two actions.
  expect((await store(page)).name).toBe("Judge");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(page.getByRole("group", { name: "Map of Boston and the MBTA network" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Explore Boston" })).toBeVisible();
  await shot(page, "02-home");

  // Plan Harvard → Park Street
  await page.getByRole("link", { name: "Plan a ride" }).click();
  await readTips();
  await expect(page.getByRole("button", { name: "Change starting point" })).toContainText("Current location"); // the demo position
  await shot(page, "02b-ride");
  await page.getByRole("button", { name: control("plan") }).click();
  await expect(page).toHaveURL(/\/journey$/);
  await readTips();
  await expect(page.getByRole("heading", { name: "Harvard to Park Street" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Step by step" }).getByText("Ride 4 stops to Park Street")).toBeVisible();
  await shot(page, "03-route");

  // Fare and how to pay, before the judge begins the journey.
  const fare = page.getByRole("region", { name: "Fare" });
  await expect(fare.getByTestId("fare-total")).toHaveText("$2.40");
  await expect(fare.getByRole("list", { name: "Ways to pay" }).getByText("CharlieCard")).toBeVisible();
  await expect(page.getByRole("region", { name: "Route options" }).getByText("No changes")).toBeVisible();
  await fare.getByRole("button", { name: "Fare breakdown and how to pay" }).click();
  await expect(fare.getByText("Red Line: Harvard to Park Street")).toBeVisible();
  await expect(fare.getByRole("link", { name: "Official MBTA fares" })).toHaveAttribute("href", "https://www.mbta.com/fares");
  await fare.scrollIntoViewIfNeeded();
  await shot(page, "03b-fare");
  await expect(page.getByTestId("trip-breakdown").first().getByText("Red Line to Park Street")).toBeVisible(); // minutes for each part
  await page.getByRole("button", { name: control("begin", 0) }).click();
  // Once the journey starts, a navigation map shows the route and the rider.
  await expect(page.getByRole("region", { name: "Navigation map" }).getByRole("group", { name: "Map of Boston and the MBTA network" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Navigation map" }).getByText("Demo position")).toBeVisible();
  await shot(page, "03c-journey-map");
  await page.getByRole("button", { name: control("begin", 1) }).click();
  await readTips();
  await expect(page.getByRole("heading", { name: "Wait for the Red Line" })).toBeVisible();
  await shot(page, "04-waiting");

  // Bostie's Favourite while waiting
  await expect(page.getByRole("region", { name: "Play while you wait" }).getByRole("link")).toHaveCount(3); // the three games, each with a picture
  await page.getByRole("main").getByRole("link", { name: /Bostie Guessing/ }).click();
  await readTips();
  await page.getByRole("button", { name: control("play") }).click();
  await expect(tipDialog(page).getByRole("heading", { name: TOUR["play-round"][0].title })).toBeVisible();
  await tipDialog(page).getByRole("button", { name: TIP.next }).click();
  await expect(tipDialog(page).getByRole("heading", { name: TOUR["play-round"][1].title })).toBeVisible();
  await page.waitForTimeout(300);
  await shot(page, "05b-tip-round");
  tips.push(TOUR["play-round"][0].title);
  await readTips();
  await expect(page.getByRole("heading", { name: /is this\?$/ })).toBeVisible();
  await shot(page, "05-round");
  for (let n = 0; n < 5; n++) {
    await answer(page, true);
    await expect(page.getByTestId("bostie")).toHaveAttribute("data-mood", "cheer"); // Bostie reacts to the answer
    await page.getByRole("button", { name: n < 4 ? "Next question" : "See results" }).click();
  }
  expect(await dismissRewards(page)).toContain("Sharp Eye");
  await readTips();
  await expect(page.getByRole("heading", { name: "5 of 5 correct" })).toBeVisible();
  await expect(page.getByText("points", { exact: true })).toBeVisible();
  await shot(page, "06-round-result");
  expect((await store(page)).events.filter((e: { t: string }) => e.t === "play")).toMatchObject([{ game: "guess", score: 5, won: true, paid: true }]);
  // The hub and the other two games each introduce themselves.
  for (const [path, heading] of [["/play", "Bostie's Favourite"], ["/play/draw", "How to play"], ["/play/parkour", "How to play"]]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await readTips();
  }
  await shot(page, "06b-parkour-intro");

  // Ride four stops, collecting a stamp at each station
  await page.goto("/journey");
  await page.getByRole("button", { name: control("ride", 0) }).click();
  await page.waitForTimeout(900); // let the stamp land
  await shot(page, "07-stamp-reveal");
  expect(await dismissRewards(page)).toContain("Harvard");
  await page.getByRole("button", { name: control("ride", 1) }).click();
  await readTips();
  for (const stop of ["Central", "Kendall/MIT", "Charles/MGH", "Park Street"]) {
    await expect(page.getByRole("heading", { name: `Next stop: ${stop}` })).toBeVisible();
    if (stop === "Kendall/MIT") await shot(page, "08-riding");
    await page.getByRole("button", { name: `Arrived at ${stop}` }).click();
    expect(await dismissRewards(page)).toContain(stop);
  }
  await expect(page.getByRole("heading", { name: "You have arrived at Park Street" })).toBeVisible();
  await page.getByRole("button", { name: control("scan") }).click();
  await readTips();
  await expect(page.getByText("Massachusetts State House").first()).toBeVisible();
  await shot(page, "09-explore-nearby");

  // Scan a landmark (upload fallback), unlock its stamp
  await page.goto("/scan");
  await readTips();
  await shot(page, "10-scan");
  await upload(page);
  expect(await dismissRewards(page)).toContain("Massachusetts State House");
  await readTips();
  await expect(page.getByText("Landmark verified")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Information" })).toBeVisible();
  await expect(page.getByText("What Gemini saw")).toHaveCount(0);
  await shot(page, "11-scan-result");

  // Complete the journey
  await page.goto("/journey");
  await page.getByRole("button", { name: control("finish") }).click();
  expect(await dismissRewards(page)).toContain("First Ride");
  await expect(page.getByRole("heading", { name: "Journey complete" })).toBeVisible();
  await shot(page, "12-journey-complete");

  // Passport reflects everything, and the ledger adds up
  await page.getByRole("button", { name: control("passport") }).click();
  await expect(page).toHaveURL(/\/passport$/);
  await readTips();
  await expect(page.getByText("5 of 125 collected")).toBeVisible();
  await shot(page, "13-passport");
  const s = await store(page);
  const keys = s.xp.map((t: { key: string }) => t.key);
  expect(new Set(keys).size).toBe(keys.length);
  expect(keys).toEqual(expect.arrayContaining([
    "station:place-harsq", "station:place-pktrm", "landmark:state-house",
    "achievement:first-ride", "achievement:first-discovery", "achievement:red-line-explorer",
  ]));
  expect(s.events.filter((e: { t: string }) => e.t === "journey")).toHaveLength(1);
  expect(await xpTotal(page)).toBeGreaterThanOrEqual(5 * 40 + 150 + 100 + 50 + 50 + 100);
  expect(s.ai.length).toBeGreaterThanOrEqual(1); // the landmark recognition was logged
  await noSidewaysScroll(page);
  await page.getByRole("tab", { name: "Landmarks" }).click();
  await shot(page, "14-passport-landmarks");

  // Every highlight defined in lib/guide.ts found its feature on screen.
  await nav.getByRole("link", { name: "Discover" }).click();
  await readTips();
  await shot(page, "14b-discover");
  for (const scene of Object.keys(TOUR) as Scene[])
    for (const spot of TOUR[scene]) expect(tips, `tip “${spot.title}” (${scene} → data-tour="${spot.target}") was never shown`).toContain(spot.title);
  expect(Object.keys((await store(page)).tipsSeen).sort()).toEqual(Object.keys(TOUR).sort());
});

test("scanning the same landmark twice never grants a second reward", async ({ page }) => {
  await mockApis(page);
  await seed(page);
  await page.goto("/scan");
  await upload(page);
  await dismissRewards(page);
  await expect(page.getByText("Landmark verified")).toBeVisible();
  const before = await xpTotal(page);

  await page.getByRole("button", { name: "Scan another" }).click();
  await upload(page);
  await expect(page.getByText("Already in your passport")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Reward unlocked" })).toHaveCount(0);
  expect(await xpTotal(page)).toBe(before);
  expect((await store(page)).events.filter((e: { t: string }) => e.t === "landmark")).toHaveLength(1);
});

test("an uncertain or failed scan awards nothing and offers a retry", async ({ page }) => {
  let mode: "uncertain" | "down" = "uncertain";
  await mockApis(page, {
    scan: (route) =>
      mode === "down"
        ? route.fulfill({ status: 502, json: { error: "upstream", message: "Gemini could not analyse this photo. Please try again." } })
        : route.fulfill({
            json: {
              ...scanOk(),
              result: { ...scanOk().result, status: "uncertain", verification: "retry", uncertaintyReason: "The photo is too dark to make out the building." },
              validation: { passed: false, landmarkId: null, verification: null, checks: [{ name: "Model verdict", ok: false, detail: "uncertain · retry" }] },
            },
          }),
  });
  await seed(page);
  await page.goto("/scan");
  await upload(page);
  await expect(page.getByText("Not sure yet")).toBeVisible();
  await expect(page.getByText("The photo is too dark to make out the building.")).toBeVisible();
  expect(await xpTotal(page)).toBe(0);

  mode = "down";
  await page.getByRole("button", { name: "Scan another" }).click();
  await upload(page);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Gemini could not analyse this photo");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("button", { name: "Turn on camera" })).toBeVisible(); // camera is opt-in
  expect(await xpTotal(page)).toBe(0);
});

test("Bostie Guessing: a hint, a wrong pick, a pin, Gemini being down, and playing again", async ({ page }) => {
  await mockApis(page, { hint: (route) => route.fulfill({ status: 500, json: { error: "internal" } }) });
  await seed(page);
  await page.goto("/play/guess");
  await expect(page.getByTestId("xp-note")).toContainText("5 paid plays left today");
  await page.getByRole("button", { name: "Start round" }).click();
  const answers = page.getByRole("group", { name: "Answers" });

  // 1: a hint removes two wrong answers and still works when Gemini is down.
  await page.getByRole("button", { name: /Hint/ }).click();
  await expect(page.getByText("From Bostie's notes")).toBeVisible();
  await expect(answers.getByRole("button", { disabled: true })).toHaveCount(2);
  await answer(page, true);
  await expect(page.getByTestId("answer-note")).toContainText("Correct, +50 points");
  await page.getByRole("button", { name: "Next question" }).click();

  // 2: one try only. A wrong pick shows the right answer and locks the buttons.
  const right = await answer(page, false);
  await expect(page.getByTestId("answer-note")).toContainText(`It was ${right}`);
  await expect(page.getByTestId("bostie")).toHaveAttribute("data-mood", "oops");
  await expect(answers.getByRole("button", { disabled: true })).toHaveCount(4);
  await shot(page, "14-guess-wrong");
  await page.getByRole("button", { name: "Next question" }).click();

  // 3: answer on the map instead.
  await page.getByRole("button", { name: "Pin it instead" }).click();
  await expect(page.getByRole("button", { name: "Tap the map first" })).toBeDisabled();
  await page.getByRole("group", { name: "Map of Boston and the MBTA network" }).click({ position: { x: 120, y: 120 } });
  await page.getByRole("button", { name: "Lock in this pin" }).click();
  await expect(page.getByTestId("answer-note")).toContainText("from the spot");
  await expect(page.getByTestId("pin-map").getByText("Your pin")).toBeVisible(); // the map shows the pin and the real place
  await shot(page, "15-pin-result");
  await page.getByRole("button", { name: "Next question" }).click();

  for (const label of ["Next question", "See results"]) {
    await answer(page, false);
    await page.getByRole("button", { name: label }).click();
  }
  await dismissRewards(page);
  await expect(page.getByRole("heading", { name: /^[12] of 5 correct$/ })).toBeVisible();
  await expect(page.getByTestId("bostie")).toHaveAttribute("data-mood", "lose");
  const play = (await store(page)).events[0];
  expect(play).toMatchObject({ t: "play", game: "guess", won: false, hints: 1, paid: true });
  expect(await xpTotal(page)).toBe(5 * play.score);

  await page.getByRole("button", { name: "Play again" }).click();
  await expect(page.getByText("1 of 5", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Quit" }).click(); // leaving mid-round goes back to the instructions
  await expect(page.getByRole("heading", { name: "How to play" })).toBeVisible();
});

test("the daily XP limit: the sixth play of a game says it earns nothing", async ({ page }) => {
  const now = Date.now();
  await mockApis(page);
  await seed(page, { events: Array.from({ length: 5 }, (_, n) => ({ t: "play", id: `guess-${n}`, game: "guess", score: 5, won: true, hints: 0, paid: true, at: now - n * 1000 })) });
  await page.goto("/play/guess");
  await expect(page.getByTestId("xp-note")).toContainText("No XP: daily limit reached");
  await page.goto("/play/draw");
  await expect(page.getByTestId("xp-note")).toContainText("5 paid plays left today"); // the limit is per game
  await page.goto("/play/guess");
  await page.getByRole("button", { name: "Start round" }).click();
  for (const label of ["Next question", "Next question", "Next question", "Next question", "See results"]) {
    await answer(page, true);
    await page.getByRole("button", { name: label }).click();
  }
  await dismissRewards(page);
  await expect(page.getByText("No XP: daily limit reached.")).toBeVisible();
  expect((await store(page)).events.at(-1)).toMatchObject({ game: "guess", score: 5, paid: false });
});

test("Bostie Drawing: tools, an empty canvas, Gemini failing, then a scored result", async ({ page }) => {
  let calls = 0;
  await mockApis(page, {
    draw: (route) => (++calls === 1
      ? route.fulfill({ status: 502, json: { error: "judge_unavailable", message: "Bostie could not look at your drawing just now." } })
      : route.fulfill({ json: { score: 182, recognizableFeatures: ["a round dome"], missingFeatures: ["the columns"], feedback: "MOCK FEEDBACK", source: "gemini", meta: META } })),
  });
  await seed(page);
  await page.goto("/play/draw");
  await page.getByRole("button", { name: "Start drawing" }).click();
  const canvas = page.locator("canvas");
  await expect(page.getByRole("img", { name: /^Reference photo:/ }).or(page.getByTestId("draw-cues"))).toBeVisible(); // something to copy from while drawing
  const submit = page.getByRole("button", { name: /Submit drawing|Try again/ });

  await submit.click();
  await expect(page.getByRole("alert").filter({ hasText: "Draw something first" })).toBeVisible();
  expect(calls).toBe(0); // an empty canvas is never sent

  const stroke = async (from: [number, number], to: [number, number]) => {
    await canvas.scrollIntoViewIfNeeded();
    const box = (await canvas.boundingBox())!; // measured each time: the page may have scrolled
    await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 8 });
    await page.mouse.up();
  };
  const ink = () => canvas.evaluate((c: HTMLCanvasElement) => c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data.reduce((n, v, i) => n + (i % 4 === 1 && v < 200 ? 1 : 0), 0));
  await stroke([0.2, 0.7], [0.8, 0.7]);
  await page.getByRole("radio", { name: "Colour #da291c" }).click();
  await page.getByLabel("Brush size").fill("20");
  await stroke([0.5, 0.2], [0.5, 0.7]);
  const two = await ink();
  expect(two).toBeGreaterThan(500);
  await page.getByRole("button", { name: "Undo" }).click();
  expect(await ink()).toBeLessThan(two);
  await page.getByRole("button", { name: "Redo" }).click();
  expect(await ink()).toBe(two);
  await page.getByRole("button", { name: "Eraser" }).click();
  await stroke([0.2, 0.7], [0.8, 0.7]);
  expect(await ink()).toBeLessThan(two);
  await page.getByRole("button", { name: "Clear canvas" }).click();
  expect(await ink()).toBe(0);
  await submit.click();
  await expect(page.getByRole("alert").filter({ hasText: "Draw something first" })).toBeVisible(); // erased and cleared drawings count as empty

  await page.getByRole("button", { name: "Pen" }).click();
  await stroke([0.2, 0.3], [0.8, 0.8]);
  await shot(page, "26-drawing");
  await submit.click();
  await expect(page.getByRole("alert").filter({ hasText: "could not look at your drawing" })).toBeVisible(); // Gemini down: the drawing stays
  expect(await ink()).toBeGreaterThan(100);
  await page.getByRole("button", { name: "Try again" }).click();

  await dismissRewards(page);
  await expect(page.getByTestId("draw-score")).toHaveText("100%"); // the model said 182: clamped
  await expect(page.getByText("MOCK FEEDBACK")).toBeVisible();
  await expect(page.getByRole("img", { name: /^Your drawing of/ })).toBeVisible();
  await expect(page.getByText("Bostie spotted: a round dome.")).toBeVisible();
  await shot(page, "27-drawing-result");
  const state = await store(page);
  expect(state.events[0]).toMatchObject({ t: "play", game: "draw", score: 100, won: true, paid: true });
  expect(await xpTotal(page)).toBe(40);
  expect(JSON.stringify(state)).not.toContain("data:image"); // the drawing is never stored

  await page.getByRole("button", { name: "Next drawing" }).click();
  await expect(canvas).toBeVisible();
  expect(await ink()).toBe(0);
  await page.getByRole("button", { name: "Quit" }).click();
  await expect(page.getByRole("heading", { name: "How to play" })).toBeVisible();
});

test("Bostie Parkour: clear every obstacle, crash on a wrong answer, and run out of time at six seconds", async ({ page }) => {
  test.setTimeout(150_000);
  await mockApis(page);
  await seed(page);
  await page.goto("/play/parkour");
  await expect(page.getByRole("radiogroup", { name: "Difficulty" }).getByRole("radio")).toHaveText([/Easy.*3 obstacles/, /Medium.*5 obstacles/, /Hard.*7 obstacles/, /Impossible.*10 obstacles/]);
  const question = page.getByRole("group", { name: "Question" });
  const end = page.getByTestId("parkour-end");

  // Easy: three right answers finish the run.
  await page.getByRole("button", { name: "Start run" }).click();
  for (let n = 0; n < 3; n++) {
    await expect(question).toBeVisible({ timeout: 20_000 });
    if (n === 0) await shot(page, "28-parkour-question");
    await answer(page, true, question);
    await expect(question).toBeHidden(); // the buttons go at once: no second answer
  }
  await expect(end).toHaveAttribute("data-won", "true", { timeout: 20_000 });
  await dismissRewards(page);
  await expect(end).toContainText("3/3");
  await shot(page, "29-parkour-win");
  expect((await store(page)).events[0]).toMatchObject({ t: "play", game: "parkour", score: 3, won: true, level: 0 });
  expect(await xpTotal(page)).toBe(15);

  // A wrong answer ends the run.
  await page.getByRole("button", { name: "Run again" }).click();
  await expect(question).toBeVisible({ timeout: 20_000 });
  await answer(page, false, question);
  await expect(end).toHaveAttribute("data-won", "false", { timeout: 20_000 });
  await expect(end).toContainText("0/3");
  expect(await xpTotal(page)).toBe(20);

  // No answer: the question stays for six seconds, the world keeps moving, then Bostie crashes.
  await page.getByRole("radio", { name: /Medium/ }).click();
  await page.getByRole("button", { name: "Run again" }).click();
  await expect(question).toBeVisible({ timeout: 20_000 });
  const shown = Date.now();
  await expect(page.getByTestId("parkour-clock")).toHaveText(/^[3-6]$/);
  await page.waitForTimeout(4000);
  await expect(question).toBeVisible(); // still answerable after four seconds
  await expect(question).toBeHidden({ timeout: 6000 });
  const lasted = Date.now() - shown;
  expect(lasted).toBeGreaterThan(5000); // measured from when the test first saw it, a moment after it opened
  expect(lasted).toBeLessThan(7500);
  await expect(end).toHaveAttribute("data-won", "false", { timeout: 20_000 });
  await expect(end).toContainText("0/5");

  // Quitting mid-run goes back to the instructions and frees the scene.
  await page.getByRole("button", { name: "Run again" }).click();
  await expect(page.getByTestId("parkour-run")).toBeVisible();
  await page.getByRole("button", { name: "Quit" }).click();
  await expect(page.getByRole("radiogroup", { name: "Difficulty" })).toBeVisible();
});

test("live transit: real predictions are labelled live, failures degrade honestly, transfers are explained", async ({ page }) => {
  let down = false;
  await mockApis(page, {
    predictions: (route) =>
      down
        ? route.fulfill({ status: 502, json: { error: "mbta_unavailable" } })
        : route.fulfill({ json: { source: "live", fetchedAt: new Date().toISOString(), stop: "place-harsq", predictions: [{ id: "p1", route: "Red", headsign: "Ashmont", direction: 0, at: new Date(Date.now() + 4 * 60_000).toISOString(), status: null, platform: "Ashmont/Braintree", scheduled: false }] } }),
  });
  await seed(page, { demo: false });
  await page.goto("/ride");
  await expect(page.getByText("Departures")).toHaveCount(0); // Ride is for planning: departures live on the journey screen
  await expect(page.getByText("Demo data")).toHaveCount(0);
  await expect(page.getByText("1 live service alert")).toBeVisible();

  await page.getByRole("combobox", { name: "Where to?" }).fill("aqua");
  await page.getByRole("button", { name: "Go to Aquarium" }).click(); // picking a result plans the trip
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByText(/Change at/).first()).toBeVisible();
  await expect(page.getByText("Estimated", { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId("departures").getByText("Live MBTA")).toBeVisible();
  await expect(page.getByTestId("departures").getByText("Ashmont", { exact: true })).toBeVisible();
  await shot(page, "16-transfer-route");

  // Several legs, one fare: changes between subway lines are not charged again.
  const fare = page.getByRole("region", { name: "Fare" });
  await expect(fare.getByTestId("fare-total")).toHaveText("$2.40");
  await fare.getByRole("button", { name: "Fare breakdown and how to pay" }).click();
  await expect(fare.getByText("Free transfer").first()).toBeVisible();
  await fare.getByRole("radio", { name: "reduced" }).click();
  await expect(fare.getByTestId("fare-total")).toHaveText("$1.10");
  await expect(fare.getByText(/mTicket app is for Commuter Rail and ferries/)).toBeVisible();
  // Route comparison: cards carry time, changes, fare and the next live train.
  const options = page.getByRole("region", { name: "Route options" });
  await expect(options.getByText("$2.40").first()).toBeVisible();
  await expect(options.getByText(/Next train in \d+ min \(live\)/).first()).toBeVisible();
  if (await options.getByRole("radio", { name: "Cheapest" }).count()) {
    await options.getByRole("radio", { name: "Cheapest" }).click();
    await expect(options.getByText("Every subway route costs the same")).toBeVisible();
    const cards = options.getByRole("radiogroup", { name: "Routes" }).getByRole("radio");
    await cards.nth(1).click();
    await expect(cards.nth(1)).toHaveAttribute("aria-checked", "true"); // choosing another route replaces the plan
  }
  await fare.scrollIntoViewIfNeeded();
  await shot(page, "16b-fare-transfer");

  down = true;
  await page.goto("/ride");
  await expect(page.getByText("Continue journey")).toBeVisible();
  await page.goto("/journey");
  await expect(page.getByText("Live MBTA predictions are unavailable right now.")).toBeVisible();
  await expect(page.getByText("Offline", { exact: true })).toBeVisible();
});

test("navigation, layout and the device frame", async ({ page }, info) => {
  await mockApis(page);
  await seed(page);
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  for (const [tab, heading] of [["Ride", "Plan a ride"], ["Discover", "Explore Boston"], ["Passport", "Stamps"], ["Map", null]] as const) {
    await nav.getByRole("link", { name: tab, exact: true }).click();
    await expect(nav.getByRole("link", { name: tab, exact: true })).toHaveAttribute("aria-current", "page");
    if (heading) await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
    await noSidewaysScroll(page);
  }
  // Home: a real street map (tiles mocked here) with credit, and the two main actions.
  await expect(page.getByRole("group", { name: "Map of Boston and the MBTA network" })).toBeVisible();
  await expect(page.getByRole("link", { name: "OpenStreetMap" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Plan a ride" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Explore Boston" })).toBeVisible();
  await shot(page, "17-map-home");
  // Quests are reached from Discover and keep its tab lit.
  await page.goto("/scan");
  await expect(nav.getByRole("link", { name: "Discover", exact: true })).toHaveAttribute("aria-current", "page");
  await page.goto("/");

  const screen = (await page.locator("#screen").boundingBox())!;
  const viewport = page.viewportSize()!;
  if (info.project.name === "desktop") {
    // The app lives inside the phone frame, fully on screen, and stays interactive there.
    expect(screen.width).toBeLessThan(420);
    expect(screen.y).toBeGreaterThan(0);
    expect(screen.y + screen.height).toBeLessThanOrEqual(viewport.height);
    await expect(page.getByRole("heading", { name: "Judge walkthrough" })).toBeVisible();
    await shot(page, "18-desktop-frame");
    // Judge tools belong to Demo Mode: switching it off leaves a clean interface.
    await page.getByRole("button", { name: "Demo mode on" }).click();
    await expect(page.getByRole("heading", { name: "Judge walkthrough" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Gemini, live" })).toHaveCount(0);
    await expect(page.locator('[data-tour="demo-strip"]')).toHaveCount(0);
    await shot(page, "18b-desktop-clean");
    await page.getByRole("button", { name: "Demo mode", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Judge walkthrough" })).toBeVisible();
    await page.getByRole("button", { name: "Fullscreen" }).click();
    expect((await page.locator("#screen").boundingBox())!.height).toBe(viewport.height);
    await page.getByRole("button", { name: "Show phone frame" }).click();
    expect((await page.locator("#screen").boundingBox())!.width).toBeLessThan(420);
  } else {
    expect(screen.width).toBe(viewport.width);
    expect(screen.height).toBe(viewport.height);
  }
});

test("saved places and resetting the demo", async ({ page }) => {
  await mockApis(page);
  await seed(page, {
    events: [{ t: "station", id: "place-harsq", at: Date.now(), via: "demo" }],
    xp: [{ key: "station:place-harsq", amount: 40, label: "Station stamp · Harvard", at: Date.now() }],
  });
  await page.goto("/passport");
  await expect(page.getByText("1 of 125 collected")).toBeVisible();
  await page.getByRole("button", { name: /^Harvard, .*collected$/ }).click();
  await page.getByRole("button", { name: "Save this place" }).click();
  await expect(page.getByRole("button", { name: "Saved to your places" })).toBeVisible();
  expect((await store(page)).saved).toEqual(["place-harsq"]);
  await page.keyboard.press("Escape");

  await expect(page.getByRole("button", { name: "Remove Harvard from saved places" })).toBeVisible();

  await page.goto("/passport");
  await page.getByRole("button", { name: "Reset all progress" }).click();
  await page.getByRole("button", { name: "Erase everything" }).click();
  await expect(page.getByText("0 of 125 collected")).toBeVisible();
  await expect(tipDialog(page).getByRole("heading", { name: TOUR.passport[0].title })).toBeVisible(); // tips return for the next judge
  const s = await store(page);
  expect([s.events.length, s.xp.length, s.saved.length]).toEqual([0, 0, 0]);
  expect(s.onboarded).toBe(true); // straight back into the demo, no welcome screen
});

test("tips: skipping turns them off everywhere, and Guide replays the screen you are on", async ({ page }) => {
  await mockApis(page);
  await seed(page, { tipsOff: false });
  await page.goto("/");
  const tip = tipDialog(page);
  await expect(tip.getByRole("heading", { name: TOUR.home[0].title })).toBeVisible();
  await expect(tip.getByText(`1 of ${TOUR.home.length}`)).toBeVisible();
  await tip.getByRole("button", { name: TIP.next }).click();
  await expect(tip.getByRole("heading", { name: TOUR.home[1].title })).toBeVisible();
  await tip.getByRole("button", { name: TIP.back }).click();
  await expect(tip.getByRole("heading", { name: TOUR.home[0].title })).toBeVisible();

  await tip.getByRole("button", { name: TIP.skip }).click();
  await expect(tip).toHaveCount(0);
  expect((await store(page)).tipsOff).toBe(true);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Discover" }).click();
  await expect(page.getByRole("heading", { name: "Explore Boston" })).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(tip).toHaveCount(0);

  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await expect(tip.getByRole("heading", { name: TOUR.discover[0].title })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tip).toHaveCount(0);
});

test("exploring without the demo still gets tips, minus the demo-only ones", async ({ page }) => {
  await mockApis(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Start exploring" }).click();
  await page.getByRole("button", { name: "Continue" }).click(); // name is optional
  expect((await store(page)).name).toBe("Explorer");
  const shown = await finishTips(page);
  expect(shown).toEqual(TOUR.home.filter((s) => s.target !== "demo-strip").map((s) => s.title)); // no gold strip outside demo mode
  await page.getByRole("button", { name: "Tips" }).click();
  await expect(tipDialog(page)).toBeVisible();
});

test("Explore Boston: interests and budget give real destinations, directions and saving, with no quest needed", async ({ page }) => {
  await mockApis(page);
  await seed(page, { demo: false });
  await page.goto("/discover");
  await expect(page.getByRole("heading", { name: "Closest to you" })).toBeVisible();

  // Interest + budget
  await page.getByRole("button", { name: "Sports" }).click();
  await expect(page.getByRole("heading", { name: "Picked for you" })).toBeVisible();
  const first = page.locator('[data-tour="discover-results"] > li').first();
  await expect(first.getByRole("heading", { name: "Fenway Park" })).toBeVisible();
  await expect(first.getByText("Kenmore")).toBeVisible(); // nearest station, from the network data
  await expect(first.getByText(/Matches your interest in sports/)).toBeVisible();
  await shot(page, "19-discover-picks");

  await page.getByRole("radio", { name: "Free only" }).click();
  await expect(page.getByRole("heading", { name: "Fenway Park" })).toHaveCount(0); // a paid tour is out of a free budget
  await page.getByRole("radio", { name: "Any budget" }).click();

  // Save, details, directions
  await first.getByRole("button", { name: "Save Fenway Park" }).click();
  expect((await store(page)).saved).toEqual(["fenway-park"]);
  await first.getByRole("button", { name: "Fenway Park: details" }).click();
  await expect(page.getByRole("dialog", { name: "Fenway Park" }).getByText(/oldest ballpark/)).toBeVisible();
  await page.keyboard.press("Escape");
  await first.getByRole("button", { name: "Get directions" }).click();
  await expect(page).toHaveURL(/\/journey$/);
  await expect(page.getByRole("heading", { name: "Park Street to Kenmore" })).toBeVisible();
  expect((await store(page)).events).toHaveLength(0); // nothing had to be completed first
});

test("Replay intro shows the opening again and keeps progress", async ({ page }) => {
  await mockApis(page);
  await seed(page, {
    events: [{ t: "station", id: "place-harsq", at: Date.now(), via: "demo" }],
    xp: [{ key: "station:place-harsq", amount: 40, label: "Station stamp · Harvard", at: Date.now() }],
  });
  await page.goto("/passport");
  await page.getByRole("main").getByRole("button", { name: "Replay intro" }).click();

  await expect(page.getByRole("heading", { name: "Make every ride an adventure." })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0); // the app is hidden behind the opening
  await page.getByRole("button", { name: "Start exploring" }).click();
  await expect(page.getByRole("heading", { name: "What should we call you?" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("link", { name: "Explore Boston" })).toBeVisible(); // back on the map
  const s = await store(page);
  expect(s.name).toBe("Tester"); // a blank name keeps the old one
  expect([s.events.length, s.xp.length, s.onboarded]).toEqual([1, 1, true]);
});

test("Ride search: type, get suggestions inside the phone, and go", async ({ page }) => {
  await mockApis(page);
  await seed(page, { demo: false });
  await page.goto("/ride");
  await expect(page.locator("select")).toHaveCount(0); // no native menus that could spill outside the frame
  const search = page.getByRole("combobox", { name: "Where to?" });
  const results = page.getByRole("listbox", { name: "Where to? results" });
  await expect(page.getByRole("button", { name: "Change starting point" })).toContainText("Harvard");
  await expect(page.getByRole("button", { name: "Change starting point" })).toContainText("From");

  // Typing narrows to the best matches, and stays inside the phone.
  await search.fill("ken");
  await expect(results.getByRole("option")).toHaveText([/Kendall\/MIT/, /Kenmore/, /Kent Street/]);
  const screen = (await page.locator("#screen").boundingBox())!;
  const box = (await results.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(screen.x);
  expect(box.x + box.width).toBeLessThanOrEqual(screen.x + screen.width + 0.5);
  await shot(page, "20-ride-search");

  // Landmarks are destinations too: they lead to their nearest station.
  await search.fill("fenway park");
  await expect(results.getByRole("button", { name: "Go to Fenway Park, by Kenmore station" })).toBeVisible();

  // Nonsense gets a clear message; clearing returns to the shortcuts.
  await search.fill("zzzz");
  await expect(results.getByText(/Nothing matches/)).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page.getByRole("link", { name: "Choose on map" })).toBeVisible();

  // Change the starting station with the arrows button.
  await page.getByRole("button", { name: "Change starting point" }).click();
  await page.getByRole("combobox", { name: "Starting point" }).fill("south st");
  await page.getByRole("button", { name: "Choose South Station" }).click();
  await expect(page.getByRole("button", { name: "Change starting point" })).toContainText("South Station");

  // Enter picks the first result; a second Enter starts the trip.
  await search.fill("kenm");
  await search.press("Enter"); // Enter picks the first result…
  await expect(search).toHaveValue("Kenmore");
  await search.press("Enter"); // …and Enter again starts
  await expect(page).toHaveURL(/\/journey$/);
  await expect(page.getByRole("heading", { name: "South Station to Kenmore" })).toBeVisible();
});

test("Ride shortcuts: home, work and recent stations", async ({ page }) => {
  await mockApis(page);
  await seed(page, { demo: false });
  await page.goto("/ride");
  await expect(page.getByRole("heading", { name: "Popular stations" })).toBeVisible(); // nothing recent yet
  await shot(page, "21-ride");

  // Set work once, then go there in one tap.
  await page.getByRole("button", { name: "Set work" }).click();
  await page.getByRole("combobox", { name: "Your work station" }).fill("kenm");
  await page.getByRole("button", { name: "Choose Kenmore" }).click();
  expect((await store(page)).work).toBe("place-kencl");
  await page.getByRole("button", { name: "Go to Kenmore, work" }).click();
  await expect(page.getByRole("heading", { name: "Harvard to Kenmore" })).toBeVisible();

  // The trip shows up under Recent, and its menu can make it home or remove it.
  await page.getByRole("button", { name: "End journey" }).click();
  await expect(page.getByRole("heading", { name: "Recent" })).toBeVisible();
  await page.getByRole("button", { name: "More for Kenmore" }).click();
  await page.getByRole("button", { name: "Set as home" }).click();
  await expect(page.getByRole("button", { name: "Go to Kenmore, home" })).toBeVisible();
  await page.getByRole("button", { name: "More for Kenmore" }).click();
  await page.getByRole("button", { name: "Remove from recent" }).click();
  await expect(page.getByRole("heading", { name: "Popular stations" })).toBeVisible();
  expect((await store(page)).recents).toEqual([]);

  // Alerts live in the shortcuts, and the map is one tap away.
  await page.getByRole("button", { name: /Service alerts/ }).click();
  await expect(page.getByRole("dialog", { name: "Service alerts" }).getByText(/shuttle buses/)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Choose on map" }).click();
  await expect(page.getByRole("group", { name: "Map of Boston and the MBTA network" })).toBeVisible();
});

test("Explore Boston start field: type and pick", async ({ page }) => {
  await mockApis(page);
  await seed(page, { demo: false });
  await page.goto("/discover");
  const from = page.getByRole("combobox", { name: "From station" });
  await from.click();
  await expect(page.getByRole("listbox", { name: "From station suggestions" }).getByRole("option")).toHaveCount(6); // popular stations first
  await from.fill("fenw");
  await page.getByRole("option", { name: /Fenway/ }).click();
  await expect(from).toHaveValue("Fenway");
  await expect(page.locator('[data-tour="discover-results"] > li').first().getByText(/from Fenway/)).toBeVisible(); // results re-rank from the new start
  await from.fill("zzzz");
  await expect(page.getByText(/No station matches/)).toBeVisible();
  await from.press("Escape");
  await expect(from).toHaveValue("Fenway");
});

test("Ride search finds any address or place and plans the best MBTA trip there", async ({ page }) => {
  let down = false;
  await mockApis(page, {
    places: (route) => {
      if (down) return route.fulfill({ status: 502, json: { error: "places_unavailable" } });
      const q = (new URL(route.request().url()).searchParams.get("q") ?? "").toLowerCase();
      return route.fulfill({ json: { provider: "openstreetmap", places: PLACE_HITS.filter((p) => q.includes(p.match)).map((p) => p.hit) } });
    },
  });
  await seed(page, { demo: false });
  await page.goto("/ride");
  const search = page.getByRole("combobox", { name: "Where to?" });
  const results = page.getByRole("listbox", { name: "Where to? results" });

  // A place that is not a station: found by the location search, routed by the MBTA planner.
  await search.fill("museum of fine");
  const mfa = results.getByRole("button", { name: /Go to Museum of Fine Arts, 465 Huntington Avenue/ });
  await expect(mfa).toBeVisible();
  await expect(mfa.getByText(/\d+ min: train to [A-Z].*, then a \d+ min walk/)).toBeVisible(); // door to door, computed from the network
  await expect(page.getByText("Places from OpenStreetMap.")).toBeVisible();
  await shot(page, "22-ride-places");
  await mfa.click();
  // The place stays in the box, the list closes, and nothing starts until Start is tapped.
  await expect(search).toHaveValue("Museum of Fine Arts");
  await expect(results).toHaveCount(0);
  await expect(page).toHaveURL(/\/ride$/);
  await shot(page, "22c-ride-start");
  await page.getByRole("button", { name: "Start", exact: true }).click();

  // The journey is to the place: train to the best station, then the walk.
  await expect(page).toHaveURL(/\/journey$/);
  await expect(page.getByRole("heading", { name: "Harvard to Museum of Fine Arts" })).toBeVisible();
  await expect(page.getByText(/then a \d+ min walk from/)).toBeVisible();
  await expect(page.getByText("Walk to Museum of Fine Arts").first()).toBeVisible();
  const parts = page.getByTestId("trip-breakdown").first();
  await expect(parts.getByText(/Change at /)).toBeVisible(); // train, change, train, walk: each with its minutes
  await expect(parts.getByText("Walk to Museum of Fine Arts")).toBeVisible();
  await expect(page.getByRole("region", { name: "Fare" }).getByTestId("fare-total")).toHaveText("$2.40");
  await shot(page, "22b-journey-to-place");
  const j = (await store(page)).journey;
  expect(j.walkTo).toMatchObject({ name: "Museum of Fine Arts" });
  expect(j.plan.from).toBe("place-harsq");
  await page.getByRole("button", { name: "End journey" }).click();

  // An address works the same way.
  await search.fill("1217 beacon");
  await results.getByRole("button", { name: /Go to 1217 Beacon Street/ }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Harvard to 1217 Beacon Street" })).toBeVisible();
  await page.getByRole("button", { name: "End journey" }).click();

  // Too far from any station: said plainly, not routed.
  await search.fill("nowhere farm");
  await expect(results.getByText(/Nothing matches/)).toBeVisible();

  // Search service down: stations and landmarks still work.
  down = true;
  await search.fill("park street ch");
  await expect(results.getByText("Address search is unavailable right now.")).toBeVisible();
  await expect(results.getByRole("button", { name: "Go to Park Street Church, by Park Street station" })).toBeVisible();
});

test("automatic tracking: the demo ride plays itself, and you can switch to manual", async ({ page }) => {
  await mockApis(page);
  await seed(page);
  await page.goto("/ride");
  await page.getByRole("button", { name: "Go to Park Street" }).click();
  await expect(page.getByRole("radio", { name: /Manual/ })).toHaveAttribute("aria-checked", "true"); // manual is the default
  await page.getByRole("radio", { name: /Automatic/ }).click();
  await shot(page, "23-tracking-choice");
  await page.getByRole("button", { name: "Start journey" }).click();
  await expect(page.getByTestId("tracking-status")).toContainText("the demo ride is playing by itself");

  // No taps: it walks, waits, boards and rides. Rewards pause it until dismissed.
  const deadline = Date.now() + 70_000;
  while (Date.now() < deadline && !(await page.getByRole("heading", { name: "You have arrived at Park Street" }).isVisible())) {
    await dismissRewards(page);
    await page.waitForTimeout(500);
  }
  await expect(page.getByRole("heading", { name: "You have arrived at Park Street" })).toBeVisible();
  expect((await store(page)).events.filter((e: { t: string }) => e.t === "station")).toHaveLength(5);

  // Manual control is always one tap away.
  await dismissRewards(page);
  await page.getByRole("button", { name: "Go manual" }).click();
  await expect(page.getByTestId("tracking-status")).toContainText("Manual mode");
  await page.getByRole("button", { name: "Explore nearby" }).click();
  await expect(page.getByRole("heading", { name: "Around Park Street" })).toBeVisible();
});

test("automatic tracking follows real location, and a blocked permission falls back to manual", async ({ page, context }) => {
  await mockApis(page);
  await seed(page, { demo: false });
  const at = { harvard: { latitude: 42.373362, longitude: -71.118956 }, central: { latitude: 42.365486, longitude: -71.103802 }, between: { latitude: 42.3698, longitude: -71.1115 } };
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ ...at.between, accuracy: 20 });
  await page.goto("/ride");
  await page.getByRole("button", { name: "Change starting point" }).click();
  await page.getByRole("combobox", { name: "Starting point" }).fill("harvard");
  await page.getByRole("button", { name: "Choose Harvard", exact: true }).click();
  await page.getByRole("button", { name: "Go to Park Street" }).click();
  await page.getByRole("radio", { name: /Automatic/ }).click();
  await page.getByRole("button", { name: "Start journey" }).click();
  await expect(page.getByTestId("tracking-status")).toContainText("following your location");
  await expect(page.getByRole("heading", { name: "Walk to Harvard" })).toBeVisible(); // not there yet

  await context.setGeolocation({ ...at.harvard, accuracy: 15 });
  await expect(page.getByRole("heading", { name: "Wait for the Red Line" })).toBeVisible(); // reached the station

  await context.setGeolocation({ ...at.central, accuracy: 15 });
  await dismissRewards(page);
  await expect(page.getByRole("heading", { name: "Next stop: Kendall/MIT" })).toBeVisible({ timeout: 15_000 }); // boarded, and Central was reached
  await dismissRewards(page);
  const stations = (await store(page)).events.filter((e: { t: string }) => e.t === "station").map((e: { id: string }) => e.id);
  expect(stations).toEqual(["place-harsq", "place-cntsq"]);
  expect((await store(page)).trail.length, "Automatic mode records the route for the heat map").toBeGreaterThanOrEqual(2);

  // Permission refused: the journey quietly becomes manual instead of getting stuck.
  await page.getByRole("button", { name: "End journey" }).click();
  await context.clearPermissions();
  await context.setGeolocation(null);
  await page.getByRole("button", { name: "Go to Park Street" }).click();
  await page.getByRole("radio", { name: /Automatic/ }).click();
  await page.getByRole("button", { name: "Start journey" }).click();
  await expect(page.getByTestId("tracking-status")).toContainText(/manual mode/i, { timeout: 30_000 });
  await page.getByRole("button", { name: /I am at the station/ }).click();
  await expect(page.getByRole("heading", { name: "Wait for the Red Line" })).toBeVisible();
});

/** Replaces the phone's share menu with a recorder, so a test can see what would be shared. */
const stubShare = (page: Page) =>
  page.addInitScript(() => {
    const w = window as unknown as { shared: unknown[] };
    w.shared = [];
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (d: ShareData) => void w.shared.push({ text: d.text, files: (d.files ?? []).map((f) => ({ name: f.name, type: f.type, size: f.size })) }),
    });
  });
const noShare = (page: Page) =>
  page.addInitScript(() => {
    for (const k of ["share", "canShare"]) Object.defineProperty(navigator, k, { configurable: true, value: undefined });
  });
const keep = (name: string) => `screenshots/${test.info().project.name}/${name}`;

test("sharing a discovery: the picture goes to the phone's share menu, and the photo is not kept", async ({ page }) => {
  await mockApis(page);
  await stubShare(page);
  await seed(page);
  await page.goto("/scan");
  await upload(page);
  await dismissRewards(page);
  await page.getByRole("button", { name: "Share this discovery" }).click();
  const sheet = page.getByRole("dialog", { name: "Share this discovery" });
  await expect(sheet.getByRole("img", { name: /Preview/ })).toBeVisible();
  await shot(page, "20-share-discovery");
  await sheet.getByRole("button", { name: "Share", exact: true }).click();
  await expect(sheet.getByText("Shared.")).toBeVisible();
  const shared = await page.evaluate(() => (window as unknown as { shared: { text: string; files: { name: string; type: string; size: number }[] }[] }).shared);
  expect(shared).toHaveLength(1);
  expect(shared[0].text).toContain("Massachusetts State House");
  expect(shared[0].files).toHaveLength(1);
  expect(shared[0].files[0]).toMatchObject({ name: "bostie-state-house.png", type: "image/png" });
  expect(shared[0].files[0].size).toBeGreaterThan(5000);
  expect(JSON.stringify(await store(page))).not.toContain("data:image"); // the photo never reaches storage
});

test("sharing without a share menu saves the picture instead", async ({ page }) => {
  await mockApis(page);
  await noShare(page);
  await seed(page);
  await page.goto("/scan");
  await upload(page);
  await dismissRewards(page);
  await page.getByRole("button", { name: "Share this discovery" }).click();
  const sheet = page.getByRole("dialog", { name: "Share this discovery" });
  await expect(sheet.getByRole("img", { name: /Preview/ })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Share", exact: true })).toHaveCount(0);
  const [download] = await Promise.all([page.waitForEvent("download"), sheet.getByRole("button", { name: "Save image" }).click()]);
  expect(download.suggestedFilename()).toBe("bostie-state-house.png");
  await download.saveAs(keep("share-discovery.png"));
});

test("My day: today's places, the heat map, sharing the day and clearing location history", async ({ page }) => {
  const now = Date.now();
  const yesterday = now - 86_400_000;
  const walk = (i: number, at: number) => ({ lat: 42.3564 + i * 0.0004, lng: -71.0624 + i * 0.0003, at });
  await mockApis(page);
  await noShare(page);
  await seed(page, {
    events: [
      { t: "station", id: "place-alfcl", at: yesterday, via: "ride" },
      { t: "station", id: "place-harsq", at: now - 3000, via: "ride" },
      { t: "station", id: "place-pktrm", at: now - 2000, via: "ride" },
      { t: "landmark", id: "state-house", at: now - 1000, verification: "simulated" },
      { t: "journey", id: "j1", from: "place-harsq", to: "place-pktrm", stops: 4, lines: ["Red"], minutes: 9, km: 4.2, demo: false, at: now - 1500 },
    ],
    xp: [{ key: "station:place-harsq", amount: 25, at: now - 3000, label: "Station" }],
    trail: Array.from({ length: 12 }, (_, i) => walk(i, now - (12 - i) * 20_000)),
  });
  await page.goto("/passport");
  const day = page.getByRole("region", { name: "My day" });
  await expect(day.getByRole("list", { name: "Places today" })).toContainText("Park Street");
  await expect(day.getByRole("list", { name: "Places today" })).toContainText("Massachusetts State House");
  await expect(day.getByRole("list", { name: "Places today" })).not.toContainText("Alewife");

  const heat = page.getByTestId("heat-map");
  const all = Number(await heat.getAttribute("data-points"));
  await day.getByRole("radio", { name: "Today" }).click();
  await expect(heat).not.toHaveAttribute("data-points", String(all)); // yesterday's Alewife drops out
  expect(Number(await heat.getAttribute("data-points"))).toBe(all - 1);
  await heat.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await shot(page, "21-my-day");

  await day.getByRole("button", { name: "Share my day" }).click();
  const sheet = page.getByRole("dialog", { name: "Share my day" });
  await expect(sheet.getByText(/exact route you travelled/)).toBeVisible(); // the rider is told the route is in the picture
  await expect(sheet.getByRole("img", { name: /Preview/ })).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), sheet.getByRole("button", { name: "Save image" }).click()]);
  await download.saveAs(keep("share-day.png"));
  await sheet.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Clear history" }).click();
  expect((await store(page)).trail).toEqual([]);
  await expect(page.getByText("Nothing saved yet.")).toBeVisible();
});

test("directions and departures: official destinations, only trains that reach the stop, platform, and timetable times", async ({ page }) => {
  const at = (min: number) => new Date(Date.now() + min * 60_000).toISOString();
  let scheduled = false;
  const train = (id: string, headsign: string, min: number) => ({ id, route: "Red", headsign, direction: 0, at: at(min), status: null, platform: "Ashmont/Braintree", scheduled });
  await mockApis(page, {
    predictions: (route) => route.fulfill({ json: { source: scheduled ? "scheduled" : "live", fetchedAt: at(0), stop: "place-pktrm", predictions: [train("b", "Braintree", 2), train("a", "Ashmont", 6)] } }),
  });
  await seed(page, { demo: false });
  await page.goto("/ride");
  await page.getByRole("button", { name: "Change starting point" }).click();
  await page.getByRole("combobox", { name: "Starting point" }).fill("park");
  await page.getByRole("button", { name: "Choose Park Street", exact: true }).click();
  await page.getByRole("combobox", { name: "Where to?" }).fill("shawmut"); // on the Ashmont branch only
  await page.getByRole("button", { name: "Go to Shawmut" }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();

  const steps = page.getByRole("list", { name: "Step by step" });
  await expect(steps.getByText("Board the Red Line")).toBeVisible();
  await expect(steps.getByText("Southbound platform, toward Ashmont.")).toBeVisible(); // not "Ashmont/Braintree"
  await expect(steps.getByText(/Ride \d+ stops to Shawmut/)).toBeVisible();

  const departures = page.getByTestId("departures");
  await expect(departures.getByText("Ashmont", { exact: true })).toBeVisible();
  await expect(departures.getByText("Braintree", { exact: true })).toHaveCount(0); // the sooner train does not go to Shawmut
  await expect(departures.getByText("Live MBTA")).toBeVisible();
  await expect(departures.getByText("Platform:")).toContainText("Ashmont/Braintree");
  await expect(page.getByText(/Next train in 6 min \(live\)/)).toBeVisible();
  await steps.scrollIntoViewIfNeeded();
  await shot(page, "22-steps");

  // No live predictions: the timetable is shown, and says so.
  scheduled = true;
  await page.reload();
  await expect(page.getByTestId("departures").getByText("Scheduled", { exact: true })).toBeVisible();
  await expect(page.getByTestId("departures").getByText("Live MBTA")).toHaveCount(0);
  await expect(page.getByText(/Timetable times/)).toBeVisible();
  await expect(page.getByText(/Next train in 6 min \(scheduled\)/)).toBeVisible();

  // During the ride the same list stays one tap away, with the current step marked.
  await page.getByRole("button", { name: "Start journey" }).click();
  await page.getByRole("button", { name: /I am at the station/ }).click();
  await expect(page.getByText("Southbound platform. Take any train toward Ashmont.")).toBeVisible();
  await page.getByText("All steps for this trip").click();
  await expect(page.getByTestId("all-steps").locator('[aria-current="step"]')).toContainText("Board the Red Line");
});

test("Green Line trunk trips accept every branch that goes there", async ({ page }) => {
  await mockApis(page);
  await seed(page); // demo departures
  await page.goto("/ride");
  await page.getByRole("button", { name: "Change starting point" }).click();
  await page.getByRole("combobox", { name: "Starting point" }).fill("park");
  await page.getByRole("button", { name: "Choose Park Street", exact: true }).click();
  await page.getByRole("combobox", { name: "Where to?" }).fill("kenmore");
  await page.getByRole("button", { name: "Go to Kenmore" }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("list", { name: "Step by step" }).getByText("Board the Green Line B, C or D")).toBeVisible();
  await expect(page.getByText("Westbound platform, toward Boston College, Cleveland Circle or Riverside.")).toBeVisible();
});

test("Google alternatives: a subway route can be chosen, a bus route is information only", async ({ page }) => {
  const stop = (id: string) => ({ name: id, lat: 0, lng: 0 });
  const H = { name: "Harvard", lat: 42.373362, lng: -71.118956 }, P = { name: "Park Street", lat: 42.356395, lng: -71.062424 };
  const ride = (over: object) => ({ kind: "transit", minutes: 12, vehicle: "SUBWAY", line: "Red Line", lineName: "Red Line", color: "#DA291C", headsign: "Ashmont", stops: 4, from: H, to: P, ...over });
  await mockApis(page, {
    routes: (route) => route.fulfill({ json: { provider: "google", routes: [
      { minutes: 14, steps: [ride({})] }, // the same trip Bostie already offers: not repeated
      { minutes: 31, steps: [{ kind: "walk", minutes: 3, metres: 200 }, ride({ vehicle: "BUS", line: "1", lineName: "Harvard - Nubian", headsign: "Nubian", stops: 9, from: stop("Mass Ave @ Holyoke St"), to: stop("Mass Ave @ Beacon St") }), { kind: "walk", minutes: 9, metres: 700 }] },
      { minutes: 40, steps: [ride({ vehicle: "COMMUTER_TRAIN", line: "Fitchburg Line", lineName: "Fitchburg Line", from: stop("Porter"), to: stop("North Station") })] },
    ] } }),
  });
  await seed(page);
  await page.goto("/ride");
  await page.getByRole("button", { name: "Go to Park Street" }).click();
  const options = page.getByRole("region", { name: "Route options" });
  const cards = options.getByTestId("google-route");
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText("1 toward Nubian");
  await expect(cards.first()).toContainText("$1.70"); // the published bus fare, not Google's
  await expect(cards.first()).toContainText("31 min");
  await expect(cards.nth(1)).toContainText("Unavailable"); // Commuter Rail fare needs zones we do not have: never guessed
  await expect(cards.first().getByRole("link", { name: /Open in Google Maps/ })).toHaveAttribute("href", /travelmode=transit/);
  await expect(cards.first().getByRole("radio")).toHaveCount(0); // cannot be started as a guided journey
  await expect(options.getByText("From Google")).toHaveCount(2); // the duplicate subway route was dropped
  await cards.first().scrollIntoViewIfNeeded();
  await shot(page, "23-google-routes");
});

test("Ride search: Enter with nothing matching explains instead of doing nothing", async ({ page }) => {
  await mockApis(page);
  await seed(page);
  await page.goto("/ride");
  const box = page.getByRole("combobox", { name: "Where to?" });
  await box.fill("zzzz");
  await expect(page.getByText(/Nothing matches/)).toBeVisible();
  await box.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "Pick a station or place from the list" })).toBeVisible();
  await expect(page).toHaveURL(/\/ride/);
});

test("Ride: From and To fields, and starting from your current location", async ({ page, context }) => {
  await mockApis(page);
  await seed(page, { demo: false });
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 42.365486, longitude: -71.103802, accuracy: 20 }); // Central
  await page.goto("/ride");
  const from = page.getByRole("button", { name: "Change starting point" });

  // Pick a starting station by hand.
  await from.click();
  await page.getByRole("combobox", { name: "Starting point" }).fill("kendall");
  await page.getByRole("button", { name: "Choose Kendall/MIT", exact: true }).click();
  await expect(from).toContainText("Kendall/MIT");

  // Then switch to wherever you are.
  await from.click();
  const here = page.getByRole("option", { name: /Current location/ });
  await expect(here).toBeVisible();
  await shot(page, "24-ride-from");
  await here.getByRole("button").click();
  await expect(from).toContainText("Current location");
  await expect(page.getByTestId("ride-from-note")).toContainText("Nearest station: Central");

  await page.getByRole("combobox", { name: "Where to?" }).fill("park");
  await page.getByRole("button", { name: "Go to Park Street", exact: true }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Central to Park Street" })).toBeVisible();
});

test("Ride: a trip can start from any address or place, not only a station", async ({ page }) => {
  await mockApis(page);
  await seed(page, { demo: false });
  await page.goto("/ride");
  const from = page.getByRole("button", { name: "Change starting point" });
  await from.click();
  await page.getByRole("combobox", { name: "Starting point" }).fill("1217 beacon");
  const hit = page.getByRole("button", { name: /Start at 1217 Beacon Street/ });
  await expect(hit).toContainText(/min walk .* to .+ station/); // says which station the trip boards at
  await shot(page, "25-from-address");
  await hit.click();
  await expect(from).toContainText("1217 Beacon Street");
  await expect(page.getByTestId("ride-from-note")).toContainText(/Starts at .+, a \d+ min walk/);

  await page.getByRole("combobox", { name: "Where to?" }).fill("park");
  await page.getByRole("button", { name: "Go to Park Street", exact: true }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("heading", { name: "1217 Beacon Street to Park Street" })).toBeVisible();
  const steps = page.getByRole("list", { name: "Step by step" });
  await expect(steps.getByRole("listitem").first()).toContainText(/Walk to .+From 1217 Beacon Street\./);

  // A landmark works as a start too.
  await page.getByRole("button", { name: "End journey" }).click();
  await page.getByRole("button", { name: "Change starting point" }).click();
  await page.getByRole("combobox", { name: "Starting point" }).fill("state house");
  await page.getByRole("button", { name: /Start at Massachusetts State House/ }).click();
  await expect(page.getByRole("button", { name: "Change starting point" })).toContainText("Massachusetts State House");
});

/** Stands in for the phone's notifications and makes the page believe it is in the background. */
const stubNotifications = (page: Page, permission: "granted" | "denied" = "granted") =>
  page.addInitScript((perm) => {
    const w = window as unknown as { notes: { title: string; body?: string }[]; background: boolean };
    w.notes = [];
    w.background = false;
    class FakeNotification {
      static permission = perm;
      static requestPermission = async () => perm;
      constructor(title: string, options?: NotificationOptions) {
        w.notes.push({ title, body: options?.body });
      }
    }
    Object.defineProperty(window, "Notification", { configurable: true, writable: true, value: FakeNotification });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (w.background ? "hidden" : "visible") });
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register: async () => undefined, getRegistration: async () => undefined } });
  }, permission);
const notes = (page: Page) => page.evaluate(() => (window as unknown as { notes: { title: string; body?: string }[] }).notes);

test("get-off alerts in Manual mode: games on the train, a warning when the stop is next and on arriving", async ({ page }) => {
  await mockApis(page);
  await stubNotifications(page);
  await seed(page);
  await page.goto("/ride");
  await page.getByRole("combobox", { name: "Where to?" }).fill("central");
  await page.getByRole("button", { name: "Go to Central", exact: true }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const alerts = page.getByRole("switch", { name: /get-off alerts/i });
  await expect(alerts).toHaveAttribute("aria-checked", "false");
  await alerts.click();
  await expect(alerts).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText(/On: you get a phone notification/)).toBeVisible();

  await page.getByRole("button", { name: "Start journey" }).click();
  await page.getByRole("button", { name: /I am at the station/ }).click();
  await page.getByRole("button", { name: "My train is here" }).click();
  await dismissRewards(page);
  await page.evaluate(() => ((window as unknown as { background: boolean }).background = true)); // the rider switches to another app
  await page.getByRole("button", { name: "I am on board" }).click();

  // One stop to go: the warning comes at once, in the app and as a notification.
  const banner = page.getByTestId("getoff-alert");
  await expect(banner).toContainText("Next stop: Central");
  expect(await notes(page)).toEqual([{ title: "Next stop: Central", body: "Get ready to get off." }]);
  await expect(page.getByRole("region", { name: "Play while you ride" }).getByRole("link")).toHaveCount(3); // games are suggested on the train too
  await shot(page, "30-getoff-alert");
  await banner.getByRole("button", { name: "Dismiss alert" }).click();
  await expect(banner).toHaveCount(0);

  await page.getByRole("button", { name: "Arrived at Central" }).click();
  await dismissRewards(page);
  await expect(banner).toContainText("This is Central");
  expect((await notes(page)).map((n) => n.title)).toEqual(["Next stop: Central", "This is Central"]);
});

test("get-off alerts in Automatic mode reach the rider inside a game, and stay in the app when notifications are blocked", async ({ page }) => {
  test.setTimeout(150_000);
  await mockApis(page);
  await stubNotifications(page, "denied");
  await seed(page);
  await page.goto("/ride");
  await page.getByRole("button", { name: "Go to Park Street" }).click();
  await page.getByRole("switch", { name: /get-off alerts/i }).click();
  await expect(page.getByText(/Notifications are blocked for this site/)).toBeVisible(); // says why, and that alerts still show in the app
  await expect(page.getByRole("switch", { name: /get-off alerts/i })).toHaveAttribute("aria-checked", "false");
  await page.getByRole("radio", { name: /Automatic/ }).click();
  await page.getByRole("button", { name: "Start journey" }).click();

  // Off to play while the ride carries on by itself.
  await page.getByRole("link", { name: "Discover" }).click();
  await page.goto("/play/guess");
  await page.evaluate(() => ((window as unknown as { background: boolean }).background = true));
  const banner = page.getByTestId("getoff-alert");
  await expect(async () => {
    await dismissRewards(page); // station stamps pause the demo ride until they are closed
    await expect(banner).toContainText("Next stop: Park Street", { timeout: 1000 });
  }).toPass({ timeout: 90_000 });
  await expect(page.getByRole("heading", { name: "How to play" })).toBeVisible(); // still on the game screen
  expect(await notes(page)).toEqual([]); // blocked: nothing is sent outside the app
});
