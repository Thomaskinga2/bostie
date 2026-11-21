# Bostie

**Make every ride an adventure.** Bostie turns Boston's MBTA into a city exploration game: plan a real route, collect a stamp at every station you ride through, let Gemini verify the landmarks you photograph, and play Guess Boston while you wait for the train.

Built for two hackathon tracks: **Transit Gamification** and **Best Use of Gemini API**.

- Mobile-first web app. On a phone it fills the screen; on a desktop it runs inside an interactive iPhone frame.
- Four tabs: **Map** (the adventure map, with Plan a ride and Explore Boston), **Ride**, **Discover** and **Passport**. Scanning and Guess Boston are optional quests reached from Discover.
- **Demo Mode** is separate: only when it is on do the judge walkthrough, the gold next-step strip and the live log of Gemini calls appear. Regular visitors get a clean interface.
- No account, no install. A guest's progress is stored on the device (and mirrored to Supabase when configured).

## Quick start

```bash
npm install
cp .env.example .env.local   # add GEMINI_API_KEY; everything else is optional
npm run dev                  # http://localhost:3000
```

The app runs with only `GEMINI_API_KEY`. Without it, transit, the map, stamps and the passport still work; scanning shows an error and Guess Boston falls back to exact-name matching and offline hints.

## What it does

| Area | What is real | Notes |
| --- | --- | --- |
| Route planning | Station network and stop order come from the MBTA V3 API (snapshot in `src/data/network.json`). Routes are computed by Dijkstra over (station, line) states with a transfer penalty. | The MBTA API has no trip planner. Ride times are **estimated** from distance and labelled as such. |
| Fares and how to pay | MBTA's published one-way fares, transfer policy, accepted payment methods and reduced-fare rules, read from mbta.com and kept in one config file. Shown on route cards and in a fare summary before you start a journey. | Information only: no tickets are sold and no payments are taken. Computed by code, never by Gemini. |
| Arrivals and alerts | Live MBTA V3 predictions and service alerts through cached server routes. | Labelled **Live MBTA**. If the API fails the UI says so; it never invents times. |
| Demo mode | A scripted Harvard → Central → Kendall/MIT → Charles/MGH → Park Street ride with simulated departures and position. | Always labelled **Demo data**. Gemini calls in demo mode are real. |
| Landmark scanner | One multimodal Gemini call: photo + player position + a 20-landmark catalogue with visual cues and reference notes → schema-constrained JSON. | Deterministic checks decide whether a stamp is granted (see below). |
| Guess Boston | Photo guessing game. Gemini links free-text guesses to catalogue entries, writes adaptive hints, writes the debrief and picks the next round from a server-built pool. | Answers, scoring, difficulty tiers and XP are all code. |
| Gamification | XP ledger, 12 levels, streaks, 10 achievements, 6 challenges, 148 stamps in five rarities. | One pure engine (`src/lib/gamification.ts`); every reward is an idempotent transaction. |
| Passport | Stamp collection with search and filters, line completion, badges, journey and discovery history, saved places, XP ledger. | |
| Adventure map (home) | Stations, lines, landmarks, saved places, position, suggested walk, active journey. | Google Maps when a key is set. Otherwise OpenStreetMap street tiles with Bostie's lines and markers drawn on top; if tiles cannot load it falls back to a labelled schematic. |
| Explore Boston (Discover) | Choose a start, interests and a budget; get destination cards with the nearest station, travel time, why it fits, Get directions and Save. | Deterministic: places come from the catalogue and travel times from the route planner. Budget is a labelled estimate. No quest required. |

## How Gemini is used

Gemini does the things only a model can do, and is never trusted with the things code should decide.

**1. Landmark recognition** (`src/app/api/scan/route.ts`), image + text → JSON

Gemini receives the photo, the player's position (GPS or simulated, with distance to each landmark) and the landmark catalogue. It returns a recognition status, ranked candidates with reasons, the visual evidence it actually saw, a history summary written only from the supplied notes, and a recommendation. Then code decides:

- the id must exist in the catalogue;
- status must be `recognized` and the recommendation `unlock`;
- at least two pieces of visual evidence;
- the top-ranked candidate must be the same landmark, at `high` likelihood;
- location sets the reward: within 1 km (or the demo position) earns full XP, otherwise the stamp is "photo-only" for half XP.

An uncertain or failed scan grants nothing and asks for a better photo. The photo is processed in memory and never stored.

**2. Guess Boston engine** (`src/app/api/game/*`), text → JSON, three roles

- **Judge**: links the player's words ("that gold dome building by the Common", "old ironsides") to one catalogue id. The server compares that id with the ground truth, so the model cannot be talked into a win. Exact names are settled without a model call.
- **Hints**: adaptive to previous guesses and escalating (visual → history → transit). Every hint passes an answer-leak check; a leaking hint is replaced with a curated cue.
- **Debrief and next round**: explains the tells, the history and how to get there on the T, coaches the player, and chooses the next location. The difficulty tier and the pool of options are computed by code; a choice outside the pool is discarded.

Every response is constrained with a JSON schema and re-validated with zod (`src/lib/server/gemini.ts`). Calls go through a model chain (default `gemini-3.5-flash-lite`, then `gemini-3.1-flash-lite`) that falls through on overload or timeout. All four endpoints have a non-AI fallback, so the game stays playable if Gemini is down.

**Showcase panel.** Each real call is logged with model, input modality, grounding context, the validated structured output, what code did with it, and latency. On desktop it is the right-hand panel; on a phone, tap "Gemini activity". No keys, photos or hidden reasoning are shown, and mocked or offline responses never appear in it.

## Architecture

```
src/
  app/
    page.tsx, explore/, scan/, play/, passport/, journey/   screens (client components)
    api/scan, api/game/{guess,hint,debrief}                  Gemini routes (server only)
    api/mbta/{predictions,alerts}                            cached MBTA V3 proxies
  components/
    shell/      iPhone frame, tab bar, reward reveals, demo guide, Gemini showcase
    map/        CityMap: Google Maps backend + schematic SVG backend
    passport/   passport sections
  lib/
    gamification.ts   events + XP ledger → levels, stamps, streaks, achievements, challenges (pure)
    game.ts           Guess Boston rules: alias matching, scoring, difficulty, pools (pure)
    network.ts        MBTA network + route planner (pure)
    store.ts          zustand store, persisted to localStorage; journey state machine
    contracts.ts      zod schemas shared by routes and client
    server/           Gemini client, rate limiting, MBTA cache
    sync.ts           optional Supabase mirror
  data/
    places.ts         curated ground truth: 20 landmarks, 8 stations, 5 neighbourhoods
    network.json      generated from the MBTA API      (npm run data:network)
    wiki.json         licensed Commons photos + credits (npm run data:photos)
supabase/             schema, RLS, idempotent sync function, generated seed
tests/                Playwright: logic, mocked end-to-end, opt-in real API
```

Decisions worth knowing:

- **State is two append-only logs**: events (what happened) and an XP ledger keyed by transaction id. Stamps, level, streak, line progress and statistics are derived, so they cannot drift, and replaying an event is a no-op. That is the duplicate-reward guarantee.
- **Station stamps are collected by riding through.** There is no GPS underground, so the rider confirms each stop. Stamps record how they were collected (ride, demo).
- **Rarity is rule-based**: common (single-line station), uncommon (transfer hub), rare (end-of-line terminal, or a downtown landmark), epic (a landmark more than 1.5 km from Park Street, or the four-line set), legendary (complete the Freedom Trail or the Red Line).
- **Streaks** count any activity, including a game round, on the player's local calendar day, and forgive one rest day. Nobody has to make an unnecessary trip.
- **Cache Components is off** (`next.config.ts`): every screen reads the player's local progress, so there is no server-rendered content to cache.

## Fares

`src/data/fares.ts` is the single source for prices, transfer rules and payment methods, and `src/lib/fares.ts` is the deterministic engine that prices a trip from it.

- **Sources** (all checked on 21 November 2026): [fares overview](https://www.mbta.com/fares), [subway](https://www.mbta.com/fares/subway-fares), [bus](https://www.mbta.com/fares/bus-fares), [Commuter Rail](https://www.mbta.com/fares/commuter-rail-fares) and its [zone table](https://www.mbta.com/fares/commuter-rail-fares/zones), [ferry](https://www.mbta.com/fares/ferry-fares), [transfers](https://www.mbta.com/fares/transfers), [reduced fares](https://www.mbta.com/fares/reduced), [contactless](https://www.mbta.com/fares/charlie/tap-ride).
- **What the engine knows**: subway and bus fares (adult and reduced), every Commuter Rail zone and interzone price, the four ferry fare groups, and the transfer pilot that began on 1 September 2026 (within two hours, pay only the highest-priced of subway, bus and ferry when using the same card or device; no transfers with cash; Commuter Rail tickets never include one).
- **What the app shows**: Bostie's planner covers rapid transit, so every planned journey is a subway-fare trip: one fare however many lines you change between. Route cards show the fare beside time, changes and the next train; the fare summary adds the breakdown, ways to pay, reduced and free fares, passes, and links to MBTA's pages for bus, Commuter Rail and ferry tickets.
- **When data is missing** the quote is marked `estimate` or `unavailable` and the interface says so. Commuter Rail interzone fares are always marked as estimates, because MBTA publishes the prices but not the zone-counting rule on that page.
- **To update after a fare change**: re-read the pages above, edit `src/data/fares.ts` (including `FARES_VERIFIED_ON`) and run `npm test`; the logic tests pin the published prices.

## Environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | for AI | Server only. From [AI Studio](https://aistudio.google.com/apikey). |
| `GEMINI_MODEL` | no | Text model override. Default `gemini-3.5-flash-lite`. |
| `GEMINI_VISION_MODEL` | no | Model for photo recognition only, e.g. a larger Flash model. Falls back automatically. |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | no | Enables Google Maps in Explore and Pin Drop. Restrict it by HTTP referrer and to the Maps JavaScript API. |
| `MBTA_API_KEY` | recommended | Free at [api-v3.mbta.com](https://api-v3.mbta.com). Keyless access is 20 requests/minute. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | no | Enables the cloud mirror of guest progress. |

## Supabase (optional)

1. Create a project at supabase.com.
2. In the SQL editor run `supabase/migrations/0001_init.sql`, then `supabase/seed.sql`.
3. Authentication → Sign In / Providers → enable **Allow anonymous sign-ins**.
4. Set the two `NEXT_PUBLIC_SUPABASE_*` variables and restart.

Guests are signed in anonymously; progress is pushed through `sync_progress()`, which inserts with `on conflict do nothing` under row-level security. The mirror is one-directional (device → cloud). `npm run data:seed` regenerates the seed from the app's own data.

## Deploying to Vercel

```bash
npm i -g vercel
vercel link
vercel env add GEMINI_API_KEY production   # and any optional variables
vercel --prod
```

Or import the GitHub repository in the Vercel dashboard and add the same variables under Settings → Environment Variables. No other configuration is needed: API routes are serverless functions, nothing is written to disk, and camera and geolocation work because Vercel serves HTTPS.

## Tests

```bash
npx playwright install chromium   # once
npm test                          # 33 logic tests + 11 flows at phone and desktop size
npm run test:real                 # opt-in: live Gemini recognition, judging and hints
node scripts/smoke-scan.mjs http://localhost:3000   # quick live scan check
```

`npm test` builds and serves the production app, mocks Gemini, MBTA and Wikimedia, and covers: the whole judge demo, duplicate-stamp prevention, uncertain and failed scans, wrong guesses, hints, Gemini outage, pin-drop scoring, live and failed transit data, transfers, navigation, layout overflow, the desktop frame and fullscreen toggle, saved places and demo reset. Screenshots land in `screenshots/`.

## Judge walkthrough (about four minutes)

Open the site on a laptop and choose **Judging? Take the guided demo** (or switch **Demo mode** on at the top right at any time). The first time each screen appears, its features are highlighted one at a time with a short description beside them (tap **Next**, or **Skip tips** to turn them off). The **Guide** button replays the highlights for the current screen. The gold strip in the app and the left panel tick off each demo step.

All of that wording lives in one file, `src/lib/guide.ts`. A feature is linked to its highlight by a `data-tour` attribute. When the app changes, edit that file, bump `GUIDE_VERSION` (returning visitors then see the revised highlights once) and run `npm test`: the tests fail, naming the highlight, if one no longer finds its feature or a button label has changed.

1. **Map**: the adventure map with your level and the two main actions. Tap **Plan a ride**: the Harvard → Park Street trip is prefilled and departures are labelled *Demo data*. Tap **Find route**.
2. **Route**: one Red Line leg, four stops, estimated time, and the fare ($2.40) with the ways to pay. Open **Fare breakdown and how to pay** to see the detail and the link to MBTA's fares. **Start journey**, then **I am at the station**.
3. **Waiting**: tap **Play Guess Boston while you wait**. Type a description rather than a name. Watch the judge call appear in the Gemini panel, then read the debrief.
4. Back to the journey (the demo strip at the top takes you there): **My train is here** stamps Harvard. Confirm Central, Kendall/MIT, Charles/MGH and Park Street. Five stamps, the Red Line Explorer badge, a few level-ups.
5. **Explore nearby** lists landmarks around Park Street. Open **Scan** (the gold strip takes you there), tap the State House sample photo (or upload your own, or use the camera). A real Gemini call verifies it; the verification checks are listed under the result.
6. **Complete journey**, then **Open passport**: stamps, badges, line progress, the journal and the XP ledger.
7. **Reset demo progress** (left panel, or Passport → Reset all progress) returns to a clean state.

Turn demo mode off to see live MBTA predictions and real geolocation.

## Troubleshooting

- **"Gemini could not analyse this photo"**: check `GEMINI_API_KEY` and the server log; lines starting `[gemini]` name the model and error. A 503 means the model is overloaded; the chain should already have fallen through.
- **Departures say Offline**: the MBTA API is unreachable or rate-limited. Add `MBTA_API_KEY`.
- **Map says "Schematic map"**: the street tiles could not load (offline, or the tile server refused). The app still works on the schematic.
- **Camera will not start**: browsers only allow camera access on HTTPS or localhost. Use the upload button otherwise.
- **Stuck state**: Passport → Reset all progress, or clear the site's storage.

## Known limitations

- The Google Maps backend was written without a key to test against. The built-in map uses OpenStreetMap's community tile server, which has a fair-use policy: fine for a demo, not for real traffic.
- Explore Boston recommendations are rule-based (interest match, then travel time). Gemini is not involved there yet.
- Supabase SQL was verified in an in-memory Postgres with stand-ins for Supabase auth, not against a live project. The mirror does not pull progress onto a second device.
- Fares are a snapshot of mbta.com on 21 November 2026 and do not update themselves. Bus, Commuter Rail and ferry fares are in the engine and tested, but no journey uses them yet because routing is rapid transit only. Passes and fare capping are described, not calculated.
- Station visits are self-confirmed; there is no anti-cheat beyond the scanner's checks. Rewards are computed on the device and trusted by the mirror.
- Rate limiting and MBTA caching are per server instance.
- The historical-photo game mode, Gemini Live voice and AI-generated challenges were left out. The challenge model already carries a `source: "ai"` field for the last one.
- Transit lines on the schematic map are straight station-to-station segments.

## Credits

Transit data: [MBTA V3 API](https://api-v3.mbta.com). Map: © OpenStreetMap contributors. Photos: Wikimedia Commons, each shown with its author and licence and linked to its source (`src/data/wiki.json`). Typefaces: Libre Caslon Text and Hanken Grotesk.
