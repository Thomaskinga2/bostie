"use client";
// Explore Boston: choose a start, say what you like and what you want to spend, and get
// destinations a train ride away. Works on its own; quests are optional extras below.
import { Bookmark, BookmarkCheck, Camera, Check, Footprints, Gamepad2, Navigation, TrainFront } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { StampArt } from "@/components/Stamp";
import { StationSelect } from "@/components/StationSelect";
import { Button, cx, Empty, LineDots, PageHeader, Photo } from "@/components/ui";
import { COST_LABEL, INTERESTS, type Cost, type Interest } from "@/data/discover";
import { recommend, type Pick } from "@/lib/discover";
import { formatFare } from "@/lib/fares";
import { derive, STAMP } from "@/lib/gamification";
import { nearestStation, STATION } from "@/lib/network";
import { DEMO_ROUTE, useStore, useWhere } from "@/lib/store";

const BUDGETS: { max: Cost; label: string }[] = [
  { max: 0, label: "Free only" },
  { max: 1, label: "Under $15" },
  { max: 2, label: "Any budget" },
];
const chip = "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-[14px] font-semibold transition";

function DestinationCard({ pick, saved, found, riding, onDirections, onSave, onOpen }: {
  pick: Pick; saved: boolean; found: boolean; riding: boolean; onDirections: () => void; onSave: () => void; onOpen: () => void;
}) {
  const station = STATION[pick.stationId];
  return (
    <li className="overflow-hidden rounded-3xl border border-line bg-card shadow-card">
      <button onClick={onOpen} className="relative block w-full text-left" aria-label={`${pick.place.name}: details`}>
        <Photo id={pick.place.id} credit={false} className="h-[150px]" />
        <span className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {pick.tags.map((t) => (
            <span key={t} className={cx("rounded-full px-2.5 py-1 text-[12px] font-bold leading-none", pick.matched.includes(t) ? "bg-gold text-forest-deep" : "bg-ink/70 text-paper")}>
              {INTERESTS.find((i) => i.id === t)!.label}
            </span>
          ))}
        </span>
        <span className="absolute right-3 top-3 rounded-full bg-card px-2.5 py-1 text-[12px] font-bold leading-none text-ink">{COST_LABEL[pick.cost]}</span>
        {found && (
          <span className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-forest px-2.5 py-1 text-[12px] font-bold leading-none text-paper">
            <Check size={12} strokeWidth={3.5} aria-hidden /> Stamp collected
          </span>
        )}
      </button>
      <div className="p-4">
        <h3 className="text-[21px] font-bold leading-tight">{pick.place.name}</h3>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-ink-soft">
          <span className="flex items-center gap-1.5 font-semibold text-ink">
            <LineDots lines={station.lines} /> {station.name}
          </span>
          {pick.rideMinutes > 0 && (
            <span className="flex items-center gap-1"><TrainFront size={14} aria-hidden /> {pick.rideMinutes} min{pick.transfers ? `, ${pick.transfers} change${pick.transfers > 1 ? "s" : ""}` : ""}</span>
          )}
          <span className="flex items-center gap-1"><Footprints size={14} aria-hidden /> {pick.walkMinutes} min</span>
          {pick.fareCents !== null && <span className="font-semibold text-ink">{formatFare(pick.fareCents)} fare</span>}
        </p>
        <p className="mt-2 text-[14.5px] leading-snug">{pick.why}</p>
        <div className="mt-3.5 flex gap-2">
          {riding ? (
            <Link href="/journey" className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full border border-line bg-card text-[15px] font-semibold">
              <TrainFront size={17} aria-hidden /> Journey in progress
            </Link>
          ) : (
            <Button className="flex-1" onClick={onDirections}>
              <Navigation size={17} aria-hidden /> Get directions
            </Button>
          )}
          <Button variant="secondary" className="w-12 !px-0" onClick={onSave} aria-pressed={saved} aria-label={saved ? `Remove ${pick.place.name} from saved places` : `Save ${pick.place.name}`}>
            {saved ? <BookmarkCheck size={19} aria-hidden /> : <Bookmark size={19} aria-hidden />}
          </Button>
        </div>
      </div>
    </li>
  );
}

export default function DiscoverPage() {
  const router = useRouter();
  const demo = useStore((s) => s.demo);
  const events = useStore((s) => s.events);
  const saved = useStore((s) => s.saved);
  const journey = useStore((s) => s.journey);
  const toggleSaved = useStore((s) => s.toggleSaved);
  const startJourney = useStore((s) => s.startJourney);
  const where = useWhere();

  const [from, setFrom] = useState(() => (where.at ? nearestStation(where.at).station.id : demo ? DEMO_ROUTE.from : DEMO_ROUTE.to));
  const [interests, setInterests] = useState<Interest[]>([]);
  const [budget, setBudget] = useState<Cost>(2);
  const [showAll, setShowAll] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const found = useMemo(() => derive(events).landmarks, [events]);
  const picks = useMemo(() => recommend(from, interests, budget), [from, interests, budget]);
  const shown = showAll ? picks : picks.slice(0, 4);
  const open = picks.find((p) => p.place.id === openId);
  const riding = !!journey && journey.stage !== "complete";

  const toggle = (id: Interest) => setInterests((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const directions = (pick: Pick) => {
    setNote("");
    if (pick.stationId === from) {
      setOpenId(pick.place.id);
      return setNote(`You are already at ${STATION[from].name}. It is a ${pick.walkMinutes} min walk from the station.`);
    }
    if (startJourney(from, pick.stationId)) router.push("/journey");
  };

  return (
    <div data-scene="discover" className="scroll-area h-full pb-8">
      <PageHeader title="Explore Boston" sub="Tell us what you like. We find places a train ride away." />

      <section data-tour="discover-prefs" className="px-5" aria-label="Your preferences">
        <div className="overflow-hidden rounded-3xl border border-line bg-card">
          <StationSelect label="From" value={from} onChange={setFrom} />
        </div>

        <h2 className="mt-5 text-[19px] font-bold">What are you into?</h2>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Interests">
          {INTERESTS.map((i) => {
            const on = interests.includes(i.id);
            return (
              <button key={i.id} onClick={() => toggle(i.id)} aria-pressed={on} className={cx(chip, on ? "border-forest bg-forest text-paper" : "border-line bg-card text-ink")}>
                {on && <Check size={14} strokeWidth={3} aria-hidden />} {i.label}
              </button>
            );
          })}
        </div>

        <h2 className="mt-5 text-[19px] font-bold">Budget</h2>
        <div className="mt-2 flex rounded-full bg-sand p-1" role="radiogroup" aria-label="Budget">
          {BUDGETS.map((b) => (
            <button key={b.max} role="radio" aria-checked={budget === b.max} onClick={() => setBudget(b.max)} className={cx("h-10 flex-1 rounded-full text-[14px] font-semibold", budget === b.max ? "bg-card text-ink shadow-card" : "text-ink-soft")}>
              {b.label}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-7 px-5" aria-labelledby="picks-h">
        <h2 id="picks-h" className="text-[23px] font-bold">
          {interests.length ? "Picked for you" : "Closest to you"}
        </h2>
        <p className="mt-0.5 text-[13px] text-ink-soft">
          Travel times are estimates from the route planner. Budget is a rough guide for one adult: check before you go.
        </p>
        {shown.length ? (
          <ul data-tour="discover-results" className="mt-3 space-y-4">
            {shown.map((p) => (
              <DestinationCard
                key={p.place.id}
                pick={p}
                saved={saved.includes(p.place.id)}
                found={found.has(p.place.id)}
                riding={riding}
                onDirections={() => directions(p)}
                onSave={() => toggleSaved(p.place.id)}
                onOpen={() => (setNote(""), setOpenId(p.place.id))}
              />
            ))}
          </ul>
        ) : (
          <div className="mt-3">
            <Empty title="Nothing in that budget from here" body="Try a wider budget, or pick a different starting station." />
          </div>
        )}
        {!showAll && picks.length > shown.length && (
          <Button variant="secondary" className="mt-4 w-full" onClick={() => setShowAll(true)}>
            Show all {picks.length} places
          </Button>
        )}
      </section>

      <section data-tour="discover-quests" className="mt-8 px-5" aria-labelledby="quests-h">
        <h2 id="quests-h" className="text-[23px] font-bold">Optional quests</h2>
        <p className="mt-0.5 text-[14px] text-ink-soft">Extra fun along the way. Nothing here is required to ride or explore.</p>
        <ul className="mt-2 divide-y divide-line">
          {[
            { href: "/scan", Icon: Camera, title: "Scan a landmark", body: "Photograph one and Gemini verifies it for a stamp." },
            { href: "/play", Icon: Gamepad2, title: "Guess Boston", body: "Name the place in the photo. Good for the platform." },
          ].map(({ href, Icon, title, body }) => (
            <li key={href}>
              <Link href={href} className="flex items-center gap-3.5 py-3.5">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-moss text-forest"><Icon size={22} aria-hidden /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16.5px] font-bold">{title}</span>
                  <span className="block text-[13.5px] leading-snug text-ink-soft">{body}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Sheet open={!!open} onClose={() => setOpenId(null)} title={open?.place.name} tall>
        {open && (
          <>
            <Photo id={open.place.id} className="h-[180px] rounded-2xl" alt={open.place.name} />
            <p className="mt-3 text-[13.5px] font-semibold text-ink-soft">
              {open.place.neighborhood}{open.place.year ? `, ${open.place.year}` : ""}. {COST_LABEL[open.cost]} (estimate).
            </p>
            <p className="mt-2 text-[15.5px] leading-relaxed">{open.place.summary}</p>
            <p className="mt-3 rounded-2xl bg-moss px-4 py-3 text-[14.5px] leading-snug text-forest-deep">{open.why}</p>
            {note && <p role="status" className="mt-3 rounded-2xl bg-gold-soft px-4 py-3 text-[14.5px] leading-snug text-[#5b410b]">{note}</p>}
            <div className="mt-3 flex items-center gap-4 rounded-2xl bg-paper p-3.5">
              <StampArt stamp={STAMP[`landmark:${open.place.id}`]} owned={found.has(open.place.id)} className="w-[64px] shrink-0" />
              <p className="text-[14px] leading-snug text-ink-soft">
                {found.has(open.place.id) ? "This stamp is already in your passport." : "Optional: scan it when you get there to unlock its stamp."}
              </p>
            </div>
            <div className="mt-4 flex flex-col gap-2.5">
              {!riding && open.stationId !== from && (
                <Button onClick={() => directions(open)}><Navigation size={17} aria-hidden /> Get directions</Button>
              )}
              <Button variant="secondary" onClick={() => toggleSaved(open.place.id)} aria-pressed={saved.includes(open.place.id)}>
                {saved.includes(open.place.id) ? <BookmarkCheck size={18} aria-hidden /> : <Bookmark size={18} aria-hidden />}
                {saved.includes(open.place.id) ? "Saved" : "Save for later"}
              </Button>
            </div>
          </>
        )}
      </Sheet>
    </div>
  );
}
