"use client";
import { useEffect, useState } from "react";
import type { Alert, AlertsResponse, PlaceHit, PlacesResponse, Prediction, PredictionsResponse, TransitRoute, TransitRoutesResponse } from "./contracts";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function post<T>(url: string, body: unknown, timeoutMs = 45_000): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new ApiError(0, "network", "No connection. Check your internet and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "error", data.message ?? "Something went wrong. Please try again.");
  return data as T;
}

type Live<T> = { state: "loading" | "live" | "unavailable"; data: T; fetchedAt: string | null };
type Loaded<T> = Live<T> & { url: string };

/** Polls a live MBTA proxy route while the screen is visible. Failures surface as "unavailable", never as fake data. */
function useLive<R, T>(url: string | null, pick: (r: R) => { data: T; fetchedAt: string }, empty: T, everyMs: number): Live<T> {
  const [live, setLive] = useState<Loaded<T> | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    const load = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (!res.ok) throw new Error(String(res.status));
        const picked = pick((await res.json()) as R);
        if (alive) setLive({ url, state: "live", ...picked });
      } catch {
        // Keep the last good data for this url, but say it is no longer live.
        if (alive) setLive((l) => (l?.url === url ? { ...l, state: "unavailable" } : { url, state: "unavailable", data: empty, fetchedAt: null }));
      }
    };
    load();
    const t = setInterval(load, everyMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // pick/empty are stable per call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, everyMs]);
  // Results for a previous url (another station) are never shown for this one.
  return live && live.url === url ? live : { state: "loading", data: empty, fetchedAt: null };
}

/** Extra routes from Google, fetched once per trip. Empty when Google is not set up or fails. */
export function useTransitRoutes(from: { lat: number; lng: number }, to: { lat: number; lng: number }): TransitRoute[] {
  const key = `${from.lat},${from.lng},${to.lat},${to.lng}`;
  const [got, setGot] = useState<{ key: string; routes: TransitRoute[] } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/routes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ from, to }), signal: AbortSignal.timeout(10_000) })
      .then((r) => (r.ok ? (r.json() as Promise<TransitRoutesResponse>) : null))
      .then((r) => alive && r && setGot({ key, routes: r.routes }))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key stands for both points
  }, [key]);
  return got?.key === key ? got.routes : NO_ROUTES;
}
const NO_ROUTES: TransitRoute[] = [];

const NO_PREDICTIONS: Prediction[] = [];
const NO_ALERTS: Alert[] = [];

export const usePredictions = (stop: string | null) =>
  useLive<PredictionsResponse, Prediction[]>(
    stop ? `/api/mbta/predictions?stop=${stop}` : null,
    (r) => ({ data: r.predictions, fetchedAt: r.fetchedAt }),
    NO_PREDICTIONS,
    30_000,
  );

export const useAlerts = (enabled = true) =>
  useLive<AlertsResponse, Alert[]>(enabled ? "/api/mbta/alerts" : null, (r) => ({ data: r.alerts, fetchedAt: r.fetchedAt }), NO_ALERTS, 120_000);

export const minutesUntil = (iso: string, now = Date.now()) => Math.max(0, Math.round((Date.parse(iso) - now) / 60_000));

/** Re-renders on an interval so countdowns stay fresh. */
export function useNow(everyMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

/** Downscales any image source to a JPEG no wider/taller than `max`, as base64 without the data: prefix. */
export async function toJpegBase64(source: Blob | HTMLVideoElement, max = 1024): Promise<{ base64: string; dataUrl: string }> {
  const img = source instanceof Blob ? await createImageBitmap(source) : source;
  const [w, h] = source instanceof Blob ? [(img as ImageBitmap).width, (img as ImageBitmap).height] : [source.videoWidth, source.videoHeight];
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
  return { base64: dataUrl.split(",")[1], dataUrl };
}

type PlaceSearch = { state: "idle" | "loading" | "done" | "unavailable"; places: PlaceHit[]; provider: PlacesResponse["provider"] | null };
const NO_PLACES: PlaceSearch = { state: "idle", places: [], provider: null };

/** Looks up addresses and places as the rider types. Waits for a pause in typing; needs 3+ characters. */
export function usePlaceSearch(text: string, enabled: boolean): PlaceSearch {
  const q = text.trim();
  const active = enabled && q.length >= 3;
  const [found, setFound] = useState<(PlaceSearch & { q: string }) | null>(null);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as PlacesResponse;
        setFound({ q, state: "done", places: data.places, provider: data.provider });
      } catch {
        if (!controller.signal.aborted) setFound({ q, state: "unavailable", places: [], provider: null });
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, active]);
  if (!active) return NO_PLACES;
  // Results for an earlier query are never shown against the current text.
  return found?.q === q ? found : { state: "loading", places: [], provider: null };
}
