"use client";
import { Bookmark, BookmarkCheck, Compass, Footprints, LocateFixed, ScanLine, TrainFront } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CityMap, TRANSIT_LINES, type MapLine, type MapMarker } from "@/components/map/CityMap";
import { Sheet } from "@/components/Sheet";
import { GuideButton } from "@/components/shell/Tour";
import { Logo } from "@/components/shell/Welcome";
import { RarityPips, rarityLabel, StampArt } from "@/components/Stamp";
import { Button, cx, Photo, shortDate, StationSign } from "@/components/ui";
import { derive, levelFor, STAMP, totalXp } from "@/lib/gamification";
import { distanceKm, formatDistance, walkMinutes, type LatLng } from "@/lib/geo";
import { LINES, nearestStation, STATION, STATIONS, type LineId, type Station } from "@/lib/network";
import { LANDMARKS, landmarksNearStation, PLACE, stationFor, type Place } from "@/lib/places";
import { DEMO_ROUTE, useStore, useWhere } from "@/lib/store";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "stations", label: "Stations" },
  { id: "landmarks", label: "Landmarks" },
  { id: "saved", label: "Saved" },
  { id: "undiscovered", label: "Undiscovered" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

const PARK_STREET = STATION["place-pktrm"];
const pill = "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-semibold shadow-card";
const linkButton = "inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-6 text-[16px] font-semibold";

function LineTags({ lines }: { lines: LineId[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {lines.map((l) => (
        <span key={l} className="inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-bold leading-none text-white" style={{ background: LINES[l].color }}>
          {LINES[l].name}
        </span>
      ))}
    </span>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-line py-2.5 text-[14.5px]">
      <dt className="shrink-0 text-ink-soft">{label}</dt>
      <dd className="text-right font-semibold">{children}</dd>
    </div>
  );
}

function Collectible({ stampId, owned }: { stampId: string; owned: boolean }) {
  const stamp = STAMP[stampId];
  return (
    <div className="mt-3 flex items-center gap-4 rounded-2xl bg-paper p-3.5">
      <StampArt stamp={stamp} owned={owned} className="w-[76px] shrink-0" />
      <div className="min-w-0">
        <p className="text-[13px] text-ink-soft">{owned ? "In your passport" : "Stamp on offer"}</p>
        <p className="flex items-center gap-2 text-[15px] font-bold">
          {rarityLabel(stamp.rarity)} <RarityPips rarity={stamp.rarity} />
        </p>
        <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">{stamp.rule}</p>
      </div>
    </div>
  );
}

/** Home: the adventure map, with the two things you can do from it. */
export default function HomeMap() {
  const router = useRouter();
  const events = useStore((s) => s.events);
  const xp = useStore((s) => s.xp);
  const saved = useStore((s) => s.saved);
  const journey = useStore((s) => s.journey);
  const demo = useStore((s) => s.demo);
  const geoStatus = useStore((s) => s.geoStatus);
  const requestLocation = useStore((s) => s.requestLocation);
  const toggleSaved = useStore((s) => s.toggleSaved);
  const startJourney = useStore((s) => s.startJourney);
  const { at, source } = useWhere();

  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [walkOn, setWalkOn] = useState(false);
  const [walkSheet, setWalkSheet] = useState(false);
  const [note, setNote] = useState("");

  const d = useMemo(() => derive(events), [events]);
  const total = totalXp(xp);
  const level = levelFor(total);
  const riding = !!journey && journey.stage !== "complete";

  const select = (id: string | null) => {
    setNote("");
    setWalkSheet(false);
    setSelectedId(id);
  };

  // Three nearest undiscovered landmarks, visited in nearest-neighbour order.
  const walk = useMemo(() => {
    const origin: LatLng = at ?? PARK_STREET;
    const pool = LANDMARKS.filter((l) => !d.landmarks.has(l.id))
      .sort((a, b) => distanceKm(origin, a) - distanceKm(origin, b))
      .slice(0, 3);
    const steps: { place: Place; km: number; minutes: number }[] = [];
    let here = origin;
    while (pool.length) {
      pool.sort((a, b) => distanceKm(here, a) - distanceKm(here, b));
      const place = pool.shift()!;
      const km = distanceKm(here, place);
      steps.push({ place, km, minutes: walkMinutes(km) });
      here = place;
    }
    return { origin, steps, minutes: steps.reduce((n, s) => n + s.minutes, 0) };
  }, [at, d]);

  const markers = useMemo(() => {
    const show = (isStation: boolean, id: string, done: boolean) =>
      filter === "all" || (filter === "stations" && isStation) || (filter === "landmarks" && !isStation) ||
      (filter === "saved" && saved.includes(id)) || (filter === "undiscovered" && !done);
    const out: MapMarker[] = [];
    for (const s of STATIONS) {
      const done = d.stations.has(s.id);
      if (show(true, s.id, done)) out.push({ id: s.id, lat: s.lat, lng: s.lng, kind: saved.includes(s.id) ? "saved" : "station", label: s.name, color: LINES[s.lines[0]].color, done });
    }
    for (const l of LANDMARKS) {
      const done = d.landmarks.has(l.id);
      if (show(false, l.id, done)) out.push({ id: l.id, lat: l.lat, lng: l.lng, kind: saved.includes(l.id) ? "saved" : "landmark", label: l.name, done });
    }
    if (at) out.push({ id: "user", lat: at.lat, lng: at.lng, kind: "user", label: source === "simulated" ? "You (demo)" : "You" });
    return out;
  }, [filter, saved, d, at, source]);

  const lines = useMemo(() => {
    const out: MapLine[] = [...TRANSIT_LINES];
    if (riding)
      journey.plan.legs.forEach((leg, i) =>
        out.push({ id: `journey-${i}`, color: LINES[leg.line].color, emphasis: true, path: leg.stops.map((id) => STATION[id]) }),
      );
    if (walkOn && walk.steps.length)
      out.push({ id: "walk", color: "#1f4b3a", emphasis: true, dashed: true, path: [walk.origin, ...walk.steps.map((s) => s.place)] });
    return out;
  }, [riding, journey, walkOn, walk]);

  // Frame the player together with downtown when they are in Boston; otherwise open on downtown.
  const center = useMemo(() => ({ lat: PARK_STREET.lat, lng: PARK_STREET.lng }), []);
  const fit = useMemo(() => {
    if (walkOn && walk.steps.length) return [walk.origin, ...walk.steps.map((s) => s.place)].map((p) => ({ lat: p.lat, lng: p.lng }));
    if (at && distanceKm(at, PARK_STREET) < 9) return [{ lat: at.lat, lng: at.lng }, { lat: PARK_STREET.lat, lng: PARK_STREET.lng }, { lat: 42.3663, lng: -71.0544 }];
    return undefined;
  }, [walkOn, walk, at]);

  const place = selectedId ? PLACE[selectedId] : undefined;
  const station: Station | undefined = selectedId ? STATION[selectedId] : undefined;

  /** Plans a trip from the station nearest the player to `toId`. */
  const planTo = (toId: string, alreadyThere: string) => {
    const from = at ? nearestStation(at).station.id : DEMO_ROUTE.from;
    if (from === toId || !startJourney(from, toId)) return setNote(alreadyThere);
    router.push("/journey");
  };

  const saveButton = (id: string) => {
    const on = saved.includes(id);
    return (
      <Button variant="secondary" className="w-full" onClick={() => toggleSaved(id)} aria-pressed={on}>
        {on ? <BookmarkCheck size={18} aria-hidden /> : <Bookmark size={18} aria-hidden />}
        {on ? "Saved" : "Save"}
      </Button>
    );
  };
  const tripAction = (label: string, toId: string, alreadyThere: string) =>
    riding ? (
      <Link href="/journey" className={cx(linkButton, "border border-line bg-card text-ink")}>
        <TrainFront size={18} aria-hidden /> Journey in progress
      </Link>
    ) : (
      <Button className="w-full" onClick={() => planTo(toId, alreadyThere)}>
        <TrainFront size={18} aria-hidden /> {label}
      </Button>
    );

  const locationHelp =
    geoStatus === "denied" ? "Location is blocked for this site. Allow it in your browser settings, then try again."
    : geoStatus === "unavailable" ? "Your location could not be found. Check your signal and try again."
    : "";

  return (
    <div data-scene="home" className="relative h-full">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 space-y-2 p-3">
        <h1 className="sr-only">Bostie adventure map</h1>
        <div className="flex items-center gap-2">
          <span className="pointer-events-auto flex h-11 items-center gap-2 rounded-full bg-card pl-1.5 pr-4 shadow-card">
            <Logo size={32} /> <span className="font-display text-[18px] font-bold">Bostie</span>
          </span>
          <span className="flex-1" />
          {/* In demo mode the gold strip already carries the Guide button. */}
          {!demo && <GuideButton label="Tips" className="pointer-events-auto h-11 rounded-full bg-card px-3.5 text-[13.5px] text-forest shadow-card" />}
          <Link href="/passport" data-tour="level-chip" aria-label={`Level ${level.level}, ${total} XP. Open passport`} className="pointer-events-auto flex h-11 items-center gap-2 rounded-full bg-forest pl-1.5 pr-3.5 text-paper shadow-card">
            <span className="grid size-8 place-items-center rounded-full border-2 border-gold bg-paper font-display text-[15px] font-bold leading-none text-forest">{level.level}</span>
            <span className="text-[13.5px] font-semibold tabular-nums">{total} XP</span>
          </Link>
        </div>
        <div className="pointer-events-auto -mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Show on map" data-tour="map-filters">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)} aria-pressed={filter === f.id} className={cx(pill, filter === f.id ? "bg-forest text-paper" : "bg-card text-ink")}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {demo ? (
            <span className={cx(pill, "pointer-events-auto bg-gold-soft text-[#6a4b0c]")}>
              <LocateFixed size={15} aria-hidden /> Demo position
            </span>
          ) : (
            <button onClick={requestLocation} disabled={geoStatus === "asking"} className={cx(pill, "pointer-events-auto bg-card text-ink disabled:opacity-60")}>
              <LocateFixed size={15} aria-hidden />
              {geoStatus === "asking" ? "Locating" : geoStatus === "granted" ? "Update my location" : geoStatus === "idle" ? "Use my location" : "Try location again"}
            </button>
          )}
          <button
            onClick={() => {
              setWalkOn(!walkOn);
              setWalkSheet(!walkOn);
            }}
            aria-pressed={walkOn}
            data-tour="map-walk"
            className={cx(pill, "pointer-events-auto", walkOn ? "bg-forest text-paper" : "bg-card text-ink")}
          >
            <Footprints size={15} aria-hidden /> {walkOn ? "Hide walk" : "Suggested walk"}
          </button>
        </div>
        {!demo && locationHelp && (
          <p role="status" className="pointer-events-auto rounded-2xl bg-card px-3.5 py-2.5 text-[13.5px] text-ink-soft shadow-card">
            {locationHelp}
          </p>
        )}
      </div>

      <div data-tour="map" className="h-full w-full">
        <CityMap className="h-full w-full" markers={markers} lines={lines} selectedId={selectedId} onSelect={select} center={center} zoom={13.6} fit={fit} />
      </div>

      {/* The two things to do from here. Sits clear of the zoom buttons and the map credit. */}
      <div data-tour="home-actions" className="absolute bottom-[22px] left-3 right-[62px] z-10 grid grid-cols-2 gap-2">
        <Link href={riding ? "/journey" : "/ride"} className="flex h-14 items-center justify-center gap-2 rounded-full bg-forest text-[15.5px] font-bold text-paper shadow-lift">
          <TrainFront size={19} aria-hidden /> {riding ? "Your journey" : "Plan a ride"}
        </Link>
        <Link href="/discover" className="flex h-14 items-center justify-center gap-2 rounded-full bg-gold text-[15.5px] font-bold text-forest-deep shadow-lift">
          <Compass size={19} aria-hidden /> Explore Boston
        </Link>
      </div>

      <Sheet open={walkSheet} onClose={() => setWalkSheet(false)} title="Suggested walk" scrim={false}>
        {walk.steps.length ? (
          <>
            <p className="text-[14.5px] text-ink-soft">
              {walk.steps.length === 1 ? "The nearest landmark" : `The ${walk.steps.length} nearest landmarks`} you have not verified, from{" "}
              {at ? "where you are" : "Park Street"}. About {walk.minutes} min on foot, estimated from straight-line distance.
            </p>
            <ol className="mt-3">
              {walk.steps.map((s, i) => (
                <li key={s.place.id}>
                  <button onClick={() => select(s.place.id)} className="flex w-full items-center gap-3 border-t border-line py-3 text-left">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-forest text-[13px] font-bold text-paper">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] font-semibold">{s.place.name}</span>
                      <span className="block text-[13.5px] text-ink-soft">
                        {s.minutes} min walk, {formatDistance(s.km)} {i ? "from the last stop" : "to start"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="pb-4 text-[15px] text-ink-soft">You have verified every landmark on the map. Nothing left to suggest.</p>
        )}
      </Sheet>

      <Sheet open={!!place || !!station} onClose={() => select(null)} title={place?.name ?? station?.name} tall={!!place}>
        {place && (() => {
          const near = stationFor(place);
          const found = d.landmarks.get(place.id);
          const walkMin = walkMinutes(distanceKm(place, near));
          return (
            <>
              <p className="text-[14px] text-ink-soft">
                Historic landmark in {place.neighborhood}
                {place.year ? `, ${place.year}` : ""}
              </p>
              <Photo id={place.id} alt={place.name} className="mt-3 h-44 rounded-2xl" />
              <p className="mt-3 text-[15px] leading-relaxed">{place.summary}</p>
              <dl className="mt-3">
                <Fact label="Status">{found ? `Verified ${shortDate(found.at)}` : "Not discovered yet"}</Fact>
                {at && <Fact label={source === "simulated" ? "From demo position" : "From you"}>{formatDistance(distanceKm(at, place))}</Fact>}
                <Fact label="Nearest station">
                  <span className="block">{near.name}, {walkMin} min walk</span>
                  <span className="mt-1 block"><LineTags lines={near.lines} /></span>
                </Fact>
              </dl>
              <Collectible stampId={`landmark:${place.id}`} owned={!!found} />
              {note && <p role="status" className="mt-3 rounded-2xl bg-moss px-3.5 py-2.5 text-[14px] text-forest-deep">{note}</p>}
              <div className="mt-4 space-y-2.5 pb-2">
                <Link href="/scan" className={cx(linkButton, "bg-forest text-paper shadow-lift")}>
                  <ScanLine size={18} aria-hidden /> Scan this landmark
                </Link>
                {tripAction("Directions", near.id, `You are already at ${near.name}, the nearest station. It is about ${walkMin} min on foot from there.`)}
                {saveButton(place.id)}
              </div>
            </>
          );
        })()}
        {station && (() => {
          const visit = d.stations.get(station.id);
          const nearby = landmarksNearStation(station.id).slice(0, 4);
          return (
            <>
              <StationSign id={station.id}>
                <p className="mt-0.5 text-[13.5px] text-white/70">
                  MBTA station in {station.municipality}
                  {station.accessible ? ", step-free access" : ""}
                </p>
              </StationSign>
              <dl className="mt-3">
                <Fact label="Lines"><LineTags lines={station.lines} /></Fact>
                <Fact label="Status">{visit ? `Collected ${shortDate(visit.at)}` : "Not collected yet"}</Fact>
                {at && <Fact label={source === "simulated" ? "From demo position" : "From you"}>{formatDistance(distanceKm(at, station))}</Fact>}
                {nearby.length > 0 && (
                  <Fact label="Landmarks nearby">
                    {nearby.map((n) => (
                      <button key={n.place.id} onClick={() => select(n.place.id)} className="block w-full text-right text-forest underline underline-offset-2">
                        {n.place.name}
                      </button>
                    ))}
                  </Fact>
                )}
              </dl>
              <Collectible stampId={`station:${station.id}`} owned={!!visit} />
              {note && <p role="status" className="mt-3 rounded-2xl bg-moss px-3.5 py-2.5 text-[14px] text-forest-deep">{note}</p>}
              <div className="mt-4 space-y-2.5 pb-2">
                {tripAction("Plan a trip here", station.id, "You are already at this station.")}
                {saveButton(station.id)}
              </div>
            </>
          );
        })()}
      </Sheet>
    </div>
  );
}
