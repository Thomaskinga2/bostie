"use client";
import { minutesUntil, useNow, usePredictions } from "@/lib/api";
import { PATTERNS, STATION } from "@/lib/network";
import { clockTime, cx, LinePill, SourceBadge } from "./ui";

type Row = { key: string; route: string; headsign: string; minutes: number; at?: string };

/**
 * Deterministic stand-in departures for demo mode: a train every 6 minutes per
 * direction, phased by the wall clock. Always rendered with the "Demo data" badge.
 */
function simulated(stationId: string, now: number, only?: { route: string; direction: number }): Row[] {
  const rows: Row[] = [];
  const minute = Math.floor(now / 60_000);
  const routes = only ? [only.route] : STATION[stationId].routes.slice(0, 3);
  for (const route of routes) {
    for (const direction of only ? [only.direction] : [0, 1]) {
      const ends = PATTERNS.filter((p) => p.route === route && p.stops.includes(stationId))
        .map((p) => (direction === 0 ? p.stops[p.stops.length - 1] : p.stops[0]))
        .filter((end) => end !== stationId);
      const headsigns = [...new Set(ends)].map((id) => STATION[id].name);
      if (!headsigns.length) continue;
      const phase = (route.length * 3 + direction * 2) % 6;
      const first = 1 + ((phase + 600 - (minute % 6)) % 6);
      for (let i = 0; i < 3; i++) {
        rows.push({ key: `${route}${direction}${i}`, route, headsign: headsigns[i % headsigns.length], minutes: first + i * 6 });
      }
    }
  }
  return rows.sort((a, b) => a.minutes - b.minutes);
}

/** Minutes until the next departure on one route and direction, and where that number comes from. */
export function useNextDeparture(stationId: string, only: { route: string; direction: number }, demo: boolean): { minutes: number; kind: "live" | "simulated" } | null {
  const now = useNow();
  const live = usePredictions(demo ? null : stationId);
  if (demo) {
    const next = simulated(stationId, now, only)[0];
    return next ? { minutes: next.minutes, kind: "simulated" } : null;
  }
  const next = live.data.find((p) => p.route === only.route && p.direction === only.direction);
  return next ? { minutes: minutesUntil(next.at, now), kind: "live" } : null;
}

export function Arrivals({
  stationId, demo, only, limit = 4, className,
}: { stationId: string; demo: boolean; only?: { route: string; direction: number }; limit?: number; className?: string }) {
  const now = useNow();
  const live = usePredictions(demo ? null : stationId);

  const rows: Row[] = demo
    ? simulated(stationId, now, only)
    : live.data
        .filter((p) => !only || (p.route === only.route && p.direction === only.direction))
        .map((p) => ({ key: p.id, route: p.route, headsign: p.headsign, minutes: minutesUntil(p.at, now), at: p.at }));

  return (
    <div className={className} data-tour="departures">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[14px] font-semibold text-ink-soft">Next departures</p>
        {demo ? <SourceBadge kind="simulated" /> : live.state === "unavailable" ? <SourceBadge kind="offline" /> : <SourceBadge kind="live" />}
      </div>
      {!demo && live.state === "loading" && !rows.length ? (
        <div className="space-y-2" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-11 animate-pulse rounded-xl bg-sand" />
          ))}
        </div>
      ) : !demo && live.state === "unavailable" && !rows.length ? (
        <p className="rounded-xl bg-sand px-3.5 py-3 text-[14px] text-ink-soft">
          Live MBTA predictions are unavailable right now. Your route still works; check station screens for times.
        </p>
      ) : !rows.length ? (
        <p className="rounded-xl bg-sand px-3.5 py-3 text-[14px] text-ink-soft">No departures predicted right now.</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.slice(0, limit).map((r, i) => (
            <li key={r.key} className="flex items-center gap-3 py-2.5">
              <LinePill route={r.route} />
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{r.headsign || "Train"}</span>
              {r.at && <span className="text-[12.5px] tabular-nums text-ink-faint">{clockTime(r.at)}</span>}
              <span className={cx("w-[58px] text-right text-[17px] font-bold tabular-nums", i === 0 && "text-forest")}>
                {r.minutes <= 0 ? "Now" : `${r.minutes} min`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
