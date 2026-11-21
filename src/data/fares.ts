// MBTA FARE CONFIGURATION: the one place fares, transfer rules and payment methods live.
//
// Every number and rule below was read from the official MBTA pages listed in
// FARE_SOURCES on the date in FARES_VERIFIED_ON. Nothing here is estimated or
// generated. To update: re-read those pages, change the values, change the date,
// and run `npm test` (tests/logic.spec.ts pins the published prices).
//
// Amounts are in cents so fare arithmetic is exact. Keep this file dependency-free.

export const FARES_VERIFIED_ON = "2026-11-21";

export const FARE_SOURCES = {
  overview: "https://www.mbta.com/fares",
  subway: "https://www.mbta.com/fares/subway-fares",
  bus: "https://www.mbta.com/fares/bus-fares",
  commuter_rail: "https://www.mbta.com/fares/commuter-rail-fares",
  commuter_rail_zones: "https://www.mbta.com/fares/commuter-rail-fares/zones",
  ferry: "https://www.mbta.com/fares/ferry-fares",
  transfers: "https://www.mbta.com/fares/transfers",
  reduced: "https://www.mbta.com/fares/reduced",
  contactless: "https://www.mbta.com/fares/charlie/tap-ride",
} as const;

export type FareMode = "subway" | "bus" | "commuter_rail" | "ferry";
export type FareCategory = "adult" | "reduced";
/** [adult, reduced] one-way, in cents. */
type Price = readonly [number, number];

export const MODE_LABEL: Record<FareMode, string> = { subway: "Subway", bus: "Bus", commuter_rail: "Commuter Rail", ferry: "Ferry" };

// Subway fares cover the Red, Orange, Green and Blue lines, the Mattapan Trolley and
// Silver Line SL1, SL2 and SL3. Bus fares cover local buses, SL4 and SL5, and (on a
// pilot basis from 1 September 2026) express buses.
export const SUBWAY_FARE: Price = [240, 110];
export const BUS_FARE: Price = [170, 85];

/** Commuter Rail: fare to or from Zone 1A (metro Boston), by the other station's zone. */
export const CR_ZONE_FARE: Record<string, Price> = {
  "1A": [240, 110], "1": [650, 325], "2": [700, 350], "3": [800, 400], "4": [875, 425], "5": [975, 475],
  "6": [1050, 525], "7": [1100, 550], "8": [1225, 600], "9": [1275, 625], "10": [1325, 650],
};
/** Commuter Rail interzone fares (trips that do not touch Zone 1A), Interzone 1 to 10. */
export const CR_INTERZONE_FARE: Record<number, Price> = {
  1: [275, 125], 2: [325, 150], 3: [350, 175], 4: [425, 200], 5: [475, 225],
  6: [525, 250], 7: [575, 275], 8: [625, 300], 9: [675, 325], 10: [725, 350],
};

export const FERRY_FARE = {
  inner_harbor: { label: "Inner Harbor (Charlestown, East Boston, Harbor Loop)", price: [240, 110] as Price, cash: true },
  east_boston: { label: "East Boston ferry", price: [240, 110] as Price, cash: false },
  winthrop_quincy: { label: "Winthrop and Quincy ferry", price: [650, 325] as Price, cash: true },
  lynn: { label: "Lynn ferry", price: [700, 350] as Price, cash: true },
  // Cash is accepted except on the Hingham to Rowes Wharf (F1) boats.
  hingham_hull: { label: "Hingham/Hull ferry", price: [975, 485] as Price, cash: true },
} as const;
export type FerryService = keyof typeof FERRY_FARE;

// Transfer policy, piloted from 1 September 2026: on subway, bus and ferry, transfer any
// number of times within two hours of the first tap and pay only the highest-priced
// service, as long as the same form of payment is used throughout.
export const TRANSFER_WINDOW_MINUTES = 120;

export type PaymentId = "contactless" | "wallet" | "charliecard" | "charlieticket" | "cash" | "mticket" | "paper_ticket";

export const PAYMENT: Record<PaymentId, { label: string; short: string }> = {
  contactless: { label: "Contactless credit or debit card", short: "Contactless card" },
  wallet: { label: "Apple Pay, Google Pay or another mobile wallet", short: "Phone or watch" },
  charliecard: { label: "CharlieCard", short: "CharlieCard" },
  charlieticket: { label: "CharlieTicket", short: "CharlieTicket" },
  cash: { label: "Cash", short: "Cash" },
  mticket: { label: "MBTA mTicket app", short: "mTicket app" },
  paper_ticket: { label: "Paper ferry ticket", short: "Paper ticket" },
};

/** Only methods the MBTA lists as accepted for that service. Contactless is not valid on Commuter Rail; CharlieCards are not accepted on Commuter Rail or ferries. */
export const ACCEPTED: Record<FareMode, PaymentId[]> = {
  subway: ["contactless", "wallet", "charliecard", "charlieticket", "cash"],
  bus: ["contactless", "wallet", "charliecard", "charlieticket", "cash"],
  commuter_rail: ["mticket", "charlieticket"],
  ferry: ["contactless", "wallet", "mticket", "paper_ticket", "cash"],
};

export const HOW_TO_PAY: Record<FareMode, string[]> = {
  subway: [
    "Tap your contactless card, phone, watch or CharlieCard on the Charlie reader at the fare gate, or at the train door at street-level stops.",
    "Wait for the green “Go” screen, then ride. Use the same card or device for the whole trip so transfers apply.",
    "Paying cash? Buy a CharlieTicket at a fare vending machine, or pay at the fare box on street-level Green Line and Mattapan trolleys.",
  ],
  bus: [
    "Tap your contactless card, phone, watch or CharlieCard on the reader at the bus door, or pay cash at the fare box.",
    "Use the same card or device for the whole trip so transfers apply.",
  ],
  commuter_rail: [
    "Buy a ticket before you board, in the mTicket app or as a CharlieTicket from a fare vending machine or ticket booth.",
    "Conductors check tickets on the train. Contactless payment and CharlieCards are not accepted.",
  ],
  ferry: [
    "Tap a contactless card, phone or watch at the ticket booth, or show an mTicket or paper ferry ticket to the crew.",
    "CharlieCards are not accepted on ferries.",
  ],
};

export const REDUCED_FARE_INFO = {
  eligible: "Reduced fares are for riders 65 and older, riders with disabilities and Medicare cardholders, some middle and high school students, and riders 18 to 64 enrolled in state assistance.",
  free: "Children 11 and under, people who are legally blind and military personnel ride free.",
};

export const PASSES = [
  { label: "1-Day Pass", cents: 1100, covers: "subway and bus for 24 hours" },
  { label: "7-Day Pass", cents: 2250, covers: "subway and bus for 7 days" },
  { label: "Monthly LinkPass", cents: 9000, covers: "subway and bus for the calendar month" },
];
