import "server-only";
// Trips: turning names Gemini proposes into real places. Gemini suggests; Google Places
// (or OpenStreetMap) decides whether a place exists and where it is.
import type { Skipped, TripStop } from "@/lib/contracts";
import { verifyPlace } from "./places";

const clampMinutes = (m: number) => Math.round(Math.min(180, Math.max(20, Number.isFinite(m) ? m : 45)));

/** Verifies each proposed place, drops the ones that cannot be found in Greater Boston, and removes repeats. */
export async function verifyStops(proposed: { name: string; why?: string; minutes: number }[]): Promise<{ stops: TripStop[]; skipped: Skipped[] }> {
  const checked = await Promise.all(proposed.map(async (p) => ({ p, place: await verifyPlace(p.name) })));
  const stops: TripStop[] = [];
  const skipped: Skipped[] = [];
  for (const { p, place } of checked) {
    if (!place) skipped.push({ name: p.name, reason: "Could not be found in Greater Boston" });
    else if (stops.some((s) => s.id === place.id)) continue;
    else stops.push({ ...place, why: p.why ?? null, minutes: clampMinutes(p.minutes) });
  }
  return { stops, skipped };
}
