"use client";
// Trips: plan a day (or three) around Boston by T. Start from a video, let Bostie plan it,
// or build it by hand. Saved trips live on this device.
import { ChevronRight, Clapperboard, PencilLine, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GenerateTrip, ImportTrip } from "@/components/trips/NewTrip";
import { PlacePhoto } from "@/components/trips/PlacePhoto";
import { PageHeader } from "@/components/ui";
import { useTrips } from "@/lib/trips";

const ORIGIN = { ai: "Planned by Bostie", import: "From a video", manual: "Built by you" };

export default function TripsPage() {
  const router = useRouter();
  const trips = useTrips((s) => s.trips);
  const open = useTrips((s) => s.open);
  const create = useTrips((s) => s.create);
  const [view, setView] = useState<"home" | "import" | "ai">("home");
  const toPlan = () => router.push("/trips/plan");

  const ways = [
    { id: "import" as const, Icon: Clapperboard, title: "From a video or screenshot", body: "Saw it on TikTok, Reels or YouTube? Bostie finds the places in it.", tint: "bg-ink text-paper", sub: "text-paper/70", icon: "text-gold" },
    { id: "ai" as const, Icon: Sparkles, title: "Plan it for me", body: "Pick what you like, your budget and your time. Gemini drafts the days.", tint: "bg-forest text-paper", sub: "text-paper/75", icon: "text-gold" },
    { id: "manual" as const, Icon: PencilLine, title: "Build it myself", body: "Search for places and put them in your own order.", tint: "bg-card text-ink border border-line", sub: "text-ink-soft", icon: "text-forest" },
  ];

  return (
    <div data-scene="trips" className="scroll-area h-full pb-8">
      <AnimatePresence mode="wait" initial={false}>
        {view === "home" ? (
          <motion.div key="home" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
            <PageHeader title="Trips" sub="Plan a day in Boston and get there on the T." />
            <div className="px-5">
              <ul data-tour="trips-new" className="space-y-2.5" aria-label="Ways to start a trip">
                {ways.map(({ id, Icon, title, body, tint, sub, icon }, i) => (
                  <motion.li key={id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + i * 0.07 }}>
                    <button
                      onClick={() => {
                        if (id !== "manual") return setView(id);
                        create({ name: "My Boston trip", origin: "manual", startStationId: "place-pktrm", days: [[]] });
                        toPlan();
                      }}
                      className={`flex w-full items-center gap-3.5 rounded-3xl px-4 py-4 text-left shadow-card ${tint}`}
                    >
                      <Icon size={28} className={`shrink-0 ${icon}`} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[17.5px] font-bold">{title}</span>
                        <span className={`block text-[13.5px] leading-snug ${sub}`}>{body}</span>
                      </span>
                      <ChevronRight size={20} className="shrink-0 opacity-60" aria-hidden />
                    </button>
                  </motion.li>
                ))}
              </ul>

              <section data-tour="trips-saved" className="mt-7" aria-labelledby="saved-trips">
                <h2 id="saved-trips" className="text-[22px] font-bold">Saved trips</h2>
                {trips.length ? (
                  <ul className="mt-2 space-y-2.5">
                    {trips.map((t) => {
                      const stops = t.days.flat();
                      return (
                        <li key={t.id}>
                          <button onClick={() => (open(t.id), toPlan())} aria-label={`Open ${t.name}`} className="flex w-full items-stretch overflow-hidden rounded-3xl border border-line bg-card text-left shadow-card">
                            <span className="grid w-[104px] shrink-0 grid-cols-2 gap-px bg-line">
                              {stops.length ? stops.slice(0, 4).map((s, i) => <PlacePhoto key={s.key} place={s} className={stops.length === 1 ? "col-span-2 row-span-2 h-full min-h-[88px]" : stops.length < 4 && i === 0 ? "col-span-2 h-[44px]" : "h-[44px]"} />) : <span className="col-span-2 min-h-[88px] bg-sand" />}
                            </span>
                            <span className="min-w-0 flex-1 px-3.5 py-3">
                              <span className="block truncate text-[16.5px] font-bold">{t.name}</span>
                              <span className="block text-[13.5px] text-ink-soft">{t.days.length} day{t.days.length === 1 ? "" : "s"}, {stops.length} stop{stops.length === 1 ? "" : "s"}</span>
                              <span className="mt-1.5 inline-block rounded-full bg-moss px-2.5 py-1 text-[11.5px] font-bold leading-none text-forest-deep">{ORIGIN[t.origin]}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-2 rounded-2xl bg-sand px-4 py-4 text-[14.5px] leading-snug text-ink-soft">No trips yet. Start one above and it is saved here, on this device.</p>
                )}
              </section>
            </div>
          </motion.div>
        ) : (
          <motion.div key={view} className="px-5 pt-4" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.2 }}>
            {view === "import" ? <ImportTrip onDone={toPlan} onCancel={() => setView("home")} /> : <GenerateTrip onDone={toPlan} onCancel={() => setView("home")} />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
