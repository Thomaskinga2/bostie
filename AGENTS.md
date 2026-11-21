<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Keep the judge guide in step with the app

The app guides first-time visitors with on-screen highlights: the first time someone reaches a screen, each feature listed for it is spotlighted with a short description beside it. `src/lib/guide.ts` is the single source of truth for those highlights (`TOUR`) and for the demo checklist (`GUIDE_STEPS`).

How it connects: a screen's root element carries `data-scene="<scene>"`, and each feature carries `data-tour="<target>"`. `src/components/shell/Tour.tsx` does the rest.

Whenever a change touches what a first-time visitor sees or does (a screen, a feature, a flow, the order of steps, the wording on a button), do this in the same change:

1. New or changed feature: add or edit its spot in `TOUR` and put the matching `data-tour` attribute on the element. Keep descriptions to one or two short sentences.
2. Removed feature: delete its spot. New screen or screen state: give its root a `data-scene` and add the scene to `TOUR`.
3. Renamed button: update `controls` in `GUIDE_STEPS` (they must match labels exactly) and any tip that quotes the label.
4. Bump `GUIDE_VERSION` so people who saw the old highlights are shown the revised ones once.
5. Run `npm test`. The logic test checks every spot has a tagged element in the source; the demo test walks every screen, taps the labels from `GUIDE_STEPS`, and fails naming the spot if a highlight never appeared.

If a change does not affect the guide, say so explicitly when reporting the change, so it is clear the guide was considered.

## Fares come from mbta.com, never from a model

`src/data/fares.ts` holds every MBTA price, transfer rule and accepted payment method, with the official source URLs and the date they were last read. `src/lib/fares.ts` prices trips from it deterministically.

- Change a fare or rule only after re-reading the official page, and update `FARES_VERIFIED_ON` in the same edit.
- Never fill in a price from memory or from Gemini. If the data is not there, the quote must come back `estimate` or `unavailable`.
- TQuest informs; it does not sell tickets, take payments or collect card details.
