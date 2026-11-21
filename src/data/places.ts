// Curated ground truth for landmarks and Guess Boston locations.
// Everything Gemini says about a place is grounded in (and validated against) this file:
// the model never invents an answer, an identifier, or a history fact that is not here.
// Keep this file dependency-free: scripts/fetch-wiki.mjs imports it directly.

export type PlaceKind = "landmark" | "station" | "neighborhood";

export type Place = {
  id: string;
  kind: PlaceKind;
  name: string;
  /** Accepted answers for deterministic matching (lowercase, punctuation-free). */
  aliases: string[];
  lat: number;
  lng: number;
  /** MBTA parent-station id. For kind "station" this is the station itself. */
  stationId?: string;
  neighborhood: string;
  year?: string;
  /** Reliable reference text. Supplied to Gemini as grounding context. */
  summary: string;
  /** Distinctive visual traits, used as recognition grounding and offline hint fallback. */
  cues: string[];
  /** 1 easy · 2 medium · 3 hard */
  difficulty: 1 | 2 | 3;
  freedomTrail?: boolean;
  /** English Wikipedia article title used to source a licensed photo. */
  wiki: string;
};

export const LANDMARKS: Place[] = [
  {
    id: "state-house",
    kind: "landmark",
    name: "Massachusetts State House",
    aliases: ["state house", "massachusetts state house", "boston state house", "the state house", "new state house"],
    lat: 42.3587, lng: -71.0638,
    neighborhood: "Beacon Hill",
    year: "1798",
    summary:
      "Designed by Charles Bulfinch and completed in 1798 on land once owned by John Hancock, the State House is the seat of Massachusetts government. Its dome was first wooden, then sheathed in copper by Paul Revere's company in 1802, and gilded with gold leaf in 1874.",
    cues: ["large gilded gold dome", "red brick Federal facade", "white columned portico above arches", "sits at the top of Boston Common"],
    difficulty: 1,
    freedomTrail: true,
    wiki: "Massachusetts State House",
  },
  {
    id: "park-street-church",
    kind: "landmark",
    name: "Park Street Church",
    aliases: ["park street church", "park st church", "brimstone corner"],
    lat: 42.3568, lng: -71.0621,
    neighborhood: "Downtown",
    year: "1809",
    summary:
      "Founded in 1809, Park Street Church stands at the corner of Park and Tremont streets, a spot nicknamed Brimstone Corner. William Lloyd Garrison gave a major anti-slavery address here in 1829, and the hymn \"America\" (My Country, 'Tis of Thee) was first sung publicly on its steps in 1831.",
    cues: ["tall white multi-tiered steeple", "red brick church body", "corner of Park and Tremont streets beside Boston Common"],
    difficulty: 2,
    freedomTrail: true,
    wiki: "Park Street Church",
  },
  {
    id: "granary",
    kind: "landmark",
    name: "Granary Burying Ground",
    aliases: ["granary burying ground", "granary burial ground", "granary cemetery", "old granary burying ground", "the granary"],
    lat: 42.3573, lng: -71.0615,
    neighborhood: "Downtown",
    year: "1660",
    summary:
      "Established in 1660, the Granary Burying Ground is the resting place of Paul Revere, Samuel Adams, John Hancock, and the victims of the Boston Massacre. It takes its name from a grain storehouse that once stood next door.",
    cues: ["rows of weathered slate gravestones", "Egyptian Revival granite gate", "obelisk monument at the center", "hemmed in by downtown buildings"],
    difficulty: 2,
    freedomTrail: true,
    wiki: "Granary Burying Ground",
  },
  {
    id: "kings-chapel",
    kind: "landmark",
    name: "King's Chapel",
    aliases: ["kings chapel", "king s chapel", "kings chapel boston"],
    lat: 42.3581, lng: -71.06,
    neighborhood: "Downtown",
    year: "1754",
    summary:
      "King's Chapel was founded in 1686 as the first Anglican church in New England. The present stone building, designed by Peter Harrison, was completed in 1754; its planned steeple was never built, leaving the distinctive flat-topped tower.",
    cues: ["dark granite block walls", "squat tower with no steeple", "wooden Ionic colonnade at the entrance"],
    difficulty: 3,
    freedomTrail: true,
    wiki: "King's Chapel",
  },
  {
    id: "old-south",
    kind: "landmark",
    name: "Old South Meeting House",
    aliases: ["old south meeting house", "old south meetinghouse", "old south", "old south church meeting house"],
    lat: 42.357, lng: -71.0586,
    neighborhood: "Downtown",
    year: "1729",
    summary:
      "Built in 1729 as a Puritan meeting house, Old South was the largest building in colonial Boston. On December 16, 1773, some 5,000 colonists gathered here in the meeting that led directly to the Boston Tea Party.",
    cues: ["red brick meeting house", "tall brick tower with a pale wooden spire", "clock on the tower", "surrounded by modern office towers"],
    difficulty: 2,
    freedomTrail: true,
    wiki: "Old South Meeting House",
  },
  {
    id: "old-state-house",
    kind: "landmark",
    name: "Old State House",
    aliases: ["old state house", "old statehouse", "old state house boston", "towne house"],
    lat: 42.3588, lng: -71.0575,
    neighborhood: "Downtown",
    year: "1713",
    summary:
      "Built in 1713, the Old State House is Boston's oldest surviving public building and was the seat of colonial government. The Boston Massacre took place outside it in 1770, and the Declaration of Independence was first read to Bostonians from its east balcony on July 18, 1776.",
    cues: ["small red brick Georgian building", "gilded lion and unicorn on the gable", "white balcony on the east face", "dwarfed by glass skyscrapers"],
    difficulty: 1,
    freedomTrail: true,
    wiki: "Old State House (Boston)",
  },
  {
    id: "faneuil-hall",
    kind: "landmark",
    name: "Faneuil Hall",
    aliases: ["faneuil hall", "faneuil", "fanueil hall", "cradle of liberty", "faneuil hall marketplace"],
    lat: 42.36, lng: -71.0562,
    neighborhood: "Downtown",
    year: "1742",
    summary:
      "A gift to the town from merchant Peter Faneuil, Faneuil Hall opened in 1742 as a market and meeting hall. Speeches by Samuel Adams and others urging independence earned it the name \"the Cradle of Liberty\". Its grasshopper weathervane dates to 1742.",
    cues: ["red brick hall with rows of arched windows", "white cupola topped by a gilded grasshopper weathervane", "statue of Samuel Adams in front"],
    difficulty: 1,
    freedomTrail: true,
    wiki: "Faneuil Hall",
  },
  {
    id: "paul-revere-house",
    kind: "landmark",
    name: "Paul Revere House",
    aliases: ["paul revere house", "revere house", "paul reveres house", "paul revere s house"],
    lat: 42.3637, lng: -71.0537,
    neighborhood: "North End",
    year: "c. 1680",
    summary:
      "Built around 1680, this is the oldest surviving house in downtown Boston. Paul Revere owned it from 1770 to 1800 and left from here on his midnight ride of April 18, 1775. It has operated as a museum since 1908.",
    cues: ["dark gray wooden clapboard house", "overhanging second storey", "diamond-paned casement windows", "cobblestoned North Square"],
    difficulty: 3,
    freedomTrail: true,
    wiki: "Paul Revere House",
  },
  {
    id: "old-north-church",
    kind: "landmark",
    name: "Old North Church",
    aliases: ["old north church", "old north", "christ church in the city of boston", "christ church boston"],
    lat: 42.3663, lng: -71.0544,
    neighborhood: "North End",
    year: "1723",
    summary:
      "Built in 1723, Old North is Boston's oldest standing church building. On the night of April 18, 1775, two lanterns hung in its steeple signalled that British troops were crossing the Charles by water: \"one if by land, two if by sea\".",
    cues: ["slender white steeple above a brick tower", "red brick Georgian church", "narrow North End streets", "Paul Revere statue on the mall behind"],
    difficulty: 1,
    freedomTrail: true,
    wiki: "Old North Church",
  },
  {
    id: "uss-constitution",
    kind: "landmark",
    name: "USS Constitution",
    aliases: ["uss constitution", "old ironsides", "constitution", "the constitution ship", "u s s constitution"],
    lat: 42.3724, lng: -71.0566,
    neighborhood: "Charlestown",
    year: "1797",
    summary:
      "Launched in Boston in 1797, USS Constitution is the world's oldest commissioned warship still afloat. She earned the nickname \"Old Ironsides\" in the War of 1812 when British cannonballs appeared to bounce off her oak hull.",
    cues: ["three-masted wooden frigate", "black hull with a white gun stripe", "moored at the Charlestown Navy Yard"],
    difficulty: 1,
    freedomTrail: true,
    wiki: "USS Constitution",
  },
  {
    id: "bunker-hill",
    kind: "landmark",
    name: "Bunker Hill Monument",
    aliases: ["bunker hill monument", "bunker hill", "bunker hill memorial", "the bunker hill obelisk"],
    lat: 42.3764, lng: -71.0608,
    neighborhood: "Charlestown",
    year: "1843",
    summary:
      "This 221-foot granite obelisk, completed in 1843, commemorates the Battle of Bunker Hill of June 17, 1775, the first major battle of the Revolutionary War. It actually stands on Breed's Hill, where most of the fighting took place.",
    cues: ["tall plain granite obelisk", "grassy hilltop square", "statue of Colonel William Prescott at the base"],
    difficulty: 1,
    freedomTrail: true,
    wiki: "Bunker Hill Monument",
  },
  {
    id: "bpl",
    kind: "landmark",
    name: "Boston Public Library",
    aliases: ["boston public library", "bpl", "mckim building", "central library", "boston public library mckim building", "copley library"],
    lat: 42.3493, lng: -71.0782,
    neighborhood: "Back Bay",
    year: "1895",
    summary:
      "The Boston Public Library was the first large free municipal library in the United States. Its McKim Building on Copley Square, designed by Charles Follen McKim and opened in 1895, was conceived as a \"palace for the people\" and carries the inscription \"Free to All\".",
    cues: ["long Renaissance Revival granite facade", "row of tall arched windows", "inscription across the cornice", "faces Copley Square"],
    difficulty: 2,
    wiki: "Boston Public Library, McKim Building",
  },
  {
    id: "trinity-church",
    kind: "landmark",
    name: "Trinity Church",
    aliases: ["trinity church", "trinity church boston", "trinity church copley", "trinity"],
    lat: 42.35, lng: -71.0755,
    neighborhood: "Back Bay",
    year: "1877",
    summary:
      "Designed by Henry Hobson Richardson and consecrated in 1877, Trinity Church defined the style now called Richardsonian Romanesque. It rests on thousands of wooden piles driven into Back Bay's filled land and is famously reflected in the glass of the neighbouring Hancock tower.",
    cues: ["massive central tower with a red tile roof", "rough polychrome stone and rounded arches", "reflected in a blue glass skyscraper", "on Copley Square"],
    difficulty: 2,
    wiki: "Trinity Church (Boston)",
  },
  {
    id: "public-garden",
    kind: "landmark",
    name: "Boston Public Garden",
    aliases: ["public garden", "boston public garden", "the public garden", "swan boats", "boston public gardens"],
    lat: 42.3541, lng: -71.07,
    neighborhood: "Back Bay",
    year: "1837",
    summary:
      "Established in 1837, the Public Garden was the first public botanical garden in the United States. Its Swan Boats have paddled the lagoon since 1877, and its small suspension footbridge and equestrian statue of George Washington are city icons.",
    cues: ["lagoon with pedal-powered swan boats", "small suspension footbridge", "weeping willows and formal flower beds", "equestrian George Washington statue"],
    difficulty: 2,
    wiki: "Public Garden (Boston)",
  },
  {
    id: "fenway-park",
    kind: "landmark",
    name: "Fenway Park",
    aliases: ["fenway park", "fenway", "fenway stadium", "red sox stadium", "home of the red sox"],
    lat: 42.3467, lng: -71.0972,
    neighborhood: "Fenway–Kenmore",
    year: "1912",
    summary:
      "Open since 1912, Fenway Park is the oldest ballpark in Major League Baseball and home of the Boston Red Sox. Its 37-foot left-field wall, the Green Monster, and its hand-operated scoreboard are among the most recognisable features in sport.",
    cues: ["tall green left-field wall", "red brick exterior on Jersey Street", "hand-operated scoreboard", "green seats and light towers"],
    difficulty: 1,
    wiki: "Fenway Park",
  },
  {
    id: "mit-dome",
    kind: "landmark",
    name: "MIT Great Dome",
    aliases: ["mit great dome", "great dome", "mit dome", "mit", "killian court", "mit building 10", "massachusetts institute of technology"],
    lat: 42.3601, lng: -71.0921,
    neighborhood: "Cambridge",
    year: "1916",
    summary:
      "The Great Dome crowns Building 10 at the heart of MIT's Cambridge campus, designed by William Welles Bosworth and opened in 1916 when the Institute moved across the Charles from Boston. Modelled on the Pantheon, it overlooks Killian Court and is a favourite target of student \"hacks\".",
    cues: ["low Pantheon-style dome", "limestone facade with a row of Ionic columns", "wide lawn of Killian Court in front"],
    difficulty: 2,
    wiki: "Great Dome (MIT)",
  },
  {
    id: "john-harvard",
    kind: "landmark",
    name: "John Harvard Statue",
    aliases: ["john harvard statue", "john harvard", "statue of john harvard", "statue of three lies", "harvard statue", "harvard yard statue"],
    lat: 42.3745, lng: -71.1172,
    neighborhood: "Cambridge",
    year: "1884",
    summary:
      "Daniel Chester French's 1884 bronze in Harvard Yard is nicknamed the \"Statue of Three Lies\": its inscription calls John Harvard the founder (he was a benefactor), dates the college to 1638 (it was 1636), and the face is a student model's, since no likeness of Harvard survives. Visitors rub its left shoe for luck.",
    cues: ["seated bronze figure on a granite plinth", "shiny worn left shoe", "in front of grey granite University Hall", "Harvard Yard lawns"],
    difficulty: 2,
    wiki: "John Harvard (statue)",
  },
  {
    id: "longfellow-bridge",
    kind: "landmark",
    name: "Longfellow Bridge",
    aliases: ["longfellow bridge", "longfellow", "salt and pepper bridge", "salt and pepper shaker bridge", "cambridge bridge"],
    lat: 42.3617, lng: -71.0756,
    neighborhood: "Charles River",
    year: "1906",
    summary:
      "Opened in 1906 and later renamed for poet Henry Wadsworth Longfellow, this steel-arch bridge carries the Red Line and road traffic over the Charles River between Boston and Cambridge. Its four granite towers earned it the nickname \"Salt-and-Pepper Bridge\".",
    cues: ["four stout granite towers shaped like salt and pepper shakers", "steel arches across the Charles River", "Red Line trains running down the middle"],
    difficulty: 2,
    wiki: "Longfellow Bridge",
  },
  {
    id: "zakim-bridge",
    kind: "landmark",
    name: "Zakim Bridge",
    aliases: ["zakim bridge", "zakim", "leonard p zakim bunker hill memorial bridge", "bunker hill bridge", "zakim bunker hill bridge", "leonard zakim bridge"],
    lat: 42.3688, lng: -71.0631,
    neighborhood: "West End",
    year: "2003",
    summary:
      "Completed in 2003 as the centrepiece of the Big Dig, the Leonard P. Zakim Bunker Hill Memorial Bridge carries Interstate 93 over the Charles River. Its two inverted-Y towers deliberately echo the Bunker Hill Monument nearby.",
    cues: ["white cable-stayed bridge", "two inverted-Y concrete towers topped with obelisk shapes", "fans of white cables", "next to TD Garden"],
    difficulty: 1,
    wiki: "Leonard P. Zakim Bunker Hill Memorial Bridge",
  },
  {
    id: "custom-house",
    kind: "landmark",
    name: "Custom House Tower",
    aliases: ["custom house tower", "custom house", "boston custom house", "customs house tower", "customs house"],
    lat: 42.3591, lng: -71.0535,
    neighborhood: "Waterfront",
    year: "1915",
    summary:
      "The Greek Revival Custom House was completed in 1847 at what was then the water's edge. The 496-foot tower added in 1915 made it Boston's tallest building for nearly half a century, exempt from city height limits because it was federal property.",
    cues: ["slender stone tower with a large clock face", "pyramid roof", "rises from a columned Greek temple base"],
    difficulty: 2,
    wiki: "Custom House Tower",
  },
];

export const GAME_STATIONS: Place[] = [
  {
    id: "stn-park-street",
    kind: "station",
    stationId: "place-pktrm",
    name: "Park Street",
    aliases: ["park street", "park st", "park street station", "park"],
    lat: 42.3564, lng: -71.0624,
    neighborhood: "Downtown",
    year: "1897",
    summary:
      "Park Street opened on September 1, 1897 as part of the Tremont Street Subway, the first subway in the United States. Today it is the transfer point between the Red and Green lines beneath Boston Common.",
    cues: ["granite headhouse kiosks on the edge of Boston Common", "Green Line trolleys on the upper level", "Red Line platforms below"],
    difficulty: 1,
    wiki: "Park Street station (MBTA)",
  },
  {
    id: "stn-harvard",
    kind: "station",
    stationId: "place-harsq",
    name: "Harvard",
    aliases: ["harvard", "harvard station", "harvard square", "harvard square station", "harvard sq"],
    lat: 42.3734, lng: -71.119,
    neighborhood: "Cambridge",
    year: "1912",
    summary:
      "Harvard opened in 1912 as the northern terminus of the Cambridge subway. The station was rebuilt in the 1980s when the Red Line was extended to Alewife, and its tunnel busway still carries buses beneath Harvard Square.",
    cues: ["glass and steel headhouse in the middle of Harvard Square", "curved platforms", "underground bus tunnel"],
    difficulty: 1,
    wiki: "Harvard station",
  },
  {
    id: "stn-kendall",
    kind: "station",
    stationId: "place-knncl",
    name: "Kendall/MIT",
    aliases: ["kendall", "kendall mit", "kendall square", "kendall station", "kendall mit station", "mit station"],
    lat: 42.3625, lng: -71.0862,
    neighborhood: "Cambridge",
    year: "1912",
    summary:
      "Kendall/MIT has served the Red Line since 1912. Riders waiting on the platform can play the Kendall Band, an interactive musical sculpture by Paul Matisse hanging between the tracks.",
    cues: ["hanging chimes and hammers between the tracks", "wall panels on MIT history", "handles on the platform wall that ring the sculpture"],
    difficulty: 2,
    wiki: "Kendall/MIT station",
  },
  {
    id: "stn-charles",
    kind: "station",
    stationId: "place-chmnl",
    name: "Charles/MGH",
    aliases: ["charles mgh", "charles", "charles street", "charles mgh station", "mgh", "charles circle"],
    lat: 42.3612, lng: -71.0706,
    neighborhood: "Beacon Hill",
    year: "1932",
    summary:
      "Charles/MGH opened in 1932 as an elevated station above Charles Circle, where the Red Line emerges from Beacon Hill to cross the Longfellow Bridge. Its curved glass headhouse dates from a 2007 rebuild.",
    cues: ["elevated platforms above a traffic circle", "curved glass entrance pavilion", "trains heading onto the Longfellow Bridge"],
    difficulty: 2,
    wiki: "Charles/MGH station",
  },
  {
    id: "stn-south-station",
    kind: "station",
    stationId: "place-sstat",
    name: "South Station",
    aliases: ["south station", "south sta", "boston south station"],
    lat: 42.3523, lng: -71.0552,
    neighborhood: "Downtown",
    year: "1899",
    summary:
      "South Station opened in 1899 and was once the busiest railway station in the world. Its curved neoclassical headhouse now anchors the Red Line, Silver Line, commuter rail and Amtrak's Northeast Corridor.",
    cues: ["curved granite neoclassical facade", "large clock topped by an eagle", "Ionic columns above the entrance"],
    difficulty: 1,
    wiki: "South Station",
  },
  {
    id: "stn-government-center",
    kind: "station",
    stationId: "place-gover",
    name: "Government Center",
    aliases: ["government center", "govt center", "government center station", "scollay square", "gov center"],
    lat: 42.3597, lng: -71.0592,
    neighborhood: "Downtown",
    year: "1898",
    summary:
      "Opened in 1898 as Scollay Square, the station was renamed when the old square was cleared for City Hall Plaza in the 1960s. Its tall glass headhouse opened in 2016, and it links the Green and Blue lines.",
    cues: ["tall angular glass headhouse", "brick expanse of City Hall Plaza", "Brutalist Boston City Hall behind"],
    difficulty: 2,
    wiki: "Government Center station (MBTA)",
  },
  {
    id: "stn-kenmore",
    kind: "station",
    stationId: "place-kencl",
    name: "Kenmore",
    aliases: ["kenmore", "kenmore square", "kenmore station", "kenmore sq"],
    lat: 42.3489, lng: -71.0952,
    neighborhood: "Fenway–Kenmore",
    year: "1932",
    summary:
      "Kenmore opened in 1932 beneath Kenmore Square, where the Green Line's B, C and D branches split. It is the closest stop to Fenway Park, and its glass bus canopy sits below the famous Citgo sign.",
    cues: ["curved glass and steel bus canopy", "large Citgo sign overhead", "crowds in Red Sox colours on game days"],
    difficulty: 2,
    wiki: "Kenmore station",
  },
  {
    id: "stn-alewife",
    kind: "station",
    stationId: "place-alfcl",
    name: "Alewife",
    aliases: ["alewife", "alewife station"],
    lat: 42.3958, lng: -71.1413,
    neighborhood: "Cambridge",
    year: "1985",
    summary:
      "Alewife opened in 1985 as the northern terminus of the Red Line's Northwest Extension. Named for Alewife Brook and the herring that run in it, the station is topped by a large commuter parking garage.",
    cues: ["concrete parking garage above the station", "glass atrium", "end-of-line platform with trains reversing"],
    difficulty: 3,
    wiki: "Alewife station",
  },
];

export const NEIGHBORHOODS: Place[] = [
  {
    id: "nbh-beacon-hill",
    kind: "neighborhood",
    stationId: "place-chmnl",
    name: "Beacon Hill",
    aliases: ["beacon hill", "beacon hill boston", "acorn street"],
    lat: 42.3583, lng: -71.0661,
    neighborhood: "Beacon Hill",
    summary:
      "Beacon Hill is one of Boston's oldest neighbourhoods, known for Federal-style brick rowhouses, gas-lit lanes and cobbled Acorn Street. The hill takes its name from a warning beacon that once stood at its summit.",
    cues: ["narrow cobblestone lane", "brick rowhouses with black shutters", "gas street lamps", "steep brick sidewalks"],
    difficulty: 1,
    wiki: "Beacon Hill, Boston",
  },
  {
    id: "nbh-back-bay",
    kind: "neighborhood",
    stationId: "place-coecl",
    name: "Back Bay",
    aliases: ["back bay", "back bay boston", "newbury street", "commonwealth avenue"],
    lat: 42.3503, lng: -71.081,
    neighborhood: "Back Bay",
    summary:
      "Back Bay was a tidal mudflat until a massive landfill project begun in 1857 created the neighbourhood. Its orderly grid of Victorian brownstones, Newbury Street shops and the Commonwealth Avenue Mall is one of America's best-preserved 19th-century districts.",
    cues: ["rows of Victorian brownstones with bay windows", "wide tree-lined boulevard mall", "Hancock and Prudential towers behind"],
    difficulty: 2,
    wiki: "Back Bay, Boston",
  },
  {
    id: "nbh-north-end",
    kind: "neighborhood",
    stationId: "place-haecl",
    name: "North End",
    aliases: ["north end", "the north end", "north end boston", "little italy", "hanover street"],
    lat: 42.3647, lng: -71.0542,
    neighborhood: "North End",
    summary:
      "Settled in the 1630s, the North End is Boston's oldest residential neighbourhood. It has been the heart of the city's Italian-American community for more than a century, famed for the bakeries and restaurants of Hanover Street.",
    cues: ["narrow streets of brick tenements", "Italian restaurants and bakeries", "fire escapes and festival decorations", "Old North steeple in the distance"],
    difficulty: 2,
    wiki: "North End, Boston",
  },
  {
    id: "nbh-chinatown",
    kind: "neighborhood",
    stationId: "place-chncl",
    name: "Chinatown",
    aliases: ["chinatown", "boston chinatown", "china town", "chinatown gate"],
    lat: 42.3513, lng: -71.0607,
    neighborhood: "Chinatown",
    summary:
      "Boston's Chinatown is the only surviving historic Chinese neighbourhood in New England. Its paifang gate on Beach Street, a gift from Taiwan installed in 1982, is guarded by a pair of foo lions.",
    cues: ["ornate paifang gate with green tiled roof", "stone guardian lions", "bilingual street signs"],
    difficulty: 1,
    wiki: "Chinatown, Boston",
  },
  {
    id: "nbh-charlestown",
    kind: "neighborhood",
    stationId: "place-ccmnl",
    name: "Charlestown",
    aliases: ["charlestown", "charlestown boston", "charles town"],
    lat: 42.3753, lng: -71.0644,
    neighborhood: "Charlestown",
    summary:
      "Founded in 1628, two years before Boston itself, Charlestown sits on a peninsula north of the Charles River. It is home to the Bunker Hill Monument and the Navy Yard, and was annexed by Boston in 1874.",
    cues: ["hillside rowhouses and gas lamps", "granite obelisk above the rooftops", "navy yard piers"],
    difficulty: 3,
    wiki: "Charlestown, Boston",
  },
];

export const PLACES: Place[] = [...LANDMARKS, ...GAME_STATIONS, ...NEIGHBORHOODS];
