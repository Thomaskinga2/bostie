"use client";
import { TrainFront, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { GeminiChip } from "@/components/shell/Showcase";
import { Button, cx, Empty, LineDots, NamedIcon, Photo, shortDate } from "@/components/ui";
import { ACHIEVEMENTS, type Derived } from "@/lib/gamification";
import { lineOf, LINES, MAIN_LINES, PATTERNS, STATION, type LineId } from "@/lib/network";
import { PLACE } from "@/lib/places";
import { useStore } from "@/lib/store";
import { linkButton, SectionTitle } from "./bits";

// --- lines -----------------------------------------------------------------

/** Stations of a line in riding order (trunk first, then each branch), from the route patterns. */
const STRIP = Object.fromEntries(
  MAIN_LINES.map((line) => [line, [...new Set(PATTERNS.filter((p) => lineOf(p.route) === line).flatMap((p) => p.stops))]]),
) as Record<LineId, string[]>;

export function Lines({ d }: { d: Derived }) {
  return (
    <section className="px-5 pt-9" aria-labelledby="lines-title">
      <div id="lines-title">
        <SectionTitle title="Lines" sub="Each tick is a station. Fill a whole line to finish it." />
      </div>
      <ul className="mt-4 space-y-5">
        {MAIN_LINES.map((line) => {
          const { have, total } = d.lines[line];
          return (
            <li key={line}>
              <div className="flex items-baseline justify-between">
                <h3 className="text-[19px] font-bold">{LINES[line].name}</h3>
                <span className="text-[14px] text-ink-soft">
                  <span className="font-semibold text-ink">{have}</span> of {total}
                  {have === total && ", complete"}
                </span>
              </div>
              <div
                className="mt-2 flex h-4 gap-px overflow-hidden rounded-full"
                role="progressbar"
                aria-label={`${LINES[line].name} stations collected`}
                aria-valuenow={have}
                aria-valuemin={0}
                aria-valuemax={total}
              >
                {STRIP[line].map((id) => (
                  <span
                    key={id}
                    title={STATION[id]?.name}
                    className="min-w-0 flex-1"
                    style={{ background: d.stations.has(id) ? LINES[line].color : "var(--color-sand)" }}
                  />
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// --- badges ----------------------------------------------------------------

export function Badges({ d, streak }: { d: Derived; streak: number }) {
  const earned = useStore((s) => s.achievements);
  const [open, setOpen] = useState<string | null>(null);
  const selected = ACHIEVEMENTS.find((a) => a.id === open);
  const count = ACHIEVEMENTS.filter((a) => earned[a.id]).length;

  return (
    <section className="px-5 pt-9" aria-labelledby="badges-title">
      <div id="badges-title">
        <SectionTitle title="Badges" sub={`${count} of ${ACHIEVEMENTS.length} earned.`} />
      </div>
      <ul className="mt-4 grid grid-cols-3 gap-x-3 gap-y-5">
        {ACHIEVEMENTS.map((a) => {
          const got = !!earned[a.id];
          const [have, goal] = a.check(d, streak);
          return (
            <li key={a.id}>
              <button onClick={() => setOpen(a.id)} className="flex w-full flex-col items-center gap-2 rounded-2xl py-1 text-center active:scale-95">
                <span
                  className={cx(
                    "grid size-[68px] place-items-center rounded-full",
                    got ? "bg-gold text-forest-deep shadow-card ring-2 ring-gold ring-offset-2 ring-offset-paper" : "border border-dashed border-line bg-sand text-ink-faint",
                  )}
                >
                  <NamedIcon name={a.icon} size={30} strokeWidth={1.7} />
                </span>
                <span className={cx("text-[13px] font-semibold leading-tight", got ? "text-ink" : "text-ink-soft")}>{a.name}</span>
                {!got && (
                  <span className="-mt-1 text-[12px] text-ink-faint">
                    {Math.min(have, goal)} of {goal}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <Sheet open={!!selected} onClose={() => setOpen(null)} title={selected?.name}>
        {selected && (
          <div className="pb-2 text-center">
            <span
              className={cx(
                "mx-auto mt-2 grid size-24 place-items-center rounded-full",
                earned[selected.id] ? "bg-gold text-forest-deep" : "border border-dashed border-line bg-sand text-ink-faint",
              )}
            >
              <NamedIcon name={selected.icon} size={44} strokeWidth={1.6} />
            </span>
            <p className="mx-auto mt-4 max-w-[28ch] text-[16px] text-ink">{selected.description}</p>
            <p className="mt-2 text-[15px] font-bold text-gold">+{selected.xp} XP</p>
            <p className="mt-1 text-[14px] text-ink-soft">
              {earned[selected.id]
                ? `Earned ${shortDate(earned[selected.id])}`
                : `Progress: ${Math.min(...selected.check(d, streak))} of ${selected.check(d, streak)[1]}`}
            </p>
          </div>
        )}
      </Sheet>
    </section>
  );
}

// --- journal ---------------------------------------------------------------

const VERIFIED = { nearby: "Verified by photo and location", simulated: "Verified by photo, demo position", "photo-only": "Verified by photo only" };

export function Journal({ d }: { d: Derived }) {
  const entries = [...d.journeys, ...d.landmarks.values()].sort((a, b) => b.at - a.at);
  return (
    <section className="px-5 pt-9" aria-labelledby="journal-title">
      <div id="journal-title">
        <SectionTitle title="Journal" sub="Every ride and every discovery, newest first." />
      </div>
      {entries.length === 0 ? (
        <div className="mt-4">
          <Empty
            title="The first page is blank"
            body="Take a guided journey or scan a landmark and it is written here."
            action={
              <Link href="/" className={linkButton}>
                Plan a journey
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {entries.map((e) =>
            e.t === "journey" ? (
              <li key={`j-${e.id}`} className="flex items-center gap-3 py-3.5">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-paper">
                  <TrainFront size={20} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-semibold">
                    {STATION[e.from]?.name ?? e.from} to {STATION[e.to]?.name ?? e.to}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-ink-soft">
                    <LineDots lines={e.lines} size={9} />
                    <span>
                      {e.stops} {e.stops === 1 ? "stop" : "stops"}, about {e.minutes} min
                    </span>
                    {e.demo && <span className="rounded-full bg-gold-soft px-2 py-0.5 text-[11.5px] font-semibold text-[#6a4b0c]">Demo</span>}
                  </p>
                </div>
                <time className="shrink-0 text-[13px] text-ink-faint">{shortDate(e.at)}</time>
              </li>
            ) : (
              <li key={`l-${e.id}`} className="flex items-center gap-3 py-3.5">
                <Photo id={e.id} credit={false} className="size-11 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-semibold">{PLACE[e.id]?.name ?? e.id}</p>
                  <p className="mt-0.5 text-[13px] text-ink-soft">{VERIFIED[e.verification]}</p>
                </div>
                <time className="shrink-0 text-[13px] text-ink-faint">{shortDate(e.at)}</time>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}

export function Saved() {
  const saved = useStore((s) => s.saved);
  const toggleSaved = useStore((s) => s.toggleSaved);
  return (
    <section className="px-5 pt-9" aria-labelledby="saved-title">
      <div id="saved-title" className="flex items-end justify-between gap-3">
        <SectionTitle title="Saved places" />
        {saved.length > 0 && (
          <Link href="/explore" className="pb-1 text-[14.5px] font-semibold text-forest underline underline-offset-2">
            See on map
          </Link>
        )}
      </div>
      {saved.length === 0 ? (
        <div className="mt-4">
          <Empty
            title="Nothing saved yet"
            body="Save a station or landmark from the map to keep it for a later trip."
            action={
              <Link href="/explore" className={linkButton}>
                Open the map
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {saved.map((id) => {
            const station = STATION[id];
            const name = station?.name ?? PLACE[id]?.name ?? id;
            return (
              <li key={id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-semibold">{name}</p>
                  <p className="flex items-center gap-2 text-[13px] text-ink-soft">
                    {station ? <LineDots lines={station.lines} size={9} /> : null}
                    {station ? "Station" : `Landmark, ${PLACE[id]?.neighborhood ?? "Boston"}`}
                  </p>
                </div>
                <button onClick={() => toggleSaved(id)} aria-label={`Remove ${name} from saved places`} className="grid size-10 shrink-0 place-items-center rounded-full bg-sand text-ink-soft">
                  <X size={17} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// --- settings --------------------------------------------------------------

export function Settings() {
  const demo = useStore((s) => s.demo);
  const setDemo = useStore((s) => s.setDemo);
  const resetAll = useStore((s) => s.resetAll);
  const xp = useStore((s) => s.xp);
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="mt-10 border-t border-line bg-sand/50 px-5 pb-10 pt-6" aria-labelledby="settings-title">
      <h2 id="settings-title" className="text-[20px] font-bold">
        Settings
      </h2>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p id="demo-label" className="text-[16px] font-semibold">
            Demo mode
          </p>
          <p className="mt-0.5 text-[13.5px] leading-snug text-ink-soft">
            Simulates train arrivals and your position so the journey works anywhere. Simulated data is always labelled.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={demo}
          aria-labelledby="demo-label"
          onClick={() => setDemo(!demo)}
          className={cx("relative mt-1 h-8 w-[52px] shrink-0 rounded-full transition-colors", demo ? "bg-forest" : "bg-line")}
        >
          <span className={cx("absolute left-1 top-1 size-6 rounded-full bg-card shadow-card transition-transform", demo && "translate-x-5")} />
        </button>
      </div>

      <details className="mt-5 border-y border-line py-3">
        <summary className="flex min-h-10 cursor-pointer items-center justify-between text-[16px] font-semibold">
          XP ledger
          <span className="text-[13px] font-normal text-ink-soft">{xp.length} {xp.length === 1 ? "entry" : "entries"}</span>
        </summary>
        {xp.length === 0 ? (
          <p className="pb-1 pt-2 text-[14px] text-ink-soft">Every reward is recorded here once, and only once.</p>
        ) : (
          <ol className="pt-2">
            {xp
              .slice(-15)
              .reverse()
              .map((t) => (
                <li key={t.key} className="flex items-baseline gap-3 py-1.5 text-[14px]">
                  <span className="min-w-0 flex-1 truncate">{t.label}</span>
                  <span className="shrink-0 text-ink-faint">{shortDate(t.at)}</span>
                  <span className="w-12 shrink-0 text-right font-bold text-forest">+{t.amount}</span>
                </li>
              ))}
          </ol>
        )}
      </details>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <GeminiChip className="h-10" />
        {confirming ? (
          <div className="flex items-center gap-2" role="group" aria-label="Confirm reset">
            {/* plain button: ui.Button's variant background would fight the destructive red */}
            <button
              className="inline-flex h-10 items-center rounded-full bg-t-red px-4 text-[14px] font-semibold text-white active:scale-[0.97]"
              onClick={() => {
                resetAll();
                setConfirming(false);
              }}
            >
              Erase everything
            </button>
            <Button size="sm" variant="secondary" className="h-10" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="secondary" className="h-10" onClick={() => setConfirming(true)}>
            Reset all progress
          </Button>
        )}
      </div>
      {confirming && <p className="mt-2 text-[13px] text-ink-soft">This clears stamps, XP, badges, journeys and saved places on this device.</p>}
    </section>
  );
}
