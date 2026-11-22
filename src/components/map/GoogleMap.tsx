"use client";
// Google Maps JS API backend. Loaded lazily, only when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set.
// Any load or auth failure reports through onFail so CityMap can fall back to the SVG map.
import { useEffect, useRef, useState } from "react";
import { BOSTON } from "@/lib/geo";
import { STATION } from "@/lib/network";
import { BOOKMARK_PATH, CARD, FOREST, GOLD, GOLD_SOFT, INK, PIN_PATH, USER_BLUE, type CityMapProps, type MapMarker } from "./shared";

// The Maps JS API ships no types and we avoid a dependency for one file: `G` is the google.maps namespace.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type G = any;
type MapsWindow = Window & { google?: { maps: G }; gm_authFailure?: () => void; __bostieMapsReady?: () => void };

const FAIL_EVENT = "bostie-maps-failed";
let loading: Promise<G> | null = null;
let failed = false;
export const googleFailed = () => failed;

function loadMaps(key: string): Promise<G> {
  return (loading ??= new Promise<G>((resolve, reject) => {
    const w = window as MapsWindow;
    const fail = (why: string) => {
      failed = true;
      reject(new Error(why));
    };
    // Google calls this (possibly after the map has rendered) for a bad or restricted key.
    w.gm_authFailure = () => {
      failed = true;
      window.dispatchEvent(new Event(FAIL_EVENT));
    };
    w.__bostieMapsReady = () =>
      Promise.all([w.google!.maps.importLibrary("maps"), w.google!.maps.importLibrary("marker")]).then(
        () => resolve(w.google!.maps),
        () => fail("Google Maps libraries failed to load"),
      );
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=__bostieMapsReady`;
    script.async = true;
    script.onerror = () => fail("Google Maps script failed to load");
    document.head.appendChild(script);
    setTimeout(() => fail("Google Maps timed out"), 10_000); // no-op if already resolved
  }));
}

// Themes Google's tiles to the app palette and strips POI / transit clutter (we draw our own).
const STYLES = [
  { elementType: "geometry", stylers: [{ color: "#f5efe0" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#4d564f" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f5efe0" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ visibility: "on" }, { color: "#cfe0c3" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#fffcf4" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#e4dcc8" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#eadfc4" }] },
  { featureType: "road.local", elementType: "labels", stylers: [{ visibility: "simplified" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#c9dbe0" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ visibility: "off" }] },
];

function iconFor(maps: G, m: MapMarker, selected: boolean) {
  const scale = selected ? 1.35 : 1;
  const solid = { fillOpacity: 1, strokeColor: CARD, strokeWeight: 2, scale };
  switch (m.kind) {
    case "station": {
      const hub = (STATION[m.id]?.lines.length ?? 1) > 1;
      return {
        path: maps.SymbolPath.CIRCLE, scale: (hub ? 7 : 5) * scale, fillOpacity: 1,
        fillColor: m.done ? GOLD : CARD, strokeColor: m.done || hub ? INK : (m.color ?? INK), strokeWeight: hub ? 3 : 2.2,
      };
    }
    case "landmark":
      return { ...solid, path: "M0,-9 9,0 0,9 -9,0z", fillColor: m.done ? GOLD : FOREST };
    case "saved":
      return { ...solid, path: BOOKMARK_PATH, fillColor: GOLD, strokeColor: FOREST };
    case "pin":
      return { ...solid, path: PIN_PATH, fillColor: m.color ?? INK };
    case "answer":
      return { path: maps.SymbolPath.CIRCLE, scale: 10, fillOpacity: 1, fillColor: GOLD_SOFT, strokeColor: GOLD, strokeWeight: 4 };
    case "user":
      return { path: maps.SymbolPath.CIRCLE, scale: 7, fillOpacity: 1, fillColor: USER_BLUE, strokeColor: "#fff", strokeWeight: 3 };
  }
}
const Z: Record<MapMarker["kind"], number> = { station: 1, landmark: 2, saved: 3, answer: 4, pin: 5, user: 6 };

export function GoogleMap({
  apiKey, onFail, markers, lines = [], selectedId, onSelect, onMapClick, center, zoom, fit, className,
}: CityMapProps & { apiKey: string; onFail: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<G>(null);
  const cb = useRef({ onSelect, onMapClick, onFail });
  const [maps, setMaps] = useState<G>(null);
  useEffect(() => {
    cb.current = { onSelect, onMapClick, onFail };
  });

  useEffect(() => {
    let dead = false;
    const fail = () => cb.current.onFail();
    window.addEventListener(FAIL_EVENT, fail);
    loadMaps(apiKey)
      .then((g) => {
        if (dead || !el.current) return;
        map.current = new g.Map(el.current, {
          center: BOSTON, zoom: 13, styles: STYLES, backgroundColor: "#f5efe0",
          disableDefaultUI: true, zoomControl: true, gestureHandling: "greedy", clickableIcons: false,
        });
        map.current.addListener("click", (e: G) => e.latLng && cb.current.onMapClick?.({ lat: e.latLng.lat(), lng: e.latLng.lng() }));
        setMaps(() => g);
      })
      .catch(fail);
    return () => {
      dead = true;
      window.removeEventListener(FAIL_EVENT, fail);
    };
  }, [apiKey]);

  // ponytail: markers are rebuilt wholesale on change (~150 objects). Diff by id if this ever stutters.
  useEffect(() => {
    if (!maps) return;
    const made = markers.map((m) => {
      const marker = new maps.Marker({
        map: map.current, position: { lat: m.lat, lng: m.lng }, title: m.label,
        icon: iconFor(maps, m, m.id === selectedId), zIndex: m.id === selectedId ? 10 : Z[m.kind], clickable: m.kind !== "user",
      });
      marker.addListener("click", () => cb.current.onSelect?.(m.id));
      return marker;
    });
    return () => made.forEach((m: G) => m.setMap(null));
  }, [maps, markers, selectedId]);

  useEffect(() => {
    if (!maps) return;
    const made = lines.map(
      (l) =>
        new maps.Polyline({
          map: map.current, path: l.path, clickable: false, strokeColor: l.color, zIndex: l.emphasis ? 2 : 1,
          strokeWeight: l.emphasis ? 7 : 4.5, strokeOpacity: l.dashed ? 0 : l.emphasis ? 1 : 0.9,
          icons: l.dashed ? [{ icon: { path: maps.SymbolPath.CIRCLE, fillOpacity: 1, fillColor: l.color, strokeOpacity: 0, scale: 3.5 }, offset: "0", repeat: "14px" }] : undefined,
        }),
    );
    return () => made.forEach((l: G) => l.setMap(null));
  }, [maps, lines]);

  const goalKey = JSON.stringify([fit ?? null, center ?? null, zoom ?? null]);
  useEffect(() => {
    if (!maps) return;
    const [f, c, z] = JSON.parse(goalKey) as [{ lat: number; lng: number }[] | null, { lat: number; lng: number } | null, number | null];
    if (f?.length) {
      const bounds = new maps.LatLngBounds();
      f.forEach((p) => bounds.extend(p));
      map.current.fitBounds(bounds, { top: 96, bottom: 120, left: 48, right: 48 });
    } else {
      map.current.panTo(c ?? BOSTON);
      map.current.setZoom(z ?? 13.4);
    }
  }, [maps, goalKey]);

  return <div ref={el} className={`bg-paper ${className ?? ""}`} />;
}
