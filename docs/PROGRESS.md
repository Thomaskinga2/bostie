# TQuest implementation progress

Status as of 2026-11-21. Priorities follow the build brief (P0 required, P1 after, P2 stretch).

## P0

| Feature | State | Verified by |
| --- | --- | --- |
| Premium mobile interface, five tabs | Done | Playwright navigation test, screenshots |
| Interactive desktop iPhone shell, fullscreen toggle | Done | Playwright desktop project |
| Guided MBTA journey (9 stages, strip map, manual stop confirmation) | Done | Full demo flow test |
| Route planning with transfers, train arrivals | Done | Logic tests (every station reaches Park Street), live MBTA smoke check |
| Exploration map | Done on the schematic backend; Google backend untested (no key) | Navigation test, manual |
| Gemini landmark scanner with deterministic validation | Done | Live smoke test (3 photos), mocked flow tests |
| Guess Boston (text, pin drop, hints, debrief, adaptive next round) | Done | Live smoke test, mocked flow tests |
| XP, levels, station and landmark stamps | Done | Logic tests, flow tests |
| Digital passport | Done | Flow tests |
| End-to-end judge demo with reset | Done | Full demo flow test at phone and desktop size |
| Production build | Done | `next build` |

## P1

Saved places, service alerts, journey and discovery history, achievement badges, streaks, rarities, line progress, statistics, completed-challenge tracking, suggested walk: done.

## Added after the first build

| Feature | State | Verified by |
| --- | --- | --- |
| On-screen guide: per-screen feature highlights, driven by `src/lib/guide.ts` | Done | Demo flow test shows every highlight; logic test checks every target is tagged |
| Animated opening: platform scene, train-door transition, name step | Done | Demo flow test, screenshots |
| Map-first home with Plan a ride and Explore Boston; tabs Map, Ride, Discover, Passport | Done | Navigation test |
| Demo Mode holds the judge walkthrough, next-step strip and Gemini log | Done | Navigation test (desktop) |
| Street basemap (OpenStreetMap tiles) under the lines and markers | Done | Checked with live tiles in the browser; tests mock the tiles |
| Explore Boston: interests and budget, destination cards, directions, save | Done (rule-based, no Gemini) | Logic tests, Explore Boston flow test |
| MBTA fare information: fare engine, route comparison cards, fare summary, payment guidance | Done | 11 logic tests against published prices; fare checks in two flow tests |

## P2 and not built

Gemini Live voice, AI-generated challenges (interface reserved: `Challenge.source`), GPS anti-cheat, daily challenge generation, historical-photo mode.

## Decisions made without asking

- Photos are hot-linked from Wikimedia Commons with author and licence, resolved by script; nothing is scraped from Street View.
- Default model is Gemini Flash-Lite: the larger Flash models were returning 503 or taking 40 s during development. Override with `GEMINI_MODEL` / `GEMINI_VISION_MODEL`; the chain falls back automatically.
- Riding through a station collects its stamp (self-confirmed), because GPS does not work underground.
- A landmark recognised far from the player still unlocks, as "photo-only" for half XP, so judges outside Boston can try the scanner.
- Local-first persistence; Supabase is an optional one-way mirror with anonymous sign-in.
- Cache Components disabled: the app is client-rendered from local state.

## Needs the team

- A Google Maps browser key to switch Explore and Pin Drop to Google Maps, and a check of that path.
- A Supabase project (run the migration and seed, enable anonymous sign-ins) to turn on and verify the cloud mirror.
- A free MBTA API key for headroom beyond 20 requests/minute.
