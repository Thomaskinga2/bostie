"use client";
// Plan a ride: pick two stations, get the route, see the trains. No quest required.
import { ArrowUpDown, ChevronRight, LocateFixed, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Arrivals } from "@/components/Arrivals";
import { Sheet } from "@/components/Sheet";
import { StationSelect } from "@/components/StationSelect";
import { Button, LinePill, PageHeader, StationSign } from "@/components/ui";
import { useAlerts } from "@/lib/api";
import { formatDistance, walkMinutes } from "@/lib/geo";
import { nearestStation, routeLabel, STATION } from "@/lib/network";
import { DEMO_ROUTE, useStore, useWhere } from "@/lib/store";

const STAGE_LABEL: Record<string, string> = {
  planning: "Route ready", walking: "Walking to the station", waiting: "Waiting for your train", boarding: "Boarding",
  traveling: "On the train", transferring: "Changing lines", arriving: "Arriving", exploring: "Exploring nearby", complete: "Journey complete",
};

export default function RidePage() {
  const router = useRouter();
  const journey = useStore((s) => s.journey);
  const demo = useStore((s) => s.demo);
  const geoStatus = useStore((s) => s.geoStatus);
  const requestLocation = useStore((s) => s.requestLocation);
  const startJourney = useStore((s) => s.startJourney);
  const where = useWhere();
  const near = where.at ? nearestStation(where.at) : null;

  // Start from the nearest station when we know where the rider is.
  const [from, setFrom] = useState(() => (demo ? DEMO_ROUTE.from : near?.station.id ?? DEMO_ROUTE.from));
  const [to, setTo] = useState(DEMO_ROUTE.to);
  const [planError, setPlanError] = useState("");
  const [alertsOpen, setAlertsOpen] = useState(false);
  const alerts = useAlerts();

  const plan = () => {
    if (from === to) return setPlanError("Pick two different stations.");
    if (!startJourney(from, to)) return setPlanError("No rail route found between those stations.");
    router.push("/journey");
  };

  const stationId = near?.station.id ?? from;
  const inProgress = journey && journey.stage !== "complete";

  return (
    <div data-scene="ride" className="scroll-area h-full pb-8">
      <PageHeader title="Plan a ride" sub="Any two stations on the T." />

      <section data-tour="planner" className="px-5" aria-label="Trip planner">
        {inProgress ? (
          <Link href="/journey" className="block">
            <StationSign id={journey.plan.to}>
              <p className="mt-1 text-[14px] text-white/75">
                From {STATION[journey.plan.from].name}. {STAGE_LABEL[journey.stage]}.
              </p>
              <span className="mt-3 inline-flex h-10 items-center gap-1 rounded-full bg-paper px-4 text-[14px] font-bold text-ink">
                Continue journey <ChevronRight size={16} aria-hidden />
              </span>
            </StationSign>
          </Link>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-line bg-card shadow-card">
            <div className="relative divide-y divide-line">
              <StationSelect label="From" value={from} onChange={(v) => (setFrom(v), setPlanError(""))} />
              <StationSelect label="To" value={to} onChange={(v) => (setTo(v), setPlanError(""))} />
              <button
                onClick={() => (setFrom(to), setTo(from))}
                aria-label="Swap origin and destination"
                className="absolute right-12 top-1/2 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-line bg-card text-ink-soft"
              >
                <ArrowUpDown size={16} />
              </button>
            </div>
            <div className="border-t border-line p-3">
              <Button className="w-full" onClick={plan}>Find route</Button>
              {planError && <p role="alert" className="mt-2 text-center text-[13.5px] font-semibold text-t-red">{planError}</p>}
            </div>
          </div>
        )}
      </section>

      <section className="mt-7 px-5" aria-labelledby="near-h">
        <div className="flex items-end justify-between">
          <h2 id="near-h" className="text-[23px] font-bold">{near ? "Nearest station" : "Departures"}</h2>
          {!demo && !where.at && (
            <button onClick={requestLocation} disabled={geoStatus === "asking"} className="flex h-9 items-center gap-1.5 text-[14px] font-semibold text-forest">
              <LocateFixed size={15} aria-hidden /> {geoStatus === "asking" ? "Locating…" : "Use my location"}
            </button>
          )}
        </div>
        {!demo && (geoStatus === "denied" || geoStatus === "unavailable") && (
          <p className="mt-1 text-[13px] text-ink-soft">
            {geoStatus === "denied" ? "Location is blocked for this site." : "Could not get a location fix."} Showing your “From” station instead.
          </p>
        )}
        <StationSign id={stationId} className="mt-3">
          <p className="mt-1 text-[14px] text-white/75">
            {near
              ? `${formatDistance(near.km)} away, about ${walkMinutes(near.km)} min on foot${where.source === "simulated" ? " (demo position)" : ""}`
              : STATION[stationId].routes.map(routeLabel).slice(0, 3).join(", ")}
          </p>
        </StationSign>
        <Arrivals stationId={stationId} demo={demo} className="mt-3 px-1" />

        {alerts.state === "live" && alerts.data.length > 0 && (
          <button onClick={() => setAlertsOpen(true)} className="mt-3 flex w-full items-center gap-3 rounded-2xl bg-gold-soft px-3.5 py-3 text-left text-[#5b410b]">
            <TriangleAlert size={18} className="shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-bold">{alerts.data.length} live service alert{alerts.data.length > 1 ? "s" : ""}</span>
              <span className="block truncate text-[13px]">{alerts.data[0].header}</span>
            </span>
            <ChevronRight size={16} className="shrink-0" aria-hidden />
          </button>
        )}
      </section>

      <Sheet open={alertsOpen} onClose={() => setAlertsOpen(false)} title="Service alerts">
        <p className="mb-3 text-[13px] text-ink-soft">Live from the MBTA. Subway and light rail only.</p>
        <ul className="divide-y divide-line">
          {alerts.data.map((a) => (
            <li key={a.id} className="py-3">
              <div className="mb-1.5 flex flex-wrap gap-1.5">
                {a.routes.slice(0, 5).map((r) => <LinePill key={r} route={r} />)}
              </div>
              <p className="text-[14.5px] leading-snug">{a.header}</p>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}
