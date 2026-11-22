"use client";
// The three games in Bostie's Favourite, each with a picture and one line on how it is played.
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { GAMES } from "@/lib/game";
import { Photo } from "./ui";

export function GameCards({ className }: { className?: string }) {
  return (
    <ul className={className} aria-label="Games">
      {GAMES.map((g) => (
        <li key={g.id} className="border-b border-line last:border-b-0">
          <Link href={g.href} className="flex items-center gap-3.5 p-2.5 pr-3">
            <span className="relative block size-[68px] shrink-0 overflow-hidden rounded-2xl bg-sand">
              <Photo id={g.photo} credit={false} className="size-full" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16.5px] font-bold">{g.name}</span>
              <span className="block text-[13.5px] leading-snug text-ink-soft">{g.about}</span>
            </span>
            <ChevronRight size={19} className="shrink-0 text-ink-faint" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** The games, offered while waiting for a train or riding one. */
export function GameList({ className, riding = false }: { className?: string; riding?: boolean }) {
  return (
    <section aria-labelledby="games-h" className={className}>
      <h2 id="games-h" className="text-[20px] font-bold">{riding ? "Play while you ride" : "Play while you wait"}</h2>
      <p className="text-[14px] text-ink-soft">
        Bostie&apos;s Favourite: three quick games about Boston.{riding ? " Bostie tells you when your stop is next, on any screen." : ""}
      </p>
      <GameCards className="mt-2.5 overflow-hidden rounded-3xl border border-line bg-card" />
    </section>
  );
}
