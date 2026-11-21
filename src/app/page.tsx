"use client";
import { ArrowUpDown, ChevronRight, Flame, LocateFixed, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Arrivals } from "@/components/Arrivals";
import { Sheet } from "@/components/Sheet";
import { StampArt } from "@/components/Stamp";
import { StationSelect } from "@/components/StationSelect";
import { Button, cx, Empty, LinePill, Meter, NamedIcon, Photo, StationSign } from "@/components/ui";
import { useAlerts, useNow } from "@/lib/api";
import { CHALLENGES, challengeProgress, derive, levelFor, STAMP, streakFor, totalXp } from "@/lib/gamification";
import { formatDistance, walkMinutes } from "@/lib/geo";
import { nearestStation, routeLabel, STATION } from "@/lib/network";
import { PLACE } from "@/lib/places";
import { DEMO_ROUTE, useStore, useWhere } from "@/lib/store";

const STAGE_LABEL: Record<string, string> = {
  planning: "Route ready", walking: "Walking to the station", waiting: "Waiting for your train", boarding: "Boarding",
  traveling: "On the train", transferring: "Changing lines", arriving: "Arriving", exploring: "Exploring nearby", complete: "Journey complete",
};

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function Home() {
  const router = useRouter();
  const name = useStore((s) => s.name);
  const events = useStore((s) => s.events);
  const xp = useStore((s) => s.xp);
  const challenges = useStore((s) => s.challenges);
  const saved = useStore((s) => s.saved);
  const journey = useStore((s) => s.journey);
  const demo = useStore((s) => s.demo);
  const geoStatus = useStore((s) => s.geoStatus);
  const requestLocation = useStore((s) => s.requestLocation);
  const startJourney = useStore((s) => s.startJourney);
  const where = useWhere();

  const d = useMemo(() => derive(events), [events]);
  const total = totalXp(xp);
  const level = levelFor(total);
  const now = useNow(60_000);
  const streak = useMemo(() => streakFor(events, now), [events, now]);
  const near = where.at ? nearestStation(where.at) : null;

  const [from, setFrom] = useState(DEMO_ROUTE.from);
  const [to, setTo] = useState(DEMO_ROUTE.to);
  const [planError, setPlanError] = useState("");
  const [alertsOpen, setAlertsOpen] = useState(false);
  const alerts = useAlerts();

  const plan = () => {
    if (from === to) return setPlanError("Pick two different stations.");
    if (!startJourney(from, to)) return setPlanError("No rail route found between those stations.");
    router.push("/journey");
  };

  const active = CHALLENGES.filter((c) => challenges[c.id] && !challenges[c.id].completedAt);
  const recent = Object.entries(d.stamps).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const stationId = near?.station.id ?? from;
  const inProgress = journey && journey.stage !== "complete";

  return (
    <div className="scroll-area h-full pb-8">
      <header className="px-5 pt-4">
        <p className="text-[15px] text-ink-soft">{greeting()},</p>
        <h1 className="text-[34px] font-bold leading-[1.05]">{name}</h1>

        <Link href="/passport" className="mt-4 flex items-center gap-4 rounded-3xl bg-forest px-4 py-3.5 text-paper shadow-lift">
          <span className="grid size-[54px] shrink-0 place-items-center rounded-full border-[3px] border-gold bg-paper font-display text-[26px] font-bold leading-none text-forest">
            {level.level}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[16px] font-bold">{level.title}</span>
              <span className="shrink-0 text-[14px] font-semibold tabular-nums text-gold-soft">{total} XP</span>
            </span>
            <Meter value={level.progress} color="var(--color-gold)" className="mt-2 bg-white/15" />
            <span className="mt-1.5 block text-[12.5px] text-paper/70">
              {level.next === null ? "Top level reached" : `${level.toNext} XP to level ${level.level + 1}`}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-center" aria-label={`${streak.current} day streak`}>
            <Flame size={22} className={streak.current ? "text-gold" : "text-paper/40"} fill={streak.current ? "currentColor" : "none"} aria-hidden />
            <span className="text-[13px] font-bold tabular-nums">{streak.current}d</span>
          </span>
        </Link>
      </header>

      {/* Journey planner */}
      <section className="mt-6 px-5" aria-labelledby="plan-h">
        <h2 id="plan-h" className="text-[23px] font-bold">{inProgress ? "Your journey" : "Where to?"}</h2>
        {inProgress ? (
          <Link href="/journey" className="mt-3 block">
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
          <div className="mt-3 overflow-hidden rounded-3xl border border-line bg-card shadow-card">
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

      {/* Nearby station + arrivals */}
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

      {/* Guess Boston */}
      <section className="mt-7 px-5" aria-labelledby="guess-h">
        <Link href="/play" className="relative block overflow-hidden rounded-3xl bg-ink text-paper">
          <Photo id="nbh-beacon-hill" credit={false} className="h-[150px] opacity-60" />
          <div className="absolute inset-x-0 top-0 p-4">
            <h2 id="guess-h" className="text-[26px] font-bold leading-tight">Guess Boston</h2>
            <p className="mt-0.5 max-w-[24ch] text-[14px] text-paper/85">Name the place in the photo. Gemini understands however you say it.</p>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[13.5px] text-paper/75">
              {d.stats.rounds ? `Best ${d.stats.bestScore} pts, ${Math.round(d.stats.accuracy * 100)}% correct` : "A round takes about a minute"}
            </span>
            <span className="inline-flex h-9 items-center rounded-full bg-gold px-4 text-[14px] font-bold text-forest-deep">Play a round</span>
          </div>
        </Link>
      </section>

      {/* Challenges */}
      <section className="mt-7 px-5" aria-labelledby="chal-h">
        <div className="flex items-end justify-between">
          <h2 id="chal-h" className="text-[23px] font-bold">Active challenges</h2>
          <Link href="/play#challenges" className="flex h-9 items-center text-[14px] font-semibold text-forest">All challenges</Link>
        </div>
        {active.length ? (
          <ul className="mt-2 divide-y divide-line">
            {active.slice(0, 3).map((c) => {
              const have = challengeProgress(c, challenges[c.id], events);
              return (
                <li key={c.id} className="flex items-center gap-3.5 py-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-moss text-forest"><NamedIcon name={c.icon} size={21} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[15.5px] font-bold">{c.title}</span>
                      <span className="shrink-0 text-[13px] font-semibold text-gold">+{c.xp} XP</span>
                    </span>
                    <Meter value={have / c.goal} className="mt-1.5" />
                    <span className="mt-1 block text-[12.5px] text-ink-soft">{have} of {c.goal}. {c.description}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty
            title="No challenge on the go"
            body="Pick one up for bonus XP on things you were going to do anyway."
            action={<Link href="/play#challenges" className="inline-flex h-10 items-center rounded-full bg-forest px-5 text-[14px] font-bold text-paper">Browse challenges</Link>}
          />
        )}
      </section>

      {/* Recent discoveries */}
      <section className="mt-7" aria-labelledby="recent-h">
        <div className="flex items-end justify-between px-5">
          <h2 id="recent-h" className="text-[23px] font-bold">Recent discoveries</h2>
          <Link href="/passport" className="flex h-9 items-center text-[14px] font-semibold text-forest">Passport</Link>
        </div>
        {recent.length ? (
          <ul className="scroll-area mt-3 flex gap-4 overflow-x-auto px-5 pb-2" style={{ overflowY: "hidden" }}>
            {recent.map(([id]) => (
              <li key={id} className="w-[104px] shrink-0">
                <Link href="/passport" aria-label={STAMP[id].name}>
                  <StampArt stamp={STAMP[id]} owned />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-2 px-5">
            <Empty title="Your first stamp is one stop away" body="Ride a guided journey and every station you pass is stamped into your passport." />
          </div>
        )}
      </section>

      {/* Saved places */}
      {saved.length > 0 && (
        <section className="mt-6 px-5" aria-labelledby="saved-h">
          <h2 id="saved-h" className="text-[23px] font-bold">Saved places</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {saved.map((id) => (
              <li key={id}>
                <Link href="/explore" className={cx("inline-flex h-10 items-center gap-2 rounded-full border border-line bg-card px-4 text-[14px] font-semibold")}>
                  {STATION[id] ? <LinePill route={STATION[id].routes[0]} className="!h-5 !px-2 !text-[11px]" /> : null}
                  {STATION[id]?.name ?? PLACE[id]?.name ?? id}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

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
