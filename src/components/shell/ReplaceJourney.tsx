"use client";
// Asked whenever a new trip is requested while a journey is under way. The current
// journey is only replaced on an explicit yes.
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Sheet } from "@/components/Sheet";
import { Button } from "@/components/ui";
import { STATION } from "@/lib/network";
import { repairJourney, useStore } from "@/lib/store";

export function ReplaceJourney() {
  const router = useRouter();
  const pending = useStore((s) => s.pending);
  const journey = useStore((s) => s.journey);
  const confirm = useStore((s) => s.confirmReplace);
  const cancel = useStore((s) => s.cancelReplace);

  // A journey restored from an earlier visit is checked once against today's network data.
  useEffect(() => {
    const saved = useStore.getState().journey;
    if (!saved) return;
    const fixed = repairJourney(saved);
    if (!fixed.changed) return;
    useStore.setState({ journey: fixed.journey });
    useStore.getState().setNotice({ tag: "journey-updated", title: "Your journey was updated", body: fixed.journey ? "The route data changed, so Bostie re-planned the same trip. Your stations are kept." : "That route no longer exists, so the journey was closed." });
  }, []);

  const current = journey ? `${journey.walkFrom?.name ?? STATION[journey.plan.from].name} → ${journey.walkTo?.name ?? STATION[journey.plan.to].name}` : "";
  const next = pending ? `${pending.walkFrom?.name ?? STATION[pending.from].name} → ${pending.walkTo?.name ?? STATION[pending.to].name}` : "";
  return (
    <Sheet open={!!pending && !!journey} onClose={cancel} title="Replace your current journey?">
      <p className="text-[15.5px] leading-snug">
        You are in the middle of <strong>{current}</strong>. Starting <strong>{next}</strong> ends it. Stamps and XP you have earned are kept.
      </p>
      <div className="mt-4 flex flex-col gap-2.5 pb-2">
        <Button
          onClick={() => {
            confirm();
            router.push("/journey");
          }}
        >
          Start the new trip
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            cancel();
            router.push("/journey");
          }}
        >
          Keep my current journey
        </Button>
      </div>
    </Sheet>
  );
}
