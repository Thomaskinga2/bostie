import type { Prediction, PredictionsResponse } from "@/lib/contracts";
import { STATION } from "@/lib/network";
import { fail } from "@/lib/server/http";
import { mbta } from "@/lib/server/mbta";

// Predictions and schedules share this shape in the MBTA V3 API.
type Raw = {
  data: {
    id: string;
    attributes: { departure_time: string | null; direction_id: number; status?: string | null; schedule_relationship?: string | null };
    relationships: { route: { data: { id: string } }; trip: { data: { id: string } | null }; stop: { data: { id: string } | null } };
  }[];
  included?: { type: string; id: string; attributes: { headsign?: string; platform_name?: string | null } }[];
};

function rows(raw: Raw, scheduled: boolean): Prediction[] {
  const inc = (type: string) => Object.fromEntries((raw.included ?? []).filter((i) => i.type === type).map((i) => [i.id, i.attributes]));
  const [trip, stop] = [inc("trip"), inc("stop")];
  const now = Date.now() - 30_000;
  return raw.data
    .filter((p) => p.attributes.schedule_relationship !== "CANCELLED" && p.attributes.schedule_relationship !== "SKIPPED")
    .map((p) => ({
      id: p.id,
      route: p.relationships.route.data.id,
      headsign: trip[p.relationships.trip.data?.id ?? ""]?.headsign ?? "",
      direction: p.attributes.direction_id,
      // departure_time is null at the last stop of a trip: those trains are not boardable.
      at: p.attributes.departure_time ?? "",
      status: p.attributes.status ?? null,
      platform: stop[p.relationships.stop.data?.id ?? ""]?.platform_name ?? null,
      scheduled,
    }))
    .filter((p) => p.at && Date.parse(p.at) >= now)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** HH:MM in Boston on the MBTA service day, which runs past midnight (1:15 am is "25:15"). */
function serviceTime(at = new Date()) {
  const [h, m] = at.toLocaleTimeString("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" }).split(":").map(Number);
  // Rounded down to 5 minutes so the upstream cache is shared between requests.
  return `${String(h < 3 ? h + 24 : h).padStart(2, "0")}:${String(m - (m % 5)).padStart(2, "0")}`;
}

/**
 * Departures for one station from the MBTA V3 API: live predictions, or the published
 * timetable when the MBTA has no predictions for the station. Each row says which.
 */
export async function GET(req: Request) {
  const stop = new URL(req.url).searchParams.get("stop") ?? "";
  if (!STATION[stop]) return fail(400, "unknown_stop");
  const query = `filter[stop]=${stop}&filter[route_type]=0,1&include=trip,stop&sort=departure_time&page[limit]=40`;
  try {
    let predictions = rows(await mbta<Raw>(`/predictions?${query}`, 20_000), false);
    let source: PredictionsResponse["source"] = "live";
    // ponytail: timetable only when the whole station has no predictions; per-line gaps show as "none predicted".
    if (!predictions.length) {
      predictions = rows(await mbta<Raw>(`/schedules?${query}&filter[min_time]=${serviceTime()}`, 60_000), true);
      source = "scheduled";
    }
    const res: PredictionsResponse = { source, fetchedAt: new Date().toISOString(), stop, predictions };
    return Response.json(res);
  } catch {
    return fail(502, "mbta_unavailable", "Live MBTA predictions are unavailable right now.");
  }
}
