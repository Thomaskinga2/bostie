"use client";
// Bostie's Favourite: the hub for the three optional games.
import { useMemo } from "react";
import { GameCards } from "@/components/GameList";
import { Bostie, SoundToggle } from "@/components/games/GameChrome";
import { GeminiChip } from "@/components/shell/Showcase";
import { PageHeader } from "@/components/ui";
import { DAILY_PAID_PLAYS } from "@/lib/game";
import { derive } from "@/lib/gamification";
import { useStore } from "@/lib/store";

export default function PlayHub() {
  const events = useStore((s) => s.events);
  const d = useMemo(() => derive(events), [events]);
  return (
    <div data-scene="play-lobby" className="scroll-area h-full pb-8">
      <PageHeader title="Bostie's Favourite" sub="Three quick games about Boston. All optional." right={<SoundToggle />} />
      <div className="px-5">
        <Bostie mood="welcome" say="Ready for a Boston adventure? Pick a game!" size={72} />

        <h2 className="mt-5 text-[22px] font-bold">Pick a game</h2>
        <div data-tour="game-modes">
          <GameCards className="mt-2 overflow-hidden rounded-3xl border border-line bg-card" />
        </div>

        <dl className="mt-4 grid grid-cols-2 divide-x divide-line rounded-2xl border border-line bg-card py-3.5 text-center">
          {[[d.stats.rounds, "games played"], [d.stats.correct, "games won"]].map(([n, label]) => (
            <div key={label}>
              <dd className="font-display text-[24px] font-bold leading-none text-forest">{n}</dd>
              <dt className="mt-1 text-[12px] text-ink-soft">{label}</dt>
            </div>
          ))}
        </dl>
        <p className="mt-2.5 text-center text-[13px] text-ink-soft">
          Each game earns XP for your first {DAILY_PAID_PLAYS} plays a day. After that it is just for fun.
        </p>
        <div className="mt-3 flex justify-center"><GeminiChip /></div>
      </div>
    </div>
  );
}
