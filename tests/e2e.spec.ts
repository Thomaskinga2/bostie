// End-to-end flows with deterministic mocked APIs (no Gemini, MBTA or Wikimedia traffic).
// Runs twice: at phone size, and at desktop size inside the iPhone demo frame.
import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { guideStep, TIP, TOUR, type GuideStepId, type Scene } from "../src/lib/guide";

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

type Mocks = Partial<Record<"scan" | "guess" | "hint" | "debrief" | "predictions" | "alerts", (route: Route) => unknown>>;

async function mockApis(page: Page, over: Mocks = {}) {
  const json = (body: unknown, status = 200) => (route: Route) => route.fulfill({ status, json: body });
  await page.route("**/tile.openstreetmap.org/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  await page.route("**/upload.wikimedia.org/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: PNG, headers: { "access-control-allow-origin": "*" } }));
  await page.route("**/api/mbta/predictions**", over.predictions ?? json({
    source: "live", fetchedAt: new Date().toISOString(), stop: "place-harsq",
    predictions: [{ id: "p1", route: "Red", headsign: "Ashmont", direction: 0, at: new Date(Date.now() + 4 * 60_000).toISOString(), status: null }],
  }));
  await page.route("**/api/mbta/alerts", over.alerts ?? json({
    source: "live", fetchedAt: new Date().toISOString(),
    alerts: [{ id: "a1", header: "Red Line: shuttle buses replace service this weekend.", effect: "SHUTTLE", severity: 7, routes: ["Red"], url: null }],
  }));
  await page.route("**/api/scan", over.scan ?? json(scanOk()));
  await page.route("**/api/game/guess", over.guess ?? json({
    verdict: "correct", resolved: { id: "x", name: "The answer" }, resolvedBy: "gemini", km: 0, feedback: "Spot on.",
    output: { resolvedId: "x", interpretation: "the answer", feedback: "Spot on." }, meta: { ...META, feature: "Guess Boston · answer judge" },
  }));
  await page.route("**/api/game/hint", over.hint ?? json({ hint: "It overlooks the oldest public park in America.", angle: "geography", source: "gemini", output: {}, meta: META }));
  await page.route("**/api/game/debrief", over.debrief ?? json({
    debrief: { tells: "MOCK TELLS", history: "MOCK HISTORY", transit: "MOCK TRANSIT", coaching: "MOCK COACHING", nextPlaceId: "faneuil-hall", nextReason: "A market hall next." },
    next: { placeId: "faneuil-hall", reason: "A market hall next.", tier: 2, chosenBy: "gemini" },
    meta: { ...META, feature: "Guess Boston · debrief + next round" },
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
  await expect(page.getByText("Demo data").first()).toBeVisible(); // simulated arrivals are labelled
  await shot(page, "02b-ride");
  await page.getByRole("button", { name: control("plan") }).click();
  await expect(page).toHaveURL(/\/journey$/);
  await readTips();
  await expect(page.getByRole("heading", { name: "Harvard to Park Street" })).toBeVisible();
  await expect(page.getByText("4 stops, about")).toBeVisible();
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
  await page.getByRole("button", { name: control("begin", 0) }).click();
  await page.getByRole("button", { name: control("begin", 1) }).click();
  await readTips();
  await expect(page.getByRole("heading", { name: "Wait for the Red Line" })).toBeVisible();
  await shot(page, "04-waiting");

  // Guess Boston while waiting
  await page.getByRole("main").getByRole("link", { name: /Play Guess Boston while you wait/ }).click();
  await readTips();
  await page.getByRole("button", { name: control("play") }).click();
  await expect(tipDialog(page).getByRole("heading", { name: TOUR["play-round"][0].title })).toBeVisible();
  await tipDialog(page).getByRole("button", { name: TIP.next }).click();
  await expect(tipDialog(page).getByRole("heading", { name: TOUR["play-round"][1].title })).toBeVisible();
  await page.waitForTimeout(300);
  await shot(page, "05b-tip-round");
  tips.push(TOUR["play-round"][0].title);
  await readTips();
  await expect(page.getByRole("heading", { name: "Where is this?" })).toBeVisible();
  await shot(page, "05-round");
  await page.getByLabel("Your guess").fill("that gold dome building by the common");
  await page.getByRole("button", { name: "Submit guess" }).click();
  expect(await dismissRewards(page)).toContain("Sharp Eye");
  await readTips();
  await expect(page.getByText("MOCK COACHING")).toBeVisible();
  await expect(page.getByText("points", { exact: true })).toBeVisible();
  await shot(page, "06-round-result");
  expect((await store(page)).events.filter((e: { t: string }) => e.t === "round")).toHaveLength(1);

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
  await expect(page.getByText("large gilded gold dome")).toBeVisible();
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
  expect(s.ai.length).toBeGreaterThanOrEqual(3); // judge, debrief, recognition were all logged
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

test("Guess Boston: hints, wrong guesses, reveal, and Gemini being down", async ({ page }) => {
  await mockApis(page, {
    guess: (route) => route.fulfill({ json: { verdict: "close", resolved: { id: "park-street-church", name: "Park Street Church" }, resolvedBy: "gemini", km: 0.3, feedback: "Right part of town.", output: {}, meta: META } }),
    debrief: (route) => route.fulfill({ status: 500, json: { error: "internal" } }),
  });
  await seed(page);
  await page.goto("/play");
  await page.getByRole("radio", { name: /Landmarks/ }).click();
  await page.getByRole("button", { name: "Start round" }).click();

  await page.getByRole("button", { name: /Hint \(3 left\)/ }).click();
  await expect(page.getByText("It overlooks the oldest public park in America.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Hint \(2 left\)/ })).toBeVisible();

  for (let i = 0; i < 3; i++) {
    await page.getByLabel("Your guess").fill(`wrong guess ${i}`);
    await page.getByRole("button", { name: "Submit guess" }).click();
    if (i < 2) await expect(page.getByText("Understood as Park Street Church")).toHaveCount(i + 1);
  }
  await dismissRewards(page);
  await expect(page.getByText("Not this time. It was")).toBeVisible();
  await expect(page.getByText("Gemini is unreachable, so this is Bostie's reference note.")).toBeVisible();
  const round = (await store(page)).events[0];
  expect(round).toMatchObject({ t: "round", correct: false, score: 0, hints: 1 });
  expect(await xpTotal(page)).toBe(5); // participation XP only
  await page.getByRole("button", { name: "Next round" }).click(); // falls back to a random pick
  await expect(page.getByRole("heading", { name: "Where is this?" })).toBeVisible();
});

test("pin drop mode scores by distance on the map", async ({ page }) => {
  await mockApis(page);
  await seed(page);
  await page.goto("/play");
  await page.getByRole("radio", { name: /Pin Drop/ }).click();
  await page.getByRole("button", { name: "Start round" }).click();
  await expect(page.getByRole("button", { name: "Tap the map first" })).toBeDisabled();
  const map = page.getByRole("group", { name: "Map of Boston and the MBTA network" });
  await map.click({ position: { x: 120, y: 120 } }); // scrolls the map into view first
  await page.getByRole("button", { name: "Lock in this pin" }).click();
  await dismissRewards(page);
  await expect(page.getByText("points", { exact: true })).toBeVisible();
  const round = (await store(page)).events[0];
  expect(round.t).toBe("round");
  expect(round.score).toBeGreaterThanOrEqual(0);
  await shot(page, "15-pin-result");
});

test("live transit: real predictions are labelled live, failures degrade honestly, transfers are explained", async ({ page }) => {
  let down = false;
  await mockApis(page, {
    predictions: (route) =>
      down
        ? route.fulfill({ status: 502, json: { error: "mbta_unavailable" } })
        : route.fulfill({ json: { source: "live", fetchedAt: new Date().toISOString(), stop: "place-harsq", predictions: [{ id: "p1", route: "Red", headsign: "Ashmont", direction: 0, at: new Date(Date.now() + 4 * 60_000).toISOString(), status: null }] } }),
  });
  await seed(page, { demo: false });
  await page.goto("/ride");
  await expect(page.getByText("Live MBTA", { exact: true }).first()).toBeVisible();
  await expect(page.locator("li", { hasText: "Ashmont" }).first()).toBeVisible();
  await expect(page.getByText("Demo data")).toHaveCount(0);
  await expect(page.getByText("1 live service alert")).toBeVisible();

  await page.getByRole("combobox", { name: "Where to?" }).fill("aqua");
  await page.getByRole("button", { name: "Go to Aquarium" }).click(); // picking a result plans the trip
  await expect(page.getByText(/Change at/).first()).toBeVisible();
  await expect(page.getByText("Estimated", { exact: true }).first()).toBeVisible();
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
  await expect(page.getByText("Journey in progress").or(page.getByText("Continue journey")).first()).toBeVisible();
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
  await expect(page.getByText("From Harvard")).toBeVisible();

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
  await page.getByRole("button", { name: "Change starting station" }).click();
  await page.getByRole("combobox", { name: "Starting station" }).fill("south st");
  await page.getByRole("button", { name: "Choose South Station" }).click();
  await expect(page.getByText("From South Station")).toBeVisible();

  // Enter takes the first result and plans the trip.
  await search.fill("kenm");
  await search.press("Enter");
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
