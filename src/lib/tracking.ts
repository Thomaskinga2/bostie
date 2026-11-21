"use client";
// Automatic journey tracking: follows the rider's live location and moves the journey on
// by itself. Location stays on the device; it is never sent to a server.
//
// GPS is unreliable underground, so this only ever ADDS to manual control: the confirm
// button is always there, a stale or missing signal is shown plainly, and a blocked
// permission switches the journey back to manual.
import { useEffect, useState } from "react";
import { distanceKm, type LatLng } from "./geo";
import { STATION } from "./network";
import { useStore, type Journey } from "./store";

/** Metres within which the rider counts as being at a station or destination. */
export const NEAR_STATION_M = 220;
export const LEFT_STATION_M = 380;
export const AT_DESTINATION_M = 80;
/** Fixes vaguer than this are ignored rather than trusted. */
export const MAX_ACCURACY_M = 250;
/** A new trail point is saved only after moving this far, so standing still records nothing. */
export const TRAIL_STEP_M = 25;

const metres = (a: LatLng, b: LatLng) => distanceKm(a, b) * 1000;

/**
 * How many journey steps a location fix justifies. Pure, so it can be tested without a GPS.
 * - walking: arrive within range of the boarding station
 * - waiting / boarding: the rider has clearly left the station, so they are on the train
 * - traveling: the fix is at an upcoming stop (it may skip stops missed underground)
 * - transferring: already at the interchange, so move to the next platform
 * - arriving: the rider has walked away from the last station
 * - exploring: reached the place they searched for
 */
export function autoSteps(j: Journey, fix: LatLng): number {
  const leg = j.plan.legs[j.leg];
  const from = STATION[leg.from];
  const to = STATION[j.plan.to];
  switch (j.stage) {
    case "walking":
      return metres(fix, from) <= NEAR_STATION_M ? 1 : 0;
    case "waiting":
      return metres(fix, from) > LEFT_STATION_M ? 2 : 0;
    case "boarding":
      return metres(fix, from) > LEFT_STATION_M ? 1 : 0;
    case "traveling": {
      let reached = -1;
      for (let i = j.stop; i < leg.stops.length; i++) if (metres(fix, STATION[leg.stops[i]]) <= NEAR_STATION_M) reached = i;
      return reached < 0 ? 0 : reached - j.stop + 1;
    }
    case "transferring":
      return 1;
    case "arriving":
      return metres(fix, to) > NEAR_STATION_M / 2 ? 1 : 0;
    case "exploring":
      return j.walkTo && metres(fix, j.walkTo) <= AT_DESTINATION_M ? 1 : 0;
    default:
      return 0;
  }
}

export type TrackingStatus = "off" | "simulated" | "asking" | "tracking" | "blocked" | "unsupported";

/** Runs while a journey is in automatic mode. Returns what the tracker is doing and when it last heard from GPS. */
export function useJourneyTracking(): { status: TrackingStatus; lastFixAt: number | null; accuracyM: number | null } {
  const active = useStore((s) => !!s.journey && s.journey.tracking === "auto" && s.journey.stage !== "planning" && s.journey.stage !== "complete");
  const demo = useStore((s) => !!s.journey?.demo);
  const [live, setLive] = useState<{ status: TrackingStatus; lastFixAt: number | null; accuracyM: number | null }>({ status: "asking", lastFixAt: null, accuracyM: null });

  // Demo journeys have no real position: automatic mode plays the ride at a steady pace,
  // pausing while a reward is on screen and stopping on arrival.
  useEffect(() => {
    if (!active || !demo) return;
    const timer = setInterval(() => {
      const s = useStore.getState();
      if (s.celebrations.length || !s.journey) return;
      if (["walking", "waiting", "boarding", "traveling", "transferring"].includes(s.journey.stage)) s.advanceJourney();
    }, 3200);
    return () => clearInterval(timer);
  }, [active, demo]);

  useEffect(() => {
    if (!active || demo) return;
    if (!navigator.geolocation) {
      useStore.getState().setTracking("manual");
      const t = setTimeout(() => setLive({ status: "unsupported", lastFixAt: null, accuracyM: null }), 0);
      return () => clearTimeout(t);
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const fix = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLive({ status: "tracking", lastFixAt: Date.now(), accuracyM: Math.round(pos.coords.accuracy) });
        useStore.setState({ geo: fix, geoStatus: "granted" });
        if (pos.coords.accuracy > MAX_ACCURACY_M) return;
        // Heat map trail: saved on this device only.
        const { trail, addTrailPoint } = useStore.getState();
        const last = trail[trail.length - 1];
        if (!last || metres(last, fix) >= TRAIL_STEP_M) addTrailPoint({ ...fix, at: Date.now() });
        // One fix can justify several steps (for example stops passed without signal).
        for (let guard = 0; guard < 12; guard++) {
          const s = useStore.getState();
          if (!s.journey || s.journey.tracking !== "auto" || autoSteps(s.journey, fix) === 0) break;
          s.advanceJourney();
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          useStore.getState().setTracking("manual"); // never leave the rider stuck
          setLive({ status: "blocked", lastFixAt: null, accuracyM: null });
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active, demo]);

  if (!active) return { status: live.status === "blocked" || live.status === "unsupported" ? live.status : "off", lastFixAt: null, accuracyM: null };
  return demo ? { status: "simulated", lastFixAt: null, accuracyM: null } : live;
}
