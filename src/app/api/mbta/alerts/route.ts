import type { Alert, AlertsResponse } from "@/lib/contracts";
import { fail } from "@/lib/server/http";
import { mbta } from "@/lib/server/mbta";

type Raw = {
  data: {
    id: string;
    attributes: { header: string; effect: string; severity: number; url: string | null; informed_entity: { route?: string }[] };
  }[];
};

/** Current subway and light-rail service alerts from the MBTA V3 API. */
export async function GET() {
  try {
    const raw = await mbta<Raw>(`/alerts?filter[route_type]=0,1&filter[datetime]=NOW&filter[severity]=3,4,5,6,7,8,9,10`, 60_000);
    const alerts: Alert[] = raw.data
      .map((a) => ({
        id: a.id,
        header: a.attributes.header,
        effect: a.attributes.effect,
        severity: a.attributes.severity,
        url: a.attributes.url,
        routes: [...new Set(a.attributes.informed_entity.map((e) => e.route).filter((r): r is string => !!r))],
      }))
      .sort((a, b) => b.severity - a.severity);
    const res: AlertsResponse = { source: "live", fetchedAt: new Date().toISOString(), alerts };
    return Response.json(res);
  } catch {
    return fail(502, "mbta_unavailable", "Live MBTA alerts are unavailable right now.");
  }
}
