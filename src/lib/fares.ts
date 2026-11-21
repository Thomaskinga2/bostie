// Deterministic MBTA fare engine. Pure functions over the published prices and rules in
// data/fares.ts: no network, no model. If a fare cannot be worked out from that data the
// quote says "estimate" or "unavailable" instead of guessing.
import {
  ACCEPTED, BUS_FARE, CR_INTERZONE_FARE, CR_ZONE_FARE, FERRY_FARE, MODE_LABEL, SUBWAY_FARE, TRANSFER_WINDOW_MINUTES,
  type FareCategory, type FareMode, type FerryService, type PaymentId,
} from "@/data/fares";
import { routeLabel, STATION, type Plan } from "./network";

export type FareSegment =
  | { mode: "subway"; label?: string }
  | { mode: "bus"; label?: string }
  | { mode: "commuter_rail"; fromZone: string; toZone: string; label?: string }
  | { mode: "ferry"; service: FerryService | string; label?: string };

/** How the rider pays: "tap" is a CharlieCard or one contactless card/device used for the whole trip. */
export type PaymentStyle = "tap" | "cash";

export type FareLine = {
  mode: FareMode;
  label: string;
  /** Published one-way price of this segment on its own. null when it cannot be determined. */
  baseCents: number | null;
  /** What this segment adds to the trip total once transfer rules are applied. */
  chargedCents: number | null;
  note?: string;
};

export type FareQuote = {
  /** exact: straight from published prices and rules · estimate: a documented assumption was needed · unavailable: missing data */
  status: "exact" | "estimate" | "unavailable";
  totalCents: number | null;
  category: FareCategory;
  lines: FareLine[];
  notes: string[];
  /** Payment methods accepted on every segment of the trip. */
  accepted: PaymentId[];
};

export const formatFare = (cents: number | null) => (cents === null ? "Unavailable" : `$${(cents / 100).toFixed(2)}`);

const idx = (c: FareCategory) => (c === "adult" ? 0 : 1);

/** One-way Commuter Rail fare between two zones, and whether the interzone rule had to be assumed. */
export function commuterRailFare(fromZone: string, toZone: string, category: FareCategory): { cents: number | null; assumed: boolean } {
  const [a, b] = [fromZone.toUpperCase(), toZone.toUpperCase()];
  if (!(a in CR_ZONE_FARE) || !(b in CR_ZONE_FARE)) return { cents: null, assumed: false };
  // Any trip touching Zone 1A is priced by the other station's zone.
  if (a === "1A" || b === "1A") return { cents: CR_ZONE_FARE[a === "1A" ? b : a][idx(category)], assumed: false };
  // Interzone: priced by the number of zones travelled through. The MBTA page lists the
  // prices but not this counting rule, so interzone quotes are flagged as estimates.
  const n = Math.abs(Number(a) - Number(b)) + 1;
  return { cents: CR_INTERZONE_FARE[n]?.[idx(category)] ?? null, assumed: true };
}

function baseFare(s: FareSegment, category: FareCategory): { cents: number | null; assumed: boolean; label: string; cashOk: boolean } {
  switch (s.mode) {
    case "subway":
      return { cents: SUBWAY_FARE[idx(category)], assumed: false, label: s.label ?? MODE_LABEL.subway, cashOk: true };
    case "bus":
      return { cents: BUS_FARE[idx(category)], assumed: false, label: s.label ?? MODE_LABEL.bus, cashOk: true };
    case "commuter_rail": {
      const f = commuterRailFare(s.fromZone, s.toZone, category);
      return { ...f, label: s.label ?? `Commuter Rail, Zone ${s.fromZone} to Zone ${s.toZone}`, cashOk: false };
    }
    case "ferry": {
      const service = FERRY_FARE[s.service as FerryService];
      return service
        ? { cents: service.price[idx(category)], assumed: false, label: s.label ?? service.label, cashOk: service.cash }
        : { cents: null, assumed: false, label: s.label ?? "Ferry", cashOk: false };
    }
  }
}

/**
 * Prices a trip made of consecutive segments.
 *
 * Transfer rules (MBTA pilot from 1 September 2026):
 *  - Subway, bus and ferry: within two hours of the first tap, pay only the highest-priced
 *    service, provided the same form of payment is used throughout. Not with cash.
 *    On ferries this applies to contactless payment only.
 *  - Commuter Rail single-ride tickets do not include transfers: that fare is always added.
 */
export function quoteFare(segments: FareSegment[], category: FareCategory = "adult", style: PaymentStyle = "tap", tripMinutes = 0): FareQuote {
  const notes: string[] = [];
  let status: FareQuote["status"] = segments.length ? "exact" : "unavailable";
  const priced = segments.map((s) => ({ s, ...baseFare(s, category) }));

  if (priced.some((p) => p.cents === null)) status = "unavailable";
  else if (priced.some((p) => p.assumed)) {
    status = "estimate";
    notes.push("Commuter Rail interzone fare estimated from the number of zones travelled. Confirm it in the MBTA trip planner.");
  }

  // Segments that share one fare under the transfer policy.
  const pooled = style === "tap" ? priced.filter((p) => p.s.mode !== "commuter_rail") : [];
  const poolMax = Math.max(0, ...pooled.map((p) => p.cents ?? 0));
  let poolCharged = false;
  const lines: FareLine[] = priced.map((p) => {
    let charged = p.cents;
    let note: string | undefined;
    if (p.cents !== null && pooled.includes(p)) {
      if (!poolCharged && p.cents === poolMax) {
        poolCharged = true;
      } else {
        charged = 0;
        note = "Included: transfer within two hours";
      }
    }
    return { mode: p.s.mode, label: p.label, baseCents: p.cents, chargedCents: charged, note };
  });

  if (pooled.length > 1) {
    notes.push("Transfers between subway, bus and ferry are included for two hours from your first tap when you use the same CharlieCard or contactless card or device. You pay only the highest fare.");
    if (pooled.some((p) => p.s.mode === "ferry")) notes.push("Ferry transfers apply with contactless payment only: CharlieCards are not accepted on ferries.");
    if (tripMinutes > TRANSFER_WINDOW_MINUTES && status === "exact") {
      status = "estimate";
      notes.push("This trip may run past the two-hour transfer window, in which case a later segment is charged again.");
    }
  }
  if (style === "cash" && segments.length > 1) notes.push("Cash fares do not include free or discounted transfers: each segment is paid separately.");
  if (priced.some((p) => p.s.mode === "commuter_rail") && segments.length > 1) notes.push("Commuter Rail single-ride tickets do not include transfers to other services.");

  // Only methods valid on every segment, so the rider can use one for the whole trip.
  const accepted =
    segments.reduce<PaymentId[] | null>((acc, s, i) => {
      const here = ACCEPTED[s.mode].filter((m) => m !== "cash" || priced[i].cashOk);
      return acc === null ? here : acc.filter((m) => here.includes(m));
    }, null) ?? [];

  return {
    status,
    category,
    totalCents: status === "unavailable" ? null : lines.reduce((sum, l) => sum + (l.chargedCents ?? 0), 0),
    lines,
    notes,
    accepted,
  };
}

/** Fare for a planned Bostie journey. The planner covers rapid transit, so every leg is a subway-fare segment. */
export function journeyFare(plan: Plan, category: FareCategory = "adult", style: PaymentStyle = "tap"): FareQuote {
  const segments: FareSegment[] = plan.legs.map((leg) => ({
    mode: "subway",
    label: `${routeLabel(leg.route)}: ${STATION[leg.from].name} to ${STATION[leg.to].name}`,
  }));
  return quoteFare(segments, category, style, plan.minutes);
}
