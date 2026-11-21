"use client";
// The games in Guess Boston, each with a picture of the kind of thing you will be shown.
import { ChevronRight, MapPin } from "lucide-react";
import Link from "next/link";
import { MODES } from "@/lib/game";
import { useStore } from "@/lib/store";
import { Photo } from "./ui";

export function GameList({ className }: { className?: string }) {
  const setPlayMode = useStore((s) => s.setPlayMode);
  return (
    <section data-tour="play-while-waiting" aria-labelledby="games-h" className={className}>
      <h2 id="games-h" className="text-[20px] font-bold">Play while you wait</h2>
      <p className="text-[14px] text-ink-soft">Guess Boston: you see a photo, you say where it is. One round takes about a minute.</p>
      <ul className="mt-2.5 divide-y divide-line overflow-hidden rounded-3xl border border-line bg-card">
        {MODES.map((m) => (
          <li key={m.id}>
            <Link href="/play" onClick={() => setPlayMode(m.id)} className="flex items-center gap-3.5 p-2.5 pr-3">
              <span className="relative block size-[68px] shrink-0 overflow-hidden rounded-2xl bg-sand">
                <Photo id={m.photo} credit={false} className="size-full" />
                {m.id === "map" && (
                  <span className="absolute inset-0 grid place-items-center bg-ink/35">
                    <MapPin size={30} className="text-paper drop-shadow" fill="#c0392b" aria-hidden />
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16.5px] font-bold">{m.name}</span>
                <span className="block text-[13.5px] leading-snug text-ink-soft">{m.about}</span>
              </span>
              <ChevronRight size={19} className="shrink-0 text-ink-faint" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
