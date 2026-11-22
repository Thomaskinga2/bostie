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

export const GUIDE_VERSION = 22;

export type Spot = {
  /** Matches data-tour on the element to highlight. */
  target: string;
  title: string;
  /** One or two short sentences shown beside the highlighted feature. */
  body: string;
};

export type Scene =
  | "home" | "ride" | "discover" | "journey-plan" | "journey-wait" | "journey-ride" | "journey-explore"
  | "play-lobby" | "play-intro" | "play-round" | "play-result" | "play-draw" | "play-parkour" | "trips" | "trip-plan" | "scan" | "scan-result" | "passport";

export const TOUR: Record<Scene, Spot[]> = {
  home: [
    { target: "demo-strip", title: "Your next step", body: "This strip always shows what to do next in the demo. Tap it to go there. “Guide” replays these tips on any screen." },
    { target: "home-actions", title: "Two ways to start", body: "“Plan a ride” takes you between any two stations. “Explore Boston” finds places worth the trip." },
    { target: "map", title: "Your adventure map", body: "Coloured dots are stations on their lines. Gold diamonds are places to discover. Tap any of them." },
    { target: "level-chip", title: "Level and XP", body: "Rides, scans and game rounds all earn XP. Tap to open your passport." },
    { target: "tabs", title: "Five places to go", body: "The map, ride planning, things to discover, trip planning, and your passport of stamps." },
  ],
  ride: [
    { target: "ride-search", title: "From and to", body: "Type a station, address or place in To, pick it from the list, then tap Start. Tap From to begin somewhere else, or choose Current location." },
    { target: "ride-shortcuts", title: "Shortcuts", body: "Pick a station on the map, or set home and work once for one-tap trips. Live service alerts are here too." },
    { target: "ride-recents", title: "Recent and popular", body: "Tap a station to plan a ride there. The dots menu sets it as home or work, or saves it." },
  ],
  discover: [
    { target: "discover-prefs", title: "Tell us what you like", body: "Type where you start, then pick what you are into. The list updates as you go." },
    { target: "discover-results", title: "Places picked for you", body: "Each card shows the nearest station, the travel time and why it fits. “Get directions” starts the trip." },
    { target: "discover-quests", title: "Optional quests", body: "Scan a landmark for a stamp, or play Bostie's Favourite. Neither is needed to ride or explore." },
  ],
  "journey-plan": [
    { target: "journey-progress", title: "Eight stages", body: "From planning to done. The bar fills as you move through the trip." },
    { target: "route-options", title: "Ways to go", body: "Each route shows the fare, the next train and the minutes for every part. Sort by fastest or cheapest. Bus and Commuter Rail options from Google appear underneath when there are any." },
    { target: "route-summary", title: "Step by step", body: "Every move in order: walk, which train to board and its direction, where to get off, and each change. Directions are the MBTA’s own." },
    { target: "fare-summary", title: "What it costs, how to pay", body: "The fare is MBTA's published price, with the ways to pay that this service accepts. Open it for the breakdown." },
    { target: "tracking-mode", title: "Automatic or manual", body: "Automatic follows your live location and moves the journey on for you. Manual lets you confirm each step yourself. You can switch at any time." },
    { target: "getoff-alerts", title: "Get-off alerts", body: "Bostie warns you when your stop is next. Turn the switch on to get the warning as a phone notification when Bostie is in the background." },
    { target: "journey-action", title: "One button moves you on", body: "Each stage has a single action. Tap “Start journey” when you are ready." },
  ],
  "journey-wait": [
    { target: "journey-map", title: "Your navigation map", body: "The route, the stations ahead and where you are. In automatic mode the dot follows your live location." },
    { target: "departures", title: "Only your trains", body: "Just the trains that go to your stop, with the platform they leave from." },
    { target: "play-while-waiting", title: "Make the wait fun", body: "Three quick games in Bostie's Favourite. Pick one, then tap the gold strip to come back." },
    { target: "journey-action", title: "Boarding earns a stamp", body: "When the train pulls in, tap “My train is here” to collect your first station stamp." },
  ],
  "journey-ride": [
    { target: "strip-map", title: "Your ride, stop by stop", body: "There is no GPS underground, so you confirm each stop as the doors open. Every station you reach is stamped into your passport." },
    { target: "journey-action", title: "Confirm the stop", body: "Tap this each time the train arrives at the station shown." },
    { target: "play-while-riding", title: "Play on the train", body: "The three games are here while you ride. Your get-off alert still reaches you inside a game." },
  ],
  "journey-explore": [
    { target: "nearby-list", title: "History within walking distance", body: "Landmarks near your stop. Tap a camera button to scan one and unlock its stamp." },
    { target: "journey-action", title: "Bank your journey", body: "“Complete journey” adds the journey XP and logs the trip in your passport." },
  ],
  "play-lobby": [
    { target: "game-modes", title: "Three games", body: "Guess a photo, draw a landmark, or keep Bostie running. All optional, and each pays XP for the first five plays a day." },
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
    { target: "draw-start", title: "Draw it", body: "Bostie names a landmark or symbol, you sketch it, and Gemini says how recognizable it is. Drawings are never saved." },
  ],
  "play-parkour": [
    { target: "parkour-levels", title: "Pick a difficulty", body: "Three, five, seven or ten obstacles. Each one asks a question with six seconds to answer." },
  ],
  trips: [
    { target: "trips-new", title: "Three ways to start a trip", body: "From a travel video or screenshot, planned for you by Gemini, or built by hand. Every place is checked on the map before it is added." },
    { target: "trips-saved", title: "Saved trips", body: "Trips are kept on this device. Tap one to open it again." },
  ],
  "trip-plan": [
    { target: "trip-map", title: "The day on the map", body: "Your stops in order, with the T lines and walks between them. Tap a pin to find its card." },
    { target: "trip-tools", title: "Optimize and add", body: "“Optimize” puts the stops in the shortest order. “Add” searches for any place in Greater Boston." },
    { target: "trip-list", title: "Your itinerary", body: "Drag the handle to reorder. Each stop shows when you arrive and whether it is open then; tap it for details." },
  ],
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
  passport: [
    { target: "passport-cover", title: "Your passport", body: "Level, XP toward the next level, and your streak. One rest day never breaks a streak." },
    { target: "my-day", title: "My day and your heat map", body: "Today's stations and landmarks, a map that glows where you go most, and a picture of your day to share." },
    { target: "stamp-tabs", title: "148 stamps to collect", body: "A stamp for every station, every landmark, and three collections. Tap any stamp to see how to earn it." },
    { target: "passport-settings", title: "Demo mode, intro and reset", body: "Turn demo mode off for live MBTA data and your real location, replay the opening, or reset to start clean." },
  ],
};

export type GuideStepId = "plan" | "begin" | "play" | "ride" | "scan" | "finish" | "passport";

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
  { id: "plan", title: "Plan Harvard to Park Street", hint: "On Ride, tap “Park Street” to plan the trip from Harvard.", href: "/ride", controls: ["Go to Park Street"] },
  { id: "begin", title: "Check the route and begin", hint: "Check the route and the fare, then start the journey.", href: "/journey", controls: ["Start journey", "I am at the station"] },
  { id: "play", title: "Play Bostie's Favourite while you wait", hint: "Pick Bostie Guessing and choose the right answer for each photo.", href: "/play/guess", controls: ["Start round"] },
  { id: "ride", title: "Ride four stops on the Red Line", hint: "Confirm each arrival to collect station stamps.", href: "/journey", controls: ["My train is here", "I am on board"] },
  { id: "scan", title: "Scan a landmark by Park Street", hint: "Tap a sample photo, or use your own. A real Gemini call.", href: "/scan", controls: ["Explore nearby"] },
  { id: "finish", title: "Complete the journey", hint: "Finish exploring to bank the journey XP.", href: "/journey", controls: ["Complete journey"] },
  { id: "passport", title: "Open your passport", hint: "Stamps, badges and your new level.", href: "/passport", controls: ["Open passport"] },
];

export const guideStep = (id: GuideStepId) => GUIDE_STEPS.find((s) => s.id === id)!;

/** Labels on the tip card itself. */
export const TIP = { next: "Next", done: "Got it", skip: "Skip tips", back: "Back" };
