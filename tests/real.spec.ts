// Opt-in smoke test against the LIVE Gemini API. Costs real requests.
//   npm run test:real        (server needs GEMINI_API_KEY; skipped otherwise)
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test.skip(!process.env.REAL_API, "set REAL_API=1 to call the live Gemini API");

test("hints never contain the answer", async ({ request }) => {
  const res = await (await request.post("/api/game/hint", { data: { placeId: "fenway-park", previous: ["TD Garden"], hints: [] } })).json();
  expect(res.hint.length).toBeGreaterThan(10);
  expect(res.hint.toLowerCase()).not.toContain("fenway");
});

test("Gemini recognises a real landmark photo and rejects a non-landmark", async ({ request }) => {
  const wiki = JSON.parse(readFileSync(join(__dirname, "../src/data/wiki.json"), "utf8"));
  const photo = async (id: string) => {
    const res = await fetch(wiki[id].src.replace("/960px-", "/500px-"), { headers: { "User-Agent": "BostieSmokeTest/0.1" } });
    test.skip(!res.ok, `Wikimedia returned ${res.status}`);
    return Buffer.from(await res.arrayBuffer()).toString("base64");
  };

  const yes = await (await request.post("/api/scan", {
    data: { image: await photo("state-house"), mimeType: "image/jpeg", location: { lat: 42.3564, lng: -71.0624, source: "simulated" } },
  })).json();
  expect(yes.validation.landmarkId).toBe("state-house");
  expect(yes.result.visualEvidence.length).toBeGreaterThanOrEqual(2);

  const no = await (await request.post("/api/scan", { data: { image: await photo("stn-kendall"), mimeType: "image/jpeg" } })).json();
  expect(no.validation.landmarkId).toBeNull();
});
