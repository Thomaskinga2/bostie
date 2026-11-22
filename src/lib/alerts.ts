"use client";
// Get-off alerts: "next stop is yours" and "get off here", as a banner inside the app and,
// when the app is in the background, as a phone notification.
//
// There is no server sending these. They are raised by this page while it is still running,
// so they reach a phone whose browser keeps the tab alive in the background (and an
// installed Home Screen app). If the phone has fully suspended the tab, nothing can fire.
import { useEffect } from "react";
import { legInfo, STATION } from "./network";
import { useStore, type Journey } from "./store";

export type Alert = { tag: string; title: string; body: string };

/** Minutes before the estimated arrival that the time-based warning goes out. */
export const ESTIMATE_LEAD_MIN = 1;

const leaving = (j: Journey) => {
  const leg = j.plan.legs[j.leg];
  const next = j.plan.legs[j.leg + 1];
  return { leg, name: STATION[leg.to].name, why: next ? ` to change to the ${legInfo(next).label}` : "" };
};

/**
 * The alert a step of the journey calls for, if any. Raised the same way whether the step
 * came from live location (Automatic) or from the rider tapping (Manual).
 */
export function getOffAlert(prev: Journey | null, next: Journey | null): Alert | null {
  if (!next || (prev && prev.id !== next.id)) return null;
  const { leg, name, why } = leaving(next);
  const moved = !prev || prev.stage !== next.stage || prev.stop !== next.stop || prev.leg !== next.leg;
  if (!moved) return null;
  // Riding, and the stop coming up is the one to get off at.
  if (next.stage === "traveling" && next.stop === leg.stops.length - 1) {
    return { tag: `next-${next.id}-${next.leg}`, title: `Next stop: ${name}`, body: `Get ready to get off${why}.` };
  }
  if ((next.stage === "transferring" || next.stage === "arriving") && prev?.stage === "traveling") {
    return { tag: `here-${next.id}-${next.leg}`, title: `This is ${name}`, body: `Get off here${why}.` };
  }
  return null;
}

/**
 * When the time-based warning for the current train is due, or null if there is none.
 * It is an estimate from the planned ride time, for when Bostie cannot see where the
 * train is: Manual mode with the app closed, or Automatic mode underground.
 */
export function estimateAlert(j: Journey | null): (Alert & { at: number }) | null {
  if (!j || j.stage !== "traveling" || !j.boardedAt) return null;
  const { leg, name, why } = leaving(j);
  return {
    tag: `est-${j.id}-${j.leg}`,
    at: j.boardedAt + Math.max(0, leg.minutes - ESTIMATE_LEAD_MIN) * 60_000,
    title: `Almost at ${name}`,
    body: `By the timetable you are about ${ESTIMATE_LEAD_MIN} minute away. Get ready to get off${why}.`,
  };
}

export const alertsSupported = () => typeof window !== "undefined" && "Notification" in window;

/** Asks the phone for permission and turns alerts on. Says what happened so the screen can explain. */
export async function enableAlerts(): Promise<"on" | "blocked" | "unsupported"> {
  if (!alertsSupported()) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "blocked";
  navigator.serviceWorker?.register("/sw.js").catch(() => {});
  useStore.getState().setAlerts(true);
  return "on";
}

async function raise(alert: Alert) {
  const s = useStore.getState();
  s.setNotice(alert); // always: it is waiting on screen when the rider comes back
  try {
    navigator.vibrate?.([220, 120, 220]);
  } catch {
    /* not every device vibrates */
  }
  if (document.visibilityState === "visible" || !s.alerts || !alertsSupported() || Notification.permission !== "granted") return;
  const options = { body: alert.body, tag: alert.tag, icon: "/mascot-face.png", badge: "/mascot-face.png" };
  try {
    // Android only allows notifications through a service worker.
    const worker = await navigator.serviceWorker?.getRegistration();
    if (worker) await worker.showNotification(alert.title, options);
    else new Notification(alert.title, options);
  } catch {
    /* the banner is still there */
  }
}

/** Watches the journey from anywhere in the app and raises each alert once. Mount it once. */
export function useGetOffAlerts() {
  const journey = useStore((s) => s.journey);
  useEffect(() => {
    if (useStore.getState().alerts) navigator.serviceWorker?.register("/sw.js").catch(() => {});
    const raised = new Set<string>();
    const once = (a: Alert | null) => {
      if (!a || raised.has(a.tag)) return;
      raised.add(a.tag);
      void raise(a);
    };
    return useStore.subscribe((s, prev) => {
      if (s.journey !== prev.journey) once(getOffAlert(prev.journey, s.journey));
    });
  }, []);

  // The time-based warning for the train the rider is on.
  const due = estimateAlert(journey);
  const dueAt = due?.at ?? null;
  const dueTag = due?.tag ?? null;
  useEffect(() => {
    if (dueAt === null || dueTag === null) return;
    const timer = setTimeout(() => {
      const now = useStore.getState().journey;
      const a = estimateAlert(now);
      // Skip it if the "next stop is yours" alert has already told them.
      if (!a || a.tag !== dueTag || !now || now.stop === now.plan.legs[now.leg].stops.length - 1) return;
      void raise(a);
    }, Math.max(0, dueAt - Date.now()));
    return () => clearTimeout(timer);
  }, [dueAt, dueTag]);
}
