"use client";
// Ride: search-first trip planning. Type where you are going, or tap a shortcut or a
// recent station, and the route is planned from where you start: a station, any address or place, or where you are now. No quest required.
import {
  Bookmark, BookmarkCheck, BriefcaseBusiness, ChevronRight, Ellipsis, House, LocateFixed, MapPin, MapPinned, Navigation,
  TrainFront, Trash2, TriangleAlert, X, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { suggestStations } from "@/components/StationSelect";
import { Button, cx, LinePill, StationSign } from "@/components/ui";
import { useAlerts, usePlaceSearch } from "@/lib/api";
import type { PlaceHit } from "@/lib/contracts";
import { bestStationFor, LINES, nearestStation, STATION, walkFor, type Station } from "@/lib/network";
import { formatDistance } from "@/lib/geo";
import { LANDMARKS, stationFor, type Place } from "@/lib/places";
import { DEMO_ROUTE, useStore, useWhere } from "@/lib/store";

const STAGE_LABEL: Record<string, string> = {
  planning: "Route ready", walking: "Walking to the station", waiting: "Waiting for your train", boarding: "Boarding",
  traveling: "On the train", transferring: "Changing lines", arriving: "Arriving", exploring: "Exploring nearby", complete: "Journey complete",
};

/** What the search field is choosing right now. */
type Mode = "to" | "from" | "home" | "work";
const PROMPT: Record<Mode, string> = { to: "Where to?", from: "Starting point", home: "Your home station", work: "Your work station" };

const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** Landmarks whose name or nickname contains the text: each leads to its nearest station. */
const asHit = (p: Place): PlaceHit => ({ id: `lm:${p.id}`, name: p.name, address: p.neighborhood, lat: p.lat, lng: p.lng });
const suggestPlaces = (text: string): Place[] => {
  const q = clean(text);
  return q.length < 2 ? [] : LANDMARKS.filter((l) => [l.name, ...l.aliases].some((a) => clean(a).includes(q))).slice(0, 3);
};

/** One pill per line serving the station (the Green Line branches count once). */
const LineBadges = ({ station }: { station: Station }) => (
  <span className="mt-1 flex flex-wrap gap-1">
    {station.lines.map((line) => (
      <span key={line} className="inline-flex h-[22px] items-center rounded-full px-2 text-[11.5px] font-bold leading-none text-white" style={{ background: LINES[line].color }}>
        {line}
      </span>
    ))}
  </span>
);

/** A rounded action row, like a button on a card. */
function ActionRow({ Icon, label, sub, muted, onClick, href, ...rest }: {
  Icon: LucideIcon; label: string; sub?: string; muted?: boolean; onClick?: () => void; href?: string; "aria-label"?: string;
}) {
  const body = (
    <>
      <Icon size={24} className={cx("shrink-0", muted ? "text-ink-faint" : "text-forest")} aria-hidden />
      <span className="min-w-0 flex-1 text-left">
        <span className={cx("block truncate text-[17px] font-bold", muted && "text-ink-soft")}>{label}</span>
        {sub && <span className="block truncate text-[13.5px] text-ink-soft">{sub}</span>}
      </span>
      <ChevronRight size={20} className="shrink-0 text-ink-faint" aria-hidden />
    </>
  );
  const box = "flex min-h-[60px] w-full items-center gap-4 rounded-2xl bg-card px-4 py-2.5 shadow-card";
  return href ? <Link href={href} className={box} {...rest}>{body}</Link> : <button onClick={onClick} className={box} {...rest}>{body}</button>;
}

export default function RidePage() {
  const router = useRouter();
  const journey = useStore((s) => s.journey);
  const home = useStore((s) => s.home);
  const work = useStore((s) => s.work);
  const recents = useStore((s) => s.recents);
  const saved = useStore((s) => s.saved);
  const geoStatus = useStore((s) => s.geoStatus);
  const requestLocation = useStore((s) => s.requestLocation);
  const startJourney = useStore((s) => s.startJourney);
  const setShortcut = useStore((s) => s.setShortcut);
  const removeRecent = useStore((s) => s.removeRecent);
  const toggleSaved = useStore((s) => s.toggleSaved);
  const where = useWhere();
  const near = where.at ? nearestStation(where.at) : null;

  /** A start the rider picked by hand: a station, or any address or place. Otherwise where they are, or Harvard. */
  const [pickedFrom, setPickedFrom] = useState<string | null>(null);
  const [fromPlace, setFromPlace] = useState<PlaceHit | null>(null);
  // ponytail: a trip from a place boards at its nearest station; choose per destination if that ever sends people the long way round.
  const fromNear = fromPlace ? nearestStation(fromPlace) : null;
  const from = pickedFrom ?? fromNear?.station.id ?? near?.station.id ?? DEMO_ROUTE.from;
  const walkFrom = fromPlace && fromNear ? { name: fromPlace.name, address: fromPlace.address, lat: fromPlace.lat, lng: fromPlace.lng, km: fromNear.km, minutes: walkFor(fromNear.km) } : undefined;
  const [mode, setMode] = useState<Mode>("to");
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const alerts = useAlerts();

  /** The destination picked from the list. It stays in the To box until the rider taps Start. */
  const [dest, setDest] = useState<{ name: string; stationId?: string; hit?: PlaceHit } | null>(null);
  const searching = mode !== "to" || (text.trim() !== "" && !dest);
  const stations = searching ? suggestStations(text) : [];
  /** Home and work are stations; the start and the destination can be anywhere. */
  const anywhere = mode === "to" || mode === "from";
  const places = anywhere ? suggestPlaces(text) : [];
  // Anywhere else: addresses and places from the location search.
  const search = usePlaceSearch(text, anywhere);
  const routed = mode === "to" ? search.places.map((hit) => ({ hit, best: bestStationFor(from, hit) })).filter((r) => r.best) : [];
  /** Places a trip can start from: those within a walk of a station. */
  const starts = mode === "from" ? search.places.map((hit) => ({ hit, near: nearestStation(hit) })).filter((r) => r.near.km <= 2.5) : [];
  const inProgress = journey && journey.stage !== "complete";
  /** The trip starts from wherever the rider is (their nearest station) rather than a station they chose. */
  const usingLocation = !pickedFrom && !fromPlace && !!near;
  /** Back to the destination field, keeping whatever destination was already chosen. */
  const backToDest = () => {
    setText(dest?.name ?? "");
    setMode("to");
  };
  const startAt = (hit: PlaceHit) => {
    setFromPlace(hit);
    setPickedFrom(null);
    backToDest();
  };
  const useCurrentLocation = () => {
    setPickedFrom(null);
    setFromPlace(null);
    if (!where.at) requestLocation();
    backToDest();
  };

  const reset = () => {
    setText("");
    setDest(null);
    setMode("to");
  };
  /** Picking a destination fills the box and closes the list; nothing starts yet. */
  const choose = (d: NonNullable<typeof dest>) => {
    setDest(d);
    setText(d.name);
    setMode("to");
    setNote("");
  };
  const startTrip = () => {
    if (dest?.hit) goPlace(dest.hit);
    else if (dest?.stationId) go(dest.stationId);
  };

  const go = (toId: string) => {
    setNote("");
    if (toId === from) return setNote(walkFrom ? `${STATION[toId].name} is the station nearest ${walkFrom.name}: a ${walkFrom.minutes} min walk, no train needed.` : `You are already at ${STATION[toId].name}. Tap the From field to start somewhere else.`);
    if (!startJourney(from, toId, undefined, walkFrom)) return setNote("No rail route found to that station.");
    router.push("/journey");
  };

  /** An address or place was picked: ride to the best station for it, then walk. */
  const goPlace = (hit: PlaceHit) => {
    setNote("");
    const best = bestStationFor(from, hit);
    if (!best) return setNote(`${hit.name} is not within walking distance of a subway station.`);
    if (!best.plan) return setNote(`${hit.name} is a ${best.walkMinutes} min walk from ${STATION[from].name}. No train needed.`);
    const walkTo = { name: hit.name, address: hit.address, lat: hit.lat, lng: hit.lng, minutes: best.walkMinutes, km: best.walkKm };
    if (startJourney(from, best.station.id, walkTo, walkFrom)) router.push("/journey");
  };

  /** A station was picked from the results: what that means depends on what the field is choosing. */
  const pick = (id: string, name = STATION[id].name) => {
    if (mode === "to") return choose({ name, stationId: id });
    if (mode === "from") {
      setPickedFrom(id);
      setFromPlace(null);
      return backToDest();
    }
    setShortcut(mode, id);
    reset();
  };

  // Recent trips first; before there are any, the stations most people start with.
  const list = (recents.length ? recents : suggestStations("").map((s) => s.id)).filter((id) => id !== from && STATION[id]);
  const menu = menuFor ? STATION[menuFor] : null;

  return (
    <div data-scene="ride" className="scroll-area h-full pb-8">
      <header data-tour="ride-search" className="bg-forest px-4 pb-4 pt-3 text-paper">
        <h1 className="px-1 text-[26px] font-bold">Plan a ride</h1>
        <div className="mt-2.5 flex items-stretch gap-2.5">
          {/* Start at the top, destination at the bottom, joined like a route. */}
          <span aria-hidden className="flex w-8 shrink-0 flex-col items-center justify-between rounded-full bg-paper/15 py-3.5">
            <Navigation size={15} fill="currentColor" />
            <span className="size-2.5 rounded-[3px] bg-paper" />
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            {(["from", "to"] as const).map((row) => {
              // Home and work are chosen in the destination field.
              const active = row === "from" ? mode === "from" : mode !== "from";
              const box = "flex h-12 w-full min-w-0 items-center gap-2.5 rounded-2xl px-3.5";
              if (!active)
                return (
                  <button
                    key={row}
                    onClick={() => {
                      setText(row === "to" ? (dest?.name ?? "") : "");
                      setMode(row);
                    }}
                    aria-label={row === "from" ? "Change starting point" : "Choose destination"}
                    className={cx(box, "bg-paper/12 text-left")}
                  >
                    <span className="w-10 shrink-0 text-[13px] font-semibold text-paper/70">{row === "from" ? "From" : "To"}</span>
                    {row === "to" ? (
                      <span className={cx("truncate text-[16.5px]", dest ? "font-bold" : "text-paper/70")}>{dest?.name ?? "Where to?"}</span>
                    ) : usingLocation ? (
                      <span className="inline-flex min-w-0 items-center gap-1.5 rounded-lg bg-t-green/90 px-2 py-1 text-[15px] font-bold">
                        <span className="truncate">Current location</span>
                      </span>
                    ) : (
                      <span className="truncate text-[16.5px] font-bold">{fromPlace?.name ?? STATION[from].name}</span>
                    )}
                  </button>
                );
              return (
                <label key={row} className={cx(box, "bg-paper text-ink")}>
                  <span className="w-10 shrink-0 text-[13px] font-semibold text-ink-faint">{row === "from" ? "From" : "To"}</span>
                  <input
                    role="combobox"
                    aria-label={PROMPT[mode]}
                    aria-expanded={searching}
                    aria-controls="ride-results"
                    aria-autocomplete="list"
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      setDest(null); // typing again reopens the list
                      setNote("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && dest && mode === "to") return startTrip();
                      if (e.key === "Enter" && searching) {
                        if (!text.trim()) return; // nothing typed: wait for a choice instead of guessing one
                        if (stations[0]) pick(stations[0].id);
                        else if (places[0] && mode !== "from") pick(stationFor(places[0]).id, places[0].name);
                        else if (mode === "from" && places[0]) startAt(asHit(places[0]));
                        else if (routed[0]) choose({ name: routed[0].hit.name, hit: routed[0].hit });
                        else if (starts[0]) startAt(starts[0].hit);
                        else setNote("Pick a station or place from the list. Bostie only plans trips to places it can find.");
                      } else if (e.key === "Escape") reset();
                    }}
                    placeholder={anywhere ? "Station, address or place" : "Type a station"}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="search"
                    style={{ outline: "none" }}
                    className="min-w-0 flex-1 bg-transparent text-[17px] font-semibold placeholder:font-normal placeholder:text-ink-faint"
                  />
                  {(searching || dest) && (
                    <button onClick={reset} aria-label="Clear search" className="grid size-8 shrink-0 place-items-center rounded-full text-ink-soft">
                      <X size={18} />
                    </button>
                  )}
                </label>
              );
            })}
          </div>
        </div>
        <p className="mt-2.5 px-1 text-[14px] text-paper/85" data-testid="ride-from-note">
          {mode === "from" ? (
            "Choose where your trip starts."
          ) : mode !== "to" ? (
            `Choose your ${mode} station for one-tap trips.`
          ) : walkFrom ? (
            <>
              Starts at <strong className="font-bold text-paper">{STATION[from].name}</strong>, a {walkFrom.minutes} min walk from there.
            </>
          ) : usingLocation ? (
            <>
              Nearest station: <strong className="font-bold text-paper">{STATION[from].name}</strong>
              {where.source === "simulated" ? " (demo position)" : ""}
            </>
          ) : !pickedFrom && geoStatus === "asking" ? (
            "Finding your location…"
          ) : !pickedFrom && (geoStatus === "denied" || geoStatus === "unavailable") ? (
            `${geoStatus === "denied" ? "Location is blocked for this site" : "Could not find your location"}, so the trip starts at ${STATION[from].name}. Tap From to change it.`
          ) : (
            "Tap From to start somewhere else or use your current location."
          )}
        </p>
        {dest && mode === "to" && (
          <button onClick={startTrip} className="mt-3 flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-gold text-[17px] font-bold text-forest-deep" data-testid="ride-start">
            <Navigation size={18} fill="currentColor" aria-hidden /> Start
          </button>
        )}
      </header>

      {note && <p role="alert" className="mx-4 mt-3 rounded-2xl bg-gold-soft px-4 py-3 text-[14.5px] font-semibold text-[#5b410b]">{note}</p>}

      {searching ? (
        <section className="px-4 pt-3" aria-label="Search results">
          <ul id="ride-results" role="listbox" aria-label={`${PROMPT[mode]} results`} className="divide-y divide-line overflow-hidden rounded-2xl bg-card shadow-card">
            {mode === "from" && (
              <li role="option" aria-selected={usingLocation}>
                <button onClick={useCurrentLocation} className="flex min-h-[60px] w-full items-center gap-3.5 px-4 py-2 text-left">
                  <LocateFixed size={22} className="shrink-0 text-t-green" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16.5px] font-bold">Current location</span>
                    <span className="block text-[13.5px] leading-snug text-ink-soft">
                      {near ? `Starts at ${near.station.name}, your nearest station${where.source === "simulated" ? " (demo position)" : ""}` : "Uses your location and starts at your nearest station"}
                    </span>
                  </span>
                </button>
              </li>
            )}
            {!text.trim() && <li role="presentation" className="px-4 pb-1 pt-3 text-[12.5px] font-semibold text-ink-faint">Popular stations</li>}
            {stations.map((s) => (
              <li key={s.id} role="option" aria-selected={false}>
                <button onClick={() => pick(s.id)} aria-label={`${mode === "to" ? "Go to" : "Choose"} ${s.name}`} className="flex min-h-[60px] w-full items-center gap-3.5 px-4 py-2 text-left">
                  <TrainFront size={22} className="shrink-0 text-forest" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16.5px] font-bold">{s.name}</span>
                    <LineBadges station={s} />
                  </span>
                </button>
              </li>
            ))}
            {places.map((p) => {
              const s = stationFor(p);
              return (
                <li key={p.id} role="option" aria-selected={false}>
                  <button onClick={() => (mode === "from" ? startAt(asHit(p)) : pick(s.id, p.name))} aria-label={`${mode === "from" ? "Start at" : "Go to"} ${p.name}, by ${s.name} station`} className="flex min-h-[60px] w-full items-center gap-3.5 px-4 py-2 text-left">
                    <MapPin size={22} className="shrink-0 text-gold" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16.5px] font-bold">{p.name}</span>
                      <span className="block truncate text-[13.5px] text-ink-soft">Landmark, by {s.name} station</span>
                    </span>
                  </button>
                </li>
              );
            })}
            {routed.map(({ hit, best }) => (
              <li key={hit.id} role="option" aria-selected={false}>
                <button onClick={() => choose({ name: hit.name, hit })} aria-label={`Go to ${hit.name}${hit.address ? `, ${hit.address}` : ""}`} className="flex min-h-[60px] w-full items-center gap-3.5 px-4 py-2 text-left">
                  <MapPin size={22} className="shrink-0 text-ink-soft" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16.5px] font-bold">{hit.name}</span>
                    {hit.address && <span className="block truncate text-[13.5px] text-ink-soft">{hit.address}</span>}
                    <span className="block truncate text-[13.5px] font-semibold text-forest">
                      {best!.plan ? `${best!.totalMinutes} min: train to ${best!.station.name}, then a ${best!.walkMinutes} min walk` : `${best!.walkMinutes} min walk from ${best!.station.name}`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {starts.map(({ hit, near: n }) => (
              <li key={hit.id} role="option" aria-selected={false}>
                <button onClick={() => startAt(hit)} aria-label={`Start at ${hit.name}${hit.address ? `, ${hit.address}` : ""}`} className="flex min-h-[60px] w-full items-center gap-3.5 px-4 py-2 text-left">
                  <MapPin size={22} className="shrink-0 text-ink-soft" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16.5px] font-bold">{hit.name}</span>
                    {hit.address && <span className="block truncate text-[13.5px] text-ink-soft">{hit.address}</span>}
                    <span className="block truncate text-[13.5px] font-semibold text-forest">
                      {walkFor(n.km)} min walk ({formatDistance(n.km)}) to {n.station.name} station
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {anywhere && search.state === "loading" && (
              <li role="presentation" className="px-4 py-3.5 text-[14px] text-ink-soft">Searching addresses and places…</li>
            )}
            {anywhere && search.state === "unavailable" && (
              <li role="presentation" className="px-4 py-3.5 text-[14px] text-ink-soft">Address search is unavailable right now. Station and landmark names still work.</li>
            )}
            {!stations.length && !places.length && !routed.length && !starts.length && search.state !== "loading" && search.state !== "unavailable" && (
              <li role="presentation" className="px-4 py-4 text-[14.5px] text-ink-soft">
                Nothing matches “{text.trim()}”{anywhere && text.trim().length < 3 ? ". Keep typing to search addresses and places." : ". Try a station, an address or a place name."}
              </li>
            )}
          </ul>
          {search.provider && routed.length + starts.length > 0 && (
            <p className="mt-2 px-1 text-[12px] text-ink-faint">
              {search.provider === "google" ? "Places by Google." : "Places from OpenStreetMap."} Routes by Bostie from the MBTA network.
            </p>
          )}
        </section>
      ) : (
        <>
          {inProgress && (
            <Link href="/journey" className="mx-4 mt-3 block">
              <StationSign id={journey.plan.to}>
                <p className="mt-1 text-[14px] text-white/75">
                  From {STATION[journey.plan.from].name}. {STAGE_LABEL[journey.stage]}.
                </p>
                <span className="mt-3 inline-flex h-10 items-center gap-1 rounded-full bg-paper px-4 text-[14px] font-bold text-ink">
                  Continue journey <ChevronRight size={16} aria-hidden />
                </span>
              </StationSign>
            </Link>
          )}

          <section data-tour="ride-shortcuts" className="space-y-2.5 px-4 pt-3" aria-label="Shortcuts">
            <ActionRow Icon={MapPinned} label="Choose on map" href="/" />
            {(["home", "work"] as const).map((kind) => {
              const id = kind === "home" ? home : work;
              const Icon = kind === "home" ? House : BriefcaseBusiness;
              return id && STATION[id] ? (
                <ActionRow key={kind} Icon={Icon} label={kind === "home" ? "Home" : "Work"} sub={STATION[id].name} onClick={() => go(id)} aria-label={`Go to ${STATION[id].name}, ${kind}`} />
              ) : (
                <ActionRow
                  key={kind}
                  Icon={Icon}
                  label={`Set ${kind}`}
                  muted
                  onClick={() => {
                    setText("");
                    setMode(kind);
                  }}
                />
              );
            })}
            <ActionRow
              Icon={TriangleAlert}
              label="Service alerts"
              sub={alerts.state === "live" ? (alerts.data.length ? `${alerts.data.length} live service alert${alerts.data.length > 1 ? "s" : ""}` : "None reported right now") : alerts.state === "loading" ? "Checking the MBTA" : "Unavailable right now"}
              onClick={() => setAlertsOpen(true)}
            />
          </section>

          <section data-tour="ride-recents" className="px-4 pt-6" aria-labelledby="recent-h">
            <h2 id="recent-h" className="px-1 font-sans text-[15px] font-semibold text-ink-soft">{recents.length ? "Recent" : "Popular stations"}</h2>
            <ul className="mt-1 divide-y divide-line">
              {list.map((id) => {
                const s = STATION[id];
                return (
                  <li key={id} className="flex items-center">
                    <button onClick={() => go(id)} aria-label={`Go to ${s.name}`} className="flex min-h-[64px] min-w-0 flex-1 items-center gap-4 px-1 py-2 text-left">
                      <TrainFront size={24} className="shrink-0 text-forest" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[17px] font-bold">{s.name}</span>
                        <LineBadges station={s} />
                      </span>
                    </button>
                    <button onClick={() => setMenuFor(id)} aria-label={`More for ${s.name}`} className="grid size-11 shrink-0 place-items-center rounded-full text-ink-soft">
                      <Ellipsis size={22} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}

      <Sheet open={!!menu} onClose={() => setMenuFor(null)} title={menu?.name}>
        {menu && (
          <div className="flex flex-col gap-2.5 pb-2">
            <Button
              onClick={() => {
                setMenuFor(null);
                go(menu.id);
              }}
            >
              <TrainFront size={18} aria-hidden /> Plan a ride here
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setShortcut("home", home === menu.id ? null : menu.id);
                setMenuFor(null);
              }}
            >
              <House size={18} aria-hidden /> {home === menu.id ? "Remove as home" : "Set as home"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setShortcut("work", work === menu.id ? null : menu.id);
                setMenuFor(null);
              }}
            >
              <BriefcaseBusiness size={18} aria-hidden /> {work === menu.id ? "Remove as work" : "Set as work"}
            </Button>
            <Button variant="secondary" onClick={() => toggleSaved(menu.id)} aria-pressed={saved.includes(menu.id)}>
              {saved.includes(menu.id) ? <BookmarkCheck size={18} aria-hidden /> : <Bookmark size={18} aria-hidden />}
              {saved.includes(menu.id) ? "Saved to your places" : "Save this station"}
            </Button>
            {recents.includes(menu.id) && (
              <Button
                variant="quiet"
                onClick={() => {
                  removeRecent(menu.id);
                  setMenuFor(null);
                }}
              >
                <Trash2 size={17} aria-hidden /> Remove from recent
              </Button>
            )}
          </div>
        )}
      </Sheet>

      <Sheet open={alertsOpen} onClose={() => setAlertsOpen(false)} title="Service alerts">
        <p className="mb-3 text-[13px] text-ink-soft">Live from the MBTA. Subway and light rail only.</p>
        {alerts.data.length ? (
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
        ) : (
          <p className="pb-4 text-[15px] text-ink-soft">{alerts.state === "live" ? "No subway alerts are reported right now." : "Service alerts could not be loaded. Check mbta.com/alerts."}</p>
        )}
      </Sheet>
    </div>
  );
}
