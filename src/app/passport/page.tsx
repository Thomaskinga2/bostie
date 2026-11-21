"use client";
import { useMemo, useState } from "react";
import { Cover, Stats } from "@/components/passport/Cover";
import { Badges, Journal, Lines, Saved, Settings } from "@/components/passport/Sections";
import { Stamps } from "@/components/passport/Stamps";
import { derive, streakFor } from "@/lib/gamification";
import { useStore } from "@/lib/store";

/** The travel journal. Everything shown is derived from the event log and XP ledger. */
export default function PassportPage() {
  const events = useStore((s) => s.events);
  const [now] = useState(() => Date.now());
  const d = useMemo(() => derive(events), [events]);
  const streak = useMemo(() => streakFor(events, now).current, [events, now]);

  return (
    <div data-scene="passport" className="scroll-area h-full">
      <Cover now={now} />
      <Stats d={d} />
      <Stamps d={d} />
      <Lines d={d} />
      <Badges d={d} streak={streak} />
      <Journal d={d} />
      <Saved />
      <Settings />
    </div>
  );
}
