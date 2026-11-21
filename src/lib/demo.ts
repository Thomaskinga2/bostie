"use client";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { derive } from "./gamification";
import { useStore } from "./store";

export type DemoStep = { id: string; title: string; detail: string; href: string; done: boolean };

/** The judge walkthrough. Each step's "done" is read from real app state, never scripted. */
export function useDemoSteps(): { steps: DemoStep[]; current: DemoStep | null } {
  const events = useStore((s) => s.events);
  const journey = useStore((s) => s.journey);
  const pathname = usePathname();
  return useMemo(() => {
    const d = derive(events);
    const rode = d.stats.journeys > 0;
    const stage = journey?.stage;
    const steps: DemoStep[] = [
      { id: "plan", title: "Plan Harvard to Park Street", detail: "On Home, the route is prefilled. Tap “Find route”.", href: "/", done: !!journey || rode },
      { id: "begin", title: "Check arrivals and begin", detail: "See the next trains, then start the journey.", href: "/journey", done: rode || (!!stage && stage !== "planning") },
      { id: "play", title: "Play Guess Boston while you wait", detail: "Type a guess in your own words. Gemini judges it.", href: "/play", done: d.stats.rounds > 0 },
      { id: "ride", title: "Ride four stops on the Red Line", detail: "Confirm each arrival to collect station stamps.", href: "/journey", done: rode || ["arriving", "exploring", "complete"].includes(stage ?? "") },
      { id: "scan", title: "Scan a landmark by Park Street", detail: "Use the sample photo or your own. A real Gemini call.", href: "/scan", done: d.stats.landmarks > 0 },
      { id: "finish", title: "Complete the journey", detail: "Finish exploring to bank the journey XP.", href: "/journey", done: rode },
      { id: "passport", title: "Open your passport", detail: "Stamps, badges and your new level.", href: "/passport", done: rode && d.stats.landmarks > 0 && pathname === "/passport" },
    ];
    return { steps, current: steps.find((s) => !s.done) ?? null };
  }, [events, journey, pathname]);
}
