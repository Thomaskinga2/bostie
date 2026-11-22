"use client";
// One trip: the map on top, the day's stops underneath in visiting order, and how to get
// between them. Stops can be dragged, optimized, added and removed; the map follows.
import { ChevronLeft, Clock, ExternalLink, Footprints, GripVertical, Plus, Search, Trash2, TrainFront, Wand2 } from "lucide-react";
import { AnimatePresence, Reorder, useDragControls } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MapLine, MapMarker } from "@/components/map/CityMap";
import { Sheet } from "@/components/Sheet";
import { PlacePhoto, priceText } from "@/components/trips/PlacePhoto";
import { Button, cx, Empty } from "@/components/ui";
import { useNow } from "@/lib/api";
import type { TripPlace, TripPlacesResponse } from "@/lib/contracts";
import { formatFare } from "@/lib/fares";
import { formatDistance } from "@/lib/geo";
import { LINES, STATION } from "@/lib/network";
import { useStore } from "@/lib/store";
import { asStop, clock, DAY_START, dayTotals, emitTrip, orderStops, schedule, useTrips, type Stop, type Timed, type Trip } from "@/lib/trips";

const CityMap = dynamic(() => import("@/components/map/CityMap").then((m) => m.CityMap), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-sand" />,
});
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** How to get to a stop from the one before: a walk, or a ride that can be started as a guided journey. */
function LegRow({ t, onRide, onWalk }: { t: Timed; onRide: () => void; onWalk: () => void }) {
  const { leg } = t;
  return (
    <div className="flex items-center gap-2.5 py-1.5 pl-[18px] text-[13px] text-ink-soft" data-testid="trip-leg">
      <span aria-hidden className="h-7 w-0.5 rounded bg-line" />
      {leg.mode === "walk" ? (
        <>
          <span className="flex min-w-0 flex-1 items-center gap-1.5"><Footprints size={15} className="shrink-0" aria-hidden /> {leg.minutes} min walk ({formatDistance(leg.km)})</span>
          <button onClick={onWalk} aria-label={`Walk it: the way to ${t.stop.name}`} className="h-8 shrink-0 rounded-full bg-forest px-3 text-[12.5px] font-bold text-paper">Walk it</button>
        </>
      ) : (
        <>
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <TrainFront size={15} className="shrink-0" style={{ color: LINES[leg.plan.legs[0].line].color }} aria-hidden />
            <span className="min-w-0 leading-snug">{leg.summary}</span>
          </span>
          <span className="shrink-0 font-semibold tabular-nums text-ink">{leg.minutes} min, {formatFare(leg.fareCents)}</span>
          <button onClick={onRide} aria-label={`Ride it: the way to ${t.stop.name}`} className="h-8 shrink-0 rounded-full bg-forest px-3 text-[12.5px] font-bold text-paper">Ride it</button>
        </>
      )}
    </div>
  );
}

/**
 * One stop in the list, with the way to reach it above. The whole unit drags by its handle.
 * Switching it off keeps it in the list but leaves it out of the day.
 */
function StopCard({ stop, t, n, selected, onOpen, onRide, onWalk, onToggle }: { stop: Stop; t?: Timed; n: number | null; selected: boolean; onOpen: () => void; onRide: () => void; onWalk: () => void; onToggle: () => void }) {
  const drag = useDragControls();
  const on = !stop.skipped;
  return (
    <Reorder.Item value={stop} layout="position" dragListener={false} dragControls={drag} id={`stop-${stop.key}`} data-testid="trip-stop" className="relative" whileDrag={{ scale: 1.02, zIndex: 5 }}>
      {t && <LegRow t={t} onRide={onRide} onWalk={onWalk} />}
      <div className={cx("mt-1.5 flex items-stretch overflow-hidden rounded-2xl border bg-card", selected ? "border-forest shadow-card ring-1 ring-forest" : "border-line", !on && "opacity-60")}>
        <button onClick={onOpen} aria-label={n ? `${n}. ${stop.name}` : `Skipped: ${stop.name}`} className="flex min-w-0 flex-1 items-center gap-3 p-2 text-left">
          <span className="relative shrink-0">
            <PlacePhoto place={stop} className={cx("size-[68px] rounded-xl", !on && "grayscale")} />
            <span className={cx("absolute -left-1 -top-1 grid size-6 place-items-center rounded-full text-[12px] font-bold ring-2 ring-card", on ? "bg-forest text-paper" : "bg-sand text-ink-soft")}>{n ?? "–"}</span>
          </span>
          <span className="min-w-0 flex-1">
            <span className={cx("block truncate text-[16px] font-bold", !on && "line-through")}>{stop.name}</span>
            <span className="block truncate text-[13px] text-ink-soft">{[stop.category, priceText(stop), stop.rating ? `${stop.rating.toFixed(1)} stars` : null].filter(Boolean).join(" · ") || stop.address}</span>
            {t ? (
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px]">
                <span className="flex items-center gap-1 text-ink-soft"><Clock size={13} aria-hidden /> {clock(t.arrive)}, {stop.minutes} min</span>
                <span className={cx("rounded-full px-2 py-0.5 text-[11.5px] font-bold leading-none", t.open === true ? "bg-moss text-forest-deep" : t.open === false ? "bg-[#fbe4e1] text-[#8a1a12]" : "bg-sand text-ink-soft")}>
                  {t.open === true ? "Open then" : t.open === false ? "Closed then" : "Hours not listed"}
                </span>
              </span>
            ) : (
              <span className="mt-0.5 block text-[12.5px] font-semibold text-ink-soft">Skipped: not part of this day</span>
            )}
          </span>
        </button>
        <span className="flex w-[52px] shrink-0 flex-col items-center justify-between border-l border-line py-1.5">
          <button role="switch" aria-checked={on} aria-label={`Include ${stop.name} in the day`} onClick={onToggle} className={cx("relative h-6 w-10 rounded-full transition-colors", on ? "bg-forest" : "bg-line")}>
            <span className={cx("absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left]", on ? "left-[18px]" : "left-0.5")} />
          </button>
          <span onPointerDown={(e) => drag.start(e)} role="img" aria-label={`Drag to move ${stop.name}`} data-testid="trip-drag" className="grid h-10 w-full cursor-grab touch-none place-items-center text-ink-soft active:cursor-grabbing"><GripVertical size={22} /></span>
        </span>
      </div>
    </Reorder.Item>
  );
}

type Point = { name: string; lat: number; lng: number };

/**
 * The way to a stop on foot: where you set off from, where you are going, how far, and a
 * link to street-by-street directions. Bostie knows the distance, not the streets, so the
 * line on its map is the direct one and it says so.
 */
function WalkSheet({ walk, onClose }: { walk: { from: Point; to: Stop; minutes: number; km: number } | null; onClose: () => void }) {
  const here = useStore((s) => s.geo);
  const view = useMemo(() => {
    if (!walk) return null;
    const a = { lat: walk.from.lat, lng: walk.from.lng };
    const b = { lat: walk.to.lat, lng: walk.to.lng };
    const markers: MapMarker[] = [
      { id: "from", kind: "pin", label: walk.from.name, ...a },
      { id: "to", kind: "answer", label: walk.to.name, ...b },
      ...(here ? [{ id: "user", kind: "user" as const, label: "You", lat: here.lat, lng: here.lng }] : []),
    ];
    return { markers, lines: [{ id: "walk", color: "#1f4b3a", dashed: true, emphasis: true, path: [a, b] }] as MapLine[], fit: [a, b] };
  }, [walk, here]);
  return (
    <Sheet open={!!walk} onClose={onClose} title={walk ? `Walk to ${walk.to.name}` : undefined} tall>
      {walk && view && (
        <div data-testid="trip-walk">
          <p className="text-[15.5px] leading-snug">
            <strong>{walk.minutes} min on foot</strong> ({formatDistance(walk.km)}) from {walk.from.name}.
          </p>
          <p className="text-[14px] text-ink-soft">{walk.to.address}</p>
          <div className="relative mt-3 h-[250px] overflow-hidden rounded-3xl border border-line">
            <CityMap className="size-full" markers={view.markers} lines={view.lines} fit={view.fit} selectedId="to" />
          </div>
          <p className="mt-2 text-[12.5px] leading-snug text-ink-faint">
            The dashed line is the direct way between the two places. Time and distance are estimates; follow the streets with the link below.
          </p>
          <a
            href={`https://www.google.com/maps/dir/?api=1&origin=${walk.from.lat},${walk.from.lng}&destination=${walk.to.lat},${walk.to.lng}&travelmode=walking`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-forest text-[15.5px] font-bold text-paper"
          >
            Street-by-street in Google Maps <ExternalLink size={16} aria-hidden />
          </a>
        </div>
      )}
    </Sheet>
  );
}

/** Search for a place and add it to the day. */
function AddPlace({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (p: TripPlace) => void }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ q: string; state: "loading" | "done" | "failed"; places: TripPlace[] } | null>(null);
  const text = q.trim();
  useEffect(() => {
    if (text.length < 3) return;
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/trips/places?q=${encodeURIComponent(text)}`, { signal: ctl.signal });
        if (!res.ok) throw new Error(String(res.status));
        setFound({ q: text, state: "done", places: ((await res.json()) as TripPlacesResponse).places });
      } catch {
        if (!ctl.signal.aborted) setFound({ q: text, state: "failed", places: [] });
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [text]);
  const current = found?.q === text ? found : null;
  return (
    <Sheet open={open} onClose={onClose} title="Add a place" tall>
      <label className="flex h-12 items-center gap-2.5 rounded-2xl border border-line bg-paper px-3.5">
        <Search size={18} className="shrink-0 text-ink-soft" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search for a place" placeholder="Cafe, museum, park, address…" autoComplete="off" className="min-w-0 flex-1 bg-transparent text-[16px] placeholder:text-ink-faint" style={{ outline: "none" }} />
      </label>
      <ul className="mt-3 space-y-2" aria-label="Places" aria-busy={text.length >= 3 && !current}>
        {text.length < 3 ? (
          <li className="px-1 text-[14px] text-ink-soft">Type at least three letters. Bostie only plans around Greater Boston.</li>
        ) : !current ? (
          [0, 1, 2].map((i) => <li key={i} className="h-[76px] animate-pulse rounded-2xl bg-sand" />)
        ) : current.state === "failed" ? (
          <li className="px-1 text-[14px] text-ink-soft">Place search is unavailable right now. Try again in a moment.</li>
        ) : !current.places.length ? (
          <li className="px-1 text-[14px] text-ink-soft">Nothing in Greater Boston matches “{text}”.</li>
        ) : (
          current.places.map((p) => (
            <li key={p.id}>
              <button onClick={() => (onAdd(p), setQ(""), onClose())} aria-label={`Add ${p.name}`} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-card p-2 text-left">
                <PlacePhoto place={p} className="size-[60px] shrink-0 rounded-xl" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15.5px] font-bold">{p.name}</span>
                  <span className="block truncate text-[13px] text-ink-soft">{[p.category, priceText(p)].filter(Boolean).join(" · ") || p.address}</span>
                  <span className="block truncate text-[12.5px] text-ink-faint">{p.address}</span>
                </span>
                <Plus size={20} className="shrink-0 text-forest" aria-hidden />
              </button>
            </li>
          ))
        )}
      </ul>
    </Sheet>
  );
}

export default function TripPlanPage() {
  const router = useRouter();
  const trip = useTrips((s) => s.trips.find((t) => t.id === s.currentId));
  const update = useTrips((s) => s.update);
  const remove = useTrips((s) => s.remove);
  const startJourney = useStore((s) => s.startJourney);
  const now = useNow(60_000);
  const [day, setDay] = useState(0);
  const [tab, setTab] = useState<"plan" | "overview">("plan");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [walk, setWalk] = useState<{ from: Point; to: Stop; minutes: number; km: number } | null>(null);
  const list = useRef<HTMLDivElement>(null);

  const weekday = new Date(now).getDay();
  const d = Math.min(day, (trip?.days.length ?? 1) - 1);
  const stops = useMemo(() => trip?.days[d] ?? [], [trip, d]);
  const timed = useMemo(() => (trip ? schedule(stops, trip.startStationId, weekday) : []), [trip, stops, weekday]);
  const totals = dayTotals(timed);

  // The map shows the day in order: the start, each stop, and the way between them.
  const map = useMemo(() => {
    if (!trip) return null;
    const start = STATION[trip.startStationId];
    const markers: MapMarker[] = [
      ...(start ? [{ id: "start", kind: "station" as const, label: `Start: ${start.name}`, lat: start.lat, lng: start.lng, color: LINES[start.lines[0]].color }] : []),
      ...timed.map((t, i) => ({ id: t.stop.key, kind: "landmark" as const, label: `${i + 1}. ${t.stop.name}`, lat: t.stop.lat, lng: t.stop.lng })),
    ];
    const lines: MapLine[] = [];
    let at = start ? { lat: start.lat, lng: start.lng } : null;
    timed.forEach((t, i) => {
      const to = { lat: t.stop.lat, lng: t.stop.lng };
      if (t.leg.mode === "transit") {
        t.leg.plan.legs.forEach((l, k) => lines.push({ id: `r${i}-${k}`, color: LINES[l.line].color, emphasis: true, path: l.stops.map((id) => ({ lat: STATION[id].lat, lng: STATION[id].lng })) }));
        if (at) lines.push({ id: `in${i}`, color: "#1f4b3a", dashed: true, path: [at, { lat: t.leg.from.lat, lng: t.leg.from.lng }] });
        lines.push({ id: `out${i}`, color: "#1f4b3a", dashed: true, path: [{ lat: t.leg.to.lat, lng: t.leg.to.lng }, to] });
      } else if (at) lines.push({ id: `w${i}`, color: "#1f4b3a", dashed: true, emphasis: true, path: [at, to] });
      at = to;
    });
    return { markers, lines, fit: markers.map((m) => ({ lat: m.lat, lng: m.lng })) };
  }, [trip, timed]);

  if (!trip)
    return (
      <div className="grid h-full place-items-center px-6">
        <Empty title="No trip open" body="Pick a saved trip or start a new one." action={<Link href="/trips" className="inline-flex h-11 items-center rounded-full bg-forest px-6 text-[15px] font-bold text-paper">Go to Trips</Link>} />
      </div>
    );

  const setStops = (next: Stop[]) => update(trip.id, (t) => ({ ...t, days: t.days.map((x, i) => (i === d ? next : x)) }));
  const openStop = stops.find((x) => x.key === detail);
  const openTimed = timed.find((t) => t.stop.key === detail);
  const open = openStop ? { stop: openStop, arrive: openTimed?.arrive ?? null } : undefined;
  const openIndex = stops.findIndex((s) => s.key === detail);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= stops.length) return;
    const next = [...stops];
    next.splice(to, 0, ...next.splice(from, 1));
    setStops(next);
  };
  const select = (key: string) => {
    setSelected(key);
    list.current?.querySelector(`#stop-${key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const ride = (t: Timed) => {
    if (t.leg.mode !== "transit") return;
    emitTrip({ t: "leg-started", tripId: trip.id, placeId: t.stop.id });
    const walkTo = { name: t.stop.name, address: t.stop.address, lat: t.stop.lat, lng: t.stop.lng, minutes: t.leg.walkOut, km: t.leg.km };
    if (startJourney(t.leg.from.id, t.leg.to.id, walkTo)) router.push("/journey");
  };
  const allDays = trip.days.map((x) => dayTotals(schedule(x, trip.startStationId, weekday)));

  return (
    <div data-scene="trip-plan" className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-1 px-3 pt-2">
        <Link href="/trips" className="flex h-10 shrink-0 items-center gap-0.5 pr-2 text-[15px] font-semibold text-forest"><ChevronLeft size={20} aria-hidden /> Trips</Link>
        <input value={trip.name} onChange={(e) => update(trip.id, (t) => ({ ...t, name: e.target.value.slice(0, 60) }))} aria-label="Trip name" className="h-10 min-w-0 flex-1 rounded-xl bg-transparent px-2 text-center text-[16px] font-bold focus:bg-card" />
        <button onClick={() => (remove(trip.id), router.push("/trips"))} aria-label="Delete this trip" className="grid size-10 shrink-0 place-items-center rounded-full text-ink-soft"><Trash2 size={18} /></button>
      </header>

      <div data-tour="trip-map" className="relative mx-4 mt-1 h-[190px] shrink-0 overflow-hidden rounded-3xl border border-line">
        {map && <CityMap className="size-full" markers={map.markers} lines={map.lines} fit={map.fit.length > 1 ? map.fit : undefined} center={map.fit[0]} zoom={14} selectedId={selected} onSelect={select} />}
      </div>

      <div className="flex shrink-0 items-center gap-2 px-4 pt-3">
        <div role="tablist" aria-label="Days" className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          {trip.days.map((_, i) => (
            <button key={i} role="tab" aria-selected={tab === "plan" && i === d} onClick={() => (setDay(i), setTab("plan"), setSelected(null))} className={cx("h-9 shrink-0 rounded-full px-3.5 text-[13.5px] font-bold", tab === "plan" && i === d ? "bg-forest text-paper" : "bg-sand text-ink-soft")}>Day {i + 1}</button>
          ))}
          {trip.days.length < 3 && (
            <button onClick={() => (update(trip.id, (t) => ({ ...t, days: [...t.days, []] })), setDay(trip.days.length), setTab("plan"))} aria-label="Add a day" className="grid size-9 shrink-0 place-items-center rounded-full bg-sand text-ink-soft"><Plus size={17} /></button>
          )}
          <button role="tab" aria-selected={tab === "overview"} onClick={() => setTab("overview")} className={cx("h-9 shrink-0 rounded-full px-3.5 text-[13.5px] font-bold", tab === "overview" ? "bg-forest text-paper" : "bg-sand text-ink-soft")}>Overview</button>
        </div>
      </div>

      <div ref={list} className="scroll-area min-h-0 flex-1 px-4 pb-6 pt-3">
        {tab === "overview" ? (
          <section aria-label="Trip overview" data-testid="trip-overview">
            <ul className="space-y-2.5">
              {allDays.map((t, i) => (
                <li key={i} className="rounded-2xl border border-line bg-card px-4 py-3">
                  <p className="text-[16px] font-bold">Day {i + 1}</p>
                  {t.stops ? (
                    <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[14px]">
                      <dt className="text-ink-soft">Stops</dt><dd className="text-right font-semibold">{t.stops}</dd>
                      <dt className="text-ink-soft">Time out</dt><dd className="text-right font-semibold">{Math.floor(t.minutes / 60)} h {t.minutes % 60} min</dd>
                      <dt className="text-ink-soft">Walking</dt><dd className="text-right font-semibold">{formatDistance(t.walkKm)}</dd>
                      <dt className="text-ink-soft">T rides</dt><dd className="text-right font-semibold">{t.rides}</dd>
                      <dt className="text-ink-soft">T fares</dt><dd className="text-right font-semibold">{formatFare(t.transitCents)}{t.passIsCheaper ? " (1-Day Pass)" : ""}</dd>
                      <dt className="text-ink-soft">Food and tickets</dt><dd className="text-right font-semibold">{t.priced ? `$${t.placesLow} to $${t.placesHigh}` : "Not listed"}</dd>
                    </dl>
                  ) : (
                    <p className="mt-1 text-[14px] text-ink-soft">No stops yet.</p>
                  )}
                  {t.closed > 0 && <p className="mt-2 rounded-xl bg-[#fbe4e1] px-3 py-2 text-[13px] font-semibold text-[#8a1a12]">{t.closed} stop{t.closed === 1 ? " is" : "s are"} closed at the planned time.</p>}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12.5px] leading-snug text-ink-faint">
              Times assume a {clock(DAY_START)} start on a {WEEKDAYS[weekday]}. T fares are the MBTA&apos;s published adult fares, with the 1-Day Pass used when it is cheaper. Food and ticket ranges are Google&apos;s, per person, and only cover the places that list one. Ride times are estimates.
            </p>
          </section>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2" data-tour="trip-tools">
              <p className="text-[13.5px] text-ink-soft" data-testid="trip-day-summary">
                {totals.stops ? `${totals.stops} stop${totals.stops === 1 ? "" : "s"}, about ${Math.floor(totals.minutes / 60)} h ${totals.minutes % 60} min, T fares ${formatFare(totals.transitCents)}` : "Nothing planned for this day yet."}
              </p>
              <div className="flex shrink-0 gap-1.5">
                <Button size="sm" variant="secondary" disabled={stops.filter((x) => !x.skipped).length < 3} onClick={() => (setStops([...orderStops(STATION[trip.startStationId], stops.filter((x) => !x.skipped)), ...stops.filter((x) => x.skipped)]), emitTrip({ t: "trip-optimized", tripId: trip.id, day: d }))}><Wand2 size={15} aria-hidden /> Optimize</Button>
                <Button size="sm" onClick={() => setAdding(true)}><Plus size={15} aria-hidden /> Add</Button>
              </div>
            </div>
            {stops.length ? (
              <Reorder.Group axis="y" values={stops} onReorder={setStops} data-tour="trip-list" aria-label={`Day ${d + 1} stops`} className="mt-1">
                {stops.map((stop) => {
                  // Times, travel and numbers come from the stops that are switched on, in their current order.
                  const at = timed.findIndex((t) => t.stop.key === stop.key);
                  const t = timed[at];
                  // Where this leg sets off from: the stop before, or the day's starting station.
                  const origin: Point = at > 0 ? timed[at - 1].stop : STATION[trip.startStationId];
                  return (
                    <StopCard key={stop.key} stop={stop} t={t} n={t ? at + 1 : null} selected={selected === stop.key} onOpen={() => (setSelected(stop.key), setDetail(stop.key))} onRide={() => t && ride(t)} onWalk={() => t && (setSelected(stop.key), setWalk({ from: origin, to: stop, minutes: t.leg.minutes, km: t.leg.km }), emitTrip({ t: "leg-started", tripId: trip.id, placeId: stop.id }))} onToggle={() => setStops(stops.map((x) => (x.key === stop.key ? { ...x, skipped: !x.skipped } : x)))} />
                  );
                })}
              </Reorder.Group>
            ) : (
              <div data-tour="trip-list" className="mt-3">
                <Empty title="An empty day" body="Add a place to start. Bostie works out the walking and the T between your stops." action={<Button onClick={() => setAdding(true)}><Plus size={16} aria-hidden /> Add a place</Button>} />
              </div>
            )}
          </>
        )}
      </div>

      <WalkSheet walk={walk} onClose={() => setWalk(null)} />
      <AddPlace open={adding} onClose={() => setAdding(false)} onAdd={(p) => (setStops([...stops, asStop({ ...p, why: null, minutes: 45 })]), emitTrip({ t: "stop-added", tripId: trip.id, placeId: p.id }))} />

      <Sheet open={!!open} onClose={() => setDetail(null)} title={open?.stop.name} tall>
        <AnimatePresence>
          {open && (
            <div data-testid="trip-stop-detail">
              <PlacePhoto place={open.stop} zoom className="h-[170px] w-full rounded-2xl" />
              <p className="mt-3 text-[14px] text-ink-soft">{[open.stop.category, priceText(open.stop), open.stop.rating ? `${open.stop.rating.toFixed(1)} stars on Google` : null].filter(Boolean).join(" · ")}</p>
              <p className="text-[14px] text-ink-soft">{open.stop.address}</p>
              {open.stop.summary && <p className="mt-2 text-[15.5px] leading-snug">{open.stop.summary}</p>}
              {open.stop.why && <p className="mt-2 rounded-2xl bg-moss px-3.5 py-2.5 text-[14.5px] leading-snug text-forest-deep">{open.stop.why}</p>}
              <div className="mt-3 flex items-center justify-between rounded-2xl border border-line px-3.5 py-2.5">
                <span className="text-[14.5px]">{open.arrive === null ? "Skipped. Would " : `Arrive ${clock(open.arrive)}, `}stay <strong>{open.stop.minutes} min</strong></span>
                <span className="flex gap-1.5">
                  {[-15, 15].map((step) => (
                    <button key={step} aria-label={step < 0 ? "Stay 15 minutes less" : "Stay 15 minutes more"} onClick={() => setStops(stops.map((s) => (s.key === open.stop.key ? { ...s, minutes: Math.min(240, Math.max(15, s.minutes + step)) } : s)))} className="grid size-9 place-items-center rounded-full bg-sand text-[18px] font-bold">{step < 0 ? "−" : "+"}</button>
                  ))}
                </span>
              </div>
              {open.stop.hours?.week.length ? (
                <ul className="mt-3 space-y-0.5 text-[13.5px] text-ink-soft" aria-label="Opening hours">{open.stop.hours.week.map((w) => <li key={w}>{w}</li>)}</ul>
              ) : (
                <p className="mt-3 text-[13.5px] text-ink-soft">Opening hours are not listed for this place. Check before you go.</p>
              )}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button variant="secondary" disabled={openIndex <= 0} onClick={() => move(openIndex, openIndex - 1)}>Move earlier</Button>
                <Button variant="secondary" disabled={openIndex >= stops.length - 1} onClick={() => move(openIndex, openIndex + 1)}>Move later</Button>
              </div>
              {trip.days.length > 1 && (
                <div className="mt-2 flex gap-2">
                  {trip.days.map((_, i) => i !== d && (
                    <Button key={i} variant="secondary" className="flex-1" onClick={() => (update(trip.id, (t) => ({ ...t, days: t.days.map((x, k) => (k === d ? x.filter((s) => s.key !== open.stop.key) : k === i ? [...x, open.stop] : x)) })), setDetail(null))}>Move to day {i + 1}</Button>
                  ))}
                </div>
              )}
              <Button variant="quiet" className="mt-2 w-full" onClick={() => (setStops(stops.filter((s) => s.key !== open.stop.key)), setDetail(null))}><Trash2 size={16} aria-hidden /> Remove from trip</Button>
            </div>
          )}
        </AnimatePresence>
      </Sheet>
    </div>
  );
}

export type { Trip };
