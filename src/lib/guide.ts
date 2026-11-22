// THE JUDGE GUIDE: the single source of truth for how a newcomer is walked through Bostie.
//
// Two things live here:
//   TOUR        : on-screen highlights. The first time someone reaches a screen, each
//                 feature listed for it is spotlighted with a short description beside it.
//   GUIDE_STEPS : the demo checklist (gold strip in the app, panel beside the phone frame).
//
// How a highlight finds its feature: the element carries data-tour="<target>", and the
// screen's root carries data-scene="<scene>". Nothing else connects them.
//
// WHEN THE APP CHANGES (a screen, a feature, a flow, or the wording on a button):
//   1. Edit the affected entries below. Add a spot for a new feature and put the matching
//      data-tour attribute on its element; delete the spot when a feature is removed.
//   2. `controls` in GUIDE_STEPS must match button labels exactly.
//   3. Bump GUIDE_VERSION, so people who saw the old highlights are shown the new ones once.
//   4. Run `npm test`. The demo test walks every screen and fails, naming the spot, if a
//      highlight cannot find its feature or a button label no longer exists.
//
// Keep this file dependency-free: tests import it directly.

export const GUIDE_VERSION = 24;

export type Spot = {
  /** Matches data-tour on the element to highlight. */
  target: string;
  title: string;
  /** One or two short sentences shown beside the highlighted feature. */
  body: string;
};

export type Scene =
  | "home" | "ride" | "discover"
  | "journey-plan" | "journey-walk" | "journey-wait" | "journey-ride" | "journey-explore" | "journey-done"
  | "play-lobby" | "play-intro" | "play-round" | "play-result" | "play-draw" | "play-draw-canvas" | "play-draw-result" | "play-parkour"
  | "trips" | "trip-import" | "trip-generate" | "trip-plan"
  | "scan" | "scan-result" | "passport";

export const TOUR: Record<Scene, Spot[]> = {
  // --- Map ---------------------------------------------------------------------
  home: [
    { target: "demo-strip", title: "Your next step", body: "This gold strip shows the next step of the demo. Tap it to go there. “Guide” replays the tips for whatever screen you are on." },
    { target: "home-actions", title: "Two ways to start", body: "“Plan a ride” gets you from A to B on the T. “Explore Boston” suggests places worth the trip." },
    { target: "map", title: "Your adventure map", body: "Coloured dots are stations on their lines. Gold diamonds are landmarks. Tap one to see it and plan a ride there." },
    { target: "map-filters", title: "Choose what the map shows", body: "Switch between everything, stations, landmarks and the places you have saved." },
    { target: "level-chip", title: "Level and XP", body: "Rides, scans and games all earn XP. Tap to open your passport." },
    { target: "tabs", title: "Five places to go", body: "Map, Ride to get somewhere, Discover for ideas and games, Trips to plan a day, and Passport for everything you have collected." },
  ],

  // --- Ride ----------------------------------------------------------------------
  ride: [
    { target: "ride-search", title: "From and To", body: "Type a station, address or place in To and pick it from the list. It stays in the box until you tap Start. Tap From to begin elsewhere, or use your current location." },
    { target: "ride-shortcuts", title: "Shortcuts", body: "Choose a station on the map, or set Home and Work once for one-tap trips. Live MBTA service alerts are here too." },
    { target: "ride-recents", title: "Recent and popular", body: "Tap a station to plan a ride there straight away. The dots menu sets it as home or work, or saves it." },
  ],

  // --- A journey, stage by stage ---------------------------------------------------
  "journey-plan": [
    { target: "journey-progress", title: "Eight stages", body: "Plan, walk, wait, board, ride, arrive, explore, done. The bar fills as you go." },
    { target: "route-options", title: "Ways to go", body: "Each route shows the fare, the next train and the minutes for every part. Sort by fastest or cheapest. Bus and Commuter Rail options from Google appear below when there are any." },
    { target: "route-summary", title: "Step by step", body: "Every move in order: the walk, which train to board and its direction, where to get off, and each change. Directions are the MBTA’s own." },
    { target: "fare-summary", title: "What it costs, how to pay", body: "The fare is the MBTA's published price, with the ways to pay that this service accepts. Open it for the breakdown." },
    { target: "tracking-mode", title: "Automatic or Manual", body: "Automatic follows your live location and moves the journey on, even while you are on another screen. Manual lets you confirm each step. Switch at any time." },
    { target: "getoff-alerts", title: "Get-off alerts", body: "Bostie warns you when your stop is next. Turn the switch on to also get the warning as a phone notification while Bostie is in the background." },
    { target: "journey-action", title: "One button moves you on", body: "Every stage has a single main button. Tap “Start journey” when you are ready." },
  ],
  "journey-walk": [
    { target: "tracking-status", title: "How Bostie is following you", body: "Shows Automatic or Manual, and switches with one tap. If there is no GPS signal, confirm the step yourself." },
    { target: "journey-map", title: "Your navigation map", body: "The route, the stations ahead and where you are. In Automatic mode the blue dot follows you. “Directions” opens the walk to the station in Google Maps." },
    { target: "journey-action", title: "Tell Bostie you are there", body: "In Manual mode, tap “I am at the station” when you reach it. In Automatic mode this happens by itself." },
  ],
  "journey-wait": [
    { target: "departures", title: "Only your trains", body: "Just the trains that reach your stop, with their platform. The badge says whether times are live, from the timetable, or demo data." },
    { target: "play-while-waiting", title: "Make the wait fun", body: "Three quick games. Your journey is kept: “Return to Journey” brings you back to this exact stage." },
    { target: "journey-action", title: "Boarding earns a stamp", body: "When the train pulls in, tap “My train is here” to collect your first station stamp." },
  ],
  "journey-ride": [
    { target: "strip-map", title: "Your ride, stop by stop", body: "Each station you reach is stamped into your passport. Underground there is often no GPS, so tap to confirm a stop if Automatic falls behind." },
    { target: "journey-action", title: "Confirm the stop", body: "Tap this each time the train reaches the station shown. Bostie warns you when the next stop is yours." },
    { target: "play-while-riding", title: "Play on the train", body: "The games are here while you ride. Your get-off alert reaches you inside a game too." },
  ],
  "journey-explore": [
    { target: "nearby-list", title: "History within walking distance", body: "Landmarks near your stop. Tap a camera button to scan one and unlock its stamp." },
    { target: "journey-action", title: "Bank your journey", body: "“Complete journey” adds the journey XP and logs the trip in your passport." },
  ],
  "journey-done": [
    { target: "journey-summary", title: "What this journey earned", body: "XP, stops and new stamps from the trip you just finished." },
    { target: "journey-finish", title: "It is all in your passport", body: "Open your passport to see the stamps, or plan another journey from here." },
  ],

  // --- Discover --------------------------------------------------------------------
  discover: [
    { target: "discover-prefs", title: "Tell Bostie what you like", body: "Type where you start, then pick your interests. The list below updates as you go." },
    { target: "discover-results", title: "Places picked for you", body: "Each card shows the nearest station, the travel time and why it fits. “Get directions” plans the ride." },
    { target: "discover-quests", title: "Optional extras", body: "Scan a landmark for a stamp, or play one of Bostie's three games. Neither is needed to ride or explore." },
  ],

  // --- Bostie's Favourite ------------------------------------------------------------
  "play-lobby": [
    { target: "game-modes", title: "Three games", body: "Guess a photo, draw a landmark, or keep Bostie running. All optional. Each pays XP for your first five plays a day." },
  ],
  "play-intro": [
    { target: "journey-return", title: "Your journey is safe", body: "Playing never loses your trip. “Return to Journey” takes you back to the same stage in one tap." },
    { target: "start-round", title: "Start a round", body: "Five photos of Boston, four answers each. Tap “Start round” when you are ready." },
  ],
  "play-round": [
    { target: "round-photo", title: "What is this?", body: "A real place in Boston: a landmark, a T station or a neighborhood." },
    { target: "guess-input", title: "Pick one", body: "Four answers and one try. Code checks the answer, not AI." },
    { target: "round-tools", title: "Stuck?", body: "“Hint” removes two wrong answers and Gemini writes a clue, for half the points. “Pin it instead” lets you answer on the map." },
  ],
  "play-result": [
    { target: "round-score", title: "Scored by rules, not by AI", body: "Five XP for each correct answer, up to the daily limit." },
    { target: "round-debrief", title: "Your answers", body: "Every photo from the round with its real name." },
    { target: "next-round", title: "Go again", body: "A new round avoids the photos you just saw." },
  ],
  "play-draw": [
    { target: "draw-start", title: "Bostie Drawing", body: "Bostie names a landmark or a symbol and you sketch it. Gemini says how recognizable it is. Drawings are never saved." },
  ],
  "play-draw-canvas": [
    { target: "draw-reference", title: "What to draw", body: "A photo to copy from. For symbols with no photo, a list of things to include." },
    { target: "draw-canvas", title: "Your canvas", body: "Draw with a finger, a stylus or a mouse." },
    { target: "draw-tools", title: "Colours and tools", body: "Eight colours, pen and eraser, brush size, undo, redo and clear." },
    { target: "draw-submit", title: "Hand it in", body: "Gemini judges whether the subject is recognizable, not how artistic it is. An empty canvas is never sent." },
  ],
  "play-draw-result": [
    { target: "draw-score", title: "Bostie's opinion", body: "A score from 0 to 100, for fun. The XP comes from fixed score bands, not from the AI." },
    { target: "draw-compare", title: "Yours beside the real thing", body: "Your sketch next to the reference photo, with what Bostie spotted and what you could add." },
  ],
  "play-parkour": [
    { target: "parkour-levels", title: "Pick a difficulty", body: "Three, five, seven or ten obstacles. Each one asks a question about Boston." },
    { target: "parkour-start", title: "Six seconds each", body: "Bostie runs by himself. Answer in time and he clears the obstacle. A wrong answer or a timeout ends the run." },
  ],

  // --- Trips -------------------------------------------------------------------------
  trips: [
    { target: "trips-new", title: "Three ways to start a trip", body: "From a travel video or screenshot, planned for you by Gemini, or built by hand. Every place is checked on the map before it is added." },
    { target: "trips-saved", title: "Saved trips", body: "Trips are kept on this device. Tap one to open it again." },
  ],
  "trip-import": [
    { target: "import-source", title: "Link, video or screenshots", body: "YouTube links are watched directly. For TikTok or Instagram, upload the saved video or a screenshot. Only places Bostie can verify in Greater Boston are kept." },
  ],
  "trip-generate": [
    { target: "generate-prefs", title: "Your kind of day", body: "Pick interests, then a budget, the number of days, the time you have and where you start. A note is optional." },
    { target: "generate-go", title: "Gemini drafts, Bostie checks", body: "Gemini proposes the places. Each one is looked up on the map, and the order and travel are worked out by code." },
  ],
  "trip-plan": [
    { target: "trip-map", title: "The day on the map", body: "Your stops in order, with the T lines and walks between them. Tap a pin to find its card." },
    { target: "trip-tools", title: "Optimize and add", body: "“Optimize” puts the stops in the shortest order. “Add” searches for any place in Greater Boston." },
    { target: "trip-list", title: "Your itinerary", body: "Drag the handle to reorder, or switch a stop off to skip it. Times, travel and fares update by themselves. “Ride it” or “Walk it” shows the way to a stop." },
  ],

  // --- Scan ----------------------------------------------------------------------------
  scan: [
    { target: "viewfinder", title: "Point at a landmark", body: "The camera only turns on when you ask. Photos go to Gemini for recognition and are never stored." },
    { target: "scan-controls", title: "Shoot or upload", body: "Take a photo, or upload one you already have. Adding your location earns full XP when you are really there." },
    { target: "scan-samples", title: "Not in Boston?", body: "Tap a sample photo of a nearby landmark. The Gemini call is real either way." },
  ],
  "scan-result": [
    { target: "scan-stamp", title: "Your new stamp", body: "A landmark stamp for your passport. It is only granted when the checks below pass." },
    { target: "scan-share", title: "Share it", body: "Make a picture of your photo with the stamp and send it to Instagram, Facebook or any other app from your phone's share menu." },
    { target: "scan-checks", title: "Gemini recommends, rules decide", body: "These fixed checks must pass before a stamp is granted. Scan the same landmark twice and there is no second reward." },
  ],

  // --- Passport ------------------------------------------------------------------------
  passport: [
    { target: "passport-cover", title: "Your passport", body: "Level, XP toward the next level, and your streak. One rest day never breaks a streak." },
    { target: "my-day", title: "My day and your heat map", body: "Today's stations and landmarks, a map that glows where you go most, and a picture of your day to share." },
    { target: "stamp-tabs", title: "148 stamps to collect", body: "A stamp for every station, every landmark, and three collections. Tap any stamp to see how to earn it." },
    { target: "passport-settings", title: "Settings", body: "Turn demo mode off for live MBTA data and your real location. Replay the opening, clear your location history, or reset everything." },
  ],
};

export type GuideStepId = "plan" | "begin" | "play" | "ride" | "scan" | "finish" | "passport" | "trips";

export type GuideStep = {
  id: GuideStepId;
  /** Short imperative. Shown in the checklist and the strip. */
  title: string;
  /** One line shown in the strip while the judge is on the right screen. */
  hint: string;
  /** Where tapping the strip leads. */
  href: string;
  /** Exact accessible names of the buttons this step needs, in tap order. The demo test taps these. */
  controls: string[];
};

export const GUIDE_STEPS: GuideStep[] = [
  { id: "plan", title: "Plan Harvard to Park Street", hint: "Tap “Park Street” under Popular stations to plan the ride from Harvard.", href: "/ride", controls: ["Go to Park Street"] },
  { id: "begin", title: "Check the route and begin", hint: "Look at the steps and the fare, then start the journey and walk to the station.", href: "/journey", controls: ["Start journey", "I am at the station"] },
  { id: "play", title: "Play a game while you wait", hint: "Start a round of Bostie Guessing and pick the right answer for each photo.", href: "/play/guess", controls: ["Start round"] },
  { id: "ride", title: "Ride four stops on the Red Line", hint: "Board, then confirm each stop to collect its station stamp.", href: "/journey", controls: ["My train is here", "I am on board"] },
  { id: "scan", title: "Scan a landmark by Park Street", hint: "Tap a sample photo, or use your own. This is a real Gemini call.", href: "/scan", controls: ["Explore nearby"] },
  { id: "finish", title: "Complete the journey", hint: "Finish exploring to bank the journey XP.", href: "/journey", controls: ["Complete journey"] },
  { id: "passport", title: "Open your passport", hint: "Stamps, badges, your day on the map and your new level.", href: "/passport", controls: ["Open passport"] },
  { id: "trips", title: "Plan a day out in Trips", hint: "Start a trip from a video, let Gemini plan it, or build it yourself.", href: "/trips", controls: ["Build it myself"] },
];

export const guideStep = (id: GuideStepId) => GUIDE_STEPS.find((s) => s.id === id)!;

/** Labels on the tip card itself. */
export const TIP = { next: "Next", done: "Got it", skip: "Skip tips", back: "Back" };
