// End-to-end flows with deterministic mocked APIs (no Gemini, MBTA or Wikimedia traffic).
// Runs twice: at phone size, and at desktop size inside the iPhone demo frame.
import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdirSync } from "node:fs";

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
  }, { onboarded: true, demo: true, name: "Tester", events: [], xp: [], achievements: {}, challenges: {}, saved: [], journey: null, ai: [], guestId: "t", ...state });
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
  await shot(page, "01-welcome");
  await page.getByLabel("What should we call you?").fill("Judge");
  await page.getByRole("button", { name: "Start the guided demo" }).click();
  await expect(page.getByRole("heading", { name: "Judge", exact: true })).toBeVisible();
  await expect(page.getByText("Demo data").first()).toBeVisible(); // simulated arrivals are labelled
  await shot(page, "02-home");

  // Plan Harvard → Park Street
  await page.getByRole("button", { name: "Find route" }).click();
  await expect(page).toHaveURL(/\/journey$/);
  await expect(page.getByRole("heading", { name: "Harvard to Park Street" })).toBeVisible();
  await expect(page.getByText("4 stops, about")).toBeVisible();
  await shot(page, "03-route");
  await page.getByRole("button", { name: "Start journey" }).click();
  await page.getByRole("button", { name: "I am at the station" }).click();
  await expect(page.getByRole("heading", { name: "Wait for the Red Line" })).toBeVisible();
  await shot(page, "04-waiting");

  // Guess Boston while waiting
  await page.getByRole("main").getByRole("link", { name: /Play Guess Boston while you wait/ }).click();
  await page.getByRole("button", { name: "Start round" }).click();
  await expect(page.getByRole("heading", { name: "Where is this?" })).toBeVisible();
  await shot(page, "05-round");
  await page.getByLabel("Your guess").fill("that gold dome building by the common");
  await page.getByRole("button", { name: "Submit guess" }).click();
  expect(await dismissRewards(page)).toContain("Sharp Eye");
  await expect(page.getByText("MOCK COACHING")).toBeVisible();
  await expect(page.getByText("points", { exact: true })).toBeVisible();
  await shot(page, "06-round-result");
  expect((await store(page)).events.filter((e: { t: string }) => e.t === "round")).toHaveLength(1);

  // Ride four stops, collecting a stamp at each station
  await page.goto("/journey");
  await page.getByRole("button", { name: "My train is here" }).click();
  await page.waitForTimeout(900); // let the stamp land
  await shot(page, "07-stamp-reveal");
  expect(await dismissRewards(page)).toContain("Harvard");
  await page.getByRole("button", { name: "I am on board" }).click();
  for (const stop of ["Central", "Kendall/MIT", "Charles/MGH", "Park Street"]) {
    await expect(page.getByRole("heading", { name: `Next stop: ${stop}` })).toBeVisible();
    if (stop === "Kendall/MIT") await shot(page, "08-riding");
    await page.getByRole("button", { name: `Arrived at ${stop}` }).click();
    expect(await dismissRewards(page)).toContain(stop);
  }
  await expect(page.getByRole("heading", { name: "You have arrived at Park Street" })).toBeVisible();
  await page.getByRole("button", { name: "Explore nearby" }).click();
  await expect(page.getByText("Massachusetts State House").first()).toBeVisible();
  await shot(page, "09-explore-nearby");

  // Scan a landmark (upload fallback), unlock its stamp
  await page.goto("/scan");
  await shot(page, "10-scan");
  await upload(page);
  expect(await dismissRewards(page)).toContain("Massachusetts State House");
  await expect(page.getByText("Landmark verified")).toBeVisible();
  await expect(page.getByText("large gilded gold dome")).toBeVisible();
  await shot(page, "11-scan-result");

  // Complete the journey
  await page.goto("/journey");
  await page.getByRole("button", { name: "Complete journey" }).click();
  expect(await dismissRewards(page)).toContain("First Ride");
  await expect(page.getByRole("heading", { name: "Journey complete" })).toBeVisible();
  await shot(page, "12-journey-complete");

  // Passport reflects everything, and the ledger adds up
  await page.getByRole("button", { name: "Open passport" }).click();
  await expect(page).toHaveURL(/\/passport$/);
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
  await expect(page.getByText("Gemini is unreachable, so this is TQuest's reference note.")).toBeVisible();
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
  await page.goto("/");
  await expect(page.getByText("Live MBTA", { exact: true }).first()).toBeVisible();
  await expect(page.locator("li", { hasText: "Ashmont" }).first()).toBeVisible();
  await expect(page.getByText("Demo data")).toHaveCount(0);
  await expect(page.getByText("1 live service alert")).toBeVisible();

  await page.getByLabel("To station").selectOption({ label: "Aquarium" });
  await page.getByRole("button", { name: "Find route" }).click();
  await expect(page.getByText(/Change at/).first()).toBeVisible();
  await expect(page.getByText("Estimated", { exact: true }).first()).toBeVisible();
  await shot(page, "16-transfer-route");

  down = true;
  await page.goto("/");
  await expect(page.getByText("Journey in progress").or(page.getByText("Continue journey")).first()).toBeVisible();
  await expect(page.getByText("Live MBTA predictions are unavailable right now.")).toBeVisible();
  await expect(page.getByText("Offline", { exact: true })).toBeVisible();
});

test("navigation, layout and the device frame", async ({ page }, info) => {
  await mockApis(page);
  await seed(page);
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  for (const [tab, heading] of [["Explore", null], ["Scan", "Scan a landmark"], ["Play", "Guess Boston"], ["Passport", "Stamps"], ["Home", "Tester"]] as const) {
    await nav.getByRole("link", { name: tab }).click();
    await expect(nav.getByRole("link", { name: tab })).toHaveAttribute("aria-current", "page");
    if (heading) await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
    await noSidewaysScroll(page);
    if (tab === "Explore") {
      await expect(page.getByText("Schematic map")).toBeVisible(); // no Google Maps key in tests
      await shot(page, "17-explore");
    }
  }

  const screen = (await page.locator("#screen").boundingBox())!;
  const viewport = page.viewportSize()!;
  if (info.project.name === "desktop") {
    // The app lives inside the phone frame, fully on screen, and stays interactive there.
    expect(screen.width).toBeLessThan(420);
    expect(screen.y).toBeGreaterThan(0);
    expect(screen.y + screen.height).toBeLessThanOrEqual(viewport.height);
    await expect(page.getByRole("heading", { name: "Judge walkthrough" })).toBeVisible();
    await shot(page, "18-desktop-frame");
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

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Home" }).click();
  await expect(page.getByRole("heading", { name: "Saved places" })).toBeVisible();

  await page.goto("/passport");
  await page.getByRole("button", { name: "Reset all progress" }).click();
  await page.getByRole("button", { name: "Erase everything" }).click();
  await expect(page.getByText("0 of 125 collected")).toBeVisible();
  const s = await store(page);
  expect([s.events.length, s.xp.length, s.saved.length]).toEqual([0, 0, 0]);
  expect(s.onboarded).toBe(true); // straight back into the demo, no welcome screen
});
