import type { Prediction, PredictionsResponse } from "@/lib/contracts";
import { STATION } from "@/lib/network";
import { fail } from "@/lib/server/http";
import { mbta } from "@/lib/server/mbta";

type Raw = {
  data: {
    id: string;
    attributes: { arrival_time: string | null; departure_time: string | null; direction_id: number; status: string | null; schedule_relationship: string | null };
    relationships: { route: { data: { id: string } }; trip: { data: { id: string } | null } };
  }[];
  included?: { type: string; id: string; attributes: { headsign?: string } }[];
};

/** Live train predictions for one station, straight from the MBTA V3 API. */
export async function GET(req: Request) {
  const stop = new URL(req.url).searchParams.get("stop") ?? "";
  if (!STATION[stop]) return fail(400, "unknown_stop");
  try {
    const raw = await mbta<Raw>(
      `/predictions?filter[stop]=${stop}&filter[route_type]=0,1&include=trip&sort=departure_time&page[limit]=40`,
      20_000,
    );
    const headsign = Object.fromEntries((raw.included ?? []).filter((i) => i.type === "trip").map((t) => [t.id, t.attributes.headsign ?? ""]));
    const now = Date.now() - 30_000;
    const predictions: Prediction[] = raw.data
      .filter((p) => p.attributes.schedule_relationship !== "CANCELLED" && p.attributes.schedule_relationship !== "SKIPPED")
      .map((p) => ({
        id: p.id,
        route: p.relationships.route.data.id,
        headsign: headsign[p.relationships.trip.data?.id ?? ""] ?? "",
        direction: p.attributes.direction_id,
        // departure_time is null at the last stop of a trip: those trains are not boardable.
        at: p.attributes.departure_time ?? "",
        status: p.attributes.status,
      }))
      .filter((p) => p.at && Date.parse(p.at) >= now)
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const res: PredictionsResponse = { source: "live", fetchedAt: new Date().toISOString(), stop, predictions };
    return Response.json(res);
  } catch {
    return fail(502, "mbta_unavailable", "Live MBTA predictions are unavailable right now.");
  }
}
