import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3311);
const baseURL = `http://localhost:${PORT}`;

// logic   : pure functions, no browser
// mobile  : mocked end-to-end at phone size (touch, no device frame)
// desktop : the same flows inside the iPhone demo frame
// real    : opt-in smoke test against live Gemini (REAL_API=1, needs GEMINI_API_KEY on the server)
export default defineConfig({
  testDir: "tests",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: { baseURL, trace: "retain-on-failure" },
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 240_000,
  },
  projects: [
    { name: "logic", testMatch: /logic\.spec\.ts/ },
    { name: "mobile", testMatch: /e2e\.spec\.ts/, use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } },
    { name: "desktop", testMatch: /e2e\.spec\.ts/, use: { viewport: { width: 1440, height: 900 } } },
    { name: "real", testMatch: /real\.spec\.ts/ },
  ],
});
