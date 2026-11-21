"use client";
import { Flame, Pencil } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/shell/Welcome";
import { cx } from "@/components/ui";
import { levelFor, streakFor, totalXp, type Derived } from "@/lib/gamification";
import { useStore } from "@/lib/store";

const weekday = (dayNumber: number) =>
  new Date(dayNumber * 86_400_000).toLocaleDateString([], { weekday: "narrow", timeZone: "UTC" });

export function Cover({ now }: { now: number }) {
  const name = useStore((s) => s.name);
  const setName = useStore((s) => s.setName);
  const xp = useStore((s) => s.xp);
  const events = useStore((s) => s.events);
  const [editing, setEditing] = useState(false);

  const total = totalXp(xp);
  const lv = levelFor(total);
  const streak = streakFor(events, now);
  const week = Array.from({ length: 7 }, (_, i) => streak.today - 6 + i);

  return (
    <section data-tour="passport-cover" className="relative rounded-b-[34px] bg-forest px-5 pb-6 pt-5 text-paper">
      {/* stitched inner border, like a passport cover */}
      <div aria-hidden className="pointer-events-none absolute inset-x-2 bottom-2 top-2 rounded-[26px] border border-dashed border-paper/20" />

      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Logo size={34} />
          <h1 className="text-[22px] font-bold leading-none text-gold-soft">Passport</h1>
        </div>
        <div className="grid size-[58px] place-items-center rounded-full border-[3px] border-gold bg-forest-deep" aria-label={`Level ${lv.level}`}>
          <span className="font-display text-[28px] font-bold leading-none">{lv.level}</span>
        </div>
      </div>

      <div className="relative mt-5">
        {editing ? (
          <input
            autoFocus
            defaultValue={name}
            maxLength={24}
            aria-label="Your name"
            onBlur={(e) => {
              setName(e.currentTarget.value);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") e.currentTarget.value = name;
              if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
            }}
            className="h-11 w-full rounded-xl border border-paper/40 bg-forest-deep px-3 font-display text-[26px] font-bold text-paper"
          />
        ) : (
          <button onClick={() => setEditing(true)} className="flex min-h-11 max-w-full items-center gap-2 text-left" aria-label={`Name: ${name}. Edit`}>
            <span className="truncate font-display text-[32px] font-bold leading-tight">{name}</span>
            <Pencil size={15} className="shrink-0 text-paper/55" aria-hidden />
          </button>
        )}
        <p className="text-[15px] text-paper/75">
          {lv.title}, level {lv.level}
        </p>
      </div>

      <div className="relative mt-4">
        <div className="flex items-baseline justify-between text-[14px]">
          <span>
            <span className="font-display text-[24px] font-bold">{total.toLocaleString()}</span> XP
          </span>
          <span className="text-paper/70">{lv.next === null ? "Top level reached" : `${lv.toNext} XP to level ${lv.level + 1}`}</span>
        </div>
        <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-forest-deep" role="progressbar" aria-valuenow={Math.round(lv.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to next level">
          <div className="h-full rounded-full bg-gold transition-[width] duration-700" style={{ width: `${lv.progress * 100}%` }} />
        </div>
      </div>

      <div className="relative mt-5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[16px] font-bold">
            <Flame size={18} className={streak.current ? "text-gold" : "text-paper/40"} aria-hidden />
            {streak.current ? `${streak.current}-day streak` : "No streak yet"}
          </p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-paper/65">
            Best {streak.best} {streak.best === 1 ? "day" : "days"}. One rest day never breaks your streak.
          </p>
        </div>
        <ol className="flex shrink-0 gap-1.5" aria-label="Last seven days">
          {week.map((day) => {
            const active = streak.activeDays.has(day);
            return (
              <li key={day} className="flex flex-col items-center gap-1 text-[10.5px] text-paper/60">
                <span
                  className={cx("size-[15px] rounded-full", active ? "bg-gold" : "bg-forest-deep", day === streak.today && "ring-2 ring-paper/70 ring-offset-2 ring-offset-forest")}
                  aria-label={`${weekday(day)}: ${active ? "active" : "no activity"}`}
                />
                <span aria-hidden>{weekday(day)}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

/** Headline numbers set as type on the page, not as cards. */
export function Stats({ d }: { d: Derived }) {
  const items: [string, string][] = [
    [String(d.stats.stations), "stations"],
    [String(d.stats.landmarks), "landmarks"],
    [String(d.stats.journeys), d.stats.journeys === 1 ? "journey" : "journeys"],
    [d.stats.rounds ? `${Math.round(d.stats.accuracy * 100)}%` : "–", "accuracy"],
  ];
  return (
    <dl className="mx-5 mt-5 grid grid-cols-4 divide-x divide-line border-b border-line pb-5">
      {items.map(([value, label]) => (
        <div key={label} className="flex flex-col-reverse px-2 text-center first:pl-0 last:pr-0">
          <dt className="mt-1 text-[12px] leading-tight text-ink-soft">{label}</dt>
          <dd className="font-display text-[28px] font-bold leading-none">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
