"use client";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { derive } from "./gamification";
import { GUIDE_STEPS, type GuideStepId } from "./guide";
import { useStore } from "./store";

export type DemoStep = { id: GuideStepId; title: string; detail: string; href: string; done: boolean };

/**
 * The judge walkthrough. Wording comes from lib/guide.ts; each step's "done" is read
 * from real app state here, never scripted.
 */
export function useDemoSteps(): { steps: DemoStep[]; current: DemoStep | null } {
  const events = useStore((s) => s.events);
  const journey = useStore((s) => s.journey);
  const pathname = usePathname();
  return useMemo(() => {
    const d = derive(events);
    const rode = d.stats.journeys > 0;
    const stage = journey?.stage;
    const done: Record<GuideStepId, boolean> = {
      plan: !!journey || rode,
      begin: rode || (!!stage && stage !== "planning"),
      play: d.stats.rounds > 0,
      ride: rode || ["arriving", "exploring", "complete"].includes(stage ?? ""),
      scan: d.stats.landmarks > 0,
      finish: rode,
      passport: rode && d.stats.landmarks > 0 && pathname === "/passport",
    };
    const steps = GUIDE_STEPS.map((g) => ({ id: g.id, title: g.title, detail: g.hint, href: g.href, done: done[g.id] }));
    return { steps, current: steps.find((s) => !s.done) ?? null };
  }, [events, journey, pathname]);
}
