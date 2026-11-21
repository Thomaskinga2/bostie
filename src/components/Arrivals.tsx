"use client";
import { minutesUntil, useNow, usePredictions } from "@/lib/api";
import { PATTERNS, servesLeg, STATION, type Leg } from "@/lib/network";
import { clockTime, cx, LinePill, SourceBadge } from "./ui";

type Row = { key: string; route: string; direction: number; headsign: string; minutes: number; at?: string; platform?: string | null; scheduled?: boolean };
/** Where a list of departures came from. Each gets its own badge; none is passed off as another. */
export type DepartureKind = "live" | "scheduled" | "simulated";
type TrainLeg = Pick<Leg, "route" | "from" | "to">;

/**
 * Deterministic stand-in departures for demo mode: a train every 6 minutes per
 * direction, phased by the wall clock. Always rendered with the "Demo data" badge.
 */
function simulated(stationId: string, now: number): Row[] {
  const rows: Row[] = [];
  const minute = Math.floor(now / 60_000);
  for (const route of STATION[stationId].routes) {
    for (const direction of [0, 1]) {
      const ends = PATTERNS.filter((p) => p.route === route && p.stops.includes(stationId))
        .map((p) => (direction === 0 ? p.stops[p.stops.length - 1] : p.stops[0]))
        .filter((end) => end !== stationId);
      const headsigns = [...new Set(ends)].map((id) => STATION[id].name);
      if (!headsigns.length) continue;
      const phase = (route.length * 3 + direction * 2) % 6;
      const first = 1 + ((phase + 600 - (minute % 6)) % 6);
      for (let i = 0; i < 3; i++) {
        rows.push({ key: `${route}${direction}${i}`, route, direction, headsign: headsigns[i % headsigns.length], minutes: first + i * 6 });
      }
    }
  }
  return rows.sort((a, b) => a.minutes - b.minutes);
}

/** Departures from a station, narrowed to the trains that make `leg` when one is given. */
function useDepartures(stationId: string, demo: boolean, leg?: TrainLeg) {
  const now = useNow();
  const live = usePredictions(demo ? null : stationId);
  const all: Row[] = demo
    ? simulated(stationId, now)
    : live.data.map((p) => ({ key: p.id, route: p.route, direction: p.direction, headsign: p.headsign, minutes: minutesUntil(p.at, now), at: p.at, platform: p.platform, scheduled: p.scheduled }));
  const rows = leg ? all.filter((r) => servesLeg(leg, r)) : all;
  const kind: DepartureKind = demo ? "simulated" : rows.some((r) => r.scheduled) ? "scheduled" : "live";
  return { rows, kind, state: demo ? ("live" as const) : live.state };
}

/** The next train that makes this leg: minutes away, platform, and where that number comes from. */
export function useNextDeparture(leg: TrainLeg, demo: boolean): { minutes: number; kind: DepartureKind; platform: string | null } | null {
  const { rows, kind } = useDepartures(leg.from, demo, leg);
  return rows[0] ? { minutes: rows[0].minutes, kind: rows[0].scheduled ? "scheduled" : kind, platform: rows[0].platform ?? null } : null;
}

export function Arrivals({ stationId, demo, leg, limit = 4, className }: { stationId: string; demo: boolean; leg?: TrainLeg; limit?: number; className?: string }) {
  const { rows, kind, state } = useDepartures(stationId, demo, leg);
  const platforms = [...new Set(rows.map((r) => r.platform).filter(Boolean))];

  return (
    <div className={className} data-tour="departures" data-testid="departures">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[14px] font-semibold text-ink-soft">Next departures</p>
        {state === "loading" ? null : state === "unavailable" ? <SourceBadge kind="offline" /> : <SourceBadge kind={kind} />}
      </div>
      {state === "loading" && !rows.length ? (
        <div className="space-y-2" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-11 animate-pulse rounded-xl bg-sand" />
          ))}
        </div>
      ) : state === "unavailable" && !rows.length ? (
        <p className="rounded-xl bg-sand px-3.5 py-3 text-[14px] text-ink-soft">
          Live MBTA predictions are unavailable right now. Your route still works; check station screens for times.
        </p>
      ) : !rows.length ? (
        <p className="rounded-xl bg-sand px-3.5 py-3 text-[14px] text-ink-soft">
          {leg ? "No trains for this trip are predicted right now. Check the station screens." : "No departures predicted right now."}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-line">
            {rows.slice(0, limit).map((r, i) => (
              <li key={r.key} className="flex items-center gap-3 py-2.5">
                <LinePill route={r.route} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{r.headsign || "Train"}</span>
                  {/* Only worth a line when trains leave from more than one platform. */}
                  {platforms.length > 1 && r.platform && <span className="block truncate text-[12.5px] text-ink-faint">Platform: {r.platform}</span>}
                </span>
                {r.at && <span className="text-[12.5px] tabular-nums text-ink-faint">{clockTime(r.at)}</span>}
                <span className={cx("w-[58px] text-right text-[17px] font-bold tabular-nums", i === 0 && "text-forest")}>
                  {r.minutes <= 0 ? "Now" : `${r.minutes} min`}
                </span>
              </li>
            ))}
          </ul>
          {platforms.length === 1 && <p className="mt-1.5 text-[13px] text-ink-soft">Platform: <strong>{platforms[0]}</strong></p>}
          {kind === "scheduled" && state !== "unavailable" && (
            <p className="mt-1.5 text-[13px] text-ink-soft">Timetable times: the MBTA has no live predictions here right now, so trains may run earlier or later.</p>
          )}
        </>
      )}
    </div>
  );
}
