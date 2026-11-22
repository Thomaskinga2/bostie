// Bostie Parkour trivia about Boston people, and the things Bostie Drawing can ask for.
//
// Every question was checked against the page in `source` on TRIVIA_VERIFIED_ON: the
// answer is what that page says, not what a model remembers. To add one, read the source
// first; if a fact cannot be sourced, leave the question out.
export const TRIVIA_VERIFIED_ON = "2026-11-21";

export type FigureQuestion = { id: string; q: string; answer: string; wrong: [string, string, string]; source: string };
const wiki = (page: string) => `https://en.wikipedia.org/wiki/${page}`;

export const FIGURES: FigureQuestion[] = [
  { id: "revere", q: "Who made the famous midnight ride in April 1775 to warn that British troops were coming?", answer: "Paul Revere", wrong: ["Samuel Adams", "John Hancock", "Benjamin Franklin"], source: wiki("Paul_Revere") },
  { id: "attucks", q: "Who is traditionally regarded as the first person killed in the Boston Massacre?", answer: "Crispus Attucks", wrong: ["Paul Revere", "Robert Gould Shaw", "John Winthrop"], source: wiki("Crispus_Attucks") },
  { id: "wheatley", q: "Who is considered the first African-American author of a published book of poetry?", answer: "Phillis Wheatley", wrong: ["Louisa May Alcott", "Isabella Stewart Gardner", "Donna Summer"], source: wiki("Phillis_Wheatley") },
  { id: "hancock", q: "Which Bostonian is best remembered for his large, flamboyant signature on the Declaration of Independence?", answer: "John Hancock", wrong: ["Samuel Adams", "Paul Revere", "John Winthrop"], source: wiki("John_Hancock") },
  { id: "bulfinch", q: "Which architect designed the Massachusetts State House?", answer: "Charles Bulfinch", wrong: ["Frederick Law Olmsted", "Alexander Graham Bell", "Robert McCloskey"], source: wiki("Charles_Bulfinch") },
  { id: "olmsted", q: "Who designed Boston's Emerald Necklace of parks?", answer: "Frederick Law Olmsted", wrong: ["Charles Bulfinch", "Isabella Stewart Gardner", "Arthur Fiedler"], source: wiki("Frederick_Law_Olmsted") },
  { id: "gardner", q: "Who founded the Boston art museum that carries her own name?", answer: "Isabella Stewart Gardner", wrong: ["Louisa May Alcott", "Phillis Wheatley", "Donna Summer"], source: wiki("Isabella_Stewart_Gardner") },
  { id: "shaw", q: "Who commanded the 54th Massachusetts, the first all-Black regiment, in the Civil War?", answer: "Robert Gould Shaw", wrong: ["William Lloyd Garrison", "Crispus Attucks", "John F. Kennedy"], source: wiki("Robert_Gould_Shaw") },
  { id: "russell", q: "Which Boston Celtics player won 11 NBA championships?", answer: "Bill Russell", wrong: ["Larry Bird", "Bobby Orr", "Ted Williams"], source: wiki("Bill_Russell") },
  { id: "williams", q: "Which Red Sox hitter posted a .406 batting average in 1941?", answer: "Ted Williams", wrong: ["Bill Russell", "Bobby Orr", "Larry Bird"], source: wiki("Ted_Williams") },
  { id: "poe", q: "Which writer of dark tales and poems was born in Boston in 1809?", answer: "Edgar Allan Poe", wrong: ["Robert McCloskey", "Louisa May Alcott", "Benjamin Franklin"], source: wiki("Edgar_Allan_Poe") },
  { id: "franklin", q: "Which Founding Father was born in Boston in 1706?", answer: "Benjamin Franklin", wrong: ["John Hancock", "Paul Revere", "John Winthrop"], source: wiki("Benjamin_Franklin") },
  { id: "jfk", q: "Which US president was born in Brookline, Massachusetts, in 1917?", answer: "John F. Kennedy", wrong: ["Benjamin Franklin", "Samuel Adams", "John Hancock"], source: wiki("John_F._Kennedy") },
  { id: "bell", q: "Who got his telephone to work in Boston in March 1876?", answer: "Alexander Graham Bell", wrong: ["Benjamin Franklin", "Charles Bulfinch", "Frederick Law Olmsted"], source: wiki("Alexander_Graham_Bell") },
  { id: "mccloskey", q: "Who wrote and drew “Make Way for Ducklings”, set in Boston?", answer: "Robert McCloskey", wrong: ["Louisa May Alcott", "Edgar Allan Poe", "Leonard Nimoy"], source: wiki("Robert_McCloskey") },
  { id: "garrison", q: "Who published the anti-slavery newspaper “The Liberator” in Boston?", answer: "William Lloyd Garrison", wrong: ["Robert Gould Shaw", "Samuel Adams", "John Winthrop"], source: wiki("William_Lloyd_Garrison") },
  { id: "king", q: "Which civil rights leader received his PhD from Boston University in 1955?", answer: "Martin Luther King Jr.", wrong: ["Malcolm X", "John F. Kennedy", "William Lloyd Garrison"], source: wiki("Martin_Luther_King_Jr.") },
  { id: "fiedler", q: "Who conducted the Boston Pops for nearly 50 years?", answer: "Arthur Fiedler", wrong: ["Leonard Nimoy", "Robert McCloskey", "Charles Bulfinch"], source: wiki("Arthur_Fiedler") },
  { id: "orr", q: "Which hockey defenseman spent his first 10 seasons with the Boston Bruins?", answer: "Bobby Orr", wrong: ["Larry Bird", "Bill Russell", "Ted Williams"], source: wiki("Bobby_Orr") },
  { id: "nimoy", q: "Which actor, Spock in Star Trek, was born in Boston?", answer: "Leonard Nimoy", wrong: ["Arthur Fiedler", "Larry Bird", "Edgar Allan Poe"], source: wiki("Leonard_Nimoy") },
  { id: "summer", q: "Which Boston-born singer is known as the “Queen of Disco”?", answer: "Donna Summer", wrong: ["Isabella Stewart Gardner", "Phillis Wheatley", "Louisa May Alcott"], source: wiki("Donna_Summer") },
  { id: "winthrop", q: "Who was an early governor of the Massachusetts Bay Colony?", answer: "John Winthrop", wrong: ["John Hancock", "Paul Revere", "Crispus Attucks"], source: wiki("John_Winthrop") },
  { id: "adams", q: "Which Boston-born leader of the Revolution signed the Declaration of Independence?", answer: "Samuel Adams", wrong: ["Paul Revere", "John Winthrop", "Crispus Attucks"], source: wiki("Samuel_Adams") },
  { id: "malcolm", q: "Which civil rights figure lived in Roxbury with his half-sister as a young man?", answer: "Malcolm X", wrong: ["Martin Luther King Jr.", "Bill Russell", "Crispus Attucks"], source: wiki("Malcolm_X") },
  { id: "alcott", q: "Who is best known for writing the novel “Little Women”?", answer: "Louisa May Alcott", wrong: ["Phillis Wheatley", "Isabella Stewart Gardner", "Robert McCloskey"], source: wiki("Louisa_May_Alcott") },
  { id: "bird", q: "Who played his entire 13-season professional career for the Celtics?", answer: "Larry Bird", wrong: ["Bill Russell", "Bobby Orr", "Ted Williams"], source: wiki("Larry_Bird") },
];

/** Generic Boston things to draw. No reference photo: Gemini judges them from these features. */
export const SYMBOLS: { id: string; name: string; cues: string[] }[] = [
  { id: "sym-swan-boat", name: "A swan boat", cues: ["a large swan figure at the back of a flat boat", "rows of bench seats with passengers", "water underneath"] },
  { id: "sym-lobster", name: "A lobster", cues: ["two large claws", "long antennae", "a segmented tail", "several legs"] },
  { id: "sym-t-train", name: "A T subway train", cues: ["a long rectangular train car", "a row of windows and doors", "wheels on rails", "a circled letter T"] },
  { id: "sym-lighthouse", name: "A harbor lighthouse", cues: ["a tall tapering tower", "a lamp room at the top with light beams", "rocks or water at the base"] },
  { id: "sym-sailboat", name: "A sailboat on the Charles River", cues: ["a hull on water", "a mast with a triangular sail", "waves or a river line"] },
  { id: "sym-ducklings", name: "A mother duck and her ducklings", cues: ["one large duck", "a line of smaller ducks following", "beaks and webbed feet"] },
  { id: "sym-tea-chest", name: "A tea chest falling into the harbor", cues: ["a box or crate", "water or waves", "a splash or a ship's side"] },
  { id: "sym-cream-pie", name: "A Boston cream pie", cues: ["a round layered cake", "a cream filling stripe", "a dark chocolate top"] },
];
