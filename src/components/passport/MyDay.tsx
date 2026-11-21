"use client";
// My day: what the rider did today, a heat map of everywhere they have been, and a
// picture of the day to share. Everything is read from this device.
import { Share2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { MapLine } from "@/components/map/CityMap";
import { ShareSheet } from "@/components/ShareSheet";
import { Button, clockTime, cx } from "@/components/ui";
import { dayKey } from "@/lib/gamification";
import { dayRecap, heatPoints, trailSegments } from "@/lib/recap";
import { dayCard } from "@/lib/share";
import { useStore } from "@/lib/store";
import { SectionTitle } from "./bits";

const CityMap = dynamic(() => import("@/components/map/CityMap").then((m) => m.CityMap), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-sand" />,
});
const NONE: never[] = [];

export function MyDay({ now }: { now: number }) {
  const events = useStore((s) => s.events);
  const xp = useStore((s) => s.xp);
  const trail = useStore((s) => s.trail);
  const name = useStore((s) => s.name);
  const [span, setSpan] = useState<"all" | "today">("all");
  const [sharing, setSharing] = useState(false);

  const today = dayKey(now);
  const recap = useMemo(() => dayRecap(events, xp, trail, today), [events, xp, trail, today]);
  const range = span === "all" ? "all" : today;
  const heat = useMemo(() => heatPoints(events, trail, range), [events, trail, range]);
  const lines = useMemo<MapLine[]>(
    () => trailSegments(trail, range).map((path, i) => ({ id: `trail-${i}`, color: "#b45309", path, emphasis: true })),
    [trail, range],
  );
  const fit = useMemo(() => (heat.length ? heat.map((p) => ({ lat: p.lat, lng: p.lng })) : undefined), [heat]);
  const places = [...recap.landmarks, ...recap.stations].sort((a, b) => a.at - b.at);
  const km = recap.rideKm + recap.trailKm;

  return (
    <section data-tour="my-day" className="px-5 pt-8" aria-labelledby="myday-title">
      <SectionTitle title="My day" />
      <h2 id="myday-title" className="sr-only">My day</h2>
      {recap.active ? (
        <>
          <dl className="mt-3 grid grid-cols-4 divide-x divide-line rounded-2xl border border-line bg-card py-3.5 text-center">
            {[[recap.stations.length, "stations"], [recap.landmarks.length, "landmarks"], [km >= 10 ? km.toFixed(0) : km.toFixed(1), "km"], [recap.xp, "XP"]].map(([n, label]) => (
              <div key={label}>
                <dd className="font-display text-[24px] font-bold leading-none text-forest">{n}</dd>
                <dt className="mt-1 text-[12px] text-ink-soft">{label}</dt>
              </div>
            ))}
          </dl>
          {places.length > 0 && (
            <ol className="mt-3 divide-y divide-line" aria-label="Places today">
              {places.slice(-6).map((p) => (
                <li key={p.id} className="flex items-baseline justify-between gap-3 py-2 text-[15px]">
                  <span className="min-w-0 truncate font-semibold">{p.name}</span>
                  <time className="shrink-0 text-[13px] tabular-nums text-ink-faint">{clockTime(p.at)}</time>
                </li>
              ))}
            </ol>
          )}
        </>
      ) : (
        <p className="mt-2 text-[15px] text-ink-soft">Nothing yet today. Ride, scan a landmark or play a round and it shows up here.</p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <h3 className="text-[19px] font-bold">Where you have been</h3>
        <div role="radiogroup" aria-label="Heat map range" className="flex shrink-0 rounded-full bg-sand p-1">
          {(["all", "today"] as const).map((id) => (
            <button key={id} role="radio" aria-checked={span === id} onClick={() => setSpan(id)} className={cx("h-8 whitespace-nowrap rounded-full px-3 text-[13px] font-semibold", span === id ? "bg-card text-ink shadow-card" : "text-ink-soft")}>
              {id === "all" ? "All time" : "Today"}
            </button>
          ))}
        </div>
      </div>
      <div className="relative mt-2.5 h-[260px] overflow-hidden rounded-3xl border border-line" data-testid="heat-map" data-points={heat.length}>
        <CityMap className="size-full" markers={NONE} lines={lines} heat={heat} fit={fit} zoom={12.6} />
        {!heat.length && (
          <p className="pointer-events-none absolute inset-x-6 top-1/2 -translate-y-1/2 rounded-2xl bg-card/95 px-4 py-3 text-center text-[14px] text-ink-soft shadow-card">
            {span === "today" ? "No places yet today." : "Your heat map fills in as you collect stations and landmarks."}
          </p>
        )}
      </div>
      <p className="mt-2 text-[12.5px] leading-snug text-ink-faint">
        Brighter means you go there more. In Automatic mode your route is drawn too. This map is saved on your device only.
      </p>

      <Button variant="secondary" className="mt-3 w-full" onClick={() => setSharing(true)} disabled={!recap.active}>
        <Share2 size={17} aria-hidden /> Share my day
      </Button>

      <ShareSheet
        open={sharing}
        onClose={() => setSharing(false)}
        title="Share my day"
        filename={`bostie-${today}.png`}
        caption={`My day on the T with Bostie: ${recap.stations.length} stations, ${recap.landmarks.length} landmarks.`}
        warning={trailSegments(trail, today).length ? "This picture shows the exact route you travelled today, including where you started and ended." : undefined}
        make={() => dayCard({ recap, segments: trailSegments(trail, today), rider: name, at: now })}
      />
    </section>
  );
}
