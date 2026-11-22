"use client";
import { BellRing, Bus, Camera, Check, ChevronLeft, CreditCard, ExternalLink, Footprints, Hand, LocateFixed, Repeat, ShieldCheck, TrainFront } from "lucide-react";
import type { MapLine, MapMarker } from "@/components/map/CityMap";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Arrivals, useNextDeparture } from "@/components/Arrivals";
import { FareSummary } from "@/components/FareSummary";
import { GameList } from "@/components/GameList";
import { Button, cx, Empty, LineDots, LinePill, SourceBadge, StationSign } from "@/components/ui";
import { derive, STAMP } from "@/lib/gamification";
import { alertsSupported, enableAlerts } from "@/lib/alerts";
import { useNow, useTransitRoutes } from "@/lib/api";
import type { TransitRoute } from "@/lib/contracts";
import { formatFare, journeyFare, quoteFare, type FareSegment } from "@/lib/fares";
import { distanceKm, formatDistance, walkMinutes } from "@/lib/geo";
import { legInfo, LINES, planFromStops, rideMinutes, routeOptions, signature, STATION, tripSteps, type Leg, type Plan, type RouteOption } from "@/lib/network";
import { landmarksNearStation } from "@/lib/places";
import { useStore, useWhere, type Journey, type Stage } from "@/lib/store";
import { useJourneyTracking } from "@/lib/tracking";
import { StampArt } from "@/components/Stamp";

const STEP_NAMES = ["Plan", "Walk", "Wait", "Board", "Ride", "Arrive", "Explore", "Done"];
/** Scenes that have on-screen tips (lib/guide.ts). */
const SCENE: Partial<Record<Stage, string>> = { planning: "journey-plan", walking: "journey-walk", waiting: "journey-wait", traveling: "journey-ride", exploring: "journey-explore", complete: "journey-done" };
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

/** Which instruction the rider is on, for each stage of a journey. */
function currentStep(steps: ReturnType<typeof tripSteps>, journey: Journey): number {
  const { stage, leg } = journey;
  const find = (kind: string, l: number) => steps.findIndex((s) => s.kind === kind && s.leg === l);
  if (stage === "walking") return steps[0]?.kind === "walk" ? 0 : find("board", 0);
  if (stage === "waiting" || stage === "boarding") return find("board", leg);
  if (stage === "traveling" || stage === "arriving") return find("ride", leg);
  if (stage === "transferring") return find("change", leg);
  if (stage === "exploring") return steps.length - 1;
  return -1;
}

/** The whole trip as numbered instructions. During a journey the current one is marked. */
function Steps({ journey, walkInMin }: { journey: Journey; walkInMin: number | null }) {
  const steps = tripSteps(journey.plan, journey.walkFrom?.minutes ?? walkInMin, journey.walkTo, journey.walkFrom?.name);
  const now = currentStep(steps, journey);
  return (
    <ol data-tour="route-summary" aria-label="Step by step" className="overflow-hidden rounded-3xl border border-line bg-card">
      {steps.map((s, i) => {
        const Icon = s.kind === "walk" ? Footprints : s.kind === "change" ? Repeat : TrainFront;
        return (
          <li key={i} aria-current={i === now ? "step" : undefined} className={cx("flex items-start gap-3 border-b border-line px-4 py-3 last:border-b-0", i === now && "bg-moss", now >= 0 && i < now && "opacity-55")}>
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-white" style={{ background: s.color ?? "#4d564f" }}>
              {now >= 0 && i < now ? <Check size={14} strokeWidth={3.5} aria-hidden /> : <Icon size={15} aria-hidden />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-bold leading-snug">{s.title}</span>
              <span className="block text-[13.5px] leading-snug text-ink-soft">{s.detail}</span>
            </span>
            {s.minutes !== null && <span className="shrink-0 pt-0.5 text-[13.5px] font-bold tabular-nums">{s.minutes} min</span>}
          </li>
        );
      })}
    </ol>
  );
}

const CityMap = dynamic(() => import("@/components/map/CityMap").then((m) => m.CityMap), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-sand" />,
});

/** Minutes each change of line is expected to take (the planner's own allowance). */
const CHANGE_MIN = 4;
type Part = { kind: "walk" | "train" | "change"; minutes: number; label: string; color?: string };

/** The trip as a sequence of timed parts: walk in, each train, each change, walk out. */
function tripParts(plan: Plan, walkInMin: number | null, walkOut?: { minutes: number; name: string }): Part[] {
  const parts: Part[] = [];
  if (walkInMin && walkInMin > 1) parts.push({ kind: "walk", minutes: walkInMin, label: `Walk to ${STATION[plan.from].name}` });
  plan.legs.forEach((leg, i) => {
    if (i > 0) parts.push({ kind: "change", minutes: CHANGE_MIN, label: `Change at ${STATION[leg.from].name}` });
    parts.push({ kind: "train", minutes: leg.minutes, label: `${legInfo(leg).label} to ${STATION[leg.to].name}`, color: LINES[leg.line].color });
  });
  if (walkOut) parts.push({ kind: "walk", minutes: walkOut.minutes, label: `Walk to ${walkOut.name}` });
  return parts;
}

/** A proportional bar plus a labelled row per part, so every minute of the trip is accounted for. */
function TripBreakdown({ parts }: { parts: Part[] }) {
  return (
    <span className="mt-3 block" data-testid="trip-breakdown">
      <span className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {parts.map((p, i) => (
          <span key={i} style={{ flexGrow: Math.max(1, p.minutes), background: p.color ?? (p.kind === "walk" ? "#8a8f84" : "#ddd3bc") }} />
        ))}
      </span>
      <span className="mt-2 block space-y-1">
        {parts.map((p, i) => {
          const Icon = p.kind === "walk" ? Footprints : p.kind === "train" ? TrainFront : Repeat;
          return (
            <span key={i} className="flex items-center gap-2 text-[13.5px]">
              <Icon size={15} className="shrink-0" style={{ color: p.color ?? "#4d564f" }} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{p.label}</span>
              <span className="shrink-0 font-bold tabular-nums">{p.minutes} min</span>
            </span>
          );
        })}
      </span>
    </span>
  );
}

const sameRoute = (a: Plan, b: Plan) => a.legs.length === b.legs.length && a.legs.every((l, i) => l.line === b.legs[i].line && l.from === b.legs[i].from && l.to === b.legs[i].to);

/** One way to make the trip: time, changes, fare and the next train, at a glance. */
function RouteCard({ option, selected, demo, walkInMin, walkOut, onChoose }: {
  option: RouteOption; selected: boolean; demo: boolean; walkInMin: number | null; walkOut?: { minutes: number; name: string }; onChoose?: () => void;
}) {
  const { plan, tag } = option;
  const parts = tripParts(plan, walkInMin, walkOut);
  const total = parts.reduce((n, p) => n + p.minutes, 0);
  const first = plan.legs[0];
  const next = useNextDeparture(first, demo);
  const changes = plan.legs.length - 1;
  const body = (
    <>
      <span className="flex items-center justify-between gap-3">
        <span className={cx("rounded-full px-2.5 py-1 text-[12px] font-bold leading-none", selected ? "bg-forest text-paper" : "bg-sand text-ink-soft")}>{tag}</span>
        <span className="font-display text-[22px] font-bold leading-none text-forest">{formatFare(journeyFare(plan).totalCents)}</span>
      </span>
      <span className="mt-2 flex items-baseline gap-3">
        <span className="text-[22px] font-bold leading-none">{total} min</span>
        <span className="text-[14px] text-ink-soft">
          {total !== plan.minutes ? "door to door, " : ""}
          {changes ? `${changes} change${changes > 1 ? "s" : ""}` : "no changes"}
        </span>
      </span>
      <TripBreakdown parts={parts} />
      <span className="mt-2.5 flex items-center gap-2 border-t border-line pt-2.5 text-[13.5px] text-ink-soft">
        <LineDots lines={[...new Set(plan.legs.map((l) => l.line))]} size={11} />
        {next ? (
          <span>
            Next train {next.minutes <= 0 ? "now" : `in ${next.minutes} min`} ({next.kind === "live" ? "live" : next.kind === "scheduled" ? "scheduled" : "demo data"})
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

const RAIL = ["SUBWAY", "TRAM", "METRO_RAIL", "LIGHT_RAIL"];
type Ride = Extract<TransitRoute["steps"][number], { kind: "transit" }>;
const rides = (r: TransitRoute) => r.steps.filter((s): s is Ride => s.kind === "transit");

/** A Google route as a plan Bostie can guide, or null when it uses a bus, Commuter Rail or other stations. */
const guidable = (r: TransitRoute, from: string, to: string): Plan | null => {
  if (!rides(r).every((s) => RAIL.includes(s.vehicle))) return null;
  const plan = planFromStops(rides(r));
  return plan && plan.from === from && plan.to === to ? plan : null;
};

/** Fare for a Google route from the published MBTA prices; "Unavailable" when the data is not there (Commuter Rail zones, ferries). */
function googleFare(r: TransitRoute) {
  const segments: FareSegment[] = rides(r).map((s) => {
    const label = `${s.line}${s.headsign ? ` toward ${s.headsign}` : ""}`;
    if (RAIL.includes(s.vehicle) || /^SL[123]\b/.test(s.line)) return { mode: "subway", label };
    if (s.vehicle.includes("BUS")) return { mode: "bus", label };
    if (s.vehicle === "FERRY") return { mode: "ferry", service: "unknown", label };
    return { mode: "commuter_rail", fromZone: "?", toZone: "?", label };
  });
  return quoteFare(segments, "adult", "tap", r.minutes);
}

/** A route Google found that Bostie cannot guide (it uses a bus or Commuter Rail): steps only. */
function GoogleCard({ route, mapsUrl }: { route: TransitRoute; mapsUrl: string }) {
  const fare = googleFare(route);
  return (
    <div className="rounded-2xl border border-dashed border-line bg-card p-3.5" data-testid="google-route">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-sand px-2.5 py-1 text-[12px] font-bold leading-none text-ink-soft">From Google</span>
        <span className="font-display text-[22px] font-bold leading-none text-forest">{fare.status === "estimate" ? "about " : ""}{formatFare(fare.totalCents)}</span>
      </div>
      <p className="mt-2 text-[22px] font-bold leading-none">{route.minutes} min</p>
      <ol className="mt-2.5 space-y-1.5">
        {route.steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-[13.5px] leading-snug">
            {s.kind === "walk" ? <Footprints size={15} className="mt-0.5 shrink-0 text-ink-soft" aria-hidden /> : s.vehicle.includes("BUS") ? <Bus size={15} className="mt-0.5 shrink-0" style={{ color: s.color ?? undefined }} aria-hidden /> : <TrainFront size={15} className="mt-0.5 shrink-0" style={{ color: s.color ?? undefined }} aria-hidden />}
            <span className="min-w-0 flex-1">
              {s.kind === "walk" ? "Walk" : (
                <>
                  <strong>{s.line}</strong>{s.headsign ? ` toward ${s.headsign}` : ""}: {s.from.name} to {s.to.name}{s.stops ? `, ${s.stops} stop${s.stops > 1 ? "s" : ""}` : ""}
                </>
              )}
            </span>
            <span className="shrink-0 font-bold tabular-nums">{s.minutes} min</span>
          </li>
        ))}
      </ol>
      <p className="mt-2.5 border-t border-line pt-2.5 text-[13px] leading-snug text-ink-soft">
        Bostie guides and stamps subway trips only, so this one is for information.{" "}
        <a href={mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-forest underline underline-offset-2">
          Open in Google Maps <ExternalLink size={13} aria-hidden />
        </a>
      </p>
    </div>
  );
}

/** The route comparison: every sensible way to make the trip, sortable by time or cost. */
function RouteOptions({ plan, demo, walkInMin, walkOut, dest }: { plan: Plan; demo: boolean; walkInMin: number | null; walkOut?: { minutes: number; name: string }; dest: { lat: number; lng: number } }) {
  const choosePlan = useStore((s) => s.choosePlan);
  const [sort, setSort] = useState<"time" | "cost">("time");
  const origin = STATION[plan.from];
  const google = useTransitRoutes({ lat: origin.lat, lng: origin.lng }, dest);
  const { options, extra } = useMemo(() => {
    const options = routeOptions(plan.from, plan.to);
    const extra: TransitRoute[] = [];
    for (const r of google) {
      const p = guidable(r, plan.from, plan.to);
      if (!p) extra.push(r);
      else if (!options.some((o) => signature(o.plan) === signature(p))) options.push({ plan: p, tag: "From Google" });
    }
    return { options, extra: extra.slice(0, 3) };
  }, [plan.from, plan.to, google]);
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${dest.lat},${dest.lng}&travelmode=transit`;
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
          <RouteCard key={i} option={o} selected={sameRoute(o.plan, plan)} demo={demo} walkInMin={walkInMin} walkOut={walkOut} onChoose={many ? () => choosePlan(o.plan) : undefined} />
        ))}
      </div>
      {many && sort === "cost" && new Set(options.map(cost)).size === 1 && (
        <p className="mt-2 text-[13px] text-ink-soft">Every subway route costs the same: one fare covers changes between lines.</p>
      )}
      {extra.length > 0 && (
        <div className="mt-3 space-y-2" role="group" aria-label="Other routes from Google">
          <p className="text-[14px] font-semibold text-ink-soft">Other ways, by bus or Commuter Rail</p>
          {extra.map((r, i) => <GoogleCard key={i} route={r} mapsUrl={mapsUrl} />)}
        </div>
      )}
    </section>
  );
}

/** Live navigation map: the route, where the rider is, and where they are heading next. */
function JourneyMap({ journey }: { journey: Journey }) {
  const where = useWhere();
  const { plan, stage, walkTo } = journey;
  const leg = plan.legs[journey.leg];
  const at = where.at;
  const view = useMemo(() => {
    const pt = (id: string) => ({ lat: STATION[id].lat, lng: STATION[id].lng });
    const lines: MapLine[] = plan.legs.map((l, i) => ({ id: `leg-${i}`, color: LINES[l.line].color, emphasis: true, path: l.stops.map(pt) }));
    const start = journey.walkFrom ? { lat: journey.walkFrom.lat, lng: journey.walkFrom.lng } : at;
    if (start && (stage === "walking" || journey.walkFrom)) lines.push({ id: "walk-in", color: "#1f4b3a", dashed: true, emphasis: true, path: [start, pt(plan.from)] });
    if (walkTo) lines.push({ id: "walk-out", color: "#1f4b3a", dashed: true, emphasis: true, path: [pt(plan.to), { lat: walkTo.lat, lng: walkTo.lng }] });

    const reached = (legIndex: number, stopIndex: number) =>
      legIndex < journey.leg || (legIndex === journey.leg && (["arriving", "exploring", "complete", "transferring"].includes(stage) || (stage === "traveling" && stopIndex < journey.stop) || (stopIndex === 0 && stage !== "walking" && stage !== "waiting")));
    const markers: MapMarker[] = [];
    plan.legs.forEach((l, li) => l.stops.forEach((id, si) => {
      if (!markers.some((m) => m.id === id)) markers.push({ id, kind: "station", label: STATION[id].name, color: LINES[l.line].color, done: reached(li, si), ...pt(id) });
    }));
    if (walkTo) markers.push({ id: "destination", kind: "answer", label: walkTo.name, lat: walkTo.lat, lng: walkTo.lng });
    if (journey.walkFrom) markers.push({ id: "origin", kind: "pin", label: journey.walkFrom.name, lat: journey.walkFrom.lat, lng: journey.walkFrom.lng });
    if (at) markers.push({ id: "user", kind: "user", label: where.source === "simulated" ? "You (demo)" : "You", lat: at.lat, lng: at.lng });

    // Frame what matters right now: the rider and the next thing they are heading for.
    const next = stage === "walking" ? [pt(leg.from)]
      : stage === "traveling" ? [pt(leg.stops[journey.stop - 1]), pt(leg.stops[journey.stop])]
      : stage === "exploring" || stage === "arriving" ? [pt(plan.to), ...(walkTo ? [{ lat: walkTo.lat, lng: walkTo.lng }] : [])]
      : [pt(leg.from), pt(leg.to)];
    const fit = [...(at ? [{ lat: at.lat, lng: at.lng }] : []), ...next];
    const focus = stage === "traveling" ? leg.stops[journey.stop] : stage === "walking" || stage === "waiting" || stage === "boarding" ? leg.from : walkTo ? "destination" : plan.to;
    return { lines, markers, fit, focus };
  }, [plan, stage, walkTo, leg, journey.leg, journey.stop, journey.walkFrom, at, where.source]);

  return (
    <section data-tour="journey-map" aria-label="Navigation map" className="relative mx-5 mt-4 h-[230px] shrink-0 overflow-hidden rounded-3xl border border-line">
      <CityMap className="size-full" markers={view.markers} lines={view.lines} fit={view.fit} selectedId={view.focus} />
      <span className="pointer-events-none absolute left-2.5 top-2.5 rounded-full bg-card/95 px-2.5 py-1 text-[12px] font-semibold shadow-card">
        {at ? (where.source === "simulated" ? "Demo position" : "Your live position") : "Route map"}
      </span>
    </section>
  );
}

/** Automatic or manual: chosen before the journey starts, changeable at any time. */
function TrackingChoice({ journey }: { journey: Journey }) {
  const setTracking = useStore((s) => s.setTracking);
  const mode = journey.tracking ?? "manual";
  const options = [
    { id: "auto" as const, Icon: LocateFixed, title: "Automatic", body: journey.demo ? "The demo ride plays by itself, stop by stop." : "Follows your live location, moves through the steps for you, and adds your route to your heat map." },
    { id: "manual" as const, Icon: Hand, title: "Manual", body: "You tap to confirm each step. Works everywhere, including underground." },
  ];
  return (
    <section data-tour="tracking-mode" aria-labelledby="tracking-h" className="mt-5">
      <h2 id="tracking-h" className="text-[20px] font-bold">How should Bostie follow your trip?</h2>
      <div role="radiogroup" aria-label="Tracking mode" className="mt-2 space-y-2">
        {options.map(({ id, Icon, title, body }) => (
          <button
            key={id}
            role="radio"
            aria-checked={mode === id}
            onClick={() => setTracking(id)}
            className={cx("flex w-full items-start gap-3.5 rounded-2xl border bg-card p-3.5 text-left", mode === id ? "border-forest shadow-card ring-1 ring-forest" : "border-line")}
          >
            <Icon size={22} className={cx("mt-0.5 shrink-0", mode === id ? "text-forest" : "text-ink-faint")} aria-hidden />
            <span className="min-w-0">
              <span className="block text-[16.5px] font-bold">{title}</span>
              <span className="block text-[13.5px] leading-snug text-ink-soft">{body}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-[12.5px] text-ink-faint">
        {journey.demo ? "Demo journeys use a simulated position." : "Automatic mode asks for your location when you start. It stays on your device and is never uploaded."}
      </p>
    </section>
  );
}

/** Get-off alerts: a warning when the stop to get off at is next, in the app and as a phone notification. */
function AlertChoice() {
  const on = useStore((s) => s.alerts);
  const setAlerts = useStore((s) => s.setAlerts);
  const [problem, setProblem] = useState<"blocked" | "unsupported" | null>(null);
  const toggle = async () => {
    if (on) return setAlerts(false);
    const result = await enableAlerts();
    setProblem(result === "on" ? null : result);
  };
  return (
    <section data-tour="getoff-alerts" aria-labelledby="alerts-h" className="mt-5 rounded-2xl border border-line bg-card p-3.5">
      <div className="flex items-start gap-3.5">
        <BellRing size={22} className={cx("mt-0.5 shrink-0", on ? "text-forest" : "text-ink-faint")} aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="alerts-h" className="text-[16.5px] font-bold">Get-off alerts</h2>
          <p className="text-[13.5px] leading-snug text-ink-soft">
            Bostie warns you when your stop is next and again when to get off. Works in Automatic and Manual mode.
          </p>
        </div>
        <button role="switch" aria-checked={on} aria-label="Phone notifications for get-off alerts" onClick={toggle} className={cx("relative mt-0.5 h-8 w-[52px] shrink-0 rounded-full transition-colors", on ? "bg-forest" : "bg-line")}>
          <span className={cx("absolute top-1 size-6 rounded-full bg-white shadow transition-[left]", on ? "left-[24px]" : "left-1")} />
        </button>
      </div>
      <p className="mt-2 text-[12.5px] leading-snug text-ink-faint" aria-live="polite">
        {problem === "blocked"
          ? "Notifications are blocked for this site, so alerts show inside Bostie only. Allow them in your browser settings to get them on your lock screen."
          : problem === "unsupported"
            ? "This browser cannot send notifications, so alerts show inside Bostie only. On an iPhone, add Bostie to your Home Screen first."
            : on
              ? "On: you get a phone notification when Bostie is in the background. Keep Bostie open in a tab; if the phone closes it, no alert can be sent. In Manual mode with the app closed, the timing is an estimate."
              : alertsSupported()
                ? "Off: alerts still show inside Bostie. Turn on to get them as phone notifications too."
                : "Alerts show inside Bostie. This browser cannot send phone notifications."}
      </p>
    </section>
  );
}

/** What the tracker is doing right now, and a one-tap way to switch modes mid-journey. */
function TrackingStatus({ journey }: { journey: Journey }) {
  const setTracking = useStore((s) => s.setTracking);
  const track = useJourneyTracking();
  const now = useNow(5000);
  const auto = journey.tracking === "auto";
  const age = track.lastFixAt ? Math.round((now - track.lastFixAt) / 1000) : null;
  const stale = age !== null && age > 40;
  if (journey.stage === "planning" || journey.stage === "complete") return null;
  const text = !auto
    ? track.status === "blocked" ? "Location is blocked for this site, so you are in manual mode."
      : track.status === "unsupported" ? "This browser cannot share location, so you are in manual mode."
      : "Manual mode: tap the button as you reach each step."
    : track.status === "simulated" ? "Automatic: the demo ride is playing by itself."
      : track.status === "asking" ? "Automatic: waiting for your location…"
      : stale ? "No GPS signal right now (common underground). Tap the button to confirm the step."
      : `Automatic: following your location${track.accuracyM ? `, accurate to about ${track.accuracyM} m` : ""}.`;
  return (
    <div role="status" data-testid="tracking-status" data-tour="tracking-status" className={cx("mx-5 mt-4 flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[13.5px]", auto && !stale ? "bg-moss text-forest-deep" : "bg-sand text-ink-soft")}>
      {auto ? <LocateFixed size={17} className="shrink-0" aria-hidden /> : <Hand size={17} className="shrink-0" aria-hidden />}
      <span className="min-w-0 flex-1 leading-snug">{text}</span>
      <button onClick={() => setTracking(auto ? "manual" : "auto")} className="shrink-0 font-semibold text-forest underline underline-offset-2">
        {auto ? "Go manual" : "Go automatic"}
      </button>
    </div>
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

  const { plan, stage, demo, walkTo, walkFrom } = journey;
  /** Where the trip ends: the place searched for, or the last station. */
  const goal = walkTo?.name ?? STATION[plan.to].name;
  const leg = plan.legs[journey.leg];
  const collected = new Set(d.stations.keys());
  const nextStop = leg.stops[journey.stop];
  const info = legInfo(leg);
  const nextLeg = plan.legs[journey.leg + 1];
  // From a chosen address or place the walk is known; otherwise it is measured from where the rider is.
  const walkKm = walkFrom ? walkFrom.km : where.at ? distanceKm(where.at, STATION[leg.from]) : null;
  const walkInMin = walkKm !== null ? walkMinutes(walkKm) : null;
  const nearby = landmarksNearStation(plan.to);
  const earned = xp.filter((t) => t.at >= journey.startedAt);
  const earnedStamps = Object.entries(d.stamps).filter(([, at]) => at >= journey.startedAt);

  const quit = () => {
    end();
    router.push("/ride");
  };

  // One headline, one sentence and one action per stage.
  const view: Record<Stage, { title: string; body: string; action: string }> = {
    planning: { title: `${walkFrom?.name ?? STATION[plan.from].name} to ${goal}`, body: `About ${plan.minutes} min on the train${plan.legs.length > 1 ? `, ${plan.legs.length - 1} change${plan.legs.length > 2 ? "s" : ""}` : ", no changes"}${walkTo ? `, then a ${walkTo.minutes} min walk from ${STATION[plan.to].name}` : ""}.`, action: "Start journey" },
    walking: { title: `Walk to ${STATION[leg.from].name}`, body: walkKm !== null && walkKm > 0.05 ? `About ${walkMinutes(walkKm)} min on foot (${formatDistance(walkKm)})${walkFrom ? ` from ${walkFrom.name}` : ""}.` : "You are right by the station.", action: "I am at the station" },
    waiting: { title: `Wait for the ${info.label}`, body: `${info.directionName} platform. Take any train toward ${info.toward}.`, action: "My train is here" },
    boarding: { title: "Step aboard", body: `Ride ${leg.stops.length - 1} stop${leg.stops.length > 2 ? "s" : ""} to ${STATION[leg.to].name}.`, action: "I am on board" },
    traveling: { title: `Next stop: ${STATION[nextStop]?.name}`, body: `About ${Math.max(1, Math.round(rideMinutes(leg.route, leg.stops[journey.stop - 1], nextStop)))} min. There is no GPS underground, so confirm each stop as the doors open.`, action: `Arrived at ${STATION[nextStop]?.name}` },
    transferring: { title: `Change at ${STATION[leg.to].name}`, body: nextLeg ? `Stay inside the station and follow signs for the ${legInfo(nextLeg).label}, ${legInfo(nextLeg).directionName.toLowerCase()} toward ${legInfo(nextLeg).toward}.` : "", action: "I am on the next platform" },
    arriving: { title: `You have arrived at ${STATION[plan.to].name}`, body: walkTo ? `Take the stairs or lift up to the street. ${walkTo.name} is about ${walkTo.minutes} min on foot.` : "Mind the gap, and take the stairs or lift up to the street.", action: "Explore nearby" },
    exploring: { title: walkTo ? `Walk to ${walkTo.name}` : `Around ${STATION[plan.to].name}`, body: walkTo ? `About ${walkTo.minutes} min (${formatDistance(walkTo.km)}) from the station${walkTo.address ? `, at ${walkTo.address}` : ""}.` : nearby.length ? "History is a short walk away. Scan a landmark to unlock its stamp." : "Have a look around, then wrap up your journey.", action: "Complete journey" },
    complete: { title: "Journey complete", body: `${walkFrom?.name ?? STATION[plan.from].name} to ${goal}, stamped and logged.`, action: "Open passport" },
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

      <TrackingStatus journey={journey} />
      {stage !== "planning" && stage !== "complete" && <JourneyMap journey={journey} />}

      <div className="px-5 pt-5">
        <h1 className="text-[29px] font-bold leading-[1.08]">{v.title}</h1>
        <p className="mt-2 text-[16px] leading-snug text-ink-soft">{v.body}</p>
      </div>

      <div className="flex-1 px-5 pt-5">
        {stage === "planning" && (
          <>
            <RouteOptions plan={plan} demo={demo} walkInMin={walkInMin} walkOut={walkTo ? { minutes: walkTo.minutes, name: walkTo.name } : undefined} dest={walkTo ? { lat: walkTo.lat, lng: walkTo.lng } : { lat: STATION[plan.to].lat, lng: STATION[plan.to].lng }} />
            <h2 className="mb-2 text-[20px] font-bold">Step by step</h2>
            <Steps journey={journey} walkInMin={walkInMin} />
            <p className="mt-3 text-[13px] text-ink-soft">
              Route computed from the MBTA station network. Ride times are estimates from distance, not live predictions.
            </p>
            {/* The next trains for this trip sit right under the steps, before fares and settings. */}
            <StationSign id={plan.from} className="mt-4" />
            <Arrivals stationId={plan.from} demo={demo} leg={leg} limit={3} className="mt-3 px-1" />
            <FareSummary plan={plan} className="mt-5" />
            <TrackingChoice journey={journey} />
            <AlertChoice />
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
            <Arrivals stationId={leg.from} demo={demo} leg={leg} limit={3} className="mt-3 px-1" />
            <div data-tour="play-while-waiting"><GameList className="mt-5" /></div>
            <p className="mt-3 flex items-start gap-2.5 text-[13.5px] text-ink-soft">
              <ShieldCheck size={17} className="mt-0.5 shrink-0" aria-hidden /> Stand behind the yellow line until the train has stopped.
            </p>
          </>
        )}

        {(stage === "boarding" || stage === "traveling" || stage === "transferring" || stage === "arriving") && (
          <div data-tour="strip-map" className="rounded-3xl border border-line bg-card p-4 shadow-card">
            <div className="mb-3 flex items-center gap-2">
              <LinePill route={leg.route} />
              <span className="text-[14px] text-ink-soft">{info.directionName}, toward {info.toward}</span>
            </div>
            <StripMap
              leg={leg}
              at={stage === "boarding" ? 0 : stage === "traveling" ? journey.stop - 1 : leg.stops.length - 1}
              next={stage === "traveling" ? journey.stop : null}
              collected={collected}
            />
          </div>
        )}

        {(stage === "boarding" || stage === "traveling") && <div data-tour="play-while-riding"><GameList riding className="mt-5" /></div>}

        {stage === "transferring" && nextLeg && <Arrivals stationId={nextLeg.from} demo={demo} leg={nextLeg} limit={3} className="mt-4 px-1" />}

        {stage !== "planning" && stage !== "complete" && (
          <details className="mt-4" data-testid="all-steps">
            <summary className="cursor-pointer py-2 text-[15px] font-semibold text-forest">All steps for this trip</summary>
            <Steps journey={journey} walkInMin={null} />
          </details>
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
            <dl data-tour="journey-summary" className="grid grid-cols-3 divide-x divide-line rounded-2xl border border-line bg-card py-4 text-center">
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

      <div className="sticky bottom-0 z-10 mt-4 space-y-1 border-t border-line bg-paper px-5 pb-4 pt-3">
        {stage === "complete" ? (
          <>
            <Button size="lg" className="w-full" onClick={() => router.push("/passport")} data-tour="journey-finish">{v.action}</Button>
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
