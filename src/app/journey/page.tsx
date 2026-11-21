"use client";
import { Camera, Check, ChevronLeft, CreditCard, Footprints, Gamepad2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Arrivals, useNextDeparture } from "@/components/Arrivals";
import { FareSummary } from "@/components/FareSummary";
import { Button, cx, Empty, LineDots, LinePill, SourceBadge, StationSign } from "@/components/ui";
import { derive, STAMP } from "@/lib/gamification";
import { formatFare, journeyFare } from "@/lib/fares";
import { distanceKm, formatDistance, walkMinutes } from "@/lib/geo";
import { legDirection, LINES, rideMinutes, routeLabel, routeOptions, STATION, type Leg, type Plan, type RouteOption } from "@/lib/network";
import { landmarksNearStation } from "@/lib/places";
import { useStore, useWhere, type Journey, type Stage } from "@/lib/store";
import { StampArt } from "@/components/Stamp";

const STEP_NAMES = ["Plan", "Walk", "Wait", "Board", "Ride", "Arrive", "Explore", "Done"];
/** Scenes that have on-screen tips (lib/guide.ts). */
const SCENE: Partial<Record<Stage, string>> = { planning: "journey-plan", waiting: "journey-wait", traveling: "journey-ride", exploring: "journey-explore" };
const stepIndex = (s: Stage) => ({ planning: 0, walking: 1, waiting: 2, boarding: 3, traveling: 4, transferring: 4, arriving: 5, exploring: 6, complete: 7 })[s];

/** MBTA-style strip map of one leg. `at` = index of the station the rider has reached. */
function StripMap({ leg, at, next, collected }: { leg: Leg; at: number; next: number | null; collected: Set<string> }) {
  const color = LINES[leg.line].color;
  return (
    <ol className="relative ml-1">
      {leg.stops.map((id, i) => {
        const reached = i <= at;
        const isNext = i === next;
        const last = i === leg.stops.length - 1;
        return (
          <li key={id} className="relative flex min-h-[46px] items-start gap-4 pb-1">
            {!last && <span aria-hidden className="absolute left-[9px] top-[18px] h-full w-[6px]" style={{ background: color, opacity: i < at ? 1 : 0.28 }} />}
            <span
              aria-hidden
              className={cx("relative z-10 mt-[3px] grid size-6 shrink-0 place-items-center rounded-full border-[4px] bg-card", isNext && "animate-pulse-dot")}
              style={{ borderColor: color, background: reached ? color : undefined }}
            >
              {reached && <Check size={11} strokeWidth={4} className="text-white" />}
            </span>
            <span className="min-w-0 flex-1 pt-0.5">
              <span className={cx("block text-[16px] leading-tight", reached || isNext ? "font-bold" : "font-medium text-ink-soft")}>{STATION[id].name}</span>
              <span className="block text-[12.5px] text-ink-faint">
                {isNext ? "Next stop" : i === 0 ? "Board here" : last ? "Get off here" : reached ? "Passed" : ""}
                {collected.has(id) && " · stamp collected"}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function RouteSummary({ journey }: { journey: Journey }) {
  const { plan } = journey;
  return (
    <ol data-tour="route-summary" className="space-y-3">
      {plan.legs.map((leg, i) => (
        <li key={i} className="rounded-2xl border border-line bg-card p-4">
          <div className="flex items-center gap-2">
            <LinePill route={leg.route} />
            <span className="text-[14px] text-ink-soft">toward {leg.toward}</span>
          </div>
          <p className="mt-2 text-[17px] font-bold leading-snug">
            {STATION[leg.from].name} to {STATION[leg.to].name}
          </p>
          <p className="text-[14px] text-ink-soft">
            {leg.stops.length - 1} stop{leg.stops.length > 2 ? "s" : ""}, about {leg.minutes} min
          </p>
          {i < plan.legs.length - 1 && (
            <p className="mt-3 rounded-xl bg-sand px-3 py-2 text-[14px]">
              Change at <strong>{STATION[leg.to].name}</strong> for the {routeLabel(plan.legs[i + 1].route)} toward {plan.legs[i + 1].toward}.
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

const sameRoute = (a: Plan, b: Plan) => a.legs.length === b.legs.length && a.legs.every((l, i) => l.line === b.legs[i].line && l.from === b.legs[i].from && l.to === b.legs[i].to);

/** One way to make the trip: time, changes, fare and the next train, at a glance. */
function RouteCard({ option, selected, demo, onChoose }: { option: RouteOption; selected: boolean; demo: boolean; onChoose?: () => void }) {
  const { plan, tag } = option;
  const first = plan.legs[0];
  const next = useNextDeparture(first.from, { route: first.route, direction: legDirection(first.route, first.from, first.to) }, demo);
  const changes = plan.legs.length - 1;
  const body = (
    <>
      <span className="flex items-center justify-between gap-3">
        <span className={cx("rounded-full px-2.5 py-1 text-[12px] font-bold leading-none", selected ? "bg-forest text-paper" : "bg-sand text-ink-soft")}>{tag}</span>
        <span className="font-display text-[22px] font-bold leading-none text-forest">{formatFare(journeyFare(plan).totalCents)}</span>
      </span>
      <span className="mt-2 flex items-baseline gap-3">
        <span className="text-[22px] font-bold leading-none">{plan.minutes} min</span>
        <span className="text-[14px] text-ink-soft">{changes ? `${changes} change${changes > 1 ? "s" : ""}` : "No changes"}</span>
      </span>
      <span className="mt-2 flex items-center gap-2 text-[13.5px] text-ink-soft">
        <LineDots lines={[...new Set(plan.legs.map((l) => l.line))]} size={11} />
        {next ? (
          <span>
            Next train {next.minutes <= 0 ? "now" : `in ${next.minutes} min`} ({next.kind === "live" ? "live" : "demo data"})
          </span>
        ) : (
          <span>Next train time unavailable</span>
        )}
      </span>
    </>
  );
  const box = cx("block w-full rounded-2xl border bg-card p-3.5 text-left", selected ? "border-forest shadow-card ring-1 ring-forest" : "border-line");
  return onChoose ? (
    <button role="radio" aria-checked={selected} onClick={onChoose} className={box}>{body}</button>
  ) : (
    <div className={box}>{body}</div>
  );
}

/** The route comparison: every sensible way to make the trip, sortable by time or cost. */
function RouteOptions({ plan, demo }: { plan: Plan; demo: boolean }) {
  const choosePlan = useStore((s) => s.choosePlan);
  const [sort, setSort] = useState<"time" | "cost">("time");
  const options = useMemo(() => routeOptions(plan.from, plan.to), [plan.from, plan.to]);
  const cost = (o: RouteOption) => journeyFare(o.plan).totalCents ?? Infinity;
  const sorted = [...options].sort((a, b) => (sort === "cost" ? cost(a) - cost(b) : 0) || a.plan.minutes - b.plan.minutes);
  const many = options.length > 1;
  return (
    <section data-tour="route-options" aria-label="Route options" className="mb-4">
      {many && (
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <p className="text-[14px] font-semibold text-ink-soft">{options.length} ways to go</p>
          <div role="radiogroup" aria-label="Sort routes by" className="flex rounded-full bg-sand p-1">
            {([["time", "Fastest"], ["cost", "Cheapest"]] as const).map(([id, label]) => (
              <button key={id} role="radio" aria-checked={sort === id} onClick={() => setSort(id)} className={cx("h-8 rounded-full px-3 text-[13px] font-semibold", sort === id ? "bg-card text-ink shadow-card" : "text-ink-soft")}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div role={many ? "radiogroup" : undefined} aria-label={many ? "Routes" : undefined} className="space-y-2">
        {sorted.map((o, i) => (
          <RouteCard key={i} option={o} selected={sameRoute(o.plan, plan)} demo={demo} onChoose={many ? () => choosePlan(o.plan) : undefined} />
        ))}
      </div>
      {many && sort === "cost" && new Set(options.map(cost)).size === 1 && (
        <p className="mt-2 text-[13px] text-ink-soft">Every subway route costs the same: one fare covers changes between lines.</p>
      )}
    </section>
  );
}

export default function JourneyPage() {
  const router = useRouter();
  const journey = useStore((s) => s.journey);
  const advance = useStore((s) => s.advanceJourney);
  const end = useStore((s) => s.endJourney);
  const events = useStore((s) => s.events);
  const xp = useStore((s) => s.xp);
  const where = useWhere();
  const d = useMemo(() => derive(events), [events]);

  if (!journey)
    return (
      <div className="grid h-full place-items-center px-6">
        <Empty
          title="No journey yet"
          body="Pick two stations on Ride and Bostie guides you stop by stop."
          action={<Link href="/ride" className="inline-flex h-11 items-center rounded-full bg-forest px-6 text-[15px] font-bold text-paper">Plan a journey</Link>}
        />
      </div>
    );

  const { plan, stage, demo } = journey;
  const leg = plan.legs[journey.leg];
  const collected = new Set(d.stations.keys());
  const nextStop = leg.stops[journey.stop];
  const direction = legDirection(leg.route, leg.from, leg.to);
  const walkKm = where.at ? distanceKm(where.at, STATION[leg.from]) : null;
  const nearby = landmarksNearStation(plan.to);
  const earned = xp.filter((t) => t.at >= journey.startedAt);
  const earnedStamps = Object.entries(d.stamps).filter(([, at]) => at >= journey.startedAt);
  const rounds = d.rounds.length;

  const quit = () => {
    end();
    router.push("/ride");
  };

  // One headline, one sentence and one action per stage.
  const view: Record<Stage, { title: string; body: string; action: string }> = {
    planning: { title: `${STATION[plan.from].name} to ${STATION[plan.to].name}`, body: `About ${plan.minutes} min on the train${plan.legs.length > 1 ? `, ${plan.legs.length - 1} change${plan.legs.length > 2 ? "s" : ""}` : ", no changes"}.`, action: "Start journey" },
    walking: { title: `Walk to ${STATION[leg.from].name}`, body: walkKm !== null && walkKm > 0.05 ? `About ${walkMinutes(walkKm)} min on foot (${formatDistance(walkKm)}).` : "You are right by the station.", action: "I am at the station" },
    waiting: { title: `Wait for the ${routeLabel(leg.route)}`, body: `Take any train toward ${leg.toward}.`, action: "My train is here" },
    boarding: { title: "Step aboard", body: `Ride ${leg.stops.length - 1} stop${leg.stops.length > 2 ? "s" : ""} to ${STATION[leg.to].name}.`, action: "I am on board" },
    traveling: { title: `Next stop: ${STATION[nextStop]?.name}`, body: `About ${Math.max(1, Math.round(rideMinutes(leg.route, leg.stops[journey.stop - 1], nextStop)))} min. There is no GPS underground, so confirm each stop as the doors open.`, action: `Arrived at ${STATION[nextStop]?.name}` },
    transferring: { title: `Change at ${STATION[leg.to].name}`, body: plan.legs[journey.leg + 1] ? `Follow signs for the ${routeLabel(plan.legs[journey.leg + 1].route)} toward ${plan.legs[journey.leg + 1].toward}.` : "", action: "I am on the next platform" },
    arriving: { title: `You have arrived at ${STATION[plan.to].name}`, body: "Mind the gap, and take the stairs or lift up to the street.", action: "Explore nearby" },
    exploring: { title: `Around ${STATION[plan.to].name}`, body: nearby.length ? "History is a short walk away. Scan a landmark to unlock its stamp." : "Have a look around, then wrap up your journey.", action: "Complete journey" },
    complete: { title: "Journey complete", body: `${STATION[plan.from].name} to ${STATION[plan.to].name}, stamped and logged.`, action: "Open passport" },
  };
  const v = view[stage];

  return (
    <div data-scene={SCENE[stage] ?? "journey"} className="scroll-area flex h-full flex-col">
      <div className="flex items-center justify-between px-3 pt-2">
        <Link href="/ride" className="flex h-10 items-center gap-0.5 pr-3 text-[15px] font-semibold text-forest">
          <ChevronLeft size={20} aria-hidden /> Ride
        </Link>
        {demo ? <SourceBadge kind="simulated" /> : <SourceBadge kind="estimated" />}
      </div>

      {/* Stage progress */}
      <ol data-tour="journey-progress" className="mt-1 flex gap-1 px-5" aria-label="Journey progress">
        {STEP_NAMES.map((n, i) => (
          <li key={n} className="flex-1" aria-current={i === stepIndex(stage) ? "step" : undefined}>
            <span className={cx("block h-1.5 rounded-full", i <= stepIndex(stage) ? "bg-forest" : "bg-sand")} />
            <span className={cx("mt-1 block text-center text-[10.5px] font-semibold", i === stepIndex(stage) ? "text-forest" : "text-ink-faint")}>{n}</span>
          </li>
        ))}
      </ol>

      <div className="px-5 pt-5">
        <h1 className="text-[29px] font-bold leading-[1.08]">{v.title}</h1>
        <p className="mt-2 text-[16px] leading-snug text-ink-soft">{v.body}</p>
      </div>

      <div className="flex-1 px-5 pt-5">
        {stage === "planning" && (
          <>
            <RouteOptions plan={plan} demo={demo} />
            <RouteSummary journey={journey} />
            <p className="mt-3 text-[13px] text-ink-soft">
              Route computed from the MBTA station network. Ride times are estimates from distance, not live predictions.
            </p>
            <FareSummary plan={plan} className="mt-4" />
            <StationSign id={plan.from} className="mt-5" />
            <Arrivals stationId={plan.from} demo={demo} only={{ route: leg.route, direction }} limit={3} className="mt-3 px-1" />
          </>
        )}

        {stage === "walking" && (
          <div className="space-y-3">
            <StationSign id={leg.from}>
              <p className="mt-1 text-[14px] text-white/75">{STATION[leg.from].accessible ? "Step-free access" : "Check accessibility before you travel"}</p>
            </StationSign>
            <p className="flex items-start gap-3 rounded-2xl bg-moss px-4 py-3 text-[14.5px] text-forest-deep">
              <Footprints size={19} className="mt-0.5 shrink-0" aria-hidden />
              Keep your eyes up while you walk. Bostie never asks you to look at your phone near the platform edge.
            </p>
            <p className="flex items-start gap-3 rounded-2xl border border-line bg-card px-4 py-3 text-[14.5px]">
              <CreditCard size={19} className="mt-0.5 shrink-0 text-forest" aria-hidden />
              <span>
                <strong>Have your {formatFare(journeyFare(plan).totalCents)} fare ready.</strong> Tap a contactless card, phone or CharlieCard at the fare gate.
              </span>
            </p>
          </div>
        )}

        {stage === "waiting" && (
          <>
            <StationSign id={leg.from} />
            <Arrivals stationId={leg.from} demo={demo} only={{ route: leg.route, direction }} limit={3} className="mt-3 px-1" />
            <Link href="/play" data-tour="play-while-waiting" className="mt-4 flex items-center gap-3.5 rounded-2xl bg-ink px-4 py-3.5 text-paper">
              <Gamepad2 size={24} className="shrink-0 text-gold" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-bold">Play Guess Boston while you wait</span>
                <span className="block text-[13.5px] text-paper/70">{rounds ? `${rounds} round${rounds > 1 ? "s" : ""} played. One more?` : "One round takes about a minute."}</span>
              </span>
            </Link>
            <p className="mt-3 flex items-start gap-2.5 text-[13.5px] text-ink-soft">
              <ShieldCheck size={17} className="mt-0.5 shrink-0" aria-hidden /> Stand behind the yellow line until the train has stopped.
            </p>
          </>
        )}

        {(stage === "boarding" || stage === "traveling" || stage === "transferring" || stage === "arriving") && (
          <div data-tour="strip-map" className="rounded-3xl border border-line bg-card p-4 shadow-card">
            <div className="mb-3 flex items-center gap-2">
              <LinePill route={leg.route} />
              <span className="text-[14px] text-ink-soft">toward {leg.toward}</span>
            </div>
            <StripMap
              leg={leg}
              at={stage === "boarding" ? 0 : stage === "traveling" ? journey.stop - 1 : leg.stops.length - 1}
              next={stage === "traveling" ? journey.stop : null}
              collected={collected}
            />
          </div>
        )}

        {stage === "exploring" && (
          nearby.length ? (
            <ul data-tour="nearby-list" className="divide-y divide-line">
              {nearby.slice(0, 5).map(({ place, km }) => {
                const found = d.landmarks.has(place.id);
                return (
                  <li key={place.id} className="flex items-center gap-3.5 py-3">
                    <div className="w-[58px] shrink-0"><StampArt stamp={STAMP[`landmark:${place.id}`]} owned={found} tilt={false} /></div>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] font-bold">{place.name}</span>
                      <span className="block text-[13.5px] text-ink-soft">{walkMinutes(km)} min walk{found ? ", already in your passport" : ""}</span>
                    </span>
                    {!found && (
                      <Link href="/scan" aria-label={`Scan ${place.name}`} className="grid size-11 shrink-0 place-items-center rounded-full bg-forest text-paper">
                        <Camera size={19} />
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty title="No catalogued landmarks here yet" body="Open Explore to see what is in walking distance." />
          )
        )}

        {stage === "complete" && (
          <>
            <dl className="grid grid-cols-3 divide-x divide-line rounded-2xl border border-line bg-card py-4 text-center">
              {[
                [earned.reduce((s, t) => s + t.amount, 0), "XP earned"],
                [plan.legs.reduce((n, l) => n + l.stops.length - 1, 0), "stops"],
                [earnedStamps.length, "new stamps"],
              ].map(([n, label]) => (
                <div key={label}>
                  <dd className="font-display text-[30px] font-bold leading-none text-forest">{n}</dd>
                  <dt className="mt-1 text-[12.5px] text-ink-soft">{label}</dt>
                </div>
              ))}
            </dl>
            {earnedStamps.length > 0 && (
              <ul className="mt-5 flex flex-wrap justify-center gap-3">
                {earnedStamps.map(([id]) => (
                  <li key={id} className="w-[86px]"><StampArt stamp={STAMP[id]} owned /></li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div className="sticky bottom-0 mt-4 space-y-1 bg-gradient-to-t from-paper from-70% to-paper/0 px-5 pb-4 pt-6">
        {stage === "complete" ? (
          <>
            <Button size="lg" className="w-full" onClick={() => router.push("/passport")}>{v.action}</Button>
            <Button variant="quiet" className="w-full" onClick={quit}>Plan another journey</Button>
          </>
        ) : (
          <>
            <Button size="lg" className="w-full" onClick={advance} data-tour="journey-action">{v.action}</Button>
            <Button variant="quiet" size="sm" className="w-full" onClick={quit}>End journey</Button>
          </>
        )}
      </div>
    </div>
  );
}
